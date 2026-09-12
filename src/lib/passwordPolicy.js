// Single source of truth for the password minimum, referenced by signup, password-change, and
// password-reset — previously each of those three places hardcoded its own "6" independently,
// which is exactly how a security-relevant constant drifts out of sync. Deliberately just a
// length floor, not arbitrary complexity rules (required uppercase/digit/symbol) — those rules
// are well-documented (NIST SP 800-63B) to push people toward predictable substitutions and
// password reuse rather than actually stronger passwords.
export const MIN_PASSWORD_LENGTH = 8;

export function isValidPassword(password) {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH;
}
