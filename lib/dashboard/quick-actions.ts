// PropRoster — Mobile V2: customizable Dashboard Quick Actions.
//
// Pure catalog/validation logic only — no React, no Supabase client, no
// icons (every icon this pairs with is JSX, which lib/ files never
// contain in this codebase; app/page.tsx and app/preview/page.tsx each
// keep their own small QuickActionId -> icon lookup next to their own
// imports from components/icons/NavIcons.tsx). This file is the single
// source of truth both callers share for the id strings, their labels,
// the product defaults, and the validation a stored selection must pass
// before it's ever rendered.
//
// Every id here must have an existing, real destination behind it —
// Mobile V2's "every Quick Action must reuse an existing PropRoster
// workflow, do not invent new functionality":
//   add_expense      -> Tax Center's existing openAddExpense() modal,
//                        via the "?add=expense" one-shot flag.
//   smart_upload     -> the existing Smart Upload modal (AuthHeader's
//                        own registerSmartUploadTrigger wiring).
//   maintenance      -> the existing /maintenance route.
//   invite_tenant     \
//   tenant_messages    } -> the existing Rent > Tenant Connect tab
//                        (openProperty(id, 'Rent', ..., 'Tenant')) —
//                        the same destination handles both inviting a
//                        tenant with none yet (TenantConnectStatusCard)
//                        and messaging one already on a lease
//                        (TenantRequestsPanel's conversation view), so
//                        both ids intentionally route to the same real
//                        screen rather than inventing a second one.
//   tax_center       -> the existing /tax-center route.
//   propcrew         -> the existing /propcrew route.
//   add_property     -> the existing "?add=property" one-shot flag
//                        (openAddProperty(), including its existing
//                        plan-limit upgrade-prompt behavior).

export type QuickActionId =
  | 'add_expense'
  | 'smart_upload'
  | 'maintenance'
  | 'invite_tenant'
  | 'tax_center'
  | 'propcrew'
  | 'add_property'
  | 'tenant_messages'

// Display order for the Customize sheet's picker list — not the order
// a landlord's own selection renders in (that's whatever order they
// picked/saved, preserved as-is; see normalizeQuickActionSelection).
export const QUICK_ACTION_IDS: QuickActionId[] = [
  'add_expense',
  'smart_upload',
  'maintenance',
  'invite_tenant',
  'tax_center',
  'propcrew',
  'add_property',
  'tenant_messages',
]

export const QUICK_ACTION_LABELS: Record<QuickActionId, string> = {
  add_expense: 'Add Expense',
  smart_upload: 'Smart Upload',
  maintenance: 'Maintenance',
  invite_tenant: 'Invite Tenant',
  tax_center: 'Tax Center',
  propcrew: 'PropCrew',
  add_property: 'Add Property',
  tenant_messages: 'Tenant Messages',
}

export const QUICK_ACTION_SELECTION_SIZE = 4

// Add Property is deliberately excluded from the default set — the
// Dashboard already has its own always-visible "+ Add Property" button
// (My Properties section), so defaulting it into Quick Actions too
// would be a redundant shortcut to the same place.
export const DEFAULT_QUICK_ACTIONS: QuickActionId[] = ['add_expense', 'smart_upload', 'maintenance', 'invite_tenant']

export function isQuickActionId(value: unknown): value is QuickActionId {
  return typeof value === 'string' && (QUICK_ACTION_IDS as string[]).includes(value)
}

/** Exactly QUICK_ACTION_SELECTION_SIZE valid, unique ids — the shape both the Customize sheet's "Save" and a read from storage must satisfy. */
export function isValidQuickActionSelection(value: unknown): value is QuickActionId[] {
  if (!Array.isArray(value)) return false
  if (value.length !== QUICK_ACTION_SELECTION_SIZE) return false
  if (!value.every(isQuickActionId)) return false
  return new Set(value).size === value.length
}

/**
 * The one place that turns "whatever came back from storage" (a fresh
 * account with no row, a null column, a stale/corrupt value, or a
 * genuinely valid selection) into something safe to render. Anything
 * that isn't EXACTLY four valid, unique, currently-known ids falls back
 * to the product defaults wholesale — never a partial/padded selection,
 * and never a crash on an unexpected shape (Mobile V2: "Provide a safe
 * fallback to defaults" / "Handle loading and save failures
 * gracefully"). A valid selection's own order is preserved exactly —
 * that's the landlord's own arrangement, not re-sorted to catalog order.
 */
export function normalizeQuickActionSelection(stored: unknown): QuickActionId[] {
  if (isValidQuickActionSelection(stored)) return stored
  return DEFAULT_QUICK_ACTIONS
}
