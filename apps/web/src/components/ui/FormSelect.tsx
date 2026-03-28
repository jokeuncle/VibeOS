import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'

interface FormSelectProps {
  value: string
  options: { value: string; label: string }[]
  placeholder?: string
  onChange: (v: string) => void
}

export default function FormSelect({ value, options, placeholder, onChange }: FormSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border-default bg-surface-2 text-sm cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent/50 transition-colors"
      >
        <span className={selected ? 'text-text-primary' : 'text-text-quaternary'}>
          {selected?.label ?? placeholder ?? ''}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute top-full mt-1 left-0 right-0 bg-surface-2 border border-border-subtle rounded-lg shadow-xl shadow-black/30 z-50 py-1 max-h-48 overflow-y-auto"
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={`w-full text-left px-3 py-1.5 text-sm cursor-pointer transition-colors ${
                  opt.value === value ? 'text-accent bg-accent/5' : 'text-text-secondary hover:bg-surface-3'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
