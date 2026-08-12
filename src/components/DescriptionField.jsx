import { useEffect, useRef, useState } from 'react'

// Wraps a plain textarea with small formatting tools that write a
// hand-rolled syntax at the cursor/selection — **bold**, _italic_,
// ~underline~, and [text](url) links. Keeping the stored value plain
// text with a few tightly-scoped patterns (rather than a real
// rich-text/HTML editor) is what lets the display side
// (utils/renderFormattedText) turn just those patterns into real
// elements without ever using dangerouslySetInnerHTML.
export default function DescriptionField({ id, value, onChange }) {
  const textareaRef = useRef(null)
  const [showLinkTool, setShowLinkTool] = useState(false)
  const [linkText, setLinkText] = useState('')
  const [linkUrl, setLinkUrl] = useState('')

  // Starts larger (to match the bigger Event Detail Card) and then
  // tracks content height from there — grows OR shrinks as the admin
  // types/deletes, rather than staying fixed at the larger size
  // regardless of how much text is actually in it.
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [value])

  // Wraps the current selection in `before`/`after` (or, if nothing's
  // selected, inserts `placeholder` between them so there's something
  // to immediately start typing over) — shared by the Bold/Italic/
  // Underline buttons, which differ only in which characters they use.
  function wrapSelection(before, after, placeholder) {
    const textarea = textareaRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = value.slice(start, end) || placeholder
    const nextValue = value.slice(0, start) + before + selected + after + value.slice(end)

    onChange(nextValue)

    requestAnimationFrame(() => {
      textarea.focus()
      const selStart = start + before.length
      textarea.setSelectionRange(selStart, selStart + selected.length)
    })
  }

  function insertLink() {
    const text = linkText.trim()
    const url = linkUrl.trim()
    if (!text || !url) return

    const textarea = textareaRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const markdown = `[${text}](${url})`
    const nextValue = value.slice(0, start) + markdown + value.slice(end)

    onChange(nextValue)
    setLinkText('')
    setLinkUrl('')
    setShowLinkTool(false)

    requestAnimationFrame(() => {
      textarea.focus()
      const cursor = start + markdown.length
      textarea.setSelectionRange(cursor, cursor)
    })
  }

  return (
    <div className="description-field">
      <div className="description-field__toolbar">
        <button
          type="button"
          className="description-field__format-button"
          onClick={() => wrapSelection('**', '**', 'bold text')}
          aria-label="Bold"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className="description-field__format-button"
          onClick={() => wrapSelection('_', '_', 'italic text')}
          aria-label="Italic"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className="description-field__format-button"
          onClick={() => wrapSelection('~', '~', 'underlined text')}
          aria-label="Underline"
        >
          <u>U</u>
        </button>
        <button
          type="button"
          className="description-field__toolbar-button"
          onClick={() => setShowLinkTool((s) => !s)}
        >
          🔗 Insert link
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
            disabled={!linkText.trim() || !linkUrl.trim()}
          >
            Insert
          </button>
        </div>
      )}

      <textarea
        id={id}
        ref={textareaRef}
        className="description-field__textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        placeholder="Optional"
      />
    </div>
  )
}