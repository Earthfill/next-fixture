// ---------------------------------------------------------------------------
// Preview chat — threaded match discussion for /previews/[slug]
// ---------------------------------------------------------------------------
// Backed by the dedicated preview_chat_messages table + an in-memory fallback
// for no-PG (dev/standalone) environments. Postgres is the single source of
// truth so messages posted on one serverless instance are immediately visible
// on another (mirrors lib/admin-overrides.ts).

import {
  initPostgres,
  pgAvailable,
  pgChatList,
  pgChatCreate,
  pgChatRemove,
  pgChatModerate,
  pgChatExists,
} from "@/lib/cache/postgres";
import type { ChatMessage, ChatModerationStatus } from "@/lib/types";

const memoryStore = new Map<string, ChatMessage[]>(); // keyed by slug
let memoryCounter = 0;

export const MAX_BODY_LENGTH = 1000;

function toPublic(row: {
  id: string;
  slug: string;
  userId: string;
  body: string;
  parentId: string | null;
  moderationStatus: ChatModerationStatus;
  removedBy: string | null;
  createdAt: string;
  displayName: string | null;
  email: string | null;
}): ChatMessage {
  return {
    id: row.id,
    slug: row.slug,
    user: {
      id: row.userId,
      displayName: row.displayName ?? "Deleted user",
      email: row.email ?? "",
    },
    body: row.body,
    parentId: row.parentId,
    moderationStatus: row.moderationStatus,
    removedBy: row.removedBy,
    createdAt: row.createdAt,
  };
}

/** Public thread for a slug: only approved messages. */
export async function listApprovedMessages(slug: string): Promise<ChatMessage[]> {
  await initPostgres();
  if (pgAvailable()) {
    const rows = await pgChatList(slug, ["approved"]).catch(() => []);
    return rows.map(toPublic);
  }
  return (memoryStore.get(slug) ?? [])
    .filter((m) => m.moderationStatus === "approved")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Post a new message (or reply). Returns the created message, or null on failure. */
export async function createMessage(data: {
  slug: string;
  userId: string;
  body: string;
  parentId: string | null;
  displayName: string;
  email: string;
  /** Fixture kickoff (UTC ISO) — used by the daily cron to drop finished-match threads. */
  matchDate: string | null;
}): Promise<ChatMessage | null> {
  // Validate reply parent exists (must be a real message on the same slug).
  // Only enforced when Postgres is available (dev/standalone fallback has no
  // reliable existence check, so replies are accepted there too).
  if (data.parentId && pgAvailable()) {
    const ok = await pgChatExists(data.parentId).catch(() => false);
    if (!ok) return null;
  }

  const id = `chat_${Date.now()}_${memoryCounter++}`;
  const createdAt = new Date().toISOString();

  if (pgAvailable()) {
    const row = await pgChatCreate({
      id,
      slug: data.slug,
      userId: data.userId,
      body: data.body,
      parentId: data.parentId,
      matchDate: data.matchDate,
    }).catch(() => null);
    if (!row) return null;
    return {
      id: row.id,
      slug: data.slug,
      user: { id: data.userId, displayName: data.displayName, email: data.email },
      body: data.body,
      parentId: data.parentId,
      moderationStatus: row.moderationStatus,
      removedBy: null,
      createdAt: row.createdAt,
    };
  }

  const message: ChatMessage = {
    id,
    slug: data.slug,
    user: { id: data.userId, displayName: data.displayName, email: data.email },
    body: data.body,
    parentId: data.parentId,
    moderationStatus: "approved",
    removedBy: null,
    createdAt,
  };
  const list = memoryStore.get(data.slug) ?? [];
  list.unshift(message);
  memoryStore.set(data.slug, list);
  return message;
}

/** Look up a single message within a slug's thread (for self-removal checks). */
export async function findMessage(slug: string, id: string): Promise<ChatMessage | null> {
  await initPostgres();
  if (pgAvailable()) {
    const rows = await pgChatList(slug, ["approved", "pending", "removed"]).catch(() => []);
    const row = rows.find((r) => r.id === id);
    return row ? toPublic(row) : null;
  }
  // In-memory fallback has no expiry; but Find only within the slug store.
  return memoryStore.get(slug)?.find((m) => m.id === id) ?? null;
}

/** Soft-remove a message (author self-removal or admin). */
export async function removeMessage(id: string, removedBy: string): Promise<boolean> {
  if (pgAvailable()) {
    return pgChatRemove(id, removedBy).catch(() => false);
  }
  for (const list of memoryStore.values()) {
    const idx = list.findIndex((m) => m.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], moderationStatus: "removed", removedBy };
      return true;
    }
  }
  return false;
}

/** Admin: approve or hard-delete a message. */
export async function moderateMessage(id: string, action: "approve" | "delete"): Promise<boolean> {
  if (pgAvailable()) {
    return pgChatModerate(id, action).catch(() => false);
  }
  for (const list of memoryStore.values()) {
    const idx = list.findIndex((m) => m.id === id);
    if (idx !== -1) {
      if (action === "delete") list.splice(idx, 1);
      else list[idx] = { ...list[idx], moderationStatus: "approved", removedBy: null };
      return true;
    }
  }
  return false;
}
