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

type Score = {
  home: number;
  away: number;
  probability: number;
};

/**
 * Memperbaiki nama yang mengalami mojibake UTF-8
 * akibat interpretasi byte UTF-8 sebagai Latin-1.
 *
 * Contoh:
 * München -> MÃ¼nchen -> München
 *
 * Jika hasil konversi tidak valid atau tidak memperbaiki
 * pola mojibake, nilai awal tetap dipakai.
 */
function repairEncoding(value: string): string {
  const original = value.replace(/^\uFEFF/, "").trim();

  if (!/[ÃÂâ]/.test(original)) {
    return original;
  }

  try {
    const repaired = Buffer.from(original, "latin1").toString("utf8");

    if (
      repaired.includes("\uFFFD") ||
      repaired.length === 0 ||
      /[ÃÂâ]/.test(repaired)
    ) {
      return original;
    }

    return repaired;
  } catch {
    return original;
  }
}

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

  if ([
    "uefa champions league",
    "champions league",
    "ucl"
  ].includes(valueNorm)) {
    return "UEFA Champions League";
  }

  if ([
    "uefa europa league",
    "europa league",
    "uel"
  ].includes(valueNorm)) {
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

function jsonError(
  message: string,
  status: number,
  extra: Record<string, unknown> = {}
) {
  return NextResponse.json(
    { error: message, ...extra },
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}

export async function POST(request: Request) {
  try {
    let body: Record<string, unknown>;

    try {
      body = await request.json();
    } catch {
      return jsonError("Body harus berupa JSON yang valid.", 400);
    }

    // Perbaiki nama tim sebelum proses pencocokan.
    const league = competition(String(body.league ?? ""));
    const requestedHome = repairEncoding(String(body.home ?? ""));
    const requestedAway = repairEncoding(String(body.away ?? ""));
    const kickoff = String(body.kickoff ?? "").trim();

    const kickoffDateMatch = kickoff.match(
      /^(\d{4}-\d{2}-\d{2})T/
    );

    if (
      !league ||
      !requestedHome ||
      !requestedAway ||
      !kickoffDateMatch ||
      norm(requestedHome) === norm(requestedAway)
    ) {
      return jsonError(
        "Isi league, home, away, dan kickoff ISO dengan benar.",
        400,
        {
          supportedLeagues: [
            "UEFA Champions League",
            "UEFA Europa League"
          ]
        }
      );
    }

    const kickoffTime = Date.parse(kickoff);

    if (
      !Number.isFinite(kickoffTime) ||
      !Number.isFinite(Date.parse(kickoffDateMatch[1])) ||
      kickoffTime <= Date.now()
    ) {
      return jsonError(
        "kickoff harus berupa tanggal-waktu valid di masa mendatang.",
        400
      );
    }

    // Batas tanggal prediksi:
    // pertandingan pada tanggal ini atau setelahnya tidak digunakan.
    const predictionCutoff = kickoffDateMatch[1];

    const file = path.join(
      process.cwd(),
      "data",
      "european-match-stats-v2.json"
    );

    const parsed: unknown = JSON.parse(
      await readFile(file, "utf8")
    );

    if (!Array.isArray(parsed)) {
      throw new Error("Dataset UEFA bukan array.");
    }

    // Data historis harus lebih lama dari tanggal kickoff.
    const rows = (parsed as Match[])
      .filter((match) =>
        validMatch(match) &&
        competition(String(match.league ?? "")) === league &&
        String(match.date) < predictionCutoff
      )
      .sort((a, b) =>
        String(b.date).localeCompare(String(a.date))
      );

    // Tanggal historis terakhir dari data kompetisi
    // yang lolos filter dan benar-benar dipakai model.
    const latestHistoricalMatchDate =
      rows.length > 0 ? String(rows[0].date) : null;

    if (rows.length < 20) {
      return jsonError(
        "Data historis kompetisi belum cukup.",
        422,
        {
          league,
          availableMatches: rows.length,
          requiredMatches: 20,
          predictionCutoff,
          latestHistoricalMatchDate
        }
      );
    }

    const homeRows = rows.filter(
      (match) => norm(match.home!) === norm(requestedHome)
    );

    const awayRows = rows.filter(
      (match) => norm(match.away!) === norm(requestedAway)
    );

    if (homeRows.length < 3 || awayRows.length < 3) {
      return jsonError(
        "Riwayat kandang atau tandang tim belum cukup.",
        422,
        {
          league,
          teams: {
            home: requestedHome,
            away: requestedAway
          },
          homeMatchesAvailable: homeRows.length,
          awayMatchesAvailable: awayRows.length,
          requiredMatchesPerTeam: 3,
          predictionCutoff,
          latestHistoricalMatchDate,
          hint: "Gunakan nama tim yang tersedia dalam pilihan dataset."
        }
      );
    }

    const homeSample = homeRows.slice(0, 10);
    const awaySample = awayRows.slice(0, 10);

    // Gunakan nama kanonis dari dataset untuk response.
    const canonicalHome = String(homeSample[0].home);
    const canonicalAway = String(awaySample[0].away);

    const avgHome = mean(
      rows.map((match) => match.homeGoals!)
    );

    const avgAway = mean(
      rows.map((match) => match.awayGoals!)
    );

    const homeScored = mean(
      homeSample.map((match) => match.homeGoals!)
    );

    const homeConceded = mean(
      homeSample.map((match) => match.awayGoals!)
    );

    const awayScored = mean(
      awaySample.map((match) => match.awayGoals!)
    );

    const awayConceded = mean(
      awaySample.map((match) => match.homeGoals!)
    );

    // Metode Independent Poisson dipertahankan.
    const lambdaHome = Math.max(
      0.05,
      Math.min(
        5,
        homeScored * (
          awayConceded / Math.max(avgHome, 0.01)
        )
      )
    );

    const lambdaAway = Math.max(
      0.05,
      Math.min(
        5,
        awayScored * (
          homeConceded / Math.max(avgAway, 0.01)
        )
      )
    );

    const scores: Score[] = [];

    let homeWin = 0;
    let draw = 0;
    let awayWin = 0;
    let under25 = 0;

    for (let homeGoals = 0; homeGoals <= 8; homeGoals++) {
      for (let awayGoals = 0; awayGoals <= 8; awayGoals++) {
        const probability =
          poisson(lambdaHome, homeGoals) *
          poisson(lambdaAway, awayGoals);

        scores.push({
          home: homeGoals,
          away: awayGoals,
          probability
        });

        if (homeGoals > awayGoals) {
          homeWin += probability;
        } else if (homeGoals === awayGoals) {
          draw += probability;
        } else {
          awayWin += probability;
        }

        if (homeGoals + awayGoals <= 2) {
          under25 += probability;
        }
      }
    }

    scores.sort(
      (a, b) => b.probability - a.probability
    );

    const response = {
      available: true,
      source: "european-match-stats-v2.json",
      method: "Independent Poisson baseline",
      league,
      kickoff,

      teams: {
        home: canonicalHome,
        away: canonicalAway
      },

      expectedGoals: {
        home: Number(lambdaHome.toFixed(2)),
        away: Number(lambdaAway.toFixed(2))
      },

      mostLikelyScore: {
        home: scores[0].home,
        away: scores[0].away,
        probability: Number(
          (scores[0].probability * 100).toFixed(2)
        )
      },

      topScores: scores.slice(0, 5).map((score) => ({
        score: `${score.home}-${score.away}`,
        probability: Number(
          (score.probability * 100).toFixed(2)
        )
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

      // Tanggal batas prediksi dan tanggal historis terakhir
      // adalah dua informasi yang berbeda.
      predictionCutoff,
      latestHistoricalMatchDate,

      // Dipertahankan sementara untuk kompatibilitas
      // dengan konsumen API versi sebelumnya.
      dataCutoff: predictionCutoff,

      unavailableStatistics: [
        "shots",
        "shotsOnTarget",
        "corners",
        "cards",
        "xG",
        "possession"
      ],

      disclaimer:
        "Backtest awal dilakukan pada 2.075 pertandingan: " +
        "akurasi hasil H/D/A 54,17%, exact score 8,29%, " +
        "MAE gol kandang 1,1634 dan tandang 1,0622, " +
        "Brier score 0,608044, serta log loss 1,039453. " +
        "Evaluasi ini masih awal dan belum membuktikan " +
        "keunggulan dibandingkan metode pembanding. " +
        "Prediksi merupakan estimasi statistik, bukan jaminan hasil."
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });

  } catch (error) {
    console.error("[european-pre-match]", error);

    return jsonError(
      "Prediksi UEFA gagal diproses.",
      500
    );
  }
}