import BrowserWindow from 'sketch-module-web-view'
import { getWebview } from 'sketch-module-web-view/remote'
import UI from 'sketch/ui'
import sketch from 'sketch/dom'

const WEBVIEW_IDENTIFIER = 'com.bergside.design-md-sketch.webview'
const PLUGIN_VERSION = '1.0.0'
const REPO_URL = 'https://github.com/bergside/design-md-sketch'

const DESIGN_FILE_NAME = 'DESIGN.md'
const DESIGN_BLUEPRINT = 'blueprints/DESIGN-MD-BLUEPRINT.md'
const SKILL_BLUEPRINT = 'blueprints/SKILL-BLUEPRINT.md'

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(String(value || ''))
  } catch (error) {
    return String(value || '')
  }
}

function toTitleWords(value) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function deriveDocumentTitle(document) {
  const source = document.path
    ? String(document.path).split('/').pop()
    : (document.name || 'Untitled Sketch document')
  const decoded = safeDecodeURIComponent(source).trim()
  const withoutExt = decoded
    .replace(/\.sketchcloud$/i, '')
    .replace(/\.sketch$/i, '')
  return withoutExt || 'Untitled Sketch document'
}

function normalizeColor(value) {
  if (typeof value !== 'string') {
    return null
  }

  const input = value.trim()
  if (!input) {
    return null
  }

  if (/^#[0-9a-f]{3}$/i.test(input)) {
    return `#${input[1]}${input[1]}${input[2]}${input[2]}${input[3]}${input[3]}FF`.toUpperCase()
  }

  if (/^#[0-9a-f]{4}$/i.test(input)) {
    return `#${input[1]}${input[1]}${input[2]}${input[2]}${input[3]}${input[3]}${input[4]}${input[4]}`.toUpperCase()
  }

  if (/^#[0-9a-f]{6}$/i.test(input)) {
    return `${input}FF`.toUpperCase()
  }

  if (/^#[0-9a-f]{8}$/i.test(input)) {
    return input.toUpperCase()
  }

  if (/^[0-9a-f]{8}$/i.test(input)) {
    return `#${input.toUpperCase()}`
  }

  return input
}

function recordCount(map, key) {
  if (!key) {
    return
  }
  map.set(key, (map.get(key) || 0) + 1)
}

function topEntries(map, limit = 12) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
}

function formatNumberList(map, limit = 10, unit = 'px') {
  return [...map.keys()]
    .map(v => Number(v))
    .filter(v => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b)
    .slice(0, limit)
    .map(v => `${v}${unit}`)
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || '').length / 4))
}

function collectColor(colorValue, collector) {
  const normalized = normalizeColor(colorValue)
  if (normalized) {
    recordCount(collector.colors, normalized)
  }
}

function collectTypographyToken(style, sourceName, collector) {
  if (!style) {
    return
  }

  const fontFamily = typeof style.fontFamily === 'string' && style.fontFamily.trim()
    ? style.fontFamily.trim()
    : undefined
  const fontSize = toNumber(style.fontSize)
  const fontWeight = toNumber(style.fontWeight)
  const lineHeightRaw = toNumber(style.lineHeight)
  const lineHeight = lineHeightRaw && lineHeightRaw > 0
    ? lineHeightRaw
    : (typeof style.getDefaultLineHeight === 'function' ? toNumber(style.getDefaultLineHeight()) : undefined)

  if (!fontFamily && !fontSize) {
    return
  }

  const token = [
    fontFamily || 'Unknown',
    fontSize || '-',
    fontWeight || '-',
    lineHeight || '-'
  ].join('|')

  if (!collector.typography.has(token)) {
    collector.typography.set(token, {
      fontFamily: fontFamily || 'Unknown',
      fontSize: fontSize || undefined,
      fontWeight: fontWeight || undefined,
      lineHeight: lineHeight || undefined,
      names: new Set(),
      count: 0
    })
  }

  const entry = collector.typography.get(token)
  entry.count += 1
  if (sourceName) {
    entry.names.add(sourceName)
  }
}

function collectRadius(corners, collector) {
  if (!corners || typeof corners !== 'object') {
    return
  }

  const rawRadii = corners.radii
  const radii = Array.isArray(rawRadii) ? rawRadii : [rawRadii]
  radii.forEach(radius => {
    const value = toNumber(radius)
    if (value && value > 0) {
      recordCount(collector.radii, value)
    }
  })
}

function collectGradientStops(gradient, collector) {
  if (!gradient || !Array.isArray(gradient.stops)) {
    return
  }
  gradient.stops.forEach(stop => {
    if (!stop || typeof stop !== 'object') {
      return
    }
    collectColor(stop.color, collector)
  })
}

function collectFromFillOrBorder(item, collector) {
  if (!item || item.enabled === false) {
    return
  }
  collectColor(item.color, collector)
  if (item.gradient) {
    collectGradientStops(item.gradient, collector)
  }
}

function collectFromShadow(shadow, collector) {
  if (!shadow || shadow.enabled === false) {
    return
  }
  collectColor(shadow.color, collector)
}

function extractStyle(style, collector, sourceName) {
  if (!style) {
    return
  }

  collectTypographyToken(style, sourceName, collector)
  collectRadius(style.corners, collector)
  collectColor(style.textColor, collector)
  collectFromFillOrBorder(style.tint, collector)

  toArray(style.fills).forEach(fill => collectFromFillOrBorder(fill, collector))
  toArray(style.borders).forEach(border => collectFromFillOrBorder(border, collector))
  toArray(style.shadows).forEach(shadow => collectFromShadow(shadow, collector))
  toArray(style.innerShadows).forEach(shadow => collectFromShadow(shadow, collector))
}

function collectSpacingFromContainer(container, collector) {
  const layers = toArray(container.layers).filter(layer => layer && layer.frame)
  if (layers.length < 2) {
    return
  }

  const byX = layers
    .filter(layer => toNumber(layer.frame.x) !== undefined && toNumber(layer.frame.width) !== undefined)
    .sort((a, b) => a.frame.x - b.frame.x)
  const byY = layers
    .filter(layer => toNumber(layer.frame.y) !== undefined && toNumber(layer.frame.height) !== undefined)
    .sort((a, b) => a.frame.y - b.frame.y)

  for (let i = 0; i < byX.length - 1; i += 1) {
    const current = byX[i]
    const next = byX[i + 1]
    const gap = Math.round(next.frame.x - (current.frame.x + current.frame.width))
    if (gap > 0 && gap <= 512) {
      recordCount(collector.spacing, gap)
    }
  }

  for (let i = 0; i < byY.length - 1; i += 1) {
    const current = byY[i]
    const next = byY[i + 1]
    const gap = Math.round(next.frame.y - (current.frame.y + current.frame.height))
    if (gap > 0 && gap <= 512) {
      recordCount(collector.spacing, gap)
    }
  }
}

function walkLayers(layers, visitor) {
  toArray(layers).forEach(layer => {
    if (!layer) {
      return
    }
    visitor(layer)
    if (toArray(layer.layers).length > 0) {
      walkLayers(layer.layers, visitor)
    }
  })
}

function collectDocumentStyles(document) {
  const collector = {
    colors: new Map(),
    typography: new Map(),
    radii: new Map(),
    spacing: new Map(),
    layerCount: 0,
    sharedLayerStyles: [],
    sharedTextStyles: []
  }

  toArray(document.colors).forEach(colorAsset => {
    collectColor(colorAsset && (colorAsset.color || colorAsset.hex || colorAsset.value), collector)
  })

  toArray(document.swatches).forEach(swatch => {
    collectColor(swatch && swatch.color, collector)
  })

  toArray(document.sharedLayerStyles).forEach(sharedStyle => {
    collector.sharedLayerStyles.push(sharedStyle.name || 'Unnamed layer style')
    extractStyle(sharedStyle.style, collector, sharedStyle.name || 'Layer style')
  })

  toArray(document.sharedTextStyles).forEach(sharedStyle => {
    collector.sharedTextStyles.push(sharedStyle.name || 'Unnamed text style')
    extractStyle(sharedStyle.style, collector, sharedStyle.name || 'Text style')
  })

  toArray(document.pages).forEach(page => {
    collectSpacingFromContainer(page, collector)
    walkLayers(page.layers, layer => {
      collector.layerCount += 1
      extractStyle(layer.style, collector, layer.name || layer.type || 'Layer')
      collectSpacingFromContainer(layer, collector)
    })
  })

  return collector
}

function pickBrandFromStyleNames(styleNames, fallbackTitle) {
  const candidates = new Map()
  toArray(styleNames).forEach(name => {
    const decoded = safeDecodeURIComponent(name)
    const head = decoded.split(/[\/|:]/)[0]
    const cleaned = toTitleWords(head)
    if (!cleaned || cleaned.length < 2) {
      return
    }
    recordCount(candidates, cleaned)
  })

  const mostCommon = topEntries(candidates, 1)[0]
  if (mostCommon && mostCommon[0]) {
    return mostCommon[0]
  }
  return toTitleWords(fallbackTitle)
}

function injectFrontmatterName(markdown, replacementName) {
  const content = String(markdown || '')
  if (!content.startsWith('---\n')) {
    return content
  }
  return content.replace(/^name:\s*.+$/m, `name: ${replacementName}`)
}

function buildTokenSection(extracted) {
  const colorEntries = topEntries(extracted.colors, 12)
    .map(([color, count]) => `- \`${color}\` (${count})`)
    .join('\n')

  const typographyEntries = [...extracted.typography.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(entry => {
      const fontSize = entry.fontSize ? `${entry.fontSize}px` : 'auto'
      const lineHeight = entry.lineHeight ? `${entry.lineHeight}px` : 'auto'
      const weight = entry.fontWeight !== undefined ? entry.fontWeight : 'auto'
      return `- \`${entry.fontFamily}\` / ${fontSize} / weight ${weight} / line-height ${lineHeight}`
    })
    .join('\n')

  const radiiEntries = formatNumberList(extracted.radii, 10).map(v => `- ${v}`).join('\n')
  const spacingEntries = formatNumberList(extracted.spacing, 12).map(v => `- ${v}`).join('\n')

  return {
    colors: colorEntries || '- None detected',
    typography: typographyEntries || '- None detected',
    radii: radiiEntries || '- None detected',
    spacing: spacingEntries || '- None detected'
  }
}

function buildDesignDraft(blueprint, extracted, documentName, extractedDesignName) {
  const tokens = buildTokenSection(extracted)
  const blueprintWithName = injectFrontmatterName(blueprint, extractedDesignName)

  const summary = [
    '## Sketch Extraction Snapshot',
    '',
    `- Document: ${documentName}`,
    `- Shared layer styles: ${extracted.sharedLayerStyles.length}`,
    `- Shared text styles: ${extracted.sharedTextStyles.length}`,
    `- Layers scanned: ${extracted.layerCount}`,
    `- Colors extracted: ${extracted.colors.size}`,
    `- Typography tokens extracted: ${extracted.typography.size}`,
    `- Radius tokens extracted: ${extracted.radii.size}`,
    `- Spacing tokens extracted: ${extracted.spacing.size}`,
    '',
    '## Extracted Color Tokens',
    '',
    tokens.colors,
    '',
    '## Extracted Typography Tokens',
    '',
    tokens.typography,
    '',
    '## Extracted Radius Tokens',
    '',
    tokens.radii,
    '',
    '## Extracted Spacing Tokens',
    '',
    tokens.spacing
  ].join('\n')

  return `${blueprintWithName.trim()}\n\n---\n\n${summary}\n`
}

function buildSkillDraft(blueprint, extracted, documentName, skillSystemName) {
  const topLayerStyles = extracted.sharedLayerStyles.slice(0, 12).map(name => `- ${name}`).join('\n') || '- None detected'
  const topTextStyles = extracted.sharedTextStyles.slice(0, 12).map(name => `- ${name}`).join('\n') || '- None detected'
  const tokenInputs = buildTokenSection(extracted)
  const blueprintWithName = injectFrontmatterName(blueprint, skillSystemName)

  const appendix = [
    '## Sketch Inputs',
    '',
    `- Source document: ${documentName}`,
    `- Shared layer styles found: ${extracted.sharedLayerStyles.length}`,
    `- Shared text styles found: ${extracted.sharedTextStyles.length}`,
    `- Layers scanned: ${extracted.layerCount}`,
    '',
    '## Shared Layer Styles',
    '',
    topLayerStyles,
    '',
    '## Shared Text Styles',
    '',
    topTextStyles,
    '',
    '## Suggested Token Inputs',
    '',
    '### Colors',
    tokenInputs.colors,
    '',
    '### Typography',
    tokenInputs.typography,
    '',
    '### Radius',
    tokenInputs.radii,
    '',
    '### Spacing',
    tokenInputs.spacing
  ].join('\n')

  return `${blueprintWithName.trim()}\n\n---\n\n${appendix}\n`
}

function readResourceText(context, relativePath) {
  const resourceURL = context.plugin.urlForResourceNamed(relativePath)
  if (!resourceURL) {
    return ''
  }

  const error = MOPointer.alloc().init()
  const content = NSString.stringWithContentsOfURL_encoding_error(
    resourceURL,
    NSUTF8StringEncoding,
    error
  )

  if (!content) {
    const reason = error.value()
    throw new Error(`Failed to read resource ${relativePath}: ${reason}`)
  }

  return String(content)
}

function writeTextFile(path, text) {
  const nsText = NSString.stringWithString(String(text))
  const success = nsText.writeToFile_atomically_encoding_error(
    path,
    true,
    NSUTF8StringEncoding,
    null
  )
  return Boolean(success)
}

function copyToClipboard(text) {
  const pasteboard = NSPasteboard.generalPasteboard()
  pasteboard.clearContents()
  const pasteboardType = typeof NSPasteboardTypeString !== 'undefined'
    ? NSPasteboardTypeString
    : NSStringPboardType
  pasteboard.setString_forType(String(text || ''), pasteboardType)
}

function openExternalLink(url) {
  try {
    const nsURL = NSURL.URLWithString(String(url))
    if (nsURL) {
      NSWorkspace.sharedWorkspace().openURL(nsURL)
    }
  } catch (error) {
    console.error(error)
  }
}

function chooseOutputPath(defaultName) {
  const panel = NSSavePanel.savePanel()
  panel.setCanCreateDirectories(true)
  panel.setNameFieldStringValue(defaultName)
  panel.setAllowedFileTypes(['md'])

  const result = panel.runModal()
  const accepted = result === NSModalResponseOK || result === NSFileHandlingPanelOKButton
  if (!accepted) {
    return null
  }

  const url = panel.URL()
  return url ? String(url.path()) : null
}

function generateDrafts(context) {
  const designBlueprint = readResourceText(context, DESIGN_BLUEPRINT)
  const skillBlueprint = readResourceText(context, SKILL_BLUEPRINT)
  const document = sketch.getSelectedDocument()

  if (!document) {
    const fallbackNotice = [
      '',
      '## Sketch Extraction Snapshot',
      '',
      '- No local Sketch document is currently open.',
      '- Open a document and click Refresh to extract local styles and update this draft.'
    ].join('\n')

    const designMarkdown = `${designBlueprint.trim()}\n\n---\n${fallbackNotice}\n`
    const skillMarkdown = `${skillBlueprint.trim()}\n\n---\n${fallbackNotice}\n`

    return {
      designMarkdown,
      skillMarkdown,
      stats: {
        documentName: 'No document open',
        sharedLayerStyles: 0,
        sharedTextStyles: 0,
        layersScanned: 0,
        colorsExtracted: 0,
        typographyExtracted: 0,
        radiiExtracted: 0,
        spacingExtracted: 0,
        designChars: designMarkdown.length,
        designTokensEstimated: estimateTokens(designMarkdown),
        skillChars: skillMarkdown.length,
        skillTokensEstimated: estimateTokens(skillMarkdown)
      }
    }
  }

  const extracted = collectDocumentStyles(document)
  const documentName = deriveDocumentTitle(document)
  const brandScope = pickBrandFromStyleNames(
    [...extracted.sharedLayerStyles, ...extracted.sharedTextStyles],
    documentName
  ) || 'Design System'
  const designName = brandScope
  const skillSystemName = `design-system-${slugify(brandScope) || 'brand-or-scope'}`

  const designMarkdown = buildDesignDraft(designBlueprint, extracted, documentName, designName)
  const skillMarkdown = buildSkillDraft(skillBlueprint, extracted, documentName, skillSystemName)

  return {
    designMarkdown,
    skillMarkdown,
    stats: {
      documentName,
      sharedLayerStyles: extracted.sharedLayerStyles.length,
      sharedTextStyles: extracted.sharedTextStyles.length,
      layersScanned: extracted.layerCount,
      colorsExtracted: extracted.colors.size,
      typographyExtracted: extracted.typography.size,
      radiiExtracted: extracted.radii.size,
      spacingExtracted: extracted.spacing.size,
      designChars: designMarkdown.length,
      designTokensEstimated: estimateTokens(designMarkdown),
      skillChars: skillMarkdown.length,
      skillTokensEstimated: estimateTokens(skillMarkdown)
    }
  }
}

function sendPayload(webContents, payload) {
  const serialized = JSON.stringify(payload)
  const script = `window.__TYPEUI_RECEIVE__(${serialized})`
  webContents.executeJavaScript(script).catch(console.error)
}

export default function onRun(context) {
  const browserWindow = new BrowserWindow({
    identifier: WEBVIEW_IDENTIFIER,
    title: 'DESIGN.md Generator - TypeUI',
    width: 1120,
    height: 780,
    minWidth: 840,
    minHeight: 620,
    resizable: true,
    show: false
  })

  browserWindow.once('ready-to-show', () => {
    browserWindow.show()
  })

  const webContents = browserWindow.webContents
  let cachedPayload = null

  const rebuildAndSend = () => {
    try {
      const drafts = generateDrafts(context)
      cachedPayload = {
        version: PLUGIN_VERSION,
        repoUrl: REPO_URL,
        designMarkdown: drafts.designMarkdown,
        skillMarkdown: drafts.skillMarkdown,
        stats: drafts.stats
      }
      sendPayload(webContents, cachedPayload)
    } catch (error) {
      console.error(error)
      UI.alert('DESIGN.md Generator - TypeUI', String(error.message || error))
    }
  }

  webContents.on('did-finish-load', rebuildAndSend)

  webContents.on('uiReady', () => {
    if (cachedPayload) {
      sendPayload(webContents, cachedPayload)
    }
  })

  webContents.on('refreshContent', () => {
    rebuildAndSend()
    UI.message('Refreshed extracted styles from Sketch document.')
  })

  webContents.on('copyMarkdown', payload => {
    const content = payload && payload.content ? payload.content : ''
    const name = payload && payload.name ? payload.name : 'Markdown'
    copyToClipboard(content)
    UI.message(`${name} copied to clipboard.`)
  })

  webContents.on('downloadMarkdown', payload => {
    const content = payload && payload.content ? payload.content : ''
    const suggestedName = payload && payload.name ? payload.name : DESIGN_FILE_NAME
    const outputPath = chooseOutputPath(suggestedName)

    if (!outputPath) {
      return
    }

    const saved = writeTextFile(outputPath, content)
    if (saved) {
      UI.message(`Saved ${suggestedName}.`)
    } else {
      UI.alert('Save failed', `Could not write file to ${outputPath}`)
    }
  })

  webContents.on('openExternalLink', payload => {
    const url = payload && payload.url ? payload.url : ''
    if (url) {
      openExternalLink(url)
    }
  })

  browserWindow.loadURL(require('../resources/webview.html'))
}

export function onShutdown() {
  const existingWebview = getWebview(WEBVIEW_IDENTIFIER)
  if (existingWebview) {
    existingWebview.close()
  }
}
