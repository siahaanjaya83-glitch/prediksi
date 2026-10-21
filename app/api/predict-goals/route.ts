import { NextResponse } from "next/server";

type ApiValue =
  | string
  | number
  | boolean
  | null
  | ApiValue[]
  | { [key: string]: ApiValue };

type ApiObject = { [key: string]: ApiValue };
function asObject(value: ApiValue | undefined): ApiObject | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as ApiObject;
  }
  return null;
}

function asArray(value: ApiValue | undefined): ApiValue[] {
  return Array.isArray(value) ? value : [];
}

function field(
  value: ApiValue | undefined,
  key: string
): ApiValue | undefined {
  return asObject(value)?.[key];
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace("%", ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function poissonProbability(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let probability = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) probability *= lambda / i;
  return probability;
}

function stat(stats: ApiObject[], ...names: string[]): number | null {
  for (const item of stats) {
    if (typeof item.type === "string" && names.includes(item.type)) {
      const value = numberValue(item.value);
      if (value !== null) return value;
    }
  }
  return null;
}

async function apiGet(
  endpoint: string,
  apiKey: string,
  fixtureId: number
): Promise<ApiObject> {
  const url = new URL(`https://v3.football.api-sports.io/${endpoint}`);

  // Endpoint fixtures menggunakan parameter id.
  // Endpoint statistik dan prediksi menggunakan parameter fixture.
  const parameter = endpoint === "fixtures" ? "id" : "fixture";
  url.searchParams.set(parameter, String(fixtureId));

  const response = await fetch(url.toString(), {
    headers: { "x-apisports-key": apiKey },
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok || (data.errors && Object.keys(data.errors).length > 0)) {
    throw new Error(
      `API-Football ${endpoint}: ${JSON.stringify(data.errors ?? response.status)}`
    );
  }

  return data;
}

export async function GET(request: Request) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "API_FOOTBALL_KEY belum diatur di .env.local" },
      { status: 500 }
    );
  }

  const fixtureId = Number(new URL(request.url).searchParams.get("fixtureId"));
  if (!Number.isSafeInteger(fixtureId) || fixtureId <= 0) {
    return NextResponse.json({ error: "fixtureId tidak valid." }, { status: 400 });
  }

  try {
    const fixtureData = await apiGet("fixtures", apiKey, fixtureId);
    const fixture = asObject(asArray(fixtureData.response)[0]);
    if (!fixture) {
      return NextResponse.json({ error: "Pertandingan tidak ditemukan." }, { status: 404 });
    }

    const fixtureInfo = asObject(field(fixture, "fixture"));
    const fixtureStatus = asObject(field(fixtureInfo ?? undefined, "status"));
    const teams = asObject(field(fixture, "teams"));
    const homeTeam = asObject(field(teams ?? undefined, "home"));
    const awayTeam = asObject(field(teams ?? undefined, "away"));
    const goals = asObject(field(fixture, "goals"));

    const status = String(field(fixtureStatus ?? undefined, "short") ?? "");
    const elapsed = Number(field(fixtureStatus ?? undefined, "elapsed") ?? 0);
    const homeScore = Number(field(goals ?? undefined, "home") ?? 0);
    const awayScore = Number(field(goals ?? undefined, "away") ?? 0);
    const finishedStatuses = ["FT", "AET", "PEN", "CANC", "ABD", "AWD", "WO"];
    if (finishedStatuses.includes(status)) {
      return NextResponse.json({
        fixtureId,
        finished: true,
        message: "Pertandingan telah selesai. Tidak ada gol tersisa untuk diprediksi.",
        score: { home: homeScore, away: awayScore },
        status,
      });
    }

    if (status === "NS" || !elapsed) {
      return NextResponse.json({
        fixtureId,
        finished: false,
        message: "Pertandingan belum berjalan. Prediksi gol tambahan tersedia setelah pertandingan dimulai.",
        status,
      });
    }
    const [statsData, predictionData] = await Promise.all([
      apiGet("fixtures/statistics", apiKey, fixtureId),
      apiGet("predictions", apiKey, fixtureId),
    ]);


    const extraTime = ["ET", "BT"].includes(status);
    const totalMinutes = extraTime ? 120 : 90;
    const remainingMinutes = clamp(totalMinutes - elapsed, 0, totalMinutes);
    const prediction = asObject(asArray(predictionData.response)[0]);
    const comparison = asObject(field(prediction ?? undefined, "comparison"));

    const stats = asArray(statsData.response)
      .map(asObject)
      .filter((item): item is ApiObject => item !== null);

    const homeId = field(homeTeam ?? undefined, "id");
    const awayId = field(awayTeam ?? undefined, "id");

    const homeEntry = stats.find(
      (item) => field(asObject(field(item, "team")) ?? undefined, "id") === homeId
    );
    const awayEntry = stats.find(
      (item) => field(asObject(field(item, "team")) ?? undefined, "id") === awayId
    );

    const homeStats = asArray(field(homeEntry, "statistics"))
      .map(asObject)
      .filter((item): item is ApiObject => item !== null);
    const awayStats = asArray(field(awayEntry, "statistics"))
      .map(asObject)
      .filter((item): item is ApiObject => item !== null);

    const homeSot = stat(homeStats, "Shots on Goal");
    const awaySot = stat(awayStats, "Shots on Goal");
    const homeShots = stat(homeStats, "Total Shots");
    const awayShots = stat(awayStats, "Total Shots");

    const hasLiveStats = homeSot !== null || awaySot !== null ||
      homeShots !== null || awayShots !== null;

    const attack = asObject(field(comparison ?? undefined, "att"));
    const defense = asObject(field(comparison ?? undefined, "def"));

    const homeAttack = numberValue(field(attack ?? undefined, "home")) ?? 50;
    const awayAttack = numberValue(field(attack ?? undefined, "away")) ?? 50;
    const homeDefense = numberValue(field(defense ?? undefined, "home")) ?? 50;
    const awayDefense = numberValue(field(defense ?? undefined, "away")) ?? 50;

    function pressureMultiplier(sot: number | null, shots: number | null) {
      if (!hasLiveStats) return 1;

      const elapsedSafe = Math.max(elapsed, 10);
      const expectedSot = elapsedSafe * 5 / 90;
      const expectedShots = elapsedSafe * 13 / 90;
      const sotRatio = sot === null ? 1 : sot / Math.max(expectedSot, 0.5);
      const shotRatio = shots === null ? 1 : shots / Math.max(expectedShots, 1);
      const pressure = 0.7 * sotRatio + 0.3 * shotRatio;

      return clamp(0.65 + 0.35 * pressure, 0.65, 1.4);
    }

    function strengthMultiplier(attack: number, opponentDefense: number) {
      const attackFactor = attack / 50;
      const defensiveWeakness = (100 - opponentDefense) / 50;
      return clamp(0.6 * attackFactor + 0.4 * defensiveWeakness, 0.7, 1.3);
    }

    let homeGameState = 1;
    let awayGameState = 1;

    if (homeScore > awayScore) {
      homeGameState = 0.94;
      awayGameState = 1.10;
    } else if (awayScore > homeScore) {
      homeGameState = 1.10;
      awayGameState = 0.94;
    }

    const remainingFraction = remainingMinutes / 90;
    const baselineHome = 1.2 * remainingFraction;
    const baselineAway = 1.0 * remainingFraction;

    const homeLambda = Math.max(
      0,
      baselineHome *
        pressureMultiplier(homeSot, homeShots) *
        strengthMultiplier(homeAttack, awayDefense) *
        homeGameState
    );

    const awayLambda = Math.max(
      0,
      baselineAway *
        pressureMultiplier(awaySot, awayShots) *
        strengthMultiplier(awayAttack, homeDefense) *
        awayGameState
    );

    const totalLambda = homeLambda + awayLambda;
    const probabilityZero = poissonProbability(0, totalLambda);
    const probabilityOne = poissonProbability(1, totalLambda);
    const probabilityTwoOrMore = clamp(1 - probabilityZero - probabilityOne, 0, 1);

    // Modus Poisson: jumlah gol tambahan yang paling mungkin untuk tiap tim.
    const likelyHomeGoals = Math.floor(homeLambda);
    const likelyAwayGoals = Math.floor(awayLambda);

    return NextResponse.json({
      fixtureId,
      finished: false,
      match: {
        home: field(homeTeam ?? undefined, "name"),
        away: field(awayTeam ?? undefined, "name"),
        status,
        elapsed,
        remainingMinutes,
        score: { home: homeScore, away: awayScore },
      },
      additionalGoals: {
        expectedHome: Number(homeLambda.toFixed(2)),
        expectedAway: Number(awayLambda.toFixed(2)),
        expectedTotal: Number(totalLambda.toFixed(2)),
      },
      mostLikelyScore: {
        home: homeScore + likelyHomeGoals,
        away: awayScore + likelyAwayGoals,
      },
      totalAdditionalGoalsProbability: {
        zero: `${(probabilityZero * 100).toFixed(1)}%`,
        one: `${(probabilityOne * 100).toFixed(1)}%`,
        twoOrMore: `${(probabilityTwoOrMore * 100).toFixed(1)}%`,
      },
      inputs: {
        liveStatisticsAvailable: hasLiveStats,
        shotsOnTarget: { home: homeSot, away: awaySot },
        totalShots: { home: homeShots, away: awayShots },
        strengthComparisonAvailable: Boolean(prediction?.comparison),
      },
      model: "Poisson baseline adjusted by live shot pressure, team comparison, match time and score state",
      note: "Estimasi statistik eksperimental, bukan jaminan. Belum tervalidasi melalui backtesting. Jika statistik langsung tidak tersedia, estimasi menggunakan baseline dan indikator kekuatan yang tersedia.",
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[predict-goals] Error:", message);
    return NextResponse.json(
      { error: "Gagal menghitung prediksi gol.", detail: message },
      { status: 502 }
    );
  }
}



