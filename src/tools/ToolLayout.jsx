import styles from './ToolLayout.module.css'
import ResponsePanel from '../components/ResponsePanel'

export default function ToolLayout({ title, description, icon, children, response, loading, error, onClear }) {
  return (
    <div className={styles.layout}>
      <div className={styles.titleRow}>
        <span className={styles.icon}>{icon}</span>
        <div>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.description}>{description}</p>
        </div>
      </div>

      <div className={styles.form}>
        {children}
      </div>

      <ResponsePanel
        content={response}
        loading={loading}
        error={error}
        onClear={onClear}
      />
    </div>
  )
}
