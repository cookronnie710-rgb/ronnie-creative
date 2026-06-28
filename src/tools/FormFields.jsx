import styles from './FormFields.module.css'

export function Field({ label, hint, children }) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldHeader}>
        <label className={styles.label}>{label}</label>
        {hint && <span className={styles.hint}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export function Textarea({ value, onChange, placeholder, rows = 4, maxLength, disabled }) {
  return (
    <div className={styles.textareaWrap}>
      <textarea
        className={styles.textarea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        spellCheck={false}
      />
      {maxLength && (
        <span className={`${styles.charCount} ${value.length > maxLength * 0.9 ? styles.charWarn : ''}`}>
          {value.length}/{maxLength}
        </span>
      )}
    </div>
  )
}

export function Select({ value, onChange, options, disabled }) {
  return (
    <div className={styles.selectWrap}>
      <select
        className={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronIcon />
    </div>
  )
}

export function SegmentedControl({ value, onChange, options, disabled }) {
  return (
    <div className={styles.segmented} role="group">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`${styles.segment} ${value === opt.value ? styles.segmentActive : ''}`}
          onClick={() => onChange(opt.value)}
          disabled={disabled}
          type="button"
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function SubmitButton({ onClick, loading, disabled, children }) {
  return (
    <button
      className={`${styles.submitBtn} ${loading ? styles.loading : ''}`}
      onClick={onClick}
      disabled={disabled || loading}
      type="button"
    >
      {loading ? (
        <>
          <span className={styles.btnSpinner} />
          Generating…
        </>
      ) : children}
    </button>
  )
}

function ChevronIcon() {
  return (
    <svg className={styles.chevron} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}
