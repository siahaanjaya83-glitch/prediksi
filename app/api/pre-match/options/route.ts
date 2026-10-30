import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

type Match = {
  league?: string;
  home?: string;
  away?: string;
  matchStatus?: string;
};

const supportedLeagues = [
  "English Premier League",
  "La Liga",
  "Serie A",
  "Ligue 1 France",
];

const europeanLeagues = [
  "UEFA Champions League",
  "UEFA Europa League",
];

function buildLeague(
  name: string,
  rows: Match[],
  minMatches = 20
) {
  const teams = Array.from(
    new Set(
      rows.flatMap((match) => [match.home, match.away])
        .filter((team): team is string =>
          typeof team === "string" && team.trim().length > 0
        )
    )
  ).sort((a, b) => a.localeCompare(b));

  return {
    name,
    available: rows.length >= minMatches && teams.length >= 2,
    matches: rows.length,
    teams,
  };
}

export async function GET() {
  try {
    const dataDir = path.join(process.cwd(), "data");

    const [domesticRaw, europeanRaw, bundesligaRaw] = await Promise.all([
      readFile(path.join(dataDir, "match-stats.json"), "utf8"),
      readFile(path.join(dataDir, "european-match-stats-v2.json"), "utf8"),
      readFile(path.join(dataDir, "bundesliga-match-stats.json"), "utf8"),
    ]);

    const domestic = JSON.parse(domesticRaw) as Match[];
    const european = JSON.parse(europeanRaw) as Match[];
    const bundesliga = JSON.parse(bundesligaRaw) as Match[];

    if (
      !Array.isArray(domestic) ||
      !Array.isArray(european) ||
      !Array.isArray(bundesliga)
    ) {
      throw new Error("Format dataset tidak valid.");
    }

    const leagues = [
      ...supportedLeagues.map((name) => {
        const rows = domestic.filter(
          (match) =>
            String(match.league ?? "").toLowerCase() === name.toLowerCase()
        );
        return buildLeague(name, rows);
      }),
      ...europeanLeagues.map((name) => {
        const rows = european.filter(
          (match) =>
            match.matchStatus === "played" &&
            String(match.league ?? "").toLowerCase() === name.toLowerCase()
        );
        return buildLeague(name, rows);
      }),
      buildLeague(
        "Fu\u00dfball-Bundesliga",
        bundesliga.filter(
          (match) =>
            String(match.league ?? "").toLowerCase() ===
            "fu\u00dfball-bundesliga".toLowerCase()
        )
      ),
    ];

    return NextResponse.json({ leagues });
  } catch (error) {
    console.error("[pre-match/options]", error);
    return NextResponse.json(
      { error: "Gagal membaca pilihan dari dataset historis." },
      { status: 503 }
    );
  }
}