// Sign-in rules shared by every form and action that sets an email or password (no imports: safe in forms).
export const MIN_PASSWORD_LENGTH = 8;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const DUPLICATE_EMAIL = "An account with this email already exists.";
