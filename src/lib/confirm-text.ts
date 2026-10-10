/** Does the typed text unlock a type-the-name ConfirmDialog? Case-insensitive, trimmed, never against an empty expectation. */
export function matchesConfirmText(typed: string, expected: string): boolean {
  return typed.trim().toLowerCase() === expected.trim().toLowerCase() && expected.trim().length > 0;
}
