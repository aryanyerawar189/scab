'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { Icon } from './ui/icons'

type ToastKind = 'error' | 'success'
type Toast = { id: number; message: string; kind: ToastKind }

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

let nextId = 1

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (message: string, kind: ToastKind = 'error') => {
      const id = nextId++
      setToasts((all) => [...all.slice(-2), { id, message, kind }])
      setTimeout(() => dismiss(id), 5000)
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] px-4 flex flex-col items-center gap-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            onClick={() => dismiss(t.id)}
            className="pointer-events-auto w-full max-w-md pl-3 pr-4 py-3 rounded-lg shadow-pop text-sm font-medium flex items-center gap-3 cursor-pointer bg-ink text-canvas animate-toast-in"
          >
            <span
              className={`size-6 rounded-full flex items-center justify-center ${
                t.kind === 'error' ? 'bg-danger text-white' : 'bg-success text-white'
              }`}
            >
              {t.kind === 'error' ? <Icon.Alert className="size-3.5" /> : <Icon.Check className="size-3.5" />}
            </span>
            <span className="flex-1">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
