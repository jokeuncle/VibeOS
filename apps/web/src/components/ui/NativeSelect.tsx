import { ChevronDown } from 'lucide-react'
import { SELECT_STYLES } from './FormSelect'

export interface NativeSelectOption {
  value: string
  label: string
}

export interface NativeSelectProps {
  value: string
  options: NativeSelectOption[]
  onChange: (value: string) => void
  /** Compact for toolbars; default forms. */
  size?: 'sm' | 'md'
  disabled?: boolean
  /** Default true. Set false for inline / toolbar picks. */
  fullWidth?: boolean
  placeholder?: string
  className?: string
  id?: string
  'aria-label'?: string
}

/**
 * NativeSelect - 原生select的样式包装组件
 *
 * 特点:
 * - 使用原生HTML select元素，保证表单兼容性和可访问性
 * - 视觉风格与FormSelect完全一致
 * - 轻量级，适合简单场景
 * - 支持所有FormSelect的视觉变体（size、disabled、fullWidth等）
 */
export default function NativeSelect({
  value,
  options,
  onChange,
  size = 'md',
  disabled = false,
  fullWidth = true,
  placeholder,
  className = '',
  id,
  'aria-label': ariaLabel,
}: NativeSelectProps) {
  const sz = SELECT_STYLES.size[size]
  const selected = options.find((o) => o.value === value)

  return (
    <div className={`relative ${fullWidth ? 'w-full' : 'inline-block align-middle'} ${className}`.trim()}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className={[
          // 基础布局
          'w-full appearance-none',
          // 触发器样式（与FormSelect一致）
          SELECT_STYLES.trigger.base,
          SELECT_STYLES.trigger.surface,
          SELECT_STYLES.trigger.hover,
          SELECT_STYLES.trigger.focus,
          SELECT_STYLES.trigger.shadow,
          SELECT_STYLES.trigger.disabled,
          disabled ? '' : SELECT_STYLES.trigger.cursor,
          // 尺寸
          sz.trigger,
        ].join(' ')}
      >
        {placeholder && (
          <option value="" disabled className={SELECT_STYLES.text.quaternary}>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            className={[
              'bg-surface-3',
              opt.value === value ? SELECT_STYLES.text.primary : SELECT_STYLES.text.secondary,
            ].join(' ')}
          >
            {opt.label}
          </option>
        ))}
      </select>

      {/* 自定义下拉箭头，替代原生箭头 */}
      <ChevronDown
        className={[
          'absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none',
          SELECT_STYLES.text.tertiary,
          sz.chevron,
          disabled ? 'opacity-45' : '',
        ].join(' ')}
        aria-hidden
      />
    </div>
  )
}
