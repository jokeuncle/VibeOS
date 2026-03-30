import { useState, useEffect, useRef } from 'react'

const PAUSE_AFTER: Record<string, number> = {
  '.': 120, '。': 120, '!': 120, '！': 120, '?': 120, '？': 120,
  ',': 60, '，': 60, ';': 60, '；': 60, ':': 60, '：': 60,
  '\n': 80, '」': 40, '"': 40,
}

interface Props {
  text: string
  speed?: number
  onComplete?: () => void
}

export default function TypewriterText({ text, speed = 18, onComplete }: Props) {
  const [displayed, setDisplayed] = useState('')
  const cbRef = useRef(onComplete)
  cbRef.current = onComplete

  useEffect(() => {
    let idx = 0
    setDisplayed('')
    let timer: ReturnType<typeof setTimeout>

    function step() {
      if (idx >= text.length) {
        cbRef.current?.()
        return
      }
      idx++
      setDisplayed(text.slice(0, idx))
      const delay = speed + (PAUSE_AFTER[text[idx - 1]] ?? 0)
      timer = setTimeout(step, delay)
    }

    timer = setTimeout(step, 250)
    return () => clearTimeout(timer)
  }, [text, speed])

  return (
    <>
      {displayed}
      {displayed.length < text.length && (
        <span className="inline-block w-0.5 h-[1.1em] bg-accent/60 ml-px align-middle animate-pulse" />
      )}
    </>
  )
}
