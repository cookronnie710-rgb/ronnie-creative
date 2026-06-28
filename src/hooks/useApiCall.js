import { useState, useCallback } from 'react'
import { ApiKeyMissingError, ApiError } from '../api/claude'

export function useApiCall() {
  const [response, setResponse] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const call = useCallback(async (fn) => {
    setLoading(true)
    setError(null)
    setResponse(null)

    try {
      const result = await fn()
      setResponse(result)
    } catch (err) {
      if (err instanceof ApiKeyMissingError) {
        setError('No API key configured. Click "Set API Key" in the header to add your Anthropic key.')
      } else if (err instanceof ApiError) {
        if (err.status === 401) {
          setError('Invalid API key. Check that your key is correct and active.')
        } else if (err.status === 429) {
          setError('Rate limit reached. Wait a moment and try again.')
        } else if (err.status === 408) {
          setError(err.message)
        } else if (err.status >= 500) {
          setError('Anthropic API is temporarily unavailable. Try again in a few seconds.')
        } else {
          setError(err.message || 'An unexpected error occurred.')
        }
      } else if (err.name === 'TypeError' && err.message.includes('fetch')) {
        setError('Network error. Check your internet connection and try again.')
      } else {
        setError('An unexpected error occurred. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => {
    setResponse(null)
    setError(null)
  }, [])

  return { response, loading, error, call, clear }
}
