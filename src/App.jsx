import { useState } from 'react'
import { analyzeJudgment } from './api'
import './App.css'

const structuredFields = [
  { key: 'caseNumber', label: '사건번호' },
  { key: 'caseType', label: '사건종류' },
  { key: 'caseSummary', label: '사건개요' },
  { key: 'plaintiffClaim', label: '원고 주장' },
  { key: 'defendantClaim', label: '피고 주장' },
  { key: 'courtReasoning', label: '법원 판단' },
  { key: 'judgment', label: '주문' },
]

const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xjgjyrrq'

function renderText(value, fallback = '분석 결과가 아직 없습니다.') {
  return value?.trim() ? value : fallback
}

function App() {
  const [text, setText] = useState('')
  const [mode, setMode] = useState('student')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const structured = result?.structured ?? {}
  const issues = result?.issues ?? []
  const easySummary = result?.easySummary ?? {}

  async function handleAnalyze() {
    if (!text.trim()) {
      setError('판결문 텍스트를 입력해 주세요.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const data = await analyzeJudgment(text, mode)
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className={`app-shell mode-${mode}`}>
      <section className="hero-block">
        <div className="hero-copy">
          <span className="eyebrow">Legal Intelligence Workspace</span>
          <h1>판결문을 구조화된 인사이트로 정리합니다.</h1>
          <p className="description">
            판결문 원문을 입력하면 사건 구조, 핵심 쟁점, 쉬운 요약까지 한 화면에서
            읽을 수 있게 정리합니다.
          </p>
          <div className="hero-badges">
            <span className="hero-badge blue">구조화 분석</span>
            <span className={`hero-badge ${mode === 'student' ? 'slate' : 'mint'}`}>
              {mode === 'student' ? '학습 중심 모드' : '친절한 설명 모드'}
            </span>
            <span className="hero-badge violet">핵심 쟁점 3개</span>
          </div>
        </div>
        <div className={`hero-preview ${mode}`}>
          <div className="preview-card main">
            <p>현재 설명 모드</p>
            <strong>{mode === 'student' ? '학생 모드' : '일반인 모드'}</strong>
            <span>
              {mode === 'student'
                ? '논리 흐름과 판단 구조를 더 정돈된 톤으로 요약합니다.'
                : '쉽고 친절한 어조로 사건의 핵심을 먼저 보여줍니다.'}
            </span>
          </div>
          <div className="preview-stack">
            <div className="preview-card mini blue">
              <strong>사건 구조</strong>
              <span>사건번호, 청구, 판단, 주문</span>
            </div>
            <div className="preview-card mini mint">
              <strong>핵심 쟁점</strong>
              <span>쟁점별 설명과 근거 정리</span>
            </div>
          </div>
        </div>
      </section>

      <div className="content-grid">
        <section className="panel input-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">입력</p>
              <h2>판결문 분석 요청</h2>
            </div>
          </div>

          <label className="field">
            <span>판결문 텍스트</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="판결문 전문을 붙여넣어 주세요."
              rows={16}
            />
          </label>

          <fieldset className="field mode-group">
            <legend>설명 모드</legend>
            <div className="radio-grid">
              <label className={`radio-card ${mode === 'student' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="mode"
                  value="student"
                  checked={mode === 'student'}
                  onChange={(event) => setMode(event.target.value)}
                />
                <span className="radio-title">학생</span>
                <span className="radio-description">
                  학습과 이해를 돕는 방식으로 설명합니다.
                </span>
              </label>
              <label className={`radio-card ${mode === 'general' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="mode"
                  value="general"
                  checked={mode === 'general'}
                  onChange={(event) => setMode(event.target.value)}
                />
                <span className="radio-title">일반인</span>
                <span className="radio-description">
                  법률 비전공자도 읽기 쉽게 풀어 설명합니다.
                </span>
              </label>
            </div>
          </fieldset>

          <button
            type="button"
            className="analyze-button"
            onClick={handleAnalyze}
            disabled={loading}
          >
            <span className="button-glow"></span>
            {loading ? '분석 중...' : '분석 시작'}
          </button>

          {error ? <p className="message error">{error}</p> : null}
        </section>

        <section className="result-column">
          <section className="panel result-panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">결과</p>
                <h2>구조화 분석</h2>
              </div>
            </div>

            {result ? (
              <div className="structured-grid">
                {structuredFields.map(({ key, label }) => (
                  <article
                    key={key}
                    className={`result-card ${key === 'caseSummary' || key === 'plaintiffClaim' || key === 'defendantClaim' || key === 'courtReasoning' || key === 'judgment' ? 'wide' : ''}`}
                  >
                    <p className="card-label">{label}</p>
                    <p className="card-value">{renderText(structured[key])}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p className="empty-title">분석 결과가 여기에 표시됩니다</p>
                <p className="empty-copy">
                  왼쪽 입력 카드에 판결문을 넣고 분석을 실행하면 사건 구조와 요약이
                  카드 형태로 정리됩니다.
                </p>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Issues</p>
                <h2>핵심 쟁점</h2>
              </div>
            </div>

            {issues.length > 0 ? (
              <div className="issue-list">
                {issues.map((issue, index) => (
                  <article key={`${issue.title}-${index}`} className="issue-card">
                    <div className="issue-index">{index + 1}</div>
                    <div className="issue-body">
                      <h3>{renderText(issue.title, '쟁점 제목 없음')}</h3>
                      <p>{renderText(issue.description)}</p>
                      <div className="evidence-box">
                        <span>근거</span>
                        <p>{renderText(issue.evidence)}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state compact">
                <p className="empty-title">핵심 쟁점 3개가 표시됩니다</p>
                <p className="empty-copy">쟁점별 설명과 판단 근거를 카드로 정리합니다.</p>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Summary</p>
                <h2>쉬운 설명</h2>
              </div>
            </div>

            {result ? (
              <div className="summary-layout">
                <article className="summary-card">
                  <p className="card-label">한 줄 요약</p>
                  <p className="summary-one-line">
                    {renderText(easySummary.oneLine)}
                  </p>
                </article>
                <article className="summary-card">
                  <p className="card-label">3줄 설명</p>
                  <ol className="summary-lines">
                    {(easySummary.threeLines?.length
                      ? easySummary.threeLines
                      : ['아직 3줄 요약이 없습니다.']
                    ).map((line, index) => (
                      <li key={`${line}-${index}`}>{renderText(line)}</li>
                    ))}
                  </ol>
                </article>
              </div>
            ) : (
              <div className="empty-state compact">
                <p className="empty-title">쉬운 설명 카드가 표시됩니다</p>
                <p className="empty-copy">
                  한 줄 요약과 3줄 요약이 읽기 쉬운 형태로 정리됩니다.
                </p>
              </div>
            )}
          </section>
        </section>
      </div>

      <section className="panel contact-panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Contact</p>
            <h2>문의 남기기</h2>
          </div>
        </div>
        <p className="contact-copy">
          기능 요청, 오류 제보, 도입 문의가 있으면 아래 폼으로 보내주세요.
        </p>
        <form
          className="contact-form"
          action={FORMSPREE_ENDPOINT}
          method="POST"
        >
          <input type="hidden" name="_subject" value="LegalTech 문의 접수" />
          <div className="contact-grid">
            <label className="contact-field">
              <span>이름</span>
              <input type="text" name="name" placeholder="이름을 입력해 주세요" required />
            </label>
            <label className="contact-field">
              <span>이메일</span>
              <input
                type="email"
                name="email"
                placeholder="you@example.com"
                required
              />
            </label>
          </div>
          <label className="contact-field">
            <span>문의 내용</span>
            <textarea
              className="contact-textarea"
              name="message"
              placeholder="궁금한 점이나 요청 사항을 남겨주세요."
              rows={6}
              required
            />
          </label>
          <button type="submit" className="contact-button">
            문의 보내기
          </button>
        </form>
      </section>
    </main>
  )
}

export default App
