import { useState, useEffect, useRef } from 'react'
import styles from './ApiKeyModal.module.css'

export default function ApiKeyModal({ isOpen, currentKey, onSave, onClose }) {
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setValue(currentKey || '')
      setShow(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen, currentKey])

  function handleSave() {
    const key = value.trim()
    if (key && !key.startsWith('sk-ant-')) {
      return
    }
    onSave(key)
    onClose()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') onClose()
  }

  if (!isOpen) return null

  const isValid = value.trim() === '' || value.trim().startsWith('sk-ant-')

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className={styles.header}>
          <h2 id="modal-title" className={styles.title}>Configure API Key</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.desc}>
            Your Anthropic API key is stored only in your browser's local storage and never sent to any server other than Anthropic's API.
          </p>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="api-key-input">
              Anthropic API Key
            </label>
            <div className={styles.inputWrap}>
              <input
                ref={inputRef}
                id="api-key-input"
                type={show ? 'text' : 'password'}
                className={`${styles.input} ${!isValid ? styles.inputError : ''}`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="sk-ant-api03-..."
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className={styles.toggleBtn}
                onClick={() => setShow((s) => !s)}
                aria-label={show ? 'Hide key' : 'Show key'}
              >
                {show ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {!isValid && (
              <p className={styles.fieldError}>Key must start with sk-ant-</p>
            )}
          </div>

          <div className={styles.hint}>
            <InfoIcon />
            <span>Get your key at <strong>console.anthropic.com</strong> → API Keys</span>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          {value.trim() && (
            <button className={`${styles.saveBtn} ${styles.dangerBtn}`} onClick={() => { onSave(''); onClose() }}>
              Remove Key
            </button>
          )}
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!isValid}
          >
            Save Key
          </button>
        </div>
      </div>
    </div>
  )
}

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  )
}
