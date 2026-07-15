// Detects whether a Secrets Manager error means the secret is scheduled for
// deletion (within its recovery window). AWS phrases this as an
// InvalidRequestException whose message mentions deletion — but the exact
// wording has varied ("scheduled for deletion", "marked for deletion",
// "because it was deleted"), so match the stable parts loosely rather than a
// single literal string.
//
// Shared by:
//  - token-refresh-shim storeToken: restore the secret before re-writing on re-auth.
//  - mcp-middleware getUserToken: treat a pending-deletion secret as "not
//    authorized" (→ 403 + authorize_url) rather than a backend fault (→ 503).
export function isPendingDeletionError(e: { name?: string; message?: string }): boolean {
  if (e?.name !== 'InvalidRequestException') return false;
  const msg = (e.message || '').toLowerCase();
  return msg.includes('deletion') || msg.includes('deleted') || msg.includes('marked for deletion');
}
