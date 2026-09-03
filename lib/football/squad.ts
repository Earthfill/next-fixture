import { apiFetch } from "@/lib/football/api";

export interface SquadPlayer {
  id: number;
  name: string;
  number: number;
  pos: string;
}

export interface SquadResponse {
  team: { id: number; name: string; logo: string };
  players: SquadPlayer[];
}

export async function getTeamSquad(teamId: number): Promise<SquadResponse | null> {
  const data = await apiFetch<{ response: SquadResponse[] }>(
    `/players/squads?team=${teamId}`
  );
  if (!data?.response?.[0]?.players?.length) return null;
  return data.response[0];
}