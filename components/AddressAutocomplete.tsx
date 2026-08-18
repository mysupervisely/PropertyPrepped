'use client'

// PropRoster Milestone: Investment Tools 2.0 — the ONE reusable address
// entry component, used everywhere PropRoster asks for a property address
// (Add Property, Edit Property, Rental Property Analyzer, Home Purchase
// Calculator, Property Value & Comps).
//
// Always a normal, fully-functional text input first — autocomplete is
// strictly additive. If /api/address/search ever reports the provider as
// unconfigured (503), this component stops querying for the rest of its
// lifetime and behaves exactly like a plain <input>: manual address entry
// always works, with or without a configured provider (Part 2/3).
//
// Root-cause fix (Part 1): this input is never rendered with
// inputMode="numeric"/type="number" — inputMode is explicitly "text" so
// mobile keyboards always show letters, matching the bug report exactly
// (the old Property Evaluator address field reused a numeric-only
// NumberField component; this component exists so that mistake can't
// happen again anywhere address is collected).

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { AddressSuggestion, NormalizedAddress } from '../lib/address/types'
import { manualAddress } from '../lib/address/types'

const DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 3

type AddressAutocompleteProps = {
  id?: string
  value: string
  onTextChange: (text: string) => void
  /** Called when the user selects a real suggestion — never called for manually-typed text with no match. */
  onSelect?: (address: NormalizedAddress) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  'aria-label'?: string
}

export function AddressAutocomplete({
  id,
  value,
  onTextChange,
  onSelect,
  placeholder,
  className,
  disabled,
  'aria-label': ariaLabel,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const [resolving, setResolving] = useState(false)
  // Once the search endpoint reports "not configured" (no MAPBOX_ACCESS_TOKEN
  // on the server), stop calling it for the rest of this component's life —
  // there is no reason to keep asking, and this is exactly the manual-entry
  // fallback path (Part 3).
  const unavailableRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function scheduleSearch(query: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (unavailableRef.current) return
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      setOpen(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/address/search?q=${encodeURIComponent(query)}`)
        if (resp.status === 503) {
          unavailableRef.current = true
          setSuggestions([])
          setOpen(false)
          return
        }
        const body = (await resp.json().catch(() => ({}))) as { suggestions?: AddressSuggestion[] }
        setSuggestions(body.suggestions || [])
        setOpen(Boolean(body.suggestions?.length))
        setHighlighted(-1)
      } catch {
        // Network hiccup — fail silently into "no suggestions right now."
        // Manual typing is never blocked by this.
        setSuggestions([])
      }
    }, DEBOUNCE_MS)
  }

  function handleChange(next: string) {
    onTextChange(next)
    scheduleSearch(next)
  }

  async function selectSuggestion(suggestion: AddressSuggestion) {
    setOpen(false)
    setSuggestions([])
    onTextChange(suggestion.label)
    if (!onSelect) return
    setResolving(true)
    try {
      const resp = await fetch(`/api/address/resolve?id=${encodeURIComponent(suggestion.id)}`)
      if (resp.ok) {
        const body = (await resp.json().catch(() => ({}))) as { address?: NormalizedAddress }
        if (body.address) {
          // Core Experience Bundle, item 3: this used to also call
          // onTextChange(body.address.formattedAddress) here — always
          // overwriting whatever onSelect's caller-side state update had
          // just set (e.g. Add/Edit Property's applyNormalizedAddress(),
          // which correctly splits the resolved structured components
          // into addressLine1 for Street Address vs. city/state/postalCode
          // for City, State & ZIP) with the single full formatted string,
          // via a second, separately-raced state update. onSelect is the
          // single source of truth for what the controlled `value` becomes
          // — every caller's own onSelect already decides that (either the
          // full formattedAddress for a one-field form, or the structured
          // split for a two-field form); this component must not also try.
          onSelect(body.address)
          return
        }
      }
      // Resolve failed or returned nothing usable — the suggestion's own
      // label is still a perfectly good manually-entered address; never
      // block the user on a provider hiccup.
      onSelect(manualAddress(suggestion.label))
    } catch {
      onSelect(manualAddress(suggestion.label))
    } finally {
      setResolving(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || !suggestions.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter' && highlighted >= 0) {
      e.preventDefault()
      void selectSuggestion(suggestions[highlighted])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className={`addressAutocomplete ${className || ''}`} ref={containerRef}>
      <input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {resolving && <span className="addressResolving">Loading…</span>}
      {open && suggestions.length > 0 && (
        <ul className="addressSuggestions" role="listbox">
          {suggestions.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === highlighted}>
              <button type="button" className={i === highlighted ? 'active' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => void selectSuggestion(s)}>
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
