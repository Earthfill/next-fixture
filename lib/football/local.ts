// ---------------------------------------------------------------------------
// Local data — JSON file readers for fallback data
// ---------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import type { TeamRecord, StandingRecord, FormRecord, H2HRecord } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "lib", "data");

function readJson<T>(filename: string): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), "utf-8")) as T;
  } catch {
    return {} as T;
  }
}

export function loadTeams(): TeamRecord[] {
  return readJson<TeamRecord[]>("teams.json");
}

export function loadStandings(): Record<string, StandingRecord[]> {
  return readJson<Record<string, StandingRecord[]>>("standings.json");
}

export function loadForms(): Record<string, FormRecord> {
  return readJson<Record<string, FormRecord>>("forms.json");
}

export function loadH2H(): Record<string, H2HRecord[]> {
  return readJson<Record<string, H2HRecord[]>>("h2h.json");
}