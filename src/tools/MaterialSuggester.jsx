import { useState } from 'react'
import ToolLayout from './ToolLayout'
import { Field, Textarea, SegmentedControl, SubmitButton } from './FormFields'
import { tools } from '../api/claude'
import { useApiCall } from '../hooks/useApiCall'

const ENGINES = [
  { value: 'Cycles', label: 'Cycles' },
  { value: 'EEVEE Next', label: 'EEVEE Next' },
  { value: 'Workbench', label: 'Workbench' },
]

export default function MaterialSuggester() {
  const [surface, setSurface] = useState('')
  const [engine, setEngine] = useState('Cycles')
  const { response, loading, error, call, clear } = useApiCall()

  async function handleSubmit() {
    await call(() => tools.materialSuggester(surface, engine))
  }

  return (
    <ToolLayout
      title="Material Suggester"
      description="Get a complete Shader Editor node setup for any surface — procedural or texture-based."
      icon="◈"
      response={response}
      loading={loading}
      error={error}
      onClear={clear}
    >
      <Field label="Surface / Material Description" hint="The more detail, the better the node setup">
        <Textarea
          value={surface}
          onChange={setSurface}
          placeholder="e.g. Worn leather car seat — dark brown base, lighter creases, stitching visible, slight sheen, some cracked areas with exposed foam underneath."
          rows={5}
          maxLength={1000}
          disabled={loading}
        />
      </Field>

      <Field label="Render Engine">
        <SegmentedControl
          value={engine}
          onChange={setEngine}
          options={ENGINES}
          disabled={loading}
        />
      </Field>

      <SubmitButton
        onClick={handleSubmit}
        loading={loading}
        disabled={!surface.trim()}
      >
        Build Material Setup
      </SubmitButton>
    </ToolLayout>
  )
}
