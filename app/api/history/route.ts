import { NextRequest, NextResponse } from "next/server";
import generalData from "../../../data/match-stats.json";
import europeanData from "../../../data/european-match-stats-v2.json";
type Row = Record<string, unknown>;
type Source = "general" | "uefa";

type Match = {
  id: string;
  source: Source;
  league: string;
  season: string;
  date: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  result: "H" | "D" | "A";
  homeShots: number | null;
  awayShots: number | null;
  homeShotsOnTarget: number | null;
  awayShotsOnTarget: number | null;
  homeCorners: number | null;
  awayCorners: number | null;
  homePossession: number | null;
  awayPossession: number | null;
  homeXg: number | null;
  awayXg: number | null;
  homeFouls: number | null;
  awayFouls: number | null;
  homeYellowCards: number | null;
  awayYellowCards: number | null;
  homeRedCards: number | null;
  awayRedCards: number | null;
};

function str(v: unknown, fallback = ""): string {
  return v === null || v === undefined ? fallback : String(v).trim() || fallback;
}

function num(...values: unknown[]): number | null {
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

function get(row: Row, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return null;
}

function normalize(input: unknown, source: Source): Match[] {
  if (!Array.isArray(input)) return [];

  return (input as Row[]).flatMap((r, i) => {
    const home = str(get(r, "home", "homeTeam"));
    const away = str(get(r, "away", "awayTeam"));
    const hg = num(get(r, "homeGoals", "homeScore"));
    const ag = num(get(r, "awayGoals", "awayScore"));

    if (!home || !away || hg === null || ag === null) return [];

    return [{
      id: `${source}-${i}`,
      source,
      league: str(get(r, "league", "competition"), "Tidak diketahui"),
      season: str(get(r, "season"), "Tidak diketahui"),
      date: str(get(r, "date", "kickoff")),
      home,
      away,
      homeGoals: hg,
      awayGoals: ag,
      result: hg > ag ? "H" as const : hg < ag ? "A" as const : "D" as const,

      homeShots: num(get(r, "homeShots")),
      awayShots: num(get(r, "awayShots")),
      homeShotsOnTarget: num(get(r, "homeShotsOnTarget")),
      awayShotsOnTarget: num(get(r, "awayShotsOnTarget")),
      homeCorners: num(get(r, "homeCorners")),
      awayCorners: num(get(r, "awayCorners")),
      homePossession: num(get(r, "homePossession")),
      awayPossession: num(get(r, "awayPossession")),
      homeXg: num(get(r, "homeXg", "homeXG", "homeExpectedGoals")),
      awayXg: num(get(r, "awayXg", "awayXG", "awayExpectedGoals")),
      homeFouls: num(get(r, "homeFouls")),
      awayFouls: num(get(r, "awayFouls")),
      homeYellowCards: num(get(r, "homeYellowCards", "homeYellow")),
      awayYellowCards: num(get(r, "awayYellowCards", "awayYellow")),
      homeRedCards: num(get(r, "homeRedCards", "homeRed")),
      awayRedCards: num(get(r, "awayRedCards", "awayRed")),
    }];
  });
}

const all: Match[] = [
  ...normalize(generalData, "general"),
  ...normalize(europeanData, "uefa"),
].sort((a, b) => b.date.localeCompare(a.date));

function sum(values: (number | null)[]) {
  const present = values.filter((v): v is number => v !== null);
  return {
    availableMatches: present.length,
    total: Number(present.reduce((a, b) => a + b, 0).toFixed(2)),
    average: present.length
      ? Number((present.reduce((a, b) => a + b, 0) / present.length).toFixed(2))
      : null,
  };
}

function resultStats(matches: Match[]) {
  const homeWins = matches.filter(m => m.result === "H").length;
  const draws = matches.filter(m => m.result === "D").length;
  const awayWins = matches.filter(m => m.result === "A").length;
  const goals = matches.reduce((s, m) => s + m.homeGoals + m.awayGoals, 0);

  const scoreCounts = new Map<string, number>();
  for (const m of matches) {
    const score = `${m.homeGoals}-${m.awayGoals}`;
    scoreCounts.set(score, (scoreCounts.get(score) ?? 0) + 1);
  }

  const total = matches.length;
  const pct = (n: number) => total ? Number((n * 100 / total).toFixed(1)) : 0;

  return {
    matches: total,
    homeWins,
    draws,
    awayWins,
    homeWinPct: pct(homeWins),
    drawPct: pct(draws),
    awayWinPct: pct(awayWins),
    homeGoals: matches.reduce((s, m) => s + m.homeGoals, 0),
    awayGoals: matches.reduce((s, m) => s + m.awayGoals, 0),
    totalGoals: goals,
    averageGoals: total ? Number((goals / total).toFixed(2)) : 0,
    over15: matches.filter(m => m.homeGoals + m.awayGoals > 1.5).length,
    over25: matches.filter(m => m.homeGoals + m.awayGoals > 2.5).length,
    over35: matches.filter(m => m.homeGoals + m.awayGoals > 3.5).length,
    under25: matches.filter(m => m.homeGoals + m.awayGoals < 2.5).length,
    btts: matches.filter(m => m.homeGoals > 0 && m.awayGoals > 0).length,
    cleanSheetsHome: matches.filter(m => m.awayGoals === 0).length,
    cleanSheetsAway: matches.filter(m => m.homeGoals === 0).length,
    scorelines: [...scoreCounts.entries()]
      .map(([score, count]) => ({ score, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
    technical: {
      shots: {
        home: sum(matches.map(m => m.homeShots)),
        away: sum(matches.map(m => m.awayShots)),
      },
      shotsOnTarget: {
        home: sum(matches.map(m => m.homeShotsOnTarget)),
        away: sum(matches.map(m => m.awayShotsOnTarget)),
      },
      corners: {
        home: sum(matches.map(m => m.homeCorners)),
        away: sum(matches.map(m => m.awayCorners)),
      },
      possession: {
        home: sum(matches.map(m => m.homePossession)),
        away: sum(matches.map(m => m.awayPossession)),
      },
      xG: {
        home: sum(matches.map(m => m.homeXg)),
        away: sum(matches.map(m => m.awayXg)),
      },
      fouls: {
        home: sum(matches.map(m => m.homeFouls)),
        away: sum(matches.map(m => m.awayFouls)),
      },
      yellowCards: {
        home: sum(matches.map(m => m.homeYellowCards)),
        away: sum(matches.map(m => m.awayYellowCards)),
      },
      redCards: {
        home: sum(matches.map(m => m.homeRedCards)),
        away: sum(matches.map(m => m.awayRedCards)),
      },
    },
  };
}

function teamStats(matches: Match[], team: string) {
  const played = matches.filter(m => m.home === team || m.away === team);
  const wins = played.filter(m =>
    (m.home === team && m.result === "H") ||
    (m.away === team && m.result === "A")
  ).length;
  const draws = played.filter(m => m.result === "D").length;
  const losses = played.length - wins - draws;
  const scored = played.reduce((s, m) =>
    s + (m.home === team ? m.homeGoals : m.awayGoals), 0);
  const conceded = played.reduce((s, m) =>
    s + (m.home === team ? m.awayGoals : m.homeGoals), 0);
  const home = played.filter(m => m.home === team);
  const away = played.filter(m => m.away === team);

  return {
    team,
    played: played.length,
    wins,
    draws,
    losses,
    winPct: played.length ? Number((wins * 100 / played.length).toFixed(1)) : 0,
    goalsFor: scored,
    goalsAgainst: conceded,
    goalDifference: scored - conceded,
    averageGoalsFor: played.length ? Number((scored / played.length).toFixed(2)) : 0,
    home: resultStats(home),
    away: resultStats(away),
    recent: played.slice(0, 5),
  };
}

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const source = p.get("source") ?? "all";
    const league = p.get("league") ?? "";
    const season = p.get("season") ?? "";
    const q = (p.get("q") ?? "").toLocaleLowerCase();
    const team1 = p.get("team1") ?? "";
    const team2 = p.get("team2") ?? "";
    const page = Math.max(1, Number(p.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(p.get("limit")) || 50));

    const scoped = all.filter(m =>
      (source === "all" || m.source === source) &&
      (!league || m.league === league) &&
      (!season || m.season === season)
    );

    const filtered = scoped.filter(m => !q || [
      m.home, m.away, m.league, m.season, m.date
    ].join(" ").toLocaleLowerCase().includes(q));

    const teams = [...new Set(scoped.flatMap(m => [m.home, m.away]))]
      .sort((a, b) => a.localeCompare(b));

    let h2h: Match[] = [];
    let team1Stats = null;
    let team2Stats = null;

    if (team1 && team2 && team1 !== team2) {
      h2h = scoped.filter(m =>
        (m.home === team1 && m.away === team2) ||
        (m.home === team2 && m.away === team1)
      );
      team1Stats = teamStats(scoped, team1);
      team2Stats = teamStats(scoped, team2);
    }

    const competitionMap = new Map<string, Match[]>();
    const seasonMap = new Map<string, Match[]>();

    for (const m of filtered) {
      if (!competitionMap.has(m.league)) competitionMap.set(m.league, []);
      competitionMap.get(m.league)!.push(m);
      if (!seasonMap.has(m.season)) seasonMap.set(m.season, []);
      seasonMap.get(m.season)!.push(m);
    }

    const start = (page - 1) * pageSize;

    return NextResponse.json({
      source,
      total: filtered.length,
      validRecords: all.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
      summary: resultStats(filtered),
      competitions: [...new Set(scoped.map(m => m.league))].sort(),
      seasons: [...new Set(scoped.map(m => m.season))].sort().reverse(),
      teams,
      competitionStats: [...competitionMap.entries()]
        .map(([name, rows]) => ({ league: name, ...resultStats(rows) }))
        .sort((a, b) => b.matches - a.matches),
      seasonStats: [...seasonMap.entries()]
        .map(([name, rows]) => ({ season: name, ...resultStats(rows) }))
        .sort((a, b) => b.season.localeCompare(a.season)),
      h2h: {
        team1,
        team2,
        matches: h2h,
        summary: resultStats(h2h),
        team1Stats,
        team2Stats,
      },
      matches: filtered.slice(start, start + pageSize),
    });
  } catch (error) {
    console.error("Historical statistics error:", error);
    return NextResponse.json(
      { error: "Gagal menghitung statistik historis." },
      { status: 500 }
    );
  }
}