'use client'

import { createContext, useCallback, useContext, useState } from 'react'

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
        className="fixed inset-x-0 bottom-4 z-50 px-4 flex flex-col items-center gap-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            onClick={() => dismiss(t.id)}
            className={`pointer-events-auto w-full max-w-md px-4 py-3 rounded-2xl shadow-lg text-sm font-medium flex items-start gap-2 cursor-pointer ${
              t.kind === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
            }`}
          >
            <span>{t.kind === 'error' ? '⚠️' : '✓'}</span>
            <span className="flex-1">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
