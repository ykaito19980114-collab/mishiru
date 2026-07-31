import { relative, resolve } from 'node:path'
import { transformWithEsbuild } from 'vite'

const INSPECTOR_SCRIPT = String.raw`(() => {
  if (window.parent === window) return
  const overlay = document.createElement('div')
  overlay.setAttribute('aria-hidden', 'true')
  Object.assign(overlay.style, {
    position: 'fixed',
    zIndex: '2147483647',
    pointerEvents: 'none',
    display: 'none',
    border: '1px solid rgba(37, 99, 235, .65)',
    background: 'rgba(37, 99, 235, .04)',
    boxSizing: 'border-box',
  })
  document.documentElement.appendChild(overlay)

  const targetFromEvent = (event) => event.target instanceof Element
    ? event.target.closest('[data-rcb]')
    : null
  const show = (target) => {
    if (!target) {
      overlay.style.display = 'none'
      return
    }
    const rect = target.getBoundingClientRect()
    Object.assign(overlay.style, {
      display: 'block',
      left: rect.left + 'px',
      top: rect.top + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
    })
  }

  document.addEventListener('mouseover', (event) => show(targetFromEvent(event)), true)
  document.addEventListener('mouseout', (event) => {
    if (!targetFromEvent(event)) show(null)
  }, true)
  document.addEventListener('click', (event) => {
    if (!event.altKey) return
    const target = targetFromEvent(event)
    if (!target) return
    event.preventDefault()
    event.stopPropagation()
    const text = (target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    window.parent.postMessage({
      type: 'rcnext-pick',
      rcb: target.getAttribute('data-rcb'),
      tag: target.tagName.toLowerCase(),
      text,
    }, '*')
  }, true)
})()`

function skipQuoted(code, start, quote) {
  for (let index = start + 1; index < code.length; index += 1) {
    if (code[index] === '\\') index += 1
    else if (code[index] === quote) return index + 1
  }
  return code.length
}

function skipLineComment(code, start) {
  const end = code.indexOf('\n', start + 2)
  return end < 0 ? code.length : end + 1
}

function skipBlockComment(code, start) {
  const end = code.indexOf('*/', start + 2)
  return end < 0 ? code.length : end + 2
}

function regexStartsAt(code, start) {
  let previous = start - 1
  while (previous >= 0 && /\s/.test(code[previous])) previous -= 1
  if (previous < 0) return true
  if (/[([{:;,=!?&|+*%^~>-]/.test(code[previous])) return true
  const word = /[A-Za-z_$][A-Za-z0-9_$]*$/.exec(code.slice(0, previous + 1))?.[0]
  return Boolean(word && /^(?:return|case|throw|else|do|typeof|instanceof|in|of|yield|await)$/.test(word))
}

function skipRegex(code, start) {
  let characterClass = false
  for (let index = start + 1; index < code.length; index += 1) {
    const char = code[index]
    if (char === '\\') index += 1
    else if (char === '[') characterClass = true
    else if (char === ']') characterClass = false
    else if (char === '/' && !characterClass) {
      index += 1
      while (index < code.length && /[A-Za-z]/.test(code[index])) index += 1
      return index
    } else if (char === '\n' || char === '\r') return start + 1
  }
  return start + 1
}

function openingTagEnd(code, start) {
  let braceDepth = 0
  for (let index = start; index < code.length; index += 1) {
    const char = code[index]
    const next = code[index + 1]
    if (char === '"' || char === "'" || char === '`') {
      index = skipQuoted(code, index, char) - 1
      continue
    }
    if (char === '/' && next === '/') {
      index = skipLineComment(code, index) - 1
      continue
    }
    if (char === '/' && next === '*') {
      index = skipBlockComment(code, index) - 1
      continue
    }
    if (char === '/' && regexStartsAt(code, index)) {
      index = skipRegex(code, index) - 1
      continue
    }
    if (char === '{') braceDepth += 1
    else if (char === '}') braceDepth -= 1
    else if (char === '>' && braceDepth === 0) return index
    if (braceDepth < 0) return -1
  }
  return -1
}

function jsxInsertions(code) {
  const insertions = []
  for (let index = 0; index < code.length;) {
    const char = code[index]
    const next = code[index + 1]
    if (char === '"' || char === "'" || char === '`') {
      index = skipQuoted(code, index, char)
      continue
    }
    if (char === '/' && next === '/') {
      index = skipLineComment(code, index)
      continue
    }
    if (char === '/' && next === '*') {
      index = skipBlockComment(code, index)
      continue
    }
    if (char === '/' && regexStartsAt(code, index)) {
      index = skipRegex(code, index)
      continue
    }
    if (char !== '<' || !/[A-Za-z_$]/.test(next || '')) {
      index += 1
      continue
    }

    let nameEnd = index + 2
    while (nameEnd < code.length && /[A-Za-z0-9_$:.-]/.test(code[nameEnd])) nameEnd += 1
    const end = openingTagEnd(code, nameEnd)
    if (end < 0) return null
    const openingTag = code.slice(nameEnd, end)
    if (!/(^|\s)data-rcb\s*=/.test(openingTag)) insertions.push({ index, nameEnd })
    index = nameEnd
  }
  return insertions
}

function sourcePosition(code, index) {
  const lineStart = code.lastIndexOf('\n', index - 1)
  let line = 1
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (code.charCodeAt(cursor) === 10) line += 1
  }
  return { line, column: index - lineStart }
}

function attributeValue(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function injectAttributes(code, filePath, insertions) {
  let output = code
  for (let index = insertions.length - 1; index >= 0; index -= 1) {
    const insertion = insertions[index]
    const position = sourcePosition(code, insertion.index)
    const rcb = attributeValue(`${filePath}:${position.line}:${position.column}`)
    output = `${output.slice(0, insertion.nameEnd)} data-rcb="${rcb}"${output.slice(insertion.nameEnd)}`
  }
  return output
}

async function validatedInsertions(code, id, loader, filePath, insertions) {
  if (!insertions.length) return []
  try {
    const candidate = injectAttributes(code, filePath, insertions)
    await transformWithEsbuild(candidate, id, { loader, jsx: 'preserve', sourcemap: false })
    return insertions
  } catch {
    if (insertions.length === 1) return []
    const middle = Math.floor(insertions.length / 2)
    const [left, right] = await Promise.all([
      validatedInsertions(code, id, loader, filePath, insertions.slice(0, middle)),
      validatedInsertions(code, id, loader, filePath, insertions.slice(middle)),
    ])
    return [...left, ...right]
  }
}

/**
 * 対象プロジェクトのtsconfigがvite.configを型検査してもエラーにならないよう、
 * 戻り値をViteのPlugin型として明示する(JSDocはJS importの型推論に使われる)。
 * @returns {import('vite').Plugin}
 */
export default function rcbInject() {
  let root = process.cwd()
  return {
    name: 'rcnext-rcb-inject',
    enforce: 'pre',
    apply: 'serve',
    configResolved(config) {
      root = resolve(config.root)
    },
    async transform(code, id) {
      const cleanId = id.split('?', 1)[0]
      const extension = cleanId.endsWith('.tsx') ? 'tsx' : cleanId.endsWith('.jsx') ? 'jsx' : null
      if (!extension) return null
      const absoluteId = resolve(cleanId)
      const filePath = relative(root, absoluteId).replace(/\\/g, '/')
      if (!filePath || filePath === '..' || filePath.startsWith('../')) return null
      const insertions = jsxInsertions(code)
      if (!insertions?.length) return null
      try {
        await transformWithEsbuild(code, cleanId, { loader: extension, jsx: 'preserve', sourcemap: false })
        const accepted = await validatedInsertions(code, cleanId, extension, filePath, insertions)
        if (!accepted.length) return null
        const output = injectAttributes(code, filePath, accepted)
        await transformWithEsbuild(output, cleanId, { loader: extension, jsx: 'preserve', sourcemap: false })
        return { code: output, map: null }
      } catch {
        return null
      }
    },
    transformIndexHtml() {
      return [{ tag: 'script', attrs: { 'data-rcnext-inspector': '' }, children: INSPECTOR_SCRIPT, injectTo: 'body' }]
    },
  }
}
