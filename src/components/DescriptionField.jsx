import { useEffect, useRef, useState } from 'react'
import { formatSyntaxToHtml } from '../utils/formatSyntax'

// A small WYSIWYG editor for event descriptions: a contentEditable
// div plus Bold/Italic/Underline/Link buttons, formatting text in
// place as you click rather than wrapping it in visible **/_/~
// characters you have to imagine the result of.
//
// The stored value is still the same narrow hand-rolled syntax as
// before (**bold**, _italic_, ~underline~, [text](url)) — this
// editor is just a nicer way to write it. On mount, the stored text
// is converted to HTML (formatSyntaxToHtml) to seed the editable
// div; on every edit, domToFormatSyntax below walks the DOM back
// into that same syntax and that's what's actually passed to
// onChange. The display side (utils/renderFormattedText) still only
// ever sees this narrow syntax, not raw HTML — so it doesn't need
// dangerouslySetInnerHTML and its parsing rules haven't changed.
//
// document.execCommand is deprecated but still broadly supported for
// this exact use case (basic bold/italic/underline toggling on a
// contentEditable) and is what keeps this lightweight — a full
// selection-model editor would be a lot more code for the same
// result here. styleWithCSS is turned off so browsers emit plain
// <b>/<i>/<u> tags instead of inline styles/<span>s, which is what
// domToFormatSyntax below knows how to read.
export default function DescriptionField({ id, value, onChange }) {
  const editorRef = useRef(null)
  const lastEmittedRef = useRef(value)
  // Captured when the Link button is pressed, so the cursor position
  // (or highlighted text) is preserved even though focus then moves
  // to the Link text/URL inputs below — without this, execCommand at
  // Insert time would act wherever the selection happens to be by
  // then instead of where the admin actually meant it to go.
  const savedRangeRef = useRef(null)
  const [showLinkTool, setShowLinkTool] = useState(false)
  const [linkText, setLinkText] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false })

  // Seeds the editor once, and re-seeds only when `value` changes for
  // a reason OTHER than our own typing (e.g. the form resetting to ''
  // after a successful submit) — otherwise this would clobber the
  // DOM (and the cursor position) on every keystroke.
  useEffect(() => {
    if (value === lastEmittedRef.current) return
    if (editorRef.current) {
      editorRef.current.innerHTML = formatSyntaxToHtml(value)
    }
    lastEmittedRef.current = value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    try {
      document.execCommand('styleWithCSS', false, false)
    } catch {
      // Some browsers don't support this query outside a live edit
      // context — harmless either way, it's just a preference.
    }
  }, [])

  function emitChange() {
    const editor = editorRef.current
    if (!editor) return
    const next = domToFormatSyntax(editor)
    lastEmittedRef.current = next
    onChange(next)
  }

  function updateActiveFormats() {
    try {
      setActiveFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
      })
    } catch {
      // Ignore — this is a cosmetic toolbar highlight, not essential.
    }
  }

  function applyFormat(command) {
    editorRef.current?.focus()
    document.execCommand(command)
    updateActiveFormats()
    emitChange()
  }

  function handleKeyDown(e) {
    // Forces a consistent <br>-based newline across browsers instead
    // of some inserting a wrapping <div> per line (Chrome's default),
    // which domToFormatSyntax would otherwise have to special-case.
    if (e.key === 'Enter') {
      e.preventDefault()
      document.execCommand('insertLineBreak')
      emitChange()
    }
  }

  // Opens the link tool, capturing whatever's currently selected in
  // the editor (a cursor position, or highlighted text) so Insert can
  // restore it later. If text was highlighted, it's pulled straight
  // into the Link text field instead of making the admin retype it.
  function handleLinkButtonClick() {
    if (showLinkTool) {
      setShowLinkTool(false)
      setLinkText('')
      setLinkUrl('')
      savedRangeRef.current = null
      return
    }

    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0 && editorRef.current?.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0).cloneRange()
      savedRangeRef.current = range
      const selectedText = range.toString()
      if (selectedText) setLinkText(selectedText)
    } else {
      savedRangeRef.current = null
    }
    setShowLinkTool(true)
  }

  function insertLink() {
    const text = linkText.trim()
    const url = linkUrl.trim()
    if (!text || !url || !/^https?:\/\//.test(url)) return

    const editor = editorRef.current
    editor?.focus()

    // Restore the cursor/selection captured when the Link button was
    // pressed — focusing the text/URL inputs above moved focus (and
    // the browser's selection) away from the editor in the meantime.
    const selection = window.getSelection()
    if (savedRangeRef.current && selection) {
      selection.removeAllRanges()
      selection.addRange(savedRangeRef.current)
    }

    const escapedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const escapedUrl = url.replace(/"/g, '&quot;')
    document.execCommand('insertHTML', false, `<a href="${escapedUrl}">${escapedText}</a>`)

    savedRangeRef.current = null
    setLinkText('')
    setLinkUrl('')
    setShowLinkTool(false)
    emitChange()
  }

  return (
    <div className="description-field">
      <div className="description-field__toolbar">
        <button
          type="button"
          className={
            'description-field__format-button' + (activeFormats.bold ? ' description-field__format-button--active' : '')
          }
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormat('bold')}
          aria-label="Bold"
          aria-pressed={activeFormats.bold}
        >
          <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
            <path
              fill="currentColor"
              d="M5 3h5.5a3.5 3.5 0 0 1 2.45 6c1.4.55 2.4 1.9 2.4 3.5a3.75 3.75 0 0 1-3.75 3.75H5V3Zm2.5 2.25v3.5H10a1.75 1.75 0 0 0 0-3.5H7.5Zm0 5.75v4h3.6a2 2 0 0 0 0-4H7.5Z"
            />
          </svg>
        </button>
        <button
          type="button"
          className={
            'description-field__format-button' + (activeFormats.italic ? ' description-field__format-button--active' : '')
          }
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormat('italic')}
          aria-label="Italic"
          aria-pressed={activeFormats.italic}
        >
          <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
            <path fill="currentColor" d="M8.5 3.5h6v1.8h-2.1l-2.4 9.4h2.1v1.8h-6v-1.8h2.1l2.4-9.4H8.5V3.5Z" />
          </svg>
        </button>
        <button
          type="button"
          className={
            'description-field__format-button' +
            (activeFormats.underline ? ' description-field__format-button--active' : '')
          }
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormat('underline')}
          aria-label="Underline"
          aria-pressed={activeFormats.underline}
        >
          <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
            <path
              fill="currentColor"
              d="M5.5 3v6.5a4.5 4.5 0 0 0 9 0V3h-1.8v6.5a2.7 2.7 0 0 1-5.4 0V3H5.5ZM4.5 15.5h11v1.8h-11v-1.8Z"
            />
          </svg>
        </button>
        <span className="description-field__divider" aria-hidden="true" />
        <button
          type="button"
          className={
            'description-field__toolbar-button' + (showLinkTool ? ' description-field__toolbar-button--active' : '')
          }
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleLinkButtonClick}
          aria-pressed={showLinkTool}
        >
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8.3 11.7a1 1 0 0 1 0-1.4l2-2a1 1 0 1 1 1.4 1.4l-2 2a1 1 0 0 1-1.4 0Z"
            />
            <path
              fill="currentColor"
              d="M6.6 13.4a2.5 2.5 0 0 1 0-3.5l1.4-1.4a1 1 0 1 1 1.4 1.4l-1.4 1.4a.5.5 0 0 0 0 .7.5.5 0 0 0 .7 0l1.4-1.4a1 1 0 1 1 1.4 1.4l-1.4 1.4a2.5 2.5 0 0 1-3.5 0Zm6.8-6.8a2.5 2.5 0 0 1 0 3.5l-1.4 1.4a1 1 0 1 1-1.4-1.4l1.4-1.4a.5.5 0 0 0-.7-.7l-1.4 1.4a1 1 0 1 1-1.4-1.4l1.4-1.4a2.5 2.5 0 0 1 3.5 0Z"
            />
          </svg>
          Link
        </button>
      </div>

      {showLinkTool && (
        <div className="description-field__link-tool">
          <input
            type="text"
            placeholder="Link text"
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
          />
          <input
            type="url"
            placeholder="https://…"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
          />
          <button
            type="button"
            onClick={insertLink}
            disabled={!linkText.trim() || !linkUrl.trim() || !/^https?:\/\//.test(linkUrl.trim())}
          >
            Insert
          </button>
        </div>
      )}

      <div
        id={id}
        ref={editorRef}
        className="description-field__editor"
        contentEditable
        onInput={emitChange}
        onKeyDown={handleKeyDown}
        onKeyUp={updateActiveFormats}
        onMouseUp={updateActiveFormats}
        onFocus={updateActiveFormats}
        data-placeholder="Optional"
        suppressContentEditableWarning
      />
    </div>
  )
}

// Walks the editor's DOM back into the stored **/_/~/[]() syntax.
// Flattens any nesting to a single format per run of text (matching
// the "formatting does NOT nest" rule the display side relies on) —
// if a browser ever produces overlapping tags from an unusual
// selection, the outermost recognized tag wins and inner tags are
// read as plain text via textContent.
function domToFormatSyntax(root) {
  let out = ''
  root.childNodes.forEach((node) => {
    out += nodeToFormatSyntax(node)
  })
  return out
}

function nodeToFormatSyntax(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const tag = node.tagName
  if (tag === 'BR') return '\n'
  if (tag === 'B' || tag === 'STRONG') return `**${node.textContent}**`
  if (tag === 'I' || tag === 'EM') return `_${node.textContent}_`
  if (tag === 'U') return `~${node.textContent}~`
  if (tag === 'A') {
    const href = node.getAttribute('href') || ''
    const text = node.textContent
    return /^https?:\/\//.test(href) && text ? `[${text}](${href})` : text
  }
  // Chrome wraps each new line in its own <div> on Enter in some
  // cases — unwrap it as a line rather than dropping its content.
  if (tag === 'DIV' || tag === 'P') {
    const inner = Array.from(node.childNodes).map(nodeToFormatSyntax).join('')
    return (inner ? '\n' : '') + inner
  }
  // Unknown wrapper (e.g. a stray <span>) — unwrap and keep its text.
  return Array.from(node.childNodes).map(nodeToFormatSyntax).join('')
}