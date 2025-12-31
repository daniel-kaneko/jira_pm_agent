import bcrypt from "bcrypt";

const BCRYPT_ROUNDS = 12;

function getSessionSecret(): string {
  return process.env.AUTH_PASSWORD_HASH || process.env.AUTH_PASSWORD || "admin";
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let charIndex = 0; charIndex < str.length; charIndex++) {
    const charCode = str.charCodeAt(charIndex);
    hash = ((hash << 5) - hash) + charCode;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, "0").slice(0, 16);
}

/**
 * Hashes a password using bcrypt with 6 rounds
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verifies a password against a bcrypt hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Creates a signed session token (secret derived from password)
 */
export function createSessionToken(username: string): string {
  const payload = `${username}:${Date.now()}`;
  const signature = simpleHash(`${payload}:${getSessionSecret()}`);
  return btoa(`${payload}:${signature}`);
}

/**
 * Validates a session token
 */
export function validateSessionToken(token: string): boolean {
  try {
    const decoded = atob(token);
    const parts = decoded.split(":");
    if (parts.length !== 3) return false;

    const [username, timestamp, signature] = parts;
    if (!username || !timestamp || !signature) return false;

    const payload = `${username}:${timestamp}`;
    const expectedSignature = simpleHash(`${payload}:${getSessionSecret()}`);

    return signature === expectedSignature;
  } catch {
    return false;
  }
}

export const SESSION_NAME = "jira-pm-session";
