'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { buttonClass } from './kit'

type ConfirmOptions = {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false)

// const confirm = useConfirm(); if (await confirm({ title: 'Delete this ride?' })) …
export function useConfirm() {
  return useContext(ConfirmContext)
}

// A bottom sheet on phones, a centred dialog on wider screens. Replaces window.confirm().
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    []
  )

  const close = useCallback(
    (ok: boolean) => {
      pending?.resolve(ok)
      setPending(null)
    },
    [pending]
  )

  useEffect(() => {
    if (!pending) return
    // Focus the sheet, not a button: Enter must never confirm a destructive action by accident
    sheetRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pending, close])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={() => close(false)} />
          <div
            ref={sheetRef}
            tabIndex={-1}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="relative w-full sm:max-w-sm outline-none bg-surface rounded-t-2xl sm:rounded-xl shadow-pop p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-sheet-up"
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
            <h2 id="confirm-title" className="text-lg font-semibold tracking-tight">
              {pending.title}
            </h2>
            {pending.body && <p className="mt-1.5 text-sm text-ink-2 leading-relaxed">{pending.body}</p>}
            <div className="mt-6 grid grid-cols-2 gap-2.5">
              <button onClick={() => close(false)} className={buttonClass({ variant: 'secondary', size: 'lg' })}>
                {pending.cancelLabel ?? 'Keep it'}
              </button>
              <button
                onClick={() => close(true)}
                className={buttonClass({ variant: pending.destructive ? 'danger' : 'primary', size: 'lg' })}
              >
                {pending.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
