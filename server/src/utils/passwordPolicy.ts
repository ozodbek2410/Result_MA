export const MIN_PASSWORD_LENGTH = 8;

/**
 * Validate a new password against the system policy.
 * Returns null when the password is acceptable, or a user-facing reason string.
 */
export function validatePassword(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD_LENGTH) {
    return `Parol kamida ${MIN_PASSWORD_LENGTH} ta belgidan iborat bo'lishi kerak`;
  }
  if (!/[A-Z]/.test(pw)) return 'Parolda kamida 1 ta katta harf bo\'lishi kerak';
  if (!/[0-9]/.test(pw)) return 'Parolda kamida 1 ta raqam bo\'lishi kerak';
  return null;
}
