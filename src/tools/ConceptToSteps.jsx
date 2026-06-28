import { useState } from 'react'
import ToolLayout from './ToolLayout'
import { Field, Textarea, SegmentedControl, SubmitButton } from './FormFields'
import { tools } from '../api/claude'
import { useApiCall } from '../hooks/useApiCall'

const COMPLEXITY_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'production', label: 'Production' },
]

export default function ConceptToSteps() {
  const [concept, setConcept] = useState('')
  const [complexity, setComplexity] = useState('intermediate')
  const { response, loading, error, call, clear } = useApiCall()

  async function handleSubmit() {
    await call(() => tools.conceptToSteps(concept, complexity))
  }

  return (
    <ToolLayout
      title="Concept to Steps"
      description="Describe a 3D model or scene and get a complete, production-ready Blender workflow."
      icon="⚡"
      response={response}
      loading={loading}
      error={error}
      onClear={clear}
    >
      <Field label="Concept Description" hint="Be specific — materials, shape, style, purpose">
        <Textarea
          value={concept}
          onChange={setConcept}
          placeholder="e.g. A weathered bronze door knocker in the shape of a lion's head, with verdigris patina, for a fantasy game asset at 2k textures."
          rows={5}
          maxLength={1000}
          disabled={loading}
        />
      </Field>

      <Field label="Complexity Level">
        <SegmentedControl
          value={complexity}
          onChange={setComplexity}
          options={COMPLEXITY_OPTIONS}
          disabled={loading}
        />
      </Field>

      <SubmitButton
        onClick={handleSubmit}
        loading={loading}
        disabled={!concept.trim()}
      >
        Generate Workflow
      </SubmitButton>
    </ToolLayout>
  )
}
