// ---------------------------------------------------------------------------
// Session auth — HttpOnly cookie sessions for the logged-in preview chat.
// ---------------------------------------------------------------------------
// Postgres (app_users + app_sessions) is the authoritative store so sessions
// survive across serverless instances. An in-memory fallback keeps local dev /
// standalone (no DATABASE_URL) working in exactly the same way as the other
// stores (admin-overrides, hidden-fixtures, app_settings).

import { cookies } from "next/headers";
import crypto from "node:crypto";
import {
  initPostgres,
  pgAvailable,
  pgUserCreate,
  pgUserFindByEmail,
  pgUserGetById,
  pgSessionCreate,
  pgSessionGet,
  pgSessionDelete,
  pgEmailTokenCreate,
  pgEmailTokenGetValid,
  pgEmailTokenMarkUsed,
  pgUserSetVerified,
} from "@/lib/cache/postgres";

const SESSION_COOKIE = "nf_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const VERIFY_TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24h

interface SessionEntry {
  userId: string;
  expiresAt: number;
}

interface EmailTokenEntry {
  userId: string;
  email: string;
  purpose: string;
  used: boolean;
  expiresAt: number;
}

// No-PG fallback stores (dev/standalone only).
const memUsers = new Map<string, { id: string; email: string; displayName: string; passwordHash: string; verified?: boolean }>();
const memSessions = new Map<string, SessionEntry>();
const memTokens = new Map<string, EmailTokenEntry>();

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  verified: boolean;
}

/** Create a session (and cookie) for a user; returns the session token. */
export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await initPostgres();
  if (pgAvailable()) {
    await pgSessionCreate({ token, userId, expiresAt: expiresAt.toISOString() });
  } else {
    memSessions.set(token, { userId, expiresAt: expiresAt.getTime() });
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

/** Resolve the currently logged-in user from the session cookie, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  await initPostgres();
  let userId: string | null = null;
  if (pgAvailable()) {
    const session = await pgSessionGet(token).catch(() => null);
    if (session) userId = session.userId;
  } else {
    const mem = memSessions.get(token);
    if (mem && mem.expiresAt > Date.now()) userId = mem.userId;
  }
  if (!userId) return null;

  if (pgAvailable()) {
    const user = await pgUserGetById(userId).catch(() => null);
    if (!user) return null;
    return { id: user.id, email: user.email, displayName: user.displayName, verified: !!user.verifiedAt };
  }

  const mem = memUsers.get(userId);
  if (!mem) return null;
  return { id: mem.id, email: mem.email, displayName: mem.displayName, verified: !!mem.verified };
}

/** Destroy the current session (logout). */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await initPostgres();
    if (pgAvailable()) await pgSessionDelete(token).catch(() => undefined);
    memSessions.delete(token);
  }
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}

/** Register a new user (no fallback here — requires the DB to exist). */
export async function createUser(data: {
  email: string;
  displayName: string;
  passwordHash: string;
}): Promise<SessionUser | null> {
  await initPostgres();
  const id = crypto.randomUUID();
  if (pgAvailable()) {
    const ok = await pgUserCreate({
      id,
      email: data.email,
      displayName: data.displayName,
      passwordHash: data.passwordHash,
    });
    if (!ok) return null;
    return { id, email: data.email, displayName: data.displayName, verified: false };
  }
  // No-PG fallback (registration is possible but ephemeral — for local dev only).
  memUsers.set(id, { ...data, id, verified: false });
  return { id, email: data.email, displayName: data.displayName, verified: false };
}

/** Look up a user by email (for login). Handles both PG and no-PG fallback. */
export async function findUserByEmail(email: string): Promise<SessionUser & { passwordHash: string } | null> {
  await initPostgres();
  if (pgAvailable()) {
    const user = await pgUserFindByEmail(email).catch(() => null);
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      verified: !!user.verifiedAt,
      passwordHash: user.passwordHash,
    };
  }
  for (const u of memUsers.values()) {
    if (u.email === email) {
      return {
        id: u.id, email: u.email, displayName: u.displayName,
        verified: !!u.verified, passwordHash: u.passwordHash,
      };
    }
  }
  return null;
}

/** Create a one-time email token (for verify-on-register). Stores + returns it. */
export async function createEmailToken(
  userId: string,
  email: string,
  purpose: "verify_email" = "verify_email"
): Promise<{ token: string; expiresAt: string } | null> {
  await initPostgres();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_SECONDS * 1000);

  if (pgAvailable()) {
    const ok = await pgEmailTokenCreate({
      id: crypto.randomUUID(),
      userId,
      email,
      purpose,
      token,
      expiresAt: expiresAt.toISOString(),
    }).catch(() => false);
    if (!ok) return null;
    return { token, expiresAt: expiresAt.toISOString() };
  }

  memTokens.set(token, { userId, email, purpose, used: false, expiresAt: expiresAt.getTime() });
  return { token, expiresAt: expiresAt.toISOString() };
}

/** Validate & redeem a one-time email verification token; marks user verified. */
export async function verifyEmailToken(token: string): Promise<{
  userId: string;
  email: string;
  displayName: string;
} | null> {
  await initPostgres();
  if (pgAvailable()) {
    const entry = await pgEmailTokenGetValid(token, "verify_email").catch(() => null);
    if (!entry) return null;
    const user = await pgUserGetById(entry.userId).catch(() => null);
    if (!user) return null;
    await pgEmailTokenMarkUsed(entry.id).catch(() => undefined);
    await pgUserSetVerified(entry.userId).catch(() => undefined);
    // keep the no-PG fallback in sync (harmless when PG is the source of truth)
    const mem = memUsers.get(entry.userId);
    if (mem) mem.verified = true;
    return { userId: entry.userId, email: entry.email, displayName: user.displayName };
  }

  const mem = memTokens.get(token);
  if (!mem || mem.used || mem.expiresAt < Date.now() || mem.purpose !== "verify_email") return null;
  mem.used = true;
  const u = memUsers.get(mem.userId);
  if (!u) return null;
  u.verified = true;
  return { userId: mem.userId, email: mem.email, displayName: u.displayName };
}
