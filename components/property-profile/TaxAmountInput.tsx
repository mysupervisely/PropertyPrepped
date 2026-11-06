'use client'
import { useEffect, useRef } from 'react'

/** Let the browser hold the editing buffer, preserving the caret and unfinished decimals.
 * Parent calculations may update on every key without replacing the focused input value. */
export function TaxAmountInput({ value, onChange, label, placeholder = '0.00', invalid = false }: {
  value: string; onChange: (value: string) => void; label: string; placeholder?: string; invalid?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const field = input.current
    if (field && field !== document.activeElement && field.value !== value) field.value = value
  }, [value])
  return <input ref={input} type="text" inputMode="decimal" enterKeyHint="done" autoComplete="off"
    aria-label={label} aria-invalid={invalid || undefined} defaultValue={value} placeholder={placeholder}
    onChange={event => onChange(event.currentTarget.value)}
    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }} />
}
