const { onCall, HttpsError } = require('firebase-functions/v2/https')
const logger = require('firebase-functions/logger')
const admin = require('firebase-admin')
const { GoogleGenAI } = require('@google/genai')

admin.initializeApp()

const db = admin.firestore()

const MODEL_NAME = 'gemini-2.5-flash'
const apiKey = process.env.GEMINI_API_KEY

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
  const structured = payload && typeof payload.structured === 'object'
    ? payload.structured
    : {}

  const easySummary = payload && typeof payload.easySummary === 'object'
    ? payload.easySummary
    : {}

  const issues = Array.isArray(payload?.issues)
    ? payload.issues.slice(0, 3).map(normalizeIssue)
    : []

  return {
    structured: {
      caseNumber: normalizeString(structured.caseNumber),
      caseType: normalizeString(structured.caseType),
      caseSummary: normalizeString(structured.caseSummary),
      plaintiffClaim: normalizeString(structured.plaintiffClaim),
      defendantClaim: normalizeString(structured.defendantClaim),
      courtReasoning: normalizeString(structured.courtReasoning),
      judgment: normalizeString(structured.judgment),
    },
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

exports.analyzeJudgment = onCall(
  {
    region: 'asia-northeast3',
  },
  async (request) => {
    const text = normalizeString(request.data?.text)
    const mode = normalizeString(request.data?.mode) || 'student'

    if (!text) {
      throw new HttpsError('invalid-argument', 'text is required')
    }

    if (!['student', 'general'].includes(mode)) {
      throw new HttpsError('invalid-argument', 'mode must be student or general')
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
      })

      const prompt = [
        'You are a legal judgment analysis assistant.',
        'Analyze the following Korean court judgment text.',
        `Explanation mode: ${mode}.`,
        'Return JSON only.',
        'Do not wrap the response in markdown fences.',
        'Use this exact JSON shape:',
        JSON.stringify(
          {
            structured: {
              caseNumber: '',
              caseType: '',
              caseSummary: '',
              plaintiffClaim: '',
              defendantClaim: '',
              courtReasoning: '',
              judgment: '',
            },
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
        '- Fill all fields in Korean.',
        '- issues must contain exactly 3 items.',
        '- easySummary.threeLines must contain exactly 3 strings.',
        '- If information is unclear, use an empty string instead of guessing.',
        '',
        'Judgment text:',
        text,
      ].join('\n')

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      })

      const rawText = normalizeString(response.text)

      if (!rawText) {
        throw new Error('Gemini returned an empty response')
      }

      let parsed
      try {
        parsed = JSON.parse(rawText)
      } catch (parseError) {
        logger.error('Failed to parse Gemini JSON response', {
          rawText,
          parseError: parseError.message,
        })
        throw new Error('Gemini returned invalid JSON')
      }

      const result = normalizeResult(parsed)

      const docRef = await db.collection('judgmentAnalyses').add({
        text,
        mode,
        model: MODEL_NAME,
        result,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      await docRef.set(
        {
          analysisId: docRef.id,
        },
        { merge: true },
      )

      return result
    } catch (error) {
      logger.error('analyzeJudgment failed', {
        message: error.message,
        stack: error.stack,
      })

      if (error instanceof HttpsError) {
        throw error
      }

      throw new HttpsError('internal', 'Failed to analyze judgment')
    }
  },
)
