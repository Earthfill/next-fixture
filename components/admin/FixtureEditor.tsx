"use client";

// ---------------------------------------------------------------------------
// FixtureEditor — per-fixture override editor (prediction scoreline, tip,
// win probability, match preview text). Saves to /api/admin/override.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Pencil, X, Loader2, CheckCircle2, Trash2 } from "lucide-react";

interface FixtureEditorProps {
  slug: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  token: string;
}

interface OverridePayload {
  predictedScore: { home: number; away: number } | null;
  tip: string | null;
  winProbability: { home: number; draw: number; away: number } | null;
  previewText: string | null;
}

export default function FixtureEditor({ slug, date, homeTeam, awayTeam, token }: FixtureEditorProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Form state — empty string means "use auto".
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [tip, setTip] = useState("");
  const [homeWin, setHomeWin] = useState("");
  const [draw, setDraw] = useState("");
  const [awayWin, setAwayWin] = useState("");
  const [previewText, setPreviewText] = useState("");

  async function openEditor(): Promise<void> {
    setOpen(true);
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/override?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`
      );
      const data = await res.json();
      const o: OverridePayload | null = data.override ?? null;
      setHome(o?.predictedScore ? String(o.predictedScore.home) : "");
      setAway(o?.predictedScore ? String(o.predictedScore.away) : "");
      setTip(o?.tip ?? "");
      setHomeWin(o?.winProbability ? String(o.winProbability.home) : "");
      setDraw(o?.winProbability ? String(o.winProbability.draw) : "");
      setAwayWin(o?.winProbability ? String(o.winProbability.away) : "");
      setPreviewText(o?.previewText ?? "");
    } catch {
      setMessage({ ok: false, text: "Failed to load current override." });
    } finally {
      setLoading(false);
    }
  }

  async function save(): Promise<void> {
    setSaving(true);
    setMessage(null);
    const hasScore = home !== "" && away !== "";
    const hasWin = homeWin !== "" && draw !== "" && awayWin !== "";
    const partialScore = (home !== "") !== (away !== "");
    const partialWin =
      (homeWin !== "" || draw !== "" || awayWin !== "") && !hasWin;

    if (partialScore || partialWin) {
      setMessage({
        ok: false,
        text: partialScore && partialWin
          ? "Enter both scores (or clear both) and all three win-probability fields (or clear all). Empty = auto."
          : partialScore
            ? "Enter both scores or clear both to use auto."
            : "Enter all three win-probability fields or clear all to use auto.",
      });
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          slug,
          expiresAt: date,
          predictedScore: hasScore ? { home: Number(home), away: Number(away) } : null,
          tip: tip.trim() || null,
          winProbability: hasWin
            ? { home: Number(homeWin), draw: Number(draw), away: Number(awayWin) }
            : null,
          previewText: previewText.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({
          ok: true,
          text: data.persisted === false
            ? "Saved (memory only — database unavailable; will be lost on restart)."
            : "Saved. Preview will refresh on next load.",
        });
      } else {
        setMessage({ ok: false, text: data.error || "Save failed." });
      }
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function revert(): Promise<void> {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/override?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.success) {
        setHome(""); setAway(""); setTip("");
        setHomeWin(""); setDraw(""); setAwayWin("");
        setPreviewText("");
        setMessage({ ok: true, text: "Override removed. Auto values restored." });
      } else {
        setMessage({ ok: false, text: data.error || "Revert failed." });
      }
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openEditor}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:border-[#002b5c]/40 hover:text-[#002b5c]"
      >
        <Pencil className="h-3 w-3" /> Edit
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="my-8 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-zinc-200 bg-zinc-50 px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-base font-bold leading-tight text-zinc-900">
                  {homeTeam} <span className="font-normal text-zinc-400">vs</span> {awayTeam}
                </h3>
                <p className="mt-1 text-xs text-zinc-500">
                  {new Date(date).toLocaleString("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto space-y-5 px-5 py-4">
              {loading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading current values…
                </div>
              ) : (
                <>
                  {/* Prediction */}
                  <section>
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      Prediction
                    </h4>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <label className="block text-xs font-medium text-zinc-600">
                        {homeTeam} goals
                        <input
                          type="number"
                          min={0}
                          value={home}
                          onChange={(e) => setHome(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-[#002b5c]/40 focus:outline-none"
                          placeholder="Auto"
                        />
                      </label>
                      <label className="block text-xs font-medium text-zinc-600">
                        {awayTeam} goals
                        <input
                          type="number"
                          min={0}
                          value={away}
                          onChange={(e) => setAway(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-[#002b5c]/40 focus:outline-none"
                          placeholder="Auto"
                        />
                      </label>
                    </div>
                    <label className="mt-3 block text-xs font-medium text-zinc-600">
                      Betting tip
                      <input
                        type="text"
                        value={tip}
                        onChange={(e) => setTip(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-[#002b5c]/40 focus:outline-none"
                        placeholder="Auto"
                      />
                    </label>
                  </section>

                  <hr className="border-zinc-100" />

                  {/* Win probability */}
                  <section>
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      Win Probability (%)
                    </h4>
                    <div className="mt-2 grid grid-cols-3 gap-3">
                      <label className="block text-xs font-medium text-zinc-600">
                        {homeTeam}
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={homeWin}
                          onChange={(e) => setHomeWin(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-[#002b5c]/40 focus:outline-none"
                          placeholder="Auto"
                        />
                      </label>
                      <label className="block text-xs font-medium text-zinc-600">
                        Draw
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={draw}
                          onChange={(e) => setDraw(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-[#002b5c]/40 focus:outline-none"
                          placeholder="Auto"
                        />
                      </label>
                      <label className="block text-xs font-medium text-zinc-600">
                        {awayTeam}
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={awayWin}
                          onChange={(e) => setAwayWin(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-[#002b5c]/40 focus:outline-none"
                          placeholder="Auto"
                        />
                      </label>
                    </div>
                  </section>

                  <hr className="border-zinc-100" />

                  {/* Match preview text */}
                  <section>
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      Match Preview Text
                    </h4>
                    <textarea
                      rows={8}
                      value={previewText}
                      onChange={(e) => setPreviewText(e.target.value)}
                      className="mt-2 w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 text-sm leading-relaxed text-zinc-800 placeholder:text-zinc-400 focus:border-[#002b5c]/40 focus:outline-none"
                      placeholder="Auto-generated preview (leave empty to use auto)"
                    />
                  </section>
                </>
              )}

              {message && (
                <div
                  className={`rounded-lg border px-3 py-2.5 text-xs leading-relaxed ${
                    message.ok
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {message.text}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3">
              <button
                type="button"
                onClick={revert}
                disabled={saving || loading}
                className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Revert to auto
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs font-semibold text-zinc-600 px-3 py-2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || loading}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-white px-3 py-2 disabled:opacity-50"
                  style={{ background: "#002b5c" }}
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}{" "}
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}