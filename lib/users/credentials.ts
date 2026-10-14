// Sign-in rules shared by every form and action that sets an email or password (no imports: safe in forms).
export const MIN_PASSWORD_LENGTH = 8;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const DUPLICATE_EMAIL = "An account with this email already exists.";
export const MAX_PASSWORD_LENGTH = 64;
export const MAX_EMAIL_LENGTH = 254;
export const PASSWORD_TOO_LONG = `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`;
export const EMAIL_TOO_LONG = `Email must be ${MAX_EMAIL_LENGTH} characters or fewer.`;
// Hashing cost for stored passwords (bcrypt).
export const BCRYPT_COST = 12;
// bcrypt reads only the first 72 bytes, so anything longer would be cut short without a word.
const BCRYPT_MAX_BYTES = 72;

export function isPasswordTooLong(password: string): boolean {
  return password.length > MAX_PASSWORD_LENGTH || new TextEncoder().encode(password).length > BCRYPT_MAX_BYTES;
}
