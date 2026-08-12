import { useEffect, useState } from 'react'

// Shared by any overlay card that needs a CSS exit animation to
// actually finish before it unmounts (ChurchCard, EventDetailCard).
// React removes a conditionally-rendered component from the DOM the
// instant its condition goes false — there's no built-in way to wait
// for a CSS animation first. So "closing" goes through a brief local
// state that triggers the exit animation via the returned `isClosing`
// flag, then calls the real onClose once `durationMs` has passed.
//
// Keep `durationMs` in sync with however long the actual CSS
// `animation` you're pairing this with takes — this hook has no way
// to know that on its own.
export function useClosingAnimation(onClose, durationMs = 180) {
  const [isClosing, setIsClosing] = useState(false)

  function startClosing() {
    setIsClosing(true)
  }

  useEffect(() => {
    if (!isClosing) return
    const timer = setTimeout(onClose, durationMs)
    return () => clearTimeout(timer)
  }, [isClosing, onClose, durationMs])

  return { isClosing, startClosing }
}