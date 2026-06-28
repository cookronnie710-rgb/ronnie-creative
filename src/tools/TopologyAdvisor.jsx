import { useState } from 'react'
import ToolLayout from './ToolLayout'
import { Field, Textarea, Select, SubmitButton } from './FormFields'
import { tools } from '../api/claude'
import { useApiCall } from '../hooks/useApiCall'

const USE_CASES = [
  { value: 'game-realtime', label: 'Game — Realtime (low poly)' },
  { value: 'game-highpoly', label: 'Game — High Poly Bake Source' },
  { value: 'animation', label: 'Animation / Rigging' },
  { value: 'vfx', label: 'VFX / Simulation' },
  { value: 'subdivision', label: 'Subdivision Surface Sculpt' },
  { value: 'arch-viz', label: 'Arch-Viz / Product Render' },
  { value: '3d-print', label: '3D Printing' },
]

export default function TopologyAdvisor() {
  const [meshDescription, setMeshDescription] = useState('')
  const [useCase, setUseCase] = useState('game-realtime')
  const { response, loading, error, call, clear } = useApiCall()

  async function handleSubmit() {
    await call(() => tools.topologyAdvisor(meshDescription, useCase))
  }

  return (
    <ToolLayout
      title="Topology Advisor"
      description="Describe your mesh problem and get a precise topology fix with Blender-specific techniques."
      icon="⬡"
      response={response}
      loading={loading}
      error={error}
      onClear={clear}
    >
      <Field label="Mesh Description / Problem" hint="Describe the shape and what's going wrong">
        <Textarea
          value={meshDescription}
          onChange={setMeshDescription}
          placeholder="e.g. Character face with too many poles around the eye area, getting pinching when I apply subdivision. The eyelid loop is terminating badly."
          rows={5}
          maxLength={1000}
          disabled={loading}
        />
      </Field>

      <Field label="Intended Use Case">
        <Select
          value={useCase}
          onChange={setUseCase}
          options={USE_CASES}
          disabled={loading}
        />
      </Field>

      <SubmitButton
        onClick={handleSubmit}
        loading={loading}
        disabled={!meshDescription.trim()}
      >
        Get Topology Advice
      </SubmitButton>
    </ToolLayout>
  )
}
