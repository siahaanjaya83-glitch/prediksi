import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

type Match = {
  league?: string;
  date?: string;
  home?: string;
  away?: string;
  homeGoals?: number;
  awayGoals?: number;
  matchStatus?: string;
};

function norm(value: string): string {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function competition(value: string): string | null {
  const valueNorm = norm(value);

  if (["uefa champions league", "champions league", "ucl"].includes(valueNorm)) {
    return "UEFA Champions League";
  }

  if (["uefa europa league", "europa league", "uel"].includes(valueNorm)) {
    return "UEFA Europa League";
  }

  return null;
}

function mean(values: number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function poisson(lambda: number, goals: number): number {
  let probability = Math.exp(-lambda);

  for (let i = 1; i <= goals; i++) {
    probability *= lambda / i;
  }

  return probability;
}

function validMatch(match: Match): boolean {
  return (
    match.matchStatus === "played" &&
    typeof match.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(match.date) &&
    typeof match.home === "string" &&
    typeof match.away === "string" &&
    Number.isInteger(match.homeGoals) &&
    Number.isInteger(match.awayGoals) &&
    match.homeGoals! >= 0 &&
    match.awayGoals! >= 0
  );
}

export async function POST(request: Request) {
  try {
    let body: Record<string, unknown>;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Body harus berupa JSON yang valid." },
        { status: 400 }
      );
    }

    const league = competition(String(body.league ?? ""));
    const home = String(body.home ?? "").trim();
    const away = String(body.away ?? "").trim();
    const kickoff = String(body.kickoff ?? "").trim();
    const kickoffDateMatch = kickoff.match(/^(\d{4}-\d{2}-\d{2})T/);

    if (!league || !home || !away || !kickoffDateMatch ||
        norm(home) === norm(away)) {
      return NextResponse.json({
        error: "Isi league, home, away, dan kickoff ISO dengan benar.",
        supportedLeagues: ["UEFA Champions League", "UEFA Europa League"]
      }, { status: 400 });
    }

    const kickoffTime = Date.parse(kickoff);

    if (!Number.isFinite(kickoffTime) ||
        new Date(kickoffTime).toISOString() !== new Date(kickoffTime).toISOString() ||
        kickoffTime <= Date.now()) {
      return NextResponse.json({
        error: "kickoff harus berupa tanggal-waktu valid di masa mendatang."
      }, { status: 400 });
    }

    const cutoff = kickoffDateMatch[1];
    const file = path.join(process.cwd(), "data", "european-match-stats-v2.json");
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));

    if (!Array.isArray(parsed)) {
      throw new Error("Dataset UEFA bukan array.");
    }

    const rows = (parsed as Match[])
      .filter((m) =>
        validMatch(m) &&
        competition(String(m.league ?? "")) === league &&
        String(m.date) < cutoff
      )
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    if (rows.length < 20) {
      return NextResponse.json({
        error: "Data historis kompetisi belum cukup.",
        league,
        availableMatches: rows.length,
        requiredMatches: 20,
        dataCutoff: cutoff
      }, { status: 422 });
    }

    const homeRows = rows.filter((m) => norm(m.home!) === norm(home));
    const awayRows = rows.filter((m) => norm(m.away!) === norm(away));

    if (homeRows.length < 3 || awayRows.length < 3) {
      return NextResponse.json({
        error: "Riwayat kandang atau tandang tim belum cukup.",
        league,
        teams: { home, away },
        homeMatchesAvailable: homeRows.length,
        awayMatchesAvailable: awayRows.length,
        requiredMatchesPerTeam: 3,
        hint: "Gunakan nama tim persis seperti di dataset."
      }, { status: 422 });
    }

    const homeSample = homeRows.slice(0, 10);
    const awaySample = awayRows.slice(0, 10);

    const avgHome = mean(rows.map((m) => m.homeGoals!));
    const avgAway = mean(rows.map((m) => m.awayGoals!));

    const homeScored = mean(homeSample.map((m) => m.homeGoals!));
    const homeConceded = mean(homeSample.map((m) => m.awayGoals!));
    const awayScored = mean(awaySample.map((m) => m.awayGoals!));
    const awayConceded = mean(awaySample.map((m) => m.homeGoals!));

    const lambdaHome = Math.max(0.05, Math.min(5,
      homeScored * (awayConceded / Math.max(avgHome, 0.01))
    ));
    const lambdaAway = Math.max(0.05, Math.min(5,
      awayScored * (homeConceded / Math.max(avgAway, 0.01))
    ));

    const scores: { home: number; away: number; probability: number }[] = [];
    let homeWin = 0;
    let draw = 0;
    let awayWin = 0;
    let under25 = 0;

    for (let h = 0; h <= 8; h++) {
      for (let a = 0; a <= 8; a++) {
        const probability = poisson(lambdaHome, h) * poisson(lambdaAway, a);
        scores.push({ home: h, away: a, probability });

        if (h > a) homeWin += probability;
        else if (h === a) draw += probability;
        else awayWin += probability;

        if (h + a <= 2) under25 += probability;
      }
    }

    scores.sort((a, b) => b.probability - a.probability);

    return NextResponse.json({
      available: true,
      source: "european-match-stats-v2.json",
      method: "Independent Poisson baseline",
      league,
      kickoff,
      teams: { home, away },
      expectedGoals: {
        home: Number(lambdaHome.toFixed(2)),
        away: Number(lambdaAway.toFixed(2))
      },
      mostLikelyScore: {
        home: scores[0].home,
        away: scores[0].away,
        probability: Number((scores[0].probability * 100).toFixed(2))
      },
      topScores: scores.slice(0, 5).map((s) => ({
        score: `${s.home}-${s.away}`,
        probability: Number((s.probability * 100).toFixed(2))
      })),
      probabilities: {
        homeWin: Number((homeWin * 100).toFixed(2)),
        draw: Number((draw * 100).toFixed(2)),
        awayWin: Number((awayWin * 100).toFixed(2)),
        under2_5Goals: Number((under25 * 100).toFixed(2))
      },
      sampleSize: {
        competitionMatches: rows.length,
        homeMatchesAvailable: homeRows.length,
        awayMatchesAvailable: awayRows.length,
        homeMatchesUsed: homeSample.length,
        awayMatchesUsed: awaySample.length
      },
      dataCutoff: cutoff,
      unavailableStatistics: [
        "shots", "shotsOnTarget", "corners", "cards", "xG", "possession"
      ],
      disclaimer: "Estimasi statistik, bukan jaminan. Belum divalidasi melalui backtesting."
    });
  } catch (error) {
    console.error("[european-pre-match]", error);
    return NextResponse.json(
      { error: "Prediksi UEFA gagal diproses." },
      { status: 500 }
    );
  }
}
