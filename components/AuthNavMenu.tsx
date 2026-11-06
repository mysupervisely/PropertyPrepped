'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { hasPersonalTenantAccess } from '../lib/tenant-connect/menu-access'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthUser } from '../lib/useAuthUser'
import { markExplicitSignOut } from '../lib/auth/session-signal'
const NAV_LINKS: { href: string; label: string }[] = [
  { href: '/', label: 'Dashboard' },
  { href: '/documents', label: 'Documents' },
  { href: '/tenant-connect', label: 'Tenant Connect' },
  { href: '/maintenance', label: 'Maintenance' },
  { href: '/tax-center', label: 'Tax Center' },
  { href: '/propcrew', label: 'PropCrew' },
  { href: '/investment-tools', label: 'Investment Analysis' },
]
const ACCOUNT_LINKS: { href: string; label: string }[] = [
  { href: '/profile', label: 'Profile' },
  { href: '/account/billing', label: 'Plan & billing' },
]
export function AuthNavMenu({ onDashboardNavigate, open, onOpenChange }: { onDashboardNavigate?: () => void; open: boolean; onOpenChange: (open: boolean) => void }) {
  const pathname = usePathname()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { user } = useAuthUser()
  const [hasTenantAccess, setHasTenantAccess] = useState(false)
  useEffect(() => {
    if (!supabase || !user) { setHasTenantAccess(false); return }
    let cancelled = false
    setHasTenantAccess(false)
    hasPersonalTenantAccess(supabase, user).then((hasAccess) => {
      if (!cancelled) setHasTenantAccess(hasAccess)
    }).catch(() => { if (!cancelled) setHasTenantAccess(false) })
    return () => { cancelled = true }
  }, [user?.id, user?.email])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onOpenChange(false)
    }
    function handleKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onOpenChange(false) }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onOpenChange])

  return (
    <div className="authNavMenu" ref={containerRef}>
      {open && <div className="authNavMenuBackdrop" onClick={() => onOpenChange(false)} />}
      {open && (
        <nav className="authNavMenuPanel" aria-label="Main navigation">
          <div className="authNavMenuHead"><strong>Menu</strong><button type="button" aria-label="Close menu" onClick={() => onOpenChange(false)}>×</button></div>
          <div className="authNavMenuGroup" role="group" aria-label="Portfolio">
          <p className="authNavMenuGroupLabel">Portfolio</p>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? 'page' : undefined}
              onClick={(e) => {
                onOpenChange(false)
                if (link.href === '/' && onDashboardNavigate) {
                  e.preventDefault()
                  onDashboardNavigate()
                }
              }}
            >
              {link.label}
            </Link>
          ))}
          </div>
          <div className="authNavMenuGroup" role="group" aria-label="Account">
          <p className="authNavMenuGroupLabel">Account</p>
          {ACCOUNT_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="authNavMenuSecondary" onClick={() => onOpenChange(false)}>{link.label}</Link>
          ))}
          {hasTenantAccess && (
            <Link href="/tenant" className="authNavMenuSecondary" onClick={() => onOpenChange(false)}>Tenant Portal</Link>
          )}
          </div>
          <div className="authNavMenuDivider" role="separator" />
          <button type="button" className="authNavMenuLogout" onClick={() => { onOpenChange(false); markExplicitSignOut(); void supabase?.auth.signOut() }}>Log out</button>
        </nav>
      )}
    </div>
  )
}
