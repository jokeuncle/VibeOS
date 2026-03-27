import { SlidersHorizontal, ArrowUpDown, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useT } from '../i18n'
import type { PhaseStatus, TaskPriority } from '../types'

export interface FilterState {
  status: PhaseStatus | 'all'
  priority: TaskPriority | 'all'
  sortBy: 'title' | 'priority' | 'status'
  sortDir: 'asc' | 'desc'
}

interface Props {
  filter: FilterState
  onChange: (f: FilterState) => void
}

const STATUS_OPTIONS: { value: PhaseStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
]

const PRIORITY_OPTIONS: { value: TaskPriority | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'p0', label: 'P0 Critical' },
  { value: 'p1', label: 'P1 High' },
  { value: 'p2', label: 'P2 Medium' },
  { value: 'p3', label: 'P3 Low' },
]

const SORT_OPTIONS: { value: 'title' | 'priority' | 'status'; label: string }[] = [
  { value: 'title', label: 'Name' },
  { value: 'priority', label: 'Priority' },
  { value: 'status', label: 'Status' },
]

function Dropdown({ label, value, options, onChange }: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border-subtle text-[11px] text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
      >
        <span className="text-text-tertiary">{label}:</span>
        <span className="font-medium">{selected?.label}</span>
        <ChevronDown className={`w-3 h-3 text-text-tertiary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.1 }}
              className="absolute top-full mt-1 left-0 bg-surface-2 border border-border-subtle rounded-lg shadow-xl z-50 py-1 min-w-[120px]"
            >
              {options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { onChange(opt.value); setOpen(false) }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] cursor-pointer transition-colors ${
                    opt.value === value ? 'text-accent bg-accent/5' : 'text-text-secondary hover:bg-surface-3'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function FilterToolbar({ filter, onChange }: Props) {
  const t = useT()
  const hasFilters = filter.status !== 'all' || filter.priority !== 'all'

  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <SlidersHorizontal className="w-3.5 h-3.5 text-text-tertiary shrink-0" />

      <Dropdown
        label={t('filter.status')}
        value={filter.status}
        options={STATUS_OPTIONS}
        onChange={(v) => onChange({ ...filter, status: v as any })}
      />

      <Dropdown
        label={t('filter.priority')}
        value={filter.priority}
        options={PRIORITY_OPTIONS}
        onChange={(v) => onChange({ ...filter, priority: v as any })}
      />

      <div className="w-px h-4 bg-border-subtle mx-1" />

      <Dropdown
        label={t('filter.sortBy')}
        value={filter.sortBy}
        options={SORT_OPTIONS}
        onChange={(v) => onChange({ ...filter, sortBy: v as any })}
      />

      <button
        onClick={() => onChange({ ...filter, sortDir: filter.sortDir === 'asc' ? 'desc' : 'asc' })}
        className="p-1.5 rounded-lg bg-surface-2 border border-border-subtle text-text-tertiary hover:text-text-primary cursor-pointer transition-colors"
        title={filter.sortDir === 'asc' ? 'Ascending' : 'Descending'}
      >
        <ArrowUpDown className={`w-3 h-3 ${filter.sortDir === 'desc' ? 'rotate-180' : ''} transition-transform`} />
      </button>

      {hasFilters && (
        <button
          onClick={() => onChange({ status: 'all', priority: 'all', sortBy: 'title', sortDir: 'asc' })}
          className="text-[10px] text-accent hover:text-accent-hover cursor-pointer ml-1"
        >
          {t('filter.clear')}
        </button>
      )}
    </div>
  )
}
