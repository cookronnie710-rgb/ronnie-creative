import styles from './Sidebar.module.css'
import { TOOLS } from '../tools/toolConfig'

export default function Sidebar({ activeTool, onSelect }) {
  return (
    <nav className={styles.sidebar} aria-label="Tools">
      <div className={styles.section}>
        <p className={styles.sectionLabel}>Tools</p>
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            className={`${styles.navItem} ${activeTool === tool.id ? styles.active : ''}`}
            onClick={() => onSelect(tool.id)}
            aria-current={activeTool === tool.id ? 'page' : undefined}
          >
            <span className={styles.icon} aria-hidden="true">{tool.icon}</span>
            <span className={styles.label}>{tool.label}</span>
          </button>
        ))}
      </div>
      <div className={styles.footer}>
        <p className={styles.footerText}>Powered by Claude</p>
      </div>
    </nav>
  )
}
