import { useState } from 'react'
import ToolLayout from './ToolLayout'
import { Field, Textarea, Select, SegmentedControl, SubmitButton } from './FormFields'
import { tools } from '../api/claude'
import { useApiCall } from '../hooks/useApiCall'

const MARKETS = [
  { value: 'US/EU market, mid-market studio', label: 'US / EU — Mid-market' },
  { value: 'US/EU market, AAA studio or agency', label: 'US / EU — AAA / Agency' },
  { value: 'US/EU market, indie or startup', label: 'US / EU — Indie / Startup' },
  { value: 'Global remote market', label: 'Global Remote' },
  { value: 'Local market, emerging economy', label: 'Local / Emerging Market' },
]

const EXPERIENCE = [
  { value: 'junior (0-2 years)', label: 'Junior' },
  { value: 'mid-level (2-5 years)', label: 'Mid' },
  { value: 'senior (5+ years)', label: 'Senior' },
  { value: 'expert/specialist (10+ years)', label: 'Expert' },
]

export default function PricingCalculator() {
  const [scope, setScope] = useState('')
  const [market, setMarket] = useState('US/EU market, mid-market studio')
  const [experience, setExperience] = useState('mid-level (2-5 years)')
  const { response, loading, error, call, clear } = useApiCall()

  async function handleSubmit() {
    const context = `${market}. Artist experience: ${experience}.`
    await call(() => tools.pricingCalculator(scope, context))
  }

  return (
    <ToolLayout
      title="Pricing Calculator"
      description="Get market-calibrated pricing advice with phase breakdowns and client-facing talking points."
      icon="◎"
      response={response}
      loading={loading}
      error={error}
      onClear={clear}
    >
      <Field label="Project Scope" hint="Deliverables, deadlines, complexity, client type">
        <Textarea
          value={scope}
          onChange={setScope}
          placeholder="e.g. 5 fully-rigged character models for a mobile RPG. Each character needs 3 LODs, 2048px PBR textures, idle + walk + attack animations. 6-week timeline. Client is a 10-person indie studio."
          rows={5}
          maxLength={1200}
          disabled={loading}
        />
      </Field>

      <Field label="Your Experience Level">
        <SegmentedControl
          value={experience}
          onChange={setExperience}
          options={EXPERIENCE}
          disabled={loading}
        />
      </Field>

      <Field label="Target Market">
        <Select
          value={market}
          onChange={setMarket}
          options={MARKETS}
          disabled={loading}
        />
      </Field>

      <SubmitButton
        onClick={handleSubmit}
        loading={loading}
        disabled={!scope.trim()}
      >
        Calculate Pricing
      </SubmitButton>
    </ToolLayout>
  )
}
