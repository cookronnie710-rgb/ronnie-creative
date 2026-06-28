function getApiKey() {
  return import.meta.env.VITE_ANTHROPIC_API_KEY || window.__BMT_API_KEY__ || ''
}

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 2048

export class ApiKeyMissingError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY_MISSING')
    this.name = 'ApiKeyMissingError'
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function callClaude(systemPrompt, userMessage, options = {}) {
  const API_KEY = getApiKey()
  if (!API_KEY || API_KEY === 'your-api-key-here') {
    throw new ApiKeyMissingError()
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), options.timeout ?? 60000)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: options.maxTokens ?? MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const msg = errorData?.error?.message ?? `HTTP ${response.status}`
      throw new ApiError(msg, response.status)
    }

    const data = await response.json()
    return data.content[0].text
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError('Request timed out after 60 seconds. Try a shorter prompt.', 408)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

export const tools = {
  async conceptToSteps(concept, complexity) {
    const system = `You are an expert Blender 3D artist and technical instructor with 10+ years of production experience.
Convert concept descriptions into precise, actionable Blender workflows.
Format your response as numbered steps with sub-steps where needed.
Include specific Blender shortcuts, menu paths, and node names.
Be concrete — no vague "model the shape" steps.
End with estimated time per section and any gotchas/common mistakes.`
    const prompt = `Create a complete Blender workflow for: "${concept}"
Complexity level: ${complexity}
Include: modeling approach, topology strategy, UV unwrapping, shading setup, lighting, and render settings.`
    return callClaude(system, prompt)
  },

  async topologyAdvisor(meshDescription, useCase) {
    const system = `You are a topology and retopology expert specializing in production-ready 3D meshes.
Provide specific, technical topology advice.
Reference actual Blender tools: Loop Cut, Bridge Edge Loops, Grid Fill, Shrinkwrap, etc.
Include poly count targets, edge flow principles, and when to use tris vs quads vs ngons.
If relevant, mention where to place edge loops for deformation or subdivision.`
    const prompt = `Mesh description: "${meshDescription}"
Intended use case: ${useCase}

Diagnose topology issues and provide a corrective workflow. Include:
- Ideal edge flow strategy
- Where to add/remove edge loops
- Poly count targets
- Any modifier setup (Subdivision, Multiresolution, etc.)
- How to validate the topology`
    return callClaude(system, prompt)
  },

  async materialSuggester(surfaceDescription, renderEngine) {
    const system = `You are a Blender material and shader expert with deep knowledge of PBR workflows.
Provide specific Shader Editor node setups.
Name every node, its exact settings, and how nodes connect (from → to socket).
Include texture maps needed, their dimensions, and bit depth.
Reference real-world material references when helpful.`
    const prompt = `I need to recreate this material in Blender: "${surfaceDescription}"
Render engine: ${renderEngine}

Provide:
1. Complete node tree setup (every node, connection, and value)
2. Texture maps needed and their settings
3. Any procedural tricks to achieve the look
4. Render settings that affect this material
5. Common mistakes to avoid`
    return callClaude(system, prompt)
  },

  async portfolioWriter(projectDetails, targetAudience) {
    const system = `You are a creative director and copywriter specializing in 3D art portfolios.
Write compelling, professional portfolio copy that sells the work — not just describes it.
Use active voice, strong verbs, and specific technical details that show expertise.
Balance artistic vision with technical capability.
Avoid clichés like "passion for 3D" or "attention to detail".`
    const prompt = `Write portfolio copy for this 3D project:
${projectDetails}

Target audience: ${targetAudience}

Provide:
1. Project title (punchy, memorable)
2. One-sentence hook (for thumbnail caption)
3. Full project description (150–200 words)
4. Technical highlights (bullet list of 4–6 specific achievements)
5. Behind-the-scenes note (1–2 sentences about a challenge solved)`
    return callClaude(system, prompt)
  },

  async pricingCalculator(projectScope, marketContext) {
    const system = `You are a freelance 3D art business consultant with expertise in pricing strategy.
Give realistic, market-calibrated pricing advice for freelance 3D artists.
Break down costs by phase (concept, modeling, texturing, rigging, animation, rendering).
Account for revision cycles, rights, and usage.
Be direct with numbers — ranges are fine but avoid being vague.`
    const prompt = `Project scope: "${projectScope}"
Market context: ${marketContext}

Provide:
1. Recommended price range with reasoning
2. Breakdown by phase/deliverable
3. What's included vs. what costs extra
4. Revision policy recommendation
5. Usage rights pricing (if applicable)
6. Red flags to watch for in this type of project
7. How to present this price to the client`
    return callClaude(system, prompt)
  },

  async briefTranslator(clientBrief, artistLevel) {
    const system = `You are a senior 3D artist and project manager who bridges the gap between client language and technical execution.
Translate vague client briefs into precise technical specifications.
Flag ambiguities that need client clarification before work begins.
Identify scope creep risks and hidden complexity.
Output should be something a 3D artist can immediately act on.`
    const prompt = `Client brief: "${clientBrief}"
Artist level: ${artistLevel}

Translate this into a technical spec including:
1. What the client actually wants (decoded plain-language summary)
2. Technical deliverables list (file formats, poly counts, texture sizes, etc.)
3. Blender-specific workflow breakdown
4. Ambiguities that need clarification (with suggested questions to ask)
5. Scope risks / things that could blow up the timeline
6. Estimated complexity rating (1–10) with justification`
    return callClaude(system, prompt)
  },
}
