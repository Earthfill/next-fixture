"use client";

// ---------------------------------------------------------------------------
// JobRunner - manual trigger buttons for the background jobs.
// POSTs to /api/admin/jobs and shows the result inline (no page reload).
// ---------------------------------------------------------------------------

import { useState } from "react";
import {
  RefreshCw,
  Radio,
  Zap,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";

type JobKey = "fixtures" | "live" | "all" | "clear";

interface JobRunnerProps {
  token: string;
}

const JOBS: { key: JobKey; label: string; icon: LucideIcon }[] = [
  { key: "fixtures", label: "Prefetch 7-Day Fixtures", icon: RefreshCw },
  { key: "live", label: "Poll Live Matches", icon: Radio },
  { key: "all", label: "Run Both", icon: Zap },
  { key: "clear", label: "Clear Cache", icon: Trash2 },
];

export default function JobRunner({ token }: JobRunnerProps) {
  const [running, setRunning] = useState<JobKey | null>(null);
  const [output, setOutput] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(job: JobKey): Promise<void> {
    setRunning(job);
    setOutput(null);
    try {
      const res = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, job }),
      });
      const data = await res.json();
      if (data.success) {
        setOutput({ ok: true, text: JSON.stringify(data.result, null, 2) });
      } else {
        setOutput({ ok: false, text: data.error || "Job failed." });
      }
    } catch (err) {
      setOutput({ ok: false, text: (err as Error).message });
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {JOBS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            disabled={running !== null}
            onClick={() => run(key)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white px-3 py-2 disabled:opacity-50"
            style={{ background: "#002b5c" }}
          >
            {running === key ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Icon className="h-3.5 w-3.5" />
            )}
            {label}
          </button>
        ))}
      </div>

      {output && (
        <div
          className={`border p-3 text-xs font-mono ${
            output.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            {output.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5" />
            )}
            <span className="font-semibold">{output.ok ? "Done" : "Failed"}</span>
          </div>
          <pre className="whitespace-pre-wrap break-words">{output.text}</pre>
        </div>
      )}
    </div>
  );
}