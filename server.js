import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { GoogleGenAI } from '@google/genai'

const app = express()
const port = 3001
const model = 'gemini-2.5-flash'
const apiKey = process.env.GEMINI_API_KEY
const maxRetries = 1
const maxInputLength = 3000
const analysisCache = new Map()
const pendingAnalyses = new Map()

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeIssue(issue) {
  if (!issue || typeof issue !== 'object') {
    return {
      title: '',
      description: '',
      evidence: '',
    }
  }

  return {
    title: normalizeString(issue.title),
    description: normalizeString(issue.description),
    evidence: normalizeString(issue.evidence),
  }
}

function normalizeResult(payload) {
  const easySummary = payload && typeof payload.easySummary === 'object'
    ? payload.easySummary
    : {}

  const issues = Array.isArray(payload?.issues)
    ? payload.issues.slice(0, 3).map(normalizeIssue)
    : []

  return {
    issues,
    easySummary: {
      oneLine: normalizeString(easySummary.oneLine),
      threeLines: Array.isArray(easySummary.threeLines)
        ? easySummary.threeLines
            .map((line) => normalizeString(line))
            .filter(Boolean)
            .slice(0, 3)
        : [],
    },
  }
}

function buildCacheKey(text, mode) {
  return `${mode}::${text}`
}

function cleanExtractedText(value) {
  return normalizeString(value).replace(/\n{3,}/g, '\n\n')
}

function extractByPattern(text, pattern) {
  const match = text.match(pattern)
  return cleanExtractedText(match?.[1] || '')
}

function extractCaseNumber(text) {
  return (
    extractByPattern(text, /사건번호[:\s]*([^\n]+)/) ||
    extractByPattern(text, /([0-9]{4}\s*[가-힣]{1,4}\s*\d{1,})/) ||
    extractByPattern(text, /([0-9]{4}[가-힣]{1,4}\d{1,})/)
  )
}

function extractCaseType(text) {
  return (
    extractByPattern(text, /사건명[:\s]*([^\n]+)/) ||
    extractByPattern(text, /사건종류[:\s]*([^\n]+)/)
  )
}

function sliceSection(text, startPattern, endPattern) {
  const startMatch = text.match(startPattern)

  if (!startMatch?.index && startMatch?.index !== 0) {
    return ''
  }

  const startIndex = startMatch.index + startMatch[0].length
  const rest = text.slice(startIndex)

  if (!endPattern) {
    return cleanExtractedText(rest)
  }

  const endMatch = rest.match(endPattern)
  const endIndex = endMatch?.index ?? rest.length
  return cleanExtractedText(rest.slice(0, endIndex))
}

function extractCaseSummary(text) {
  const summaryFromFacts =
    sliceSection(
      text,
      /(이유|범죄사실|청구원인|기초사실|사건의 개요|사실관계)[:\s]*/i,
      /(원고의 주장|피고의 주장|판단|주문)[:\s]*/i,
    ) ||
    cleanExtractedText(text.split('\n').slice(0, 8).join('\n'))

  return summaryFromFacts.slice(0, 500)
}

function extractClaims(text, partyLabel) {
  return (
    sliceSection(
      text,
      new RegExp(`(${partyLabel}의 주장|${partyLabel} 주장|${partyLabel})[:\\s]*`, 'i'),
      /(원고의 주장|피고의 주장|판단|주문)[:\s]*/i,
    ) ||
    extractByPattern(text, new RegExp(`${partyLabel}[:\\s]*([^\\n]+)`, 'i'))
  )
}

function extractCourtReasoning(text) {
  return (
    sliceSection(text, /(판단|법원의 판단|이 법원의 판단)[:\s]*/i, /(주문)[:\s]*/i) ||
    extractByPattern(text, /(판단[:\s]*)([\s\S]{0,1200})/)
  )
}

function extractJudgment(text) {
  return (
    sliceSection(text, /(주문)[:\s]*/i) ||
    extractByPattern(text, /주문[:\s]*([\s\S]{0,300})/)
  )
}

function extractStructured(text) {
  return {
    caseNumber: extractCaseNumber(text),
    caseType: extractCaseType(text),
    caseSummary: extractCaseSummary(text),
    plaintiffClaim: extractClaims(text, '원고'),
    defendantClaim: extractClaims(text, '피고'),
    courtReasoning: extractCourtReasoning(text),
    judgment: extractJudgment(text),
  }
}

function isQuotaOrTemporaryError(error) {
  const status = error?.status
  const code = error?.code
  const message = normalizeString(error?.message).toLowerCase()

  return (
    status === 'UNAVAILABLE' ||
    status === 'RESOURCE_EXHAUSTED' ||
    code === 503 ||
    code === 429 ||
    message.includes('high demand') ||
    message.includes('unavailable') ||
    message.includes('quota exceeded') ||
    message.includes('resource_exhausted')
  )
}

async function generateAnalysis(ai, prompt) {
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    return ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    })
  }
}

app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.post('/analyze', async (req, res) => {
  const inputText = normalizeString(req.body?.text)
  const mode = normalizeString(req.body?.mode) || 'student'
  const text = inputText.slice(0, maxInputLength)
  const cacheKey = buildCacheKey(text, mode)

  console.log('POST /analyze request received', {
    mode,
    originalTextLength: inputText.length,
    textLength: text.length,
    truncated: inputText.length > maxInputLength,
  })

  if (!apiKey) {
    console.error('POST /analyze failed: GEMINI_API_KEY is not set')
    return res.status(500).json({
      error: 'GEMINI_API_KEY is not set',
    })
  }

  if (!inputText) {
    console.error('POST /analyze failed: text is required')
    return res.status(400).json({
      error: 'text is required',
    })
  }

  if (!['student', 'general'].includes(mode)) {
    console.error('POST /analyze failed: invalid mode', { mode })
    return res.status(400).json({
      error: 'mode must be student or general',
    })
  }

  try {
    if (analysisCache.has(cacheKey)) {
      console.log('POST /analyze cache hit', { mode, textLength: text.length })
      return res.json(analysisCache.get(cacheKey))
    }

    if (pendingAnalyses.has(cacheKey)) {
      console.log('POST /analyze pending cache hit', { mode, textLength: text.length })
      const pendingResult = await pendingAnalyses.get(cacheKey)
      return res.json(pendingResult)
    }

    const ai = new GoogleGenAI({ apiKey })
    const structured = extractStructured(text)

    const prompt = [
      'You are a legal judgment analysis assistant.',
      'Analyze the following Korean court judgment text.',
      `Explanation mode: ${mode}.`,
      'Return JSON only.',
      'Do not wrap the response in markdown fences.',
      'Use this exact JSON shape:',
      JSON.stringify(
        {
          issues: [
            {
              title: '',
              description: '',
              evidence: '',
            },
          ],
          easySummary: {
            oneLine: '',
            threeLines: ['', '', ''],
          },
        },
        null,
        2,
      ),
      'Requirements:',
      '- Do not return structured.',
      '- Fill all fields in Korean.',
      '- issues must contain exactly 3 items.',
      '- easySummary.threeLines must contain exactly 3 strings.',
      '- If information is unclear, use an empty string instead of guessing.',
      '',
      'Judgment text:',
      text,
    ].join('\n')

    const analysisPromise = (async () => {
      const response = await generateAnalysis(ai, prompt)

      const rawText = normalizeString(response.text)

      if (!rawText) {
        throw new Error('Gemini returned an empty response')
      }

      let parsed

      try {
        parsed = JSON.parse(rawText)
      } catch (parseError) {
        console.error('Failed to parse Gemini JSON response', {
          message: parseError.message,
          rawText,
        })
        throw new Error('Gemini returned invalid JSON')
      }

      const geminiResult = normalizeResult(parsed)
      const result = {
        structured,
        issues: geminiResult.issues,
        easySummary: geminiResult.easySummary,
      }

      analysisCache.set(cacheKey, result)
      console.log('POST /analyze success', {
        mode,
        issuesCount: result.issues.length,
        cached: true,
      })

      return result
    })

    pendingAnalyses.set(cacheKey, analysisPromise)

    try {
      const result = await analysisPromise
      return res.json(result)
    } finally {
      pendingAnalyses.delete(cacheKey)
    }
  } catch (error) {
    console.error('POST /analyze failed', {
      message: error.message,
      stack: error.stack,
      status: error.status,
      code: error.code,
    })

    return res.status(500).json({
      error: isQuotaOrTemporaryError(error)
        ? 'Gemini API 과부하로 일시적으로 실패했습니다. 잠시 후 다시 시도해 주세요.'
        : error.message || 'Failed to analyze judgment',
    })
  }
})

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
})
