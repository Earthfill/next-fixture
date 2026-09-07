"use client";

// ---------------------------------------------------------------------------
// JobRunner - manual trigger buttons for the background jobs.
// POSTs to /api/admin/jobs and shows the result inline (no page reload).
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";

type JobKey = "fixtures" | "clear";

interface JobRunnerProps {
  token: string;
}

interface JobDef {
  key: JobKey;
  label: string;
  icon: LucideIcon;
  variant: "primary" | "danger";
}

const JOBS: JobDef[] = [
  { key: "fixtures", label: "Prefetch 7-day fixtures", icon: RefreshCw, variant: "primary" },
  { key: "clear", label: "Clear cache", icon: Trash2, variant: "danger" },
];

export default function JobRunner({ token }: JobRunnerProps) {
  const router = useRouter();
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
        // Re-render the server component so the admin table shows the fresh data.
        router.refresh();
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
        {JOBS.map(({ key, label, icon: Icon, variant }) => (
          <button
            key={key}
            type="button"
            disabled={running !== null}
            onClick={() => run(key)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
              variant === "danger"
                ? "border border-red-200 bg-white text-red-600 hover:bg-red-50"
                : "bg-[#002b5c] text-white hover:bg-[#003d7a]"
            }`}
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