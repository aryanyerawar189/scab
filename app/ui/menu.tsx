'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from './icons'

export type MenuItem = {
  label: string
  icon?: React.ReactNode
  onSelect: () => void
  destructive?: boolean
}

// "⋯" button with a small popover of actions. Closes on outside tap, Escape or a pick.
export function OverflowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (items.length === 0) return null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="size-9 -mr-1.5 -mt-1 rounded-full flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors"
      >
        <Icon.More className="size-5" />
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          className="absolute right-0 top-10 z-30 min-w-48 p-1.5 bg-surface border border-line rounded-lg shadow-pop animate-fade-in"
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className={`w-full flex items-center gap-2.5 h-10 px-3 rounded-xl text-sm font-medium text-left transition-colors ${
                item.destructive ? 'text-danger hover:bg-danger-soft' : 'text-ink hover:bg-surface-2'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
