"use client";

// ---------------------------------------------------------------------------
// FixtureEditor — per-fixture override editor (prediction scoreline, tip,
// win probability, match preview text). Saves to /api/admin/override.
// ---------------------------------------------------------------------------

import { useState, useRef } from "react";
import { Pencil, X, Loader2, CheckCircle2, Trash2, Sparkles } from "lucide-react";

interface FixtureEditorProps {
  slug: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  token: string;
  /** Whether this match is currently flagged as needing prediction review. */
  needsReview?: boolean;
  /** Called after a successful save — passes the recomputed prediction review. */
  onEdited?: (review: { flagged: boolean; reasons: string[] } | null) => void;
}

interface OverridePayload {
  predictedScore: { home: number; away: number } | null;
  tip: string | null;
  winProbability: { home: number; draw: number; away: number } | null;
  previewText: string | null;
}

interface AutoValues {
  predictedScore: { home: number; away: number } | null;
  tip: string | null;
  winProbability: { home: number; draw: number; away: number } | null;
  previewText: string | null;
}

/** Recognised tip-format templates (match the prediction-review classifier). */
function tipTemplates(home: string, away: string): { label: string; value: string }[] {
  const H = home;
  const A = away;
  return [
    { label: "Winner: Home", value: `Winner : ${H}` },
    { label: "Winner: Away", value: `Winner : ${A}` },
    { label: "DC 1X", value: `Double chance : ${H} or draw` },
    { label: "DC X2", value: `Double chance : draw or ${A}` },
    { label: "Combo +2.5", value: `Combo Winner : ${H} and +2.5 goals` },
    { label: "Combo +1.5", value: `Combo Winner : ${H} and +1.5 goals` },
    { label: "Over 2.5", value: "Over 2.5 goals" },
    { label: "Under 2.5", value: "Under 2.5 goals" },
    { label: "BTTS Yes", value: "Both teams to score" },
    { label: "CS 2-1", value: "Correct Score: 2-1" },
  ];
}

export default function FixtureEditor({ slug, date, homeTeam, awayTeam, token, needsReview, onEdited }: FixtureEditorProps) {
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

  // The pre-override ("auto") prediction values loaded when the editor opens —
  // used to decide which fields the admin actually changed before saving.
  const autoRef = useRef<AutoValues | null>(null);
  // The values the fields were prefilled with when the editor opened
  // (override ?? auto). Used to detect which fields the admin edited.
  const baselineRef = useRef<AutoValues | null>(null);

  async function fetchPrefill(): Promise<boolean> {
    try {
      const res = await fetch(
        `/api/admin/override?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`
      );
      const data = await res.json();
      const o: OverridePayload | null = data.override ?? null;
      const auto: AutoValues | null = data.auto ?? null;
      const effective: AutoValues | null = data.effective ?? null;

      // Prefill from the currently-displayed values (override wins over auto).
      // The admin can see exactly what the public preview shows before editing.
      const pre = effective ?? auto ?? o ?? null;
      autoRef.current = auto ?? o ?? null;
      baselineRef.current = pre;

      setHome(pre?.predictedScore ? String(pre.predictedScore.home) : "");
      setAway(pre?.predictedScore ? String(pre.predictedScore.away) : "");
      setTip(pre?.tip ?? "");
      setHomeWin(pre?.winProbability ? String(pre.winProbability.home) : "");
      setDraw(pre?.winProbability ? String(pre.winProbability.draw) : "");
      setAwayWin(pre?.winProbability ? String(pre.winProbability.away) : "");
      setPreviewText(pre?.previewText ?? "");

      setMessage(
        effective
          ? data.hasOverride
            ? { ok: true, text: "Loaded override — edits below will replace the auto prediction." }
            : { ok: true, text: "Prefilled from the auto prediction. Only changed fields are saved." }
          : o
            ? { ok: true, text: "Loaded override — no auto prediction available for this match." }
            : null
      );
      return true;
    } catch {
      setMessage({ ok: false, text: "Failed to load current override." });
      return false;
    }
  }

  async function openEditor(): Promise<void> {
    setOpen(true);
    setMessage(null);
    setLoading(true);
    try {
      await fetchPrefill();
    } finally {
      setLoading(false);
    }
  }

  /** Re-fetch and repopulate the form (used after reverting to auto). */
  async function reloadPrefill(): Promise<void> {
    setLoading(true);
    try {
      await fetchPrefill();
    } finally {
      setLoading(false);
    }
  }

  async function save(): Promise<void> {
    // The API rejects saves once kickoff has passed (the override would expire
    // immediately and be invisible to the preview). Show that guard client-side
    // too so the admin isn't confused by a failure after the fact.
    if (new Date(date).getTime() <= Date.now()) { // eslint-disable-line react-hooks/purity -- event-handler runtime check
      setMessage({
        ok: false,
        text: "This match has already kicked off — prediction overrides only apply before kickoff, so the preview can't be updated.",
      });
      return;
    }

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

    // The current form state as a structured override payload.
    const current: OverridePayload = {
      predictedScore: hasScore ? { home: Number(home), away: Number(away) } : null,
      tip: tip.trim() || null,
      winProbability: hasWin
        ? { home: Number(homeWin), draw: Number(draw), away: Number(awayWin) }
        : null,
      previewText: previewText.trim() || null,
    };

    const baseline = baselineRef.current;
    const auto = autoRef.current;
    const sameVal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

    // Which fields did the admin actually change from the prefilled values?
    const scoreChanged = !sameVal(current.predictedScore, baseline?.predictedScore ?? null);
    const tipChanged = !sameVal(current.tip, baseline?.tip ?? null);
    const winChanged = !sameVal(current.winProbability, baseline?.winProbability ?? null);
    const textChanged = !sameVal(current.previewText, baseline?.previewText ?? null);

    if (!scoreChanged && !tipChanged && !winChanged && !textChanged) {
      // Flagged match with no edits: clicking Save IS the review action —
      // publish the current (prefilled) prediction by creating an override.
      if (needsReview) {
        const body: Record<string, unknown> = {
          token, slug, expiresAt: date,
          predictedScore: current.predictedScore,
          tip: current.tip,
          winProbability: current.winProbability,
          previewText: current.previewText,
        };
        await doSave(body);
        return;
      }
      setMessage({ ok: true, text: "No changes made — prediction left as is." });
      setSaving(false);
      return;
    }

    // Build a minimal patch. A changed field that equals the pure auto value is
    // sent as null (use auto for that field); omitted fields keep the existing
    // override (or auto when none was set).
    const patch: OverridePayload = {
      predictedScore: null,
      tip: null,
      winProbability: null,
      previewText: null,
    };

    if (scoreChanged) {
      patch.predictedScore = sameVal(current.predictedScore, auto?.predictedScore ?? null)
        ? null
        : current.predictedScore;
    }
    if (tipChanged) {
      patch.tip = sameVal(current.tip, auto?.tip ?? null) ? null : current.tip;
    }
    if (winChanged) {
      patch.winProbability = sameVal(current.winProbability, auto?.winProbability ?? null)
        ? null
        : current.winProbability;
    }
    if (textChanged) {
      patch.previewText = sameVal(current.previewText, auto?.previewText ?? null) ? null : current.previewText;
    }

    const body: Record<string, unknown> = {
      token,
      slug,
      expiresAt: date,
    };
    // Only include fields the admin actually changed. Omitted fields keep any
    // existing override (or auto) — sending null for an untouched field would
    // wipe a previously saved override for it.
    if (scoreChanged) body.predictedScore = patch.predictedScore;
    if (tipChanged) body.tip = patch.tip;
    if (winChanged) body.winProbability = patch.winProbability;
    if (textChanged) body.previewText = patch.previewText;

    await doSave(body);
  }

  /** POST the override payload and update the row warning state on success. */
  async function doSave(body: Record<string, unknown>): Promise<void> {
    try {
      const res = await fetch("/api/admin/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({
          ok: true,
          text: data.persisted === false
            ? "Saved (memory only — database unavailable; will be lost on restart)."
            : "Saved. Preview will refresh on next load.",
        });
        // Update the row's review warning state from the API's recomputed review.
        onEdited?.(data.review ?? { flagged: false, reasons: [] });
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
        // Repopulate the fields with the auto (pre-override) values so the admin
        // sees what will be displayed now that the override is gone.
        setHome("");
        setAway("");
        setTip("");
        setHomeWin("");
        setDraw("");
        setAwayWin("");
        setPreviewText("");
        autoRef.current = null;
        baselineRef.current = null;
        await reloadPrefill();
        setMessage({ ok: true, text: "Override removed. Auto values restored." });
        // Reverting also refreshes the review warning state.
        onEdited?.(data.review ?? { flagged: false, reasons: [] });
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
              <div className="text-start min-w-0">
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
                  <section className="text-start">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      Prediction
                    </h4>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="block text-xs font-medium text-zinc-600">
                        Home goals
                        <input
                          type="number"
                          min={0}
                          value={home}
                          onChange={(e) => setHome(e.target.value)}
                          className="mt-1 w-20 ml-4 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-[#002b5c]/40 focus:outline-none"
                          placeholder="Auto"
                        />
                      </label>
                      <label className="block text-xs font-medium text-zinc-600">
                        Away goals
                        <input
                          type="number"
                          min={0}
                          value={away}
                          onChange={(e) => setAway(e.target.value)}
                          className="mt-1 w-20 ml-4 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-[#002b5c]/40 focus:outline-none"
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
                        className="mt-1 w-auto ml-4 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-[#002b5c]/40 focus:outline-none"
                        placeholder="Auto"
                      />
                    </label>

                    {/* Recognised tip-format quick-fill buttons */}
                    <div className="mt-2.5">
                      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                        <Sparkles className="h-3 w-3" /> Tip formats
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {tipTemplates(homeTeam, awayTeam).map((t) => (
                          <button
                            key={t.label}
                            type="button"
                            onClick={() => setTip(t.value)}
                            className="rounded border border-[#002b5c]/25 bg-[#002b5c]/5 px-2 py-1 text-[11px] font-medium text-[#002b5c] transition-colors hover:bg-[#002b5c]/10"
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>

                  <hr className="border-zinc-100" />

                  {/* Win probability */}
                  <section>
                    <h4 className="text-[11px] text-start font-semibold uppercase tracking-wider text-zinc-500">
                      Win Probability (%)
                    </h4>
                    <div className="mt-2 grid grid-cols-3 gap-3">
                      <label className="block text-xs font-medium text-zinc-600">
                        Home
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={homeWin}
                          onChange={(e) => setHomeWin(e.target.value)}
                          className="mt-1 w-20 ml-4 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-[#002b5c]/40 focus:outline-none"
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
                          className="mt-1 w-20 ml-4 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-[#002b5c]/40 focus:outline-none"
                          placeholder="Auto"
                        />
                      </label>
                      <label className="block text-xs font-medium text-zinc-600">
                        Away
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={awayWin}
                          onChange={(e) => setAwayWin(e.target.value)}
                          className="mt-1 w-20 ml-4 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-[#002b5c]/40 focus:outline-none"
                          placeholder="Auto"
                        />
                      </label>
                    </div>
                  </section>

                  <hr className="border-zinc-100" />

                  {/* Match preview text */}
                  <section>
                    <h4 className="text-[11px] text-start font-semibold uppercase tracking-wider text-zinc-500">
                      Match Preview Text
                    </h4>
                    <textarea
                      rows={8}
                      value={previewText}
                      onChange={(e) => setPreviewText(e.target.value)}
                      className="mt-2 w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 text-sm leading-relaxed text-zinc-800 placeholder:text-zinc-400 focus:border-[#002b5c]/40 focus:outline-none scrollbar-none [&::-webkit-scrollbar]:hidden"
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