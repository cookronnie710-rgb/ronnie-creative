import { useState } from 'react'
import styles from './ResponsePanel.module.css'

export default function ResponsePanel({ content, loading, error, onClear }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!content) return
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!content && !loading && !error) return null

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <span className={styles.label}>Response</span>
        <div className={styles.actions}>
          {content && !loading && (
            <>
              <button className={styles.actionBtn} onClick={handleCopy} title="Copy to clipboard">
                {copied ? (
                  <>
                    <CheckIcon /> Copied
                  </>
                ) : (
                  <>
                    <CopyIcon /> Copy
                  </>
                )}
              </button>
              <button className={styles.actionBtn} onClick={onClear} title="Clear response">
                <TrashIcon /> Clear
              </button>
            </>
          )}
        </div>
      </div>

      {loading && (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <div className={styles.loadingLines}>
            <div className={`${styles.shimmerLine} ${styles.w80}`} />
            <div className={`${styles.shimmerLine} ${styles.w95}`} />
            <div className={`${styles.shimmerLine} ${styles.w70}`} />
            <div className={`${styles.shimmerLine} ${styles.w88}`} />
          </div>
          <p className={styles.loadingHint}>Claude is thinking…</p>
        </div>
      )}

      {error && !loading && (
        <div className={styles.errorState}>
          <ErrorIcon />
          <div>
            <p className={styles.errorTitle}>Something went wrong</p>
            <p className={styles.errorMsg}>{error}</p>
          </div>
        </div>
      )}

      {content && !loading && (
        <div className={`${styles.content} animate-fade-in`}>
          <FormattedResponse text={content} />
        </div>
      )}
    </div>
  )
}

function FormattedResponse({ text }) {
  const lines = text.split('\n')
  const elements = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.match(/^#{1,3}\s/)) {
      const level = line.match(/^(#+)/)[1].length
      const content = line.replace(/^#+\s/, '')
      const Tag = `h${Math.min(level + 2, 6)}`
      elements.push(<Tag key={i} className={styles[`h${level}`]}>{parseInline(content)}</Tag>)
    } else if (line.match(/^\d+\.\s/)) {
      const items = []
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        items.push(<li key={i}>{parseInline(lines[i].replace(/^\d+\.\s/, ''))}</li>)
        i++
      }
      elements.push(<ol key={`ol-${i}`} className={styles.ol}>{items}</ol>)
      continue
    } else if (line.match(/^[-*]\s/)) {
      const items = []
      while (i < lines.length && lines[i].match(/^[-*]\s/)) {
        items.push(<li key={i}>{parseInline(lines[i].replace(/^[-*]\s/, ''))}</li>)
        i++
      }
      elements.push(<ul key={`ul-${i}`} className={styles.ul}>{items}</ul>)
      continue
    } else if (line === '---' || line === '***') {
      elements.push(<hr key={i} className={styles.hr} />)
    } else if (line === '') {
      elements.push(<div key={i} className={styles.spacer} />)
    } else {
      elements.push(<p key={i} className={styles.p}>{parseInline(line)}</p>)
    }

    i++
  }

  return <>{elements}</>
}

function parseInline(text) {
  const parts = []
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g
  let last = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const val = match[0]
    if (val.startsWith('`')) {
      parts.push(<code key={match.index} className={styles.code}>{val.slice(1, -1)}</code>)
    } else if (val.startsWith('**')) {
      parts.push(<strong key={match.index} className={styles.strong}>{val.slice(2, -2)}</strong>)
    } else {
      parts.push(<em key={match.index}>{val.slice(1, -1)}</em>)
    }
    last = match.index + val.length
  }

  if (last < text.length) parts.push(text.slice(last))
  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--error)', flexShrink: 0, marginTop: 2 }}>
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  )
}
