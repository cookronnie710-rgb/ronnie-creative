import { useState } from 'react'
import styles from './App.module.css'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import ApiKeyModal from './components/ApiKeyModal'
import { useLocalStorage } from './hooks/useLocalStorage'

import ConceptToSteps from './tools/ConceptToSteps'
import TopologyAdvisor from './tools/TopologyAdvisor'
import MaterialSuggester from './tools/MaterialSuggester'
import PortfolioWriter from './tools/PortfolioWriter'
import PricingCalculator from './tools/PricingCalculator'
import BriefTranslator from './tools/BriefTranslator'

const TOOL_COMPONENTS = {
  'concept-to-steps': ConceptToSteps,
  'topology-advisor': TopologyAdvisor,
  'material-suggester': MaterialSuggester,
  'portfolio-writer': PortfolioWriter,
  'pricing-calculator': PricingCalculator,
  'brief-translator': BriefTranslator,
}

export default function App() {
  const [activeTool, setActiveTool] = useState('concept-to-steps')
  const [apiKey, setApiKey] = useLocalStorage('bmt-api-key', '')
  const [modalOpen, setModalOpen] = useState(false)

  function handleSaveKey(key) {
    setApiKey(key)
    // Inject key into env so the API module picks it up
    // In a proper app this would go through a backend; here it's in-memory only
    window.__BMT_API_KEY__ = key
  }

  // Make key accessible to the api module without vite env (runtime override)
  if (apiKey && !import.meta.env.VITE_ANTHROPIC_API_KEY) {
    window.__BMT_API_KEY__ = apiKey
  }

  const ActiveTool = TOOL_COMPONENTS[activeTool]

  return (
    <div className={styles.app}>
      <Header
        apiKeySet={!!(apiKey || import.meta.env.VITE_ANTHROPIC_API_KEY)}
        onApiKeyClick={() => setModalOpen(true)}
      />
      <div className={styles.body}>
        <Sidebar activeTool={activeTool} onSelect={setActiveTool} />
        <main className={styles.main}>
          <ActiveTool key={activeTool} />
        </main>
      </div>

      <ApiKeyModal
        isOpen={modalOpen}
        currentKey={apiKey}
        onSave={handleSaveKey}
        onClose={() => setModalOpen(false)}
      />
    </div>
  )
}
