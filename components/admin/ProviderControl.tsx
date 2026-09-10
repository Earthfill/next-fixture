"use client";

// ---------------------------------------------------------------------------
// ProviderControl — switch the active sports data provider (rapid ↔ highlightly)
// Receives the CURRENT provider + key status from the server component as props
// (no client-side fetch on mount), then POSTs a switch to /api/admin/provider and
// refreshes the server component so the table reflects the new provider.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Server, Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

export interface ProviderOption {
  id: string;
  label: string;
  keyConfigured: boolean;
}

interface ProviderControlProps {
  token: string;
  active: string;
  providers: ProviderOption[];
}

export default function ProviderControl({ token, active, providers }: ProviderControlProps) {
  const router = useRouter();
  const [switching, setSwitching] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function switchTo(id: string): Promise<void> {
    setSwitching(id);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, provider: id }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus({
          ok: true,
          text: `Switched to ${data.provider}. Caches cleared — the site will refetch from the new provider.`,
        });
        router.refresh();
      } else {
        setStatus({ ok: false, text: data.error || "Switch failed." });
      }
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message });
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div>
      <div className="space-y-2">
        {providers.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800">
                <Server className="h-3.5 w-3.5 text-zinc-400" />
                <span className="truncate">{p.label}</span>
              </div>
              <div className={`text-[11px] ${p.keyConfigured ? "text-emerald-600" : "text-amber-600"}`}>
                {p.keyConfigured ? "API key configured" : "API key not set — returns no data"}
              </div>
            </div>

            {active === p.id ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
              </span>
            ) : (
              <button
                type="button"
                disabled={switching !== null}
                onClick={() => switchTo(p.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#002b5c] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#003d7a] transition-colors disabled:opacity-50"
              >
                {switching === p.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Switch
              </button>
            )}
          </div>
        ))}
      </div>

      {status && (
        <div
          className={`mt-3 flex items-center gap-1.5 border p-3 text-xs font-medium ${
            status.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {status.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          )}
          <span>{status.text}</span>
        </div>
      )}
    </div>
  );
}
