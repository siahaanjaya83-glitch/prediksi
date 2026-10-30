import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import dataset from "../../../data/bundesliga-match-stats.json";

type HistoricalMatch = {
  league: string;
  season?: string;
  date: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  homeShots?: number | null;
  awayShots?: number | null;
  homeShotsOnTarget?: number | null;
  awayShotsOnTarget?: number | null;
  homeCorners?: number | null;
  awayCorners?: number | null;
  homeFouls?: number | null;
  awayFouls?: number | null;
  homeYellowCards?: number | null;
  awayYellowCards?: number | null;
  homeRedCards?: number | null;
  awayRedCards?: number | null;
  homeXG?: number | null;
  awayXG?: number | null;
  homePossession?: number | null;
  awayPossession?: number | null;
};

const normalize = (value: string) =>
  value.trim().toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, " ");

function canonicalLeague(value: string): string {
  const key = normalize(value);

  if (
    key === "english premier league" ||
    key === "premier league" ||
    key === "epl"
  ) return "english premier league";

  if (
    key === "ligue 1 france" ||
    key === "ligue 1" ||
    key === "french ligue 1"
  ) return "ligue 1 france";

  if (key === "la liga" || key === "laliga") return "la liga";
  if (key === "serie a") return "serie a";

  if (
    key === "uefa champions league" ||
    key === "champions league" ||
    key === "ucl"
  ) return "uefa champions league";

  if (
    key === "uefa europa league" ||
    key === "europa league" ||
    key === "uel"
  ) return "uefa europa league";

  return key;
}

function poisson(lambda: number, goals: number): number {
  let result = Math.exp(-lambda);
  for (let i = 1; i <= goals; i++) result *= lambda / i;
  return result;
}

function mean(values: number[]): number {
  const valid = values.filter(Number.isFinite);
  return valid.length
    ? valid.reduce((sum, value) => sum + value, 0) / valid.length
    : 0;
}

function meanOptional(values: Array<number | null | undefined>) {
  const valid = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value)
  );
  return valid.length ? Number(mean(valid).toFixed(2)) : null;
}

function recent(values: HistoricalMatch[], count = 10) {
  return [...values]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, count);
}

function validMatch(match: HistoricalMatch): boolean {
  return Boolean(
    match &&
    typeof match.date === "string" &&
    Number.isFinite(Date.parse(match.date)) &&
    typeof match.home === "string" &&
    typeof match.away === "string" &&
    normalize(match.home) !== "" &&
    normalize(match.away) !== "" &&
    normalize(match.home) !== normalize(match.away) &&
    Number.isFinite(match.homeGoals) &&
    Number.isFinite(match.awayGoals) &&
    match.homeGoals >= 0 &&
    match.awayGoals >= 0
  );
}


type BundesligaMatch = {
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

const bundesMatches = dataset as BundesligaMatch[];

const bundesTeamNames = [
  ...new Set(
    bundesMatches.flatMap(m => [m.home, m.away])
  ),
];

function bundesNormalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const bundesAliases: Record<string, string> = {
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

function bundesResolveTeam(input: string): string | null {
  const key = bundesNormalizeKey(input);
  const alias = bundesAliases[key];

  if (alias && bundesTeamNames.includes(alias)) {
    return alias;
  }

  return bundesTeamNames.find(
    name => bundesNormalizeKey(name) === key
  ) ?? null;
}

function bundesMean(values: number[]): number {
  return values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : 0;
}

function bundesPoisson(lambda: number, goals: number): number {
  let factorial = 1;

  for (let i = 2; i <= goals; i++) {
    factorial *= i;
  }

  return Math.exp(-lambda) *
    Math.pow(lambda, goals) /
    factorial;
}

function bundesPredict(
  home: string,
  away: string,
  kickoff: string
) {
  const kickoffDate = new Date(kickoff);

  if (Number.isNaN(kickoffDate.getTime())) {
    throw new Error("Format kickoff Bundesliga tidak valid.");
  }

  // Dataset hanya memiliki tanggal, bukan jam.
  // Seluruh pertandingan pada tanggal kickoff dikeluarkan.
  const cutoffDate = kickoff.slice(0, 10);

  const history = bundesMatches.filter(m => {
    const status = String(m.matchStatus ?? "")
      .trim()
      .toLowerCase();

    const validStatus =
      !status ||
      status === "completed" ||
      status === "played";

    return (
      typeof m.date === "string" &&
      m.date < cutoffDate &&
      Number.isFinite(Number(m.homeGoals)) &&
      Number.isFinite(Number(m.awayGoals)) &&
      Number(m.homeGoals) >= 0 &&
      Number(m.awayGoals) >= 0 &&
      validStatus
    );
  });

  const leagueHome = bundesMean(
    history.map(m => Number(m.homeGoals))
  );

  const leagueAway = bundesMean(
    history.map(m => Number(m.awayGoals))
  );

  if (
    history.length < 50 ||
    leagueHome <= 0 ||
    leagueAway <= 0
  ) {
    return {
      available: false,
      reason: "Riwayat kompetisi Bundesliga belum mencukupi.",
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

  const priorWeight = 5;

  const homeAttack = (
    homeAtHome.reduce(
      (s, m) => s + Number(m.homeGoals), 0
    ) + priorWeight * leagueHome
  ) / (homeAtHome.length + priorWeight);

  const homeDefense = (
    homeAtHome.reduce(
      (s, m) => s + Number(m.awayGoals), 0
    ) + priorWeight * leagueAway
  ) / (homeAtHome.length + priorWeight);

  const awayAttack = (
    awayAtAway.reduce(
      (s, m) => s + Number(m.awayGoals), 0
    ) + priorWeight * leagueAway
  ) / (awayAtAway.length + priorWeight);

  const awayDefense = (
    awayAtAway.reduce(
      (s, m) => s + Number(m.homeGoals), 0
    ) + priorWeight * leagueHome
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

  for (let h = 0; h <= 10; h++) {
    for (let a = 0; a <= 10; a++) {
      const probability =
        bundesPoisson(expectedHome, h) *
        bundesPoisson(expectedAway, a);

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
    throw new Error("Distribusi probabilitas Bundesliga tidak valid.");
  }

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

function isBundesligaLeague(value: string): boolean {
  const key = bundesNormalizeKey(value);

  return (
    key.includes("bundesliga") &&
    !key.includes("uefa")
  );
}

export async function POST(request: Request) {
  try {
    let body: Record<string, unknown>;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Body permintaan harus berupa JSON yang valid." },
        { status: 400 }
      );
    }

    const league = String(body.league ?? "").trim();
    const home = String(body.home ?? "").trim();
    const away = String(body.away ?? "").trim();
    const kickoff = String(body.kickoff ?? "").trim();

    if (
      !league ||
      !home ||
      !away ||
      !kickoff ||
      normalize(home) === normalize(away)
    ) {
      return NextResponse.json(
        { error: "Isi league, home, away, dan kickoff yang valid." },
        { status: 400 }
      );
    }

    const kickoffTime = Date.parse(kickoff);

    if (!Number.isFinite(kickoffTime) || kickoffTime <= Date.now()) {
      return NextResponse.json(
        { error: "kickoff harus berupa tanggal dan waktu mendatang." },
        { status: 400 }
      );
    }

    // Bundesliga memakai dataset dan model historis khusus.
    // Endpoint tetap sama: /api/pre-match.
    if (isBundesligaLeague(league)) {
      const bundesHome = bundesResolveTeam(home);
      const bundesAway = bundesResolveTeam(away);

      if (!bundesHome) {
        return NextResponse.json(
          {
            error: "Nama tim kandang Bundesliga tidak ditemukan.",
            input: home,
            availableTeams: bundesTeamNames,
          },
          { status: 400 }
        );
      }

      if (!bundesAway) {
        return NextResponse.json(
          {
            error: "Nama tim tandang Bundesliga tidak ditemukan.",
            input: away,
            availableTeams: bundesTeamNames,
          },
          { status: 400 }
        );
      }

      if (bundesHome === bundesAway) {
        return NextResponse.json(
          { error: "Tim kandang dan tandang harus berbeda." },
          { status: 400 }
        );
      }

      return NextResponse.json(
        bundesPredict(bundesHome, bundesAway, kickoff)
      );
    }
    const dataFile = path.join(
      process.cwd(),
      "data",
      "match-stats.json"
    );

    let allMatches: HistoricalMatch[];

    try {
      const raw = await readFile(dataFile, "utf8");
      const parsed: unknown = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        throw new Error("Dataset bukan array.");
      }

      allMatches = parsed as HistoricalMatch[];
    } catch {
      return NextResponse.json(
        {
          error: "Dataset statistik historis tidak dapat dibaca.",
          detail: "Periksa data/match-stats.json."
        },
        { status: 503 }
      );
    }

    const requestedLeague = canonicalLeague(league);

    // Hanya hasil yang sudah terjadi sebelum kickoff yang boleh digunakan.
    const history = allMatches.filter(
      (match) =>
        validMatch(match) &&
        canonicalLeague(match.league) === requestedLeague &&
        Date.parse(match.date) < kickoffTime
    );

    if (history.length < 20) {
      const availableLeagues = [
        ...new Set(allMatches.filter(validMatch).map((match) => match.league))
      ];

      return NextResponse.json(
        {
          error: "Data historis untuk kompetisi ini belum cukup.",
          requestedLeague: league,
          availableMatches: history.length,
          requiredMatches: 20,
          availableCompetitions: availableLeagues,
          detail:
            "Dataset saat ini mencakup Premier League, La Liga, Serie A, dan Ligue 1. Liga Champions dan Liga Europa belum tersedia."
        },
        { status: 422 }
      );
    }

    // Ambil hanya laga kandang tim tuan rumah dan laga tandang tim tamu.
    const homeVenueHistory = history.filter(
      (match) => normalize(match.home) === normalize(home)
    );

    const awayVenueHistory = history.filter(
      (match) => normalize(match.away) === normalize(away)
    );

    if (homeVenueHistory.length < 3 || awayVenueHistory.length < 3) {
      return NextResponse.json(
        {
          error: "Riwayat kandang/tandang tim belum cukup.",
          homeVenueMatches: homeVenueHistory.length,
          awayVenueMatches: awayVenueHistory.length,
          requiredVenueMatches: 3,
          detail:
            "Diperlukan setidaknya 3 laga kandang untuk tuan rumah dan 3 laga tandang untuk tim tamu sebelum kickoff."
        },
        { status: 422 }
      );
    }

    const homeSample = recent(homeVenueHistory);
    const awaySample = recent(awayVenueHistory);

    // Rata-rata liga dihitung hanya dari pertandingan sebelum kickoff.
    const averageHomeGoals = mean(history.map((match) => match.homeGoals));
    const averageAwayGoals = mean(history.map((match) => match.awayGoals));

    if (averageHomeGoals <= 0 || averageAwayGoals <= 0) {
      return NextResponse.json(
        { error: "Rata-rata gol historis liga tidak memadai." },
        { status: 422 }
      );
    }

    const homeScored = mean(homeSample.map((match) => match.homeGoals));
    const homeConceded = mean(homeSample.map((match) => match.awayGoals));
    const awayScored = mean(awaySample.map((match) => match.awayGoals));
    const awayConceded = mean(awaySample.map((match) => match.homeGoals));

    const lambdaHome = Math.min(
      5,
      Math.max(
        0.05,
        averageHomeGoals *
          (homeScored / averageHomeGoals) *
          (awayConceded / averageHomeGoals)
      )
    );

    const lambdaAway = Math.min(
      5,
      Math.max(
        0.05,
        averageAwayGoals *
          (awayScored / averageAwayGoals) *
          (homeConceded / averageAwayGoals)
      )
    );

    const scores: Array<{
      home: number;
      away: number;
      probability: number;
    }> = [];

    let homeWin = 0;
    let draw = 0;
    let awayWin = 0;
    let under25 = 0;

    for (let homeGoals = 0; homeGoals <= 20; homeGoals++) {
      for (let awayGoals = 0; awayGoals <= 20; awayGoals++) {
        const probability =
          poisson(lambdaHome, homeGoals) *
          poisson(lambdaAway, awayGoals);

        scores.push({
          home: homeGoals,
          away: awayGoals,
          probability
        });

        if (homeGoals > awayGoals) homeWin += probability;
        else if (homeGoals === awayGoals) draw += probability;
        else awayWin += probability;

        if (homeGoals + awayGoals <= 2) under25 += probability;
      }
    }

    scores.sort((a, b) => b.probability - a.probability);

    const summarizeVenue = (matches: HistoricalMatch[], venue: "home" | "away") => {
      const isHome = venue === "home";

      return {
        matchesUsed: matches.length,
        goalsScoredPerMatch: Number(
          mean(matches.map((match) =>
            isHome ? match.homeGoals : match.awayGoals
          )).toFixed(2)
        ),
        goalsConcededPerMatch: Number(
          mean(matches.map((match) =>
            isHome ? match.awayGoals : match.homeGoals
          )).toFixed(2)
        ),
        averageShots: meanOptional(matches.map((match) =>
          isHome ? match.homeShots : match.awayShots
        )),
        averageShotsOnTarget: meanOptional(matches.map((match) =>
          isHome ? match.homeShotsOnTarget : match.awayShotsOnTarget
        )),
        averageCorners: meanOptional(matches.map((match) =>
          isHome ? match.homeCorners : match.awayCorners
        )),
        averageYellowCards: meanOptional(matches.map((match) =>
          isHome ? match.homeYellowCards : match.awayYellowCards
        )),
        averageRedCards: meanOptional(matches.map((match) =>
          isHome ? match.homeRedCards : match.awayRedCards
        )),
        averageXG: meanOptional(matches.map((match) =>
          isHome ? match.homeXG : match.awayXG
        )),
        averagePossession: meanOptional(matches.map((match) =>
          isHome ? match.homePossession : match.awayPossession
        ))
      };
    };

    return NextResponse.json({
      available: true,
      source: "Local historical match statistics",
      method: "Independent Poisson baseline using pre-kickoff venue history",
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
      topScores: scores.slice(0, 5).map((score) => ({
        score: `${score.home}-${score.away}`,
        probability: Number((score.probability * 100).toFixed(2))
      })),
      probabilities: {
        homeWin: Number((homeWin * 100).toFixed(2)),
        draw: Number((draw * 100).toFixed(2)),
        awayWin: Number((awayWin * 100).toFixed(2)),
        under2_5Goals: Number((under25 * 100).toFixed(2))
      },
      teamStatistics: {
        home: summarizeVenue(homeSample, "home"),
        away: summarizeVenue(awaySample, "away")
      },
      sampleSize: {
        leagueMatchesBeforeKickoff: history.length,
        homeVenueMatchesAvailable: homeVenueHistory.length,
        awayVenueMatchesAvailable: awayVenueHistory.length,
        homeVenueMatchesUsed: homeSample.length,
        awayVenueMatchesUsed: awaySample.length
      },
      dataCutoff: kickoff,
      disclaimer:
        "Estimasi statistik, bukan jaminan. xG dan penguasaan bola tidak tersedia pada sumber saat ini. Model belum divalidasi melalui backtesting."
    });
  } catch {
    return NextResponse.json(
      { error: "Prediksi gagal diproses." },
      { status: 500 }
    );
  }
}