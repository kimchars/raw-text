const LAW_OPEN_API_BASE_URL = 'http://www.law.go.kr/DRF'

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeBooleanParam(value) {
  return ['1', 'true', 'yes', 'on'].includes(normalizeString(value).toLowerCase())
}

function maskKey(value) {
  const normalized = normalizeString(value)

  if (!normalized) {
    return null
  }

  if (normalized.length <= 4) {
    return `${normalized.slice(0, 1)}***${normalized.slice(-1)}`
  }

  return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`
}

function buildDebugInfo(env) {
  const geminiApiKey = normalizeString(env?.GEMINI_API_KEY)
  const lawOpenApiKey = normalizeString(env?.LAW_OPEN_API_KEY)

  return {
    geminiKeyExists: Boolean(geminiApiKey),
    lawKeyExists: Boolean(lawOpenApiKey),
    lawKeyLength: lawOpenApiKey.length || 0,
    lawKeyMasked: maskKey(lawOpenApiKey),
  }
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      ...init.headers,
    },
  })
}

function normalizeSearchItem(item) {
  return {
    id: normalizeString(item.판례일련번호 ?? item.판례정보일련번호 ?? item.prec),
    caseName: normalizeString(item.사건명),
    caseNumber: normalizeString(item.사건번호),
    decisionDate: normalizeString(item.선고일자),
    courtName: normalizeString(item.법원명),
    caseTypeName: normalizeString(item.사건종류명),
    judgmentType: normalizeString(item.판결유형),
    detailLink: normalizeString(item.판례상세링크),
  }
}

function buildCause(error) {
  const cause = error?.cause

  if (!cause) {
    return null
  }

  if (typeof cause === 'string') {
    return cause
  }

  const parts = [
    normalizeString(cause.code),
    normalizeString(cause.name),
    normalizeString(cause.message),
  ].filter(Boolean)

  return parts.join(': ') || 'Unknown error'
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url)
  const query = normalizeString(requestUrl.searchParams.get('query')) || '손해배상'
  const debug = normalizeBooleanParam(requestUrl.searchParams.get('debug'))
  const apiKey = normalizeString(context.env?.LAW_OPEN_API_KEY)
  const debugInfo = debug ? buildDebugInfo(context.env) : undefined

  if (!apiKey) {
    return json(
      {
        status: 500,
        message: 'LAW_OPEN_API_KEY is not set',
        cause: null,
        ...(debug ? { debug: debugInfo } : {}),
      },
      { status: 500 },
    )
  }

  const upstreamUrl = new URL(`${LAW_OPEN_API_BASE_URL}/lawSearch.do`)
  upstreamUrl.searchParams.set('OC', apiKey)
  upstreamUrl.searchParams.set('type', 'JSON')
  upstreamUrl.searchParams.set('target', 'prec')
  upstreamUrl.searchParams.set('query', query)
  upstreamUrl.searchParams.set('search', '1')
  upstreamUrl.searchParams.set('display', '3')
  upstreamUrl.searchParams.set('page', '1')

  try {
    const response = await fetch(upstreamUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0',
      },
    })

    const rawText = await response.text()

    if (!response.ok) {
      return json(
        {
          status: response.status,
          message: `law.go.kr request failed: HTTP ${response.status} ${response.statusText}`,
          cause: rawText.slice(0, 500) || null,
          ...(debug ? { debug: debugInfo } : {}),
        },
        { status: response.status },
      )
    }

    let payload

    try {
      payload = JSON.parse(rawText)
    } catch (error) {
      return json(
        {
          status: 502,
          message: 'law.go.kr returned non-JSON response',
          cause: rawText.slice(0, 500) || error.message,
          ...(debug ? { debug: debugInfo } : {}),
        },
        { status: 502 },
      )
    }

    const rawItems = Array.isArray(payload?.PrecSearch?.prec)
      ? payload.PrecSearch.prec
      : payload?.PrecSearch?.prec
        ? [payload.PrecSearch.prec]
        : []

    return json({
      query,
      totalCount: Number(payload?.PrecSearch?.totalCnt || 0),
      items: rawItems.map(normalizeSearchItem).filter((item) => item.id).slice(0, 3),
      ...(debug ? { debug: debugInfo } : {}),
    })
  } catch (error) {
    return json(
      {
        status: 502,
        message: 'law.go.kr fetch failed',
        cause: buildCause(error),
        ...(debug ? { debug: debugInfo } : {}),
      },
      { status: 502 },
    )
  }
}
