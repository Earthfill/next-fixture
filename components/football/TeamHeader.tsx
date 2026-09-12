// ---------------------------------------------------------------------------
// TeamHeader — crest + name + competition badges (SportsMole-style)
// ---------------------------------------------------------------------------

import Image from "next/image";
import Link from "next/link";
import { COMPETITION_SLUGS, COMPETITION_LOGOS } from "@/lib/football/config";
import type { TeamInfo } from "@/lib/football/team-slugs";

interface TeamHeaderProps {
  team: TeamInfo;
}

export default function TeamHeader({ team }: TeamHeaderProps) {
  return (
    <div className="flex items-center gap-4 border-b border-zinc-200 pb-6">
      {team.logo && (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white p-2">
          <Image src={team.logo} alt={`${team.name} logo`} width={48} height={48} className="h-12 w-12 object-contain" />
        </div>
      )}
      <div className="min-w-0">
        <h1 className="sm-heading-lg mb-1">{team.name}</h1>
        {team.competitions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {team.competitions.slice(0, 5).map((comp) => {
              const slug = COMPETITION_SLUGS[comp] || comp.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
              const logo = COMPETITION_LOGOS[comp] || "";
              return (
                <Link
                  key={slug}
                  href={`/leagues/${slug}`}
                  className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:border-[#002b5c]/40 hover:text-[#002b5c] transition-colors"
                >
                  {logo && <Image src={logo} alt="" width={12} height={12} className="h-3 w-3 object-contain" />}
                  {comp}
                </Link>
              );
            })}
          </div>
        )}
        <p className="mt-1 text-xs text-zinc-500">
          Fixtures, results, form, squad &amp; predicted lineups
        </p>
      </div>
    </div>
  );
}