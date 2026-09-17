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
  pgChatReactionCounts,
  pgChatReactionSet,
} from "@/lib/cache/postgres";
import type { ChatMessage, ChatModerationStatus, ChatReaction } from "@/lib/types";

const memoryStore = new Map<string, ChatMessage[]>(); // keyed by slug
const memoryReactions = new Map<string, Map<string, ChatReaction>>(); // messageId → userId → reaction
let memoryCounter = 0;

export const MAX_BODY_LENGTH = 1000;

/** In-memory fallback: reaction tallies + viewer's own reaction for a message list. */
function reactionMapFor(
  messageIds: string[],
  viewerId: string | null
): Map<string, { likes: number; dislikes: number; myReaction: ChatReaction | null }> {
  const map = new Map<string, { likes: number; dislikes: number; myReaction: ChatReaction | null }>();
  for (const id of messageIds) map.set(id, { likes: 0, dislikes: 0, myReaction: null });
  for (const id of messageIds) {
    const perUser = memoryReactions.get(id);
    if (!perUser) continue;
    let likes = 0;
    let dislikes = 0;
    for (const reaction of perUser.values()) {
      if (reaction === "like") likes += 1;
      else dislikes += 1;
    }
    map.set(id, {
      likes,
      dislikes,
      myReaction: viewerId ? perUser.get(viewerId) ?? null : null,
    });
  }
  return map;
}

function toPublic(
  row: {
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
  },
  reaction?: { likes: number; dislikes: number; myReaction: ChatReaction | null }
): ChatMessage {
  return {
    id: row.id,
    slug: row.slug,
    user: {
      id: row.userId,
      displayName: row.displayName ?? "Deleted user",
      email: row.email ?? "",
    },
    // A removed message stays in the thread as a placeholder, but its text
    // must never be retrievable through the public API.
    body: row.moderationStatus === "removed" ? "" : row.body,
    parentId: row.parentId,
    moderationStatus: row.moderationStatus,
    removedBy: row.removedBy,
    createdAt: row.createdAt,
    likes: reaction?.likes ?? 0,
    dislikes: reaction?.dislikes ?? 0,
    myReaction: reaction?.myReaction ?? null,
  };
}

/**
 * Public thread for a slug: approved messages plus soft-removed ones (rendered
 * as "Message removed" placeholders so the conversation keeps its shape).
 * Pending (awaiting moderation) messages stay hidden. `viewerId` adds the
 * caller's own reaction.
 */
export async function listPublicMessages(
  slug: string,
  viewerId: string | null = null
): Promise<ChatMessage[]> {
  await initPostgres();
  if (pgAvailable()) {
    const rows = await pgChatList(slug, ["approved", "removed"]).catch(() => []);
    const totals = await pgChatReactionCounts(
      rows.map((r) => r.id),
      viewerId
    ).catch(() => new Map());
    return rows.map((r) => toPublic(r, totals.get(r.id)));
  }
  const list = (memoryStore.get(slug) ?? [])
    .filter((m) => m.moderationStatus === "approved" || m.moderationStatus === "removed")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const totals = reactionMapFor(
    list.map((m) => m.id),
    viewerId
  );
  return list.map((m) => ({
    ...m,
    body: m.moderationStatus === "removed" ? "" : m.body,
    ...totals.get(m.id),
  }));
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
      likes: 0,
      dislikes: 0,
      myReaction: null,
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
    likes: 0,
    dislikes: 0,
    myReaction: null,
  };
  const list = memoryStore.get(data.slug) ?? [];
  list.unshift(message);
  memoryStore.set(data.slug, list);
  return message;
}

/**
 * Dev/no-PG only: per-user message counts across the in-memory threads, so the
 * admin "Registered Users" drawer can show account activity without Postgres
 * (mirrors what pgUserList counts in SQL).
 */
export function countMemoryMessagesByUser(): Map<string, { total: number; approved: number }> {
  const counts = new Map<string, { total: number; approved: number }>();
  for (const list of memoryStore.values()) {
    for (const message of list) {
      const entry = counts.get(message.user.id) ?? { total: 0, approved: 0 };
      entry.total += 1;
      if (message.moderationStatus === "approved") entry.approved += 1;
      counts.set(message.user.id, entry);
    }
  }
  return counts;
}

/** Look up a single message within a slug's thread (for self-removal checks). */
export async function findMessage(
  slug: string,
  id: string,
  viewerId: string | null = null
): Promise<ChatMessage | null> {
  await initPostgres();
  if (pgAvailable()) {
    const rows = await pgChatList(slug, ["approved", "pending", "removed"]).catch(() => []);
    const row = rows.find((r) => r.id === id);
    if (!row) return null;
    const counts = await pgChatReactionCounts([row.id], viewerId).catch(() => new Map());
    return toPublic(row, counts.get(row.id));
  }
  // In-memory fallback has no expiry; but Find only within the slug store.
  const msg = memoryStore.get(slug)?.find((m) => m.id === id) ?? null;
  if (!msg) return null;
  const totals = reactionMapFor([msg.id], viewerId).get(msg.id);
  return { ...msg, ...totals };
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
      if (action === "delete") {
        list.splice(idx, 1);
        memoryReactions.delete(id);
      } else {
        list[idx] = { ...list[idx], moderationStatus: "approved", removedBy: null };
      }
      return true;
    }
  }
  return false;
}

/** Like/dislike a message (reaction null clears it). Returns updated tallies. */
export async function setMessageReaction(
  messageId: string,
  userId: string,
  reaction: ChatReaction | null
): Promise<{ likes: number; dislikes: number; myReaction: ChatReaction | null } | null> {
  if (pgAvailable()) {
    return pgChatReactionSet(messageId, userId, reaction).catch(() => null);
  }
  if (reaction === null) {
    memoryReactions.get(messageId)?.delete(userId);
  } else {
    const perUser = memoryReactions.get(messageId) ?? new Map<string, ChatReaction>();
    perUser.set(userId, reaction);
    memoryReactions.set(messageId, perUser);
  }
  return reactionMapFor([messageId], userId).get(messageId) ?? null;
}
