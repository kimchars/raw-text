export async function analyzeJudgment(text, mode) {
  let response
  const endpoint = 'http://localhost:3001/analyze'

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, mode }),
    })
  } catch (error) {
    throw new Error(`서버 연결 실패: ${error.message}`)
  }

  let data

  try {
    data = await response.json()
  } catch (error) {
    throw new Error(`응답 파싱 실패: ${error.message}`)
  }

  if (!response.ok) {
    throw new Error(
      data?.error || `분석 요청 실패: HTTP ${response.status} ${response.statusText}`,
    )
  }

  return data
}
