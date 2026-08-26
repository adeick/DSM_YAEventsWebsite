// Shared parsing for the small hand-rolled formatting syntax used in
// event descriptions — **bold**, _italic_, ~underline~, and
// [text](url) links. Each delimiter is a distinct character so none
// of the patterns can be confused with each other (unlike real
// markdown, where * does double duty for both bold and italic).
// Formatting does NOT nest (no bold text inside a link, etc.) — this
// is a deliberately small format, not a markdown implementation.
//
// parseFormatSyntax() is the single source of truth for what counts
// as a match. renderFormattedText.jsx turns its output into React
// elements for display; DescriptionField.jsx turns it into HTML to
// seed the editor. Both stay narrow (plain text plus this fixed set
// of patterns) on purpose — see renderFormattedText.jsx for why that
// matters for avoiding dangerouslySetInnerHTML.
const FORMAT_PATTERN =
  /\*\*([^*]+)\*\*|_([^_]+)_|~([^~]+)~|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g

export function parseFormatSyntax(text) {
  if (!text) return []

  const segments = []
  let lastIndex = 0
  let match

  while ((match = FORMAT_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }

    const [fullMatch, bold, italic, underline, linkText, linkUrl] = match
    if (bold !== undefined) {
      segments.push({ type: 'bold', content: bold })
    } else if (italic !== undefined) {
      segments.push({ type: 'italic', content: italic })
    } else if (underline !== undefined) {
      segments.push({ type: 'underline', content: underline })
    } else {
      segments.push({ type: 'link', content: linkText, url: linkUrl })
    }

    lastIndex = match.index + fullMatch.length
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) })
  }

  return segments
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Builds an HTML string from the stored syntax, for seeding the
// editor's contentEditable content on mount (see DescriptionField).
// Newlines become <br> since the editor represents lines that way
// (see the DOM walker that converts back, also in DescriptionField).
export function formatSyntaxToHtml(text) {
  const segments = parseFormatSyntax(text)
  return segments
    .map((seg) => {
      const escaped = escapeHtml(seg.content).replace(/\n/g, '<br>')
      switch (seg.type) {
        case 'bold':
          return `<b>${escaped}</b>`
        case 'italic':
          return `<i>${escaped}</i>`
        case 'underline':
          return `<u>${escaped}</u>`
        case 'link':
          return `<a href="${escapeHtml(seg.url)}">${escaped}</a>`
        default:
          return escaped
      }
    })
    .join('')
}