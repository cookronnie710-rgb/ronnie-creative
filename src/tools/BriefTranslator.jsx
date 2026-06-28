import { useState } from 'react'
import ToolLayout from './ToolLayout'
import { Field, Textarea, SegmentedControl, SubmitButton } from './FormFields'
import { tools } from '../api/claude'
import { useApiCall } from '../hooks/useApiCall'

const LEVELS = [
  { value: 'junior freelancer', label: 'Junior' },
  { value: 'mid-level freelancer', label: 'Mid' },
  { value: 'senior freelancer', label: 'Senior' },
  { value: 'studio lead', label: 'Lead' },
]

export default function BriefTranslator() {
  const [brief, setBrief] = useState('')
  const [level, setLevel] = useState('mid-level freelancer')
  const { response, loading, error, call, clear } = useApiCall()

  async function handleSubmit() {
    await call(() => tools.briefTranslator(brief, level))
  }

  return (
    <ToolLayout
      title="Brief Translator"
      description="Paste a client brief and get a technical spec, clarifying questions, and scope risk assessment."
      icon="⇄"
      response={response}
      loading={loading}
      error={error}
      onClear={clear}
    >
      <Field label="Client Brief" hint="Paste it verbatim — even if it's vague">
        <Textarea
          value={brief}
          onChange={setBrief}
          placeholder="e.g. Hi! We need some cool 3D stuff for our product launch video. Like a floating holographic version of our logo that opens up and reveals the product inside. Should feel premium and futuristic. We're thinking Apple vibes. Need it by end of next week!"
          rows={7}
          maxLength={2000}
          disabled={loading}
        />
      </Field>

      <Field label="Your Experience Level">
        <SegmentedControl
          value={level}
          onChange={setLevel}
          options={LEVELS}
          disabled={loading}
        />
      </Field>

      <SubmitButton
        onClick={handleSubmit}
        loading={loading}
        disabled={!brief.trim()}
      >
        Translate Brief
      </SubmitButton>
    </ToolLayout>
  )
}
