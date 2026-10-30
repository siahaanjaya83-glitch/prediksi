import { NextRequest, NextResponse } from "next/server";
import dataset from "../../../../data/bundesliga-match-stats.json";

type Match = {
  id: string;
  league: string;
  season: string;
  date: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  result: "H" | "D" | "A";
  matchStatus?: string;
};

const matches = dataset as Match[];

const teamNames = [
  ...new Set(matches.flatMap(m => [m.home, m.away])),
];

function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Alias hanya digunakan untuk mencocokkan input.
// Nama asli dalam dataset tidak diubah.
const aliases: Record<string, string> = {
  "borussia dortmund": "Dortmund",
  "dortmund": "Dortmund",

  "fc bayern munchen": "Bayern Munich",
  "bayern munchen": "Bayern Munich",
  "bayern munich": "Bayern Munich",

  "bayer leverkusen": "Leverkusen",
  "leverkusen": "Leverkusen",

  "borussia monchengladbach": "M'gladbach",
  "monchengladbach": "M'gladbach",
  "m gladbach": "M'gladbach",

  "eintracht frankfurt": "Ein Frankfurt",
  "ein frankfurt": "Ein Frankfurt",

  "1 fc koln": "FC Koln",
  "fc koln": "FC Koln",
  "1 fc cologne": "FC Koln",
  "1 fc koeln": "FC Koln",

  "tsg hoffenheim": "Hoffenheim",
  "hoffenheim": "Hoffenheim",

  "sc freiburg": "Freiburg",
  "freiburg": "Freiburg",

  "vfb stuttgart": "Stuttgart",
  "stuttgart": "Stuttgart",

  "fc augsburg": "Augsburg",
  "augsburg": "Augsburg",

  "1 fsv mainz 05": "Mainz",
  "fsv mainz 05": "Mainz",
  "mainz 05": "Mainz",
  "mainz": "Mainz",

  "sv werder bremen": "Werder Bremen",
  "werder bremen": "Werder Bremen",

  "rb leipzig": "RB Leipzig",

  "vfl wolfsburg": "Wolfsburg",
  "wolfsburg": "Wolfsburg",

  "1 fc union berlin": "Union Berlin",
  "union berlin": "Union Berlin",

  "fc st pauli": "St Pauli",
  "fc sankt pauli": "St Pauli",
  "st pauli": "St Pauli",

  "holstein kiel": "Holstein Kiel",

  "vfl bochum": "Bochum",
  "bochum": "Bochum",

  "sv darmstadt 98": "Darmstadt",
  "darmstadt 98": "Darmstadt",
  "darmstadt": "Darmstadt",

  "1 fc heidenheim": "Heidenheim",
  "1 fc heidenheim 1846": "Heidenheim",
  "heidenheim": "Heidenheim",

  "fc schalke 04": "Schalke 04",
  "schalke 04": "Schalke 04",

  "sv elversberg": "Elversberg",
  "elversberg": "Elversberg",

  "sc paderborn 07": "Paderborn",
  "paderborn 07": "Paderborn",
  "paderborn": "Paderborn",
};

function resolveTeam(input: string): string | null {
  const key = normalizeKey(input);
  const alias = aliases[key];

  if (alias && teamNames.includes(alias)) {
    return alias;
  }

  const exact = teamNames.find(
    name => normalizeKey(name) === key
  );

  return exact ?? null;
}

function mean(values: number[]): number {
  return values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : 0;
}

function poisson(lambda: number, goals: number): number {
  let factorial = 1;

  for (let i = 2; i <= goals; i++) {
    factorial *= i;
  }

  return Math.exp(-lambda) * Math.pow(lambda, goals) / factorial;
}

function predict(
  home: string,
  away: string,
  kickoff: string
) {
  const kickoffDate = new Date(kickoff);

  if (Number.isNaN(kickoffDate.getTime())) {
    throw new Error("Format kickoff tidak valid.");
  }

  // Dataset hanya menyimpan tanggal.
  // Pertandingan pada tanggal kickoff tidak digunakan.
  const cutoffDate = kickoff.slice(0, 10);

  const history = matches.filter(m =>
    m.date < cutoffDate &&
    Number.isFinite(Number(m.homeGoals)) &&
    Number.isFinite(Number(m.awayGoals)) &&
    Number(m.homeGoals) >= 0 &&
    Number(m.awayGoals) >= 0 &&
    (!m.matchStatus ||
      m.matchStatus.toLowerCase() === "completed")
  );

  const leagueHome = mean(
    history.map(m => Number(m.homeGoals))
  );

  const leagueAway = mean(
    history.map(m => Number(m.awayGoals))
  );

  if (
    history.length < 50 ||
    leagueHome <= 0 ||
    leagueAway <= 0
  ) {
    return {
      available: false,
      reason: "Riwayat kompetisi belum mencukupi.",
      historyMatches: history.length,
    };
  }

  const homeAtHome = history.filter(m => m.home === home);
  const awayAtAway = history.filter(m => m.away === away);

  if (
    homeAtHome.length < 3 ||
    awayAtAway.length < 3
  ) {
    return {
      available: false,
      reason: "Riwayat kandang/tandang minimal 3 pertandingan belum terpenuhi.",
      home,
      away,
      historyMatches: history.length,
      homeVenueMatches: homeAtHome.length,
      awayVenueMatches: awayAtAway.length,
    };
  }

  // Shrinkage menuju rata-rata liga.
  const priorWeight = 5;

  const homeAttack = (
    homeAtHome.reduce(
      (s, m) => s + Number(m.homeGoals), 0
    ) +
    priorWeight * leagueHome
  ) / (homeAtHome.length + priorWeight);

  const homeDefense = (
    homeAtHome.reduce(
      (s, m) => s + Number(m.awayGoals), 0
    ) +
    priorWeight * leagueAway
  ) / (homeAtHome.length + priorWeight);

  const awayAttack = (
    awayAtAway.reduce(
      (s, m) => s + Number(m.awayGoals), 0
    ) +
    priorWeight * leagueAway
  ) / (awayAtAway.length + priorWeight);

  const awayDefense = (
    awayAtAway.reduce(
      (s, m) => s + Number(m.homeGoals), 0
    ) +
    priorWeight * leagueHome
  ) / (awayAtAway.length + priorWeight);

  const homeFactor = homeAttack / leagueHome;
  const awayFactor = awayAttack / leagueAway;

  const homeConcedeFactor = homeDefense / leagueAway;
  const awayConcedeFactor = awayDefense / leagueHome;

  const expectedHome = Math.max(
    0.05,
    Math.min(
      5,
      leagueHome * homeFactor * awayConcedeFactor
    )
  );

  const expectedAway = Math.max(
    0.05,
    Math.min(
      5,
      leagueAway * awayFactor * homeConcedeFactor
    )
  );

  const scorelines: Array<{
    home: number;
    away: number;
    probability: number;
  }> = [];

  let totalProbability = 0;
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  let pUnder25 = 0;

  // Distribusi skor 0 sampai 10.
  for (let h = 0; h <= 10; h++) {
    for (let a = 0; a <= 10; a++) {
      const probability =
        poisson(expectedHome, h) *
        poisson(expectedAway, a);

      scorelines.push({
        home: h,
        away: a,
        probability,
      });

      totalProbability += probability;

      if (h > a) pHome += probability;
      else if (h === a) pDraw += probability;
      else pAway += probability;

      if (h + a <= 2) pUnder25 += probability;
    }
  }

  if (totalProbability <= 0) {
    throw new Error("Distribusi probabilitas tidak valid.");
  }

  // Normalisasi akibat pemotongan skor pada 10.
  for (const score of scorelines) {
    score.probability /= totalProbability;
  }

  pHome /= totalProbability;
  pDraw /= totalProbability;
  pAway /= totalProbability;
  pUnder25 /= totalProbability;

  scorelines.sort(
    (a, b) => b.probability - a.probability
  );

  return {
    available: true,
    source: "bundesliga-match-stats.json",
    method: "Venue-adjusted Independent Poisson with shrinkage",
    league: "Fu\u00dfball-Bundesliga",
    home,
    away,
    kickoff,
    historyMatches: history.length,
    homeVenueMatches: homeAtHome.length,
    awayVenueMatches: awayAtAway.length,
    expectedGoals: {
      home: Number(expectedHome.toFixed(3)),
      away: Number(expectedAway.toFixed(3)),
    },
    probabilities: {
      home: Number(pHome.toFixed(6)),
      draw: Number(pDraw.toFixed(6)),
      away: Number(pAway.toFixed(6)),
      under2_5Goals: Number(pUnder25.toFixed(6)),
      total: Number((pHome + pDraw + pAway).toFixed(6)),
    },
    mostLikelyScore: scorelines[0],
    topScores: scorelines.slice(0, 5),
    note: "Estimasi statistik, bukan jaminan hasil pertandingan.",
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const inputHome = String(body.home ?? "").trim();
    const inputAway = String(body.away ?? "").trim();
    const kickoff = String(body.kickoff ?? "").trim();

    if (!inputHome || !inputAway || !kickoff) {
      return NextResponse.json(
        { error: "home, away, dan kickoff wajib diisi." },
        { status: 400 }
      );
    }

    const home = resolveTeam(inputHome);
    const away = resolveTeam(inputAway);

    if (!home) {
      return NextResponse.json(
        {
          error: "Nama tim kandang tidak ditemukan.",
          input: inputHome,
          availableTeams: teamNames,
        },
        { status: 400 }
      );
    }

    if (!away) {
      return NextResponse.json(
        {
          error: "Nama tim tandang tidak ditemukan.",
          input: inputAway,
          availableTeams: teamNames,
        },
        { status: 400 }
      );
    }

    if (home === away) {
      return NextResponse.json(
        { error: "Tim kandang dan tandang harus berbeda." },
        { status: 400 }
      );
    }

    if (
      !/^\d{4}-\d{2}-\d{2}/.test(kickoff) ||
      Number.isNaN(new Date(kickoff).getTime())
    ) {
      return NextResponse.json(
        { error: "Format kickoff tidak valid. Gunakan ISO 8601." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      predict(home, away, kickoff)
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : "Gagal menghitung prediksi Bundesliga.",
      },
      { status: 500 }
    );
  }
}