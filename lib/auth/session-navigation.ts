// Token refresh and same-user sign-in events must preserve the open workspace.
export function shouldResetWorkspace(previousUserId: string | null, nextUserId: string | null): boolean {
  return previousUserId !== nextUserId
}
