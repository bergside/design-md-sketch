const DESIGN_SKILLS_URL = 'https://www.typeui.sh/design-skills'
const TYPEUI_URL = 'https://www.typeui.sh'
const FALLBACK_REPO_URL = 'https://github.com/bergside/design-md-sketch'

const state = {
  activeTab: 'design',
  designMarkdown: '',
  skillMarkdown: '',
  version: '0.0.0',
  repoUrl: FALLBACK_REPO_URL,
  stats: null
}

const elements = {
  tabDesign: document.getElementById('tabDesign'),
  tabSkill: document.getElementById('tabSkill'),
  editor: document.getElementById('markdownEditor'),
  copyButton: document.getElementById('copyButton'),
  downloadButton: document.getElementById('downloadButton'),
  refreshButton: document.getElementById('refreshButton'),
  statsLine: document.getElementById('statsLine'),
  tokenMeta: document.getElementById('tokenMeta'),
  repoLink: document.getElementById('repoLink'),
  versionText: document.getElementById('versionText'),
  designSkillsLink: document.getElementById('designSkillsLink'),
  typeUiLink: document.getElementById('typeUiLink')
}

function currentFileName() {
  return state.activeTab === 'design' ? 'DESIGN.md' : 'SKILL.md'
}

function currentMarkdown() {
  return state.activeTab === 'design' ? state.designMarkdown : state.skillMarkdown
}

function setCurrentMarkdown(value) {
  if (state.activeTab === 'design') {
    state.designMarkdown = value
  } else {
    state.skillMarkdown = value
  }
}

function refreshEditor() {
  elements.editor.value = currentMarkdown()
  const isDesign = state.activeTab === 'design'
  elements.tabDesign.classList.toggle('is-active', isDesign)
  elements.tabSkill.classList.toggle('is-active', !isDesign)
  elements.tabDesign.setAttribute('aria-selected', String(isDesign))
  elements.tabSkill.setAttribute('aria-selected', String(!isDesign))
}

function refreshStats() {
  if (!state.stats) {
    elements.statsLine.textContent = 'Waiting for extraction...'
    elements.tokenMeta.textContent = 'No token stats yet.'
    return
  }

  elements.statsLine.textContent = [
    state.stats.documentName,
    `shared ${state.stats.sharedLayerStyles}/${state.stats.sharedTextStyles}`,
    `layers ${state.stats.layersScanned}`,
    `colors ${state.stats.colorsExtracted}`,
    `type ${state.stats.typographyExtracted}`,
    `radii ${state.stats.radiiExtracted}`,
    `spacing ${state.stats.spacingExtracted}`
  ].join(' • ')

  elements.tokenMeta.textContent = [
    `DESIGN.md: ${state.stats.designTokensEstimated} tokens (${state.stats.designChars} chars)`,
    `SKILL.md: ${state.stats.skillTokensEstimated} tokens (${state.stats.skillChars} chars)`
  ].join(' • ')
}

function refreshMeta() {
  elements.versionText.textContent = `v${state.version}`
}

function updateAll() {
  refreshEditor()
  refreshStats()
  refreshMeta()
}

function switchTab(tab) {
  state.activeTab = tab
  refreshEditor()
}

function sendLinkToPlugin(url) {
  window.postMessage('openExternalLink', { url })
}

elements.tabDesign.addEventListener('click', () => switchTab('design'))
elements.tabSkill.addEventListener('click', () => switchTab('skill'))

elements.editor.addEventListener('input', () => {
  setCurrentMarkdown(elements.editor.value)
})

elements.copyButton.addEventListener('click', () => {
  window.postMessage('copyMarkdown', {
    name: currentFileName(),
    content: currentMarkdown()
  })
})

elements.downloadButton.addEventListener('click', () => {
  window.postMessage('downloadMarkdown', {
    name: currentFileName(),
    content: currentMarkdown()
  })
})

elements.refreshButton.addEventListener('click', () => {
  window.postMessage('refreshContent')
})

elements.designSkillsLink.addEventListener('click', (event) => {
  event.preventDefault()
  sendLinkToPlugin(DESIGN_SKILLS_URL)
})

elements.typeUiLink.addEventListener('click', (event) => {
  event.preventDefault()
  sendLinkToPlugin(TYPEUI_URL)
})

elements.repoLink.addEventListener('click', (event) => {
  event.preventDefault()
  sendLinkToPlugin(state.repoUrl || FALLBACK_REPO_URL)
})

window.__TYPEUI_RECEIVE__ = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return
  }

  if (typeof payload.designMarkdown === 'string') {
    state.designMarkdown = payload.designMarkdown
  }
  if (typeof payload.skillMarkdown === 'string') {
    state.skillMarkdown = payload.skillMarkdown
  }
  if (typeof payload.version === 'string') {
    state.version = payload.version
  }
  if (typeof payload.repoUrl === 'string' && payload.repoUrl.trim()) {
    state.repoUrl = payload.repoUrl.trim()
  }
  if (payload.stats && typeof payload.stats === 'object') {
    state.stats = payload.stats
  }

  updateAll()
}

document.addEventListener('DOMContentLoaded', () => {
  updateAll()
  window.postMessage('uiReady')
})
