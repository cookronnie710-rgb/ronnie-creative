import styles from './Header.module.css'

const LOGO = (
  <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="16" cy="16" r="11" stroke="#8b5cf6" strokeWidth="2"/>
    <circle cx="16" cy="16" r="5" fill="#8b5cf6"/>
    <line x1="16" y1="2" x2="16" y2="8" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round"/>
    <line x1="16" y1="24" x2="16" y2="30" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round"/>
    <line x1="2" y1="16" x2="8" y2="16" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round"/>
    <line x1="24" y1="16" x2="30" y2="16" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round"/>
  </svg>
)

export default function Header({ apiKeySet, onApiKeyClick }) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        {LOGO}
        <span className={styles.title}>Blender Multitool</span>
        <span className={styles.badge}>AI</span>
      </div>
      <div className={styles.right}>
        <button
          className={`${styles.apiBtn} ${apiKeySet ? styles.apiSet : styles.apiMissing}`}
          onClick={onApiKeyClick}
          title={apiKeySet ? 'API key is configured' : 'Click to set your API key'}
        >
          <span className={styles.apiDot} />
          {apiKeySet ? 'API Connected' : 'Set API Key'}
        </button>
      </div>
    </header>
  )
}
