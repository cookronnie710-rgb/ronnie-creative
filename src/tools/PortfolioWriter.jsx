import { useState } from 'react'
import ToolLayout from './ToolLayout'
import { Field, Textarea, Select, SubmitButton } from './FormFields'
import { tools } from '../api/claude'
import { useApiCall } from '../hooks/useApiCall'

const AUDIENCES = [
  { value: 'Game studios (AAA/indie)', label: 'Game Studios' },
  { value: 'Film and VFX studios', label: 'Film & VFX Studios' },
  { value: 'Product design and advertising agencies', label: 'Advertising / Product' },
  { value: 'Architectural firms and real estate', label: 'Arch-Viz / Real Estate' },
  { value: 'NFT and digital art collectors', label: 'NFT / Digital Art' },
  { value: 'General creative directors and art buyers', label: 'General / Art Buyers' },
]

export default function PortfolioWriter() {
  const [details, setDetails] = useState('')
  const [audience, setAudience] = useState('Game studios (AAA/indie)')
  const { response, loading, error, call, clear } = useApiCall()

  async function handleSubmit() {
    await call(() => tools.portfolioWriter(details, audience))
  }

  return (
    <ToolLayout
      title="Portfolio Writer"
      description="Turn your project notes into compelling portfolio copy that wins clients."
      icon="✦"
      response={response}
      loading={loading}
      error={error}
      onClear={clear}
    >
      <Field label="Project Details" hint="Software used, what you made, key challenges, time taken">
        <Textarea
          value={details}
          onChange={setDetails}
          placeholder="e.g. Modeled a fully rigged fantasy dragon for a mobile game. Used ZBrush for sculpting, retopologised in Blender to 15k tris, hand-painted textures at 2048px, rigged with 60 bones, 8 animations. 3-week timeline, solo project."
          rows={6}
          maxLength={1500}
          disabled={loading}
        />
      </Field>

      <Field label="Target Audience">
        <Select
          value={audience}
          onChange={setAudience}
          options={AUDIENCES}
          disabled={loading}
        />
      </Field>

      <SubmitButton
        onClick={handleSubmit}
        loading={loading}
        disabled={!details.trim()}
      >
        Write Portfolio Copy
      </SubmitButton>
    </ToolLayout>
  )
}
