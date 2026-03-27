import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

export interface ContextMenuItem {
  id: string
  label: string
  icon?: ReactNode
  danger?: boolean
  onClick: () => void
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const adjustedX = Math.min(x, window.innerWidth - 200)
  const adjustedY = Math.min(y, window.innerHeight - items.length * 36 - 16)

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className="fixed z-[70] min-w-[160px] py-1 rounded-xl border border-border-default bg-surface-2 shadow-xl shadow-black/30"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => {
            item.onClick()
            onClose()
          }}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs cursor-pointer transition-colors ${
            item.danger
              ? 'text-danger hover:bg-danger/10'
              : 'text-text-secondary hover:bg-surface-3 hover:text-text-primary'
          }`}
        >
          {item.icon && <span className="w-4 h-4 flex items-center justify-center">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </motion.div>
  )
}

export function useContextMenu() {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }

  function closeMenu() {
    setMenu(null)
  }

  return { menu, onContextMenu, closeMenu }
}
