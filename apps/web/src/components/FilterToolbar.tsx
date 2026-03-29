import { SlidersHorizontal, ArrowUpDown } from 'lucide-react'
import { useT } from '../i18n'
import FormSelect from './ui/FormSelect'
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

function useFilterOptions() {
  const t = useT()
  return {
    status: [
      { value: 'all', label: t('filter.all') },
      { value: 'pending', label: t('filter.pending') },
      { value: 'in_progress', label: t('filter.inProgress') },
      { value: 'completed', label: t('filter.completed') },
    ],
    priority: [
      { value: 'all', label: t('filter.all') },
      { value: 'p0', label: 'P0 ' + t('filter.critical') },
      { value: 'p1', label: 'P1 ' + t('filter.high') },
      { value: 'p2', label: 'P2 ' + t('filter.medium') },
      { value: 'p3', label: 'P3 ' + t('filter.low') },
    ],
    sort: [
      { value: 'title', label: t('filter.name') },
      { value: 'priority', label: t('filter.priority') },
      { value: 'status', label: t('filter.status') },
    ],
  }
}

export default function FilterToolbar({ filter, onChange }: Props) {
  const t = useT()
  const opts = useFilterOptions()
  const hasFilters = filter.status !== 'all' || filter.priority !== 'all'

  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <SlidersHorizontal className="w-3.5 h-3.5 text-text-tertiary shrink-0" />

      <FormSelect
        size="sm"
        fullWidth={false}
        prefix={t('filter.status')}
        value={filter.status}
        options={opts.status}
        onChange={(v) => onChange({ ...filter, status: v as FilterState['status'] })}
      />

      <FormSelect
        size="sm"
        fullWidth={false}
        prefix={t('filter.priority')}
        value={filter.priority}
        options={opts.priority}
        onChange={(v) => onChange({ ...filter, priority: v as FilterState['priority'] })}
      />

      <div className="w-px h-4 bg-border-subtle mx-1" />

      <FormSelect
        size="sm"
        fullWidth={false}
        prefix={t('filter.sortBy')}
        value={filter.sortBy}
        options={opts.sort}
        onChange={(v) => onChange({ ...filter, sortBy: v as FilterState['sortBy'] })}
      />

      <button
        type="button"
        onClick={() => onChange({ ...filter, sortDir: filter.sortDir === 'asc' ? 'desc' : 'asc' })}
        className="p-1.5 rounded-lg bg-surface-2 border border-border-subtle text-text-tertiary hover:text-text-primary cursor-pointer transition-colors"
        title={filter.sortDir === 'asc' ? 'Ascending' : 'Descending'}
      >
        <ArrowUpDown className={`w-3 h-3 ${filter.sortDir === 'desc' ? 'rotate-180' : ''} transition-transform`} />
      </button>

      {hasFilters && (
        <button
          type="button"
          onClick={() => onChange({ status: 'all', priority: 'all', sortBy: 'title', sortDir: 'asc' })}
          className="text-[10px] text-accent hover:text-accent-hover cursor-pointer ml-1"
        >
          {t('filter.clear')}
        </button>
      )}
    </div>
  )
}
