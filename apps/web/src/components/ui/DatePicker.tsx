import { useState, useRef, useEffect } from 'react'
import { DayPicker, getDefaultClassNames } from 'react-day-picker'
import { motion, AnimatePresence } from 'framer-motion'
import { Calendar, X } from 'lucide-react'
import { useI18nStore } from '../../i18n'
import 'react-day-picker/style.css'

interface DatePickerProps {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function DatePicker({ value, onChange, placeholder }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { locale } = useI18nStore()

  const selected = value ? new Date(value + 'T00:00:00') : undefined
  const defaultClassNames = getDefaultClassNames()

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [open])

  function handleSelect(date: Date | undefined) {
    if (date) {
      const yyyy = date.getFullYear()
      const mm = String(date.getMonth() + 1).padStart(2, '0')
      const dd = String(date.getDate()).padStart(2, '0')
      onChange(`${yyyy}-${mm}-${dd}`)
    } else {
      onChange('')
    }
    setOpen(false)
  }

  const displayValue = selected
    ? selected.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-all ${
            open
              ? 'bg-surface-2 border-accent/40 text-text-primary'
              : 'bg-surface-2 border-border-default text-text-primary hover:border-border-strong'
          }`}
        >
          <Calendar className={`w-3.5 h-3.5 ${displayValue ? 'text-accent' : 'text-text-tertiary'}`} />
          <span className={displayValue ? 'text-text-primary' : 'text-text-tertiary'}>
            {displayValue || placeholder || 'Pick a date…'}
          </span>
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="p-1 rounded-md text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-colors cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 mt-1.5 left-0 rounded-xl border border-border-default bg-surface-1 shadow-xl shadow-black/30 overflow-hidden"
          >
            <DayPicker
              mode="single"
              selected={selected}
              onSelect={handleSelect}
              defaultMonth={selected}
              classNames={{
                root: `${defaultClassNames.root} vibe-datepicker`,
                selected: 'rdp-selected',
                today: 'rdp-today',
                chevron: `${defaultClassNames.chevron} fill-accent`,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
