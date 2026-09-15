// ---------------------------------------------------------------------------
// Password hashing — bcrypt via bcryptjs (pure JS, no native build needed,
// works consistently across local dev and Vercel serverless Node runtimes).
// ---------------------------------------------------------------------------

import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}
