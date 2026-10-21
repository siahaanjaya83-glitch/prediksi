import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const apiKey = process.env.API_FOOTBALL_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "API_FOOTBALL_KEY belum diatur di .env.local" },
      { status: 500 }
    );
  }

  const params = new URL(request.url).searchParams;
  const fixtureId = Number(params.get("fixtureId"));

  if (!Number.isSafeInteger(fixtureId) || fixtureId <= 0) {
    return NextResponse.json(
      { error: "fixtureId tidak valid." },
      { status: 400 }
    );
  }

  try {
    const url = new URL("https://v3.football.api-sports.io/predictions");
    url.searchParams.set("fixture", String(fixtureId));

    const response = await fetch(url.toString(), {
      headers: { "x-apisports-key": apiKey },
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok || (data.errors && Object.keys(data.errors).length > 0)) {
      return NextResponse.json(
        {
          error: "Gagal mengambil analisis prediksi.",
          details: data.errors ?? `HTTP ${response.status}`,
        },
        { status: response.ok ? 502 : response.status }
      );
    }

    const item = data.response?.[0];

    if (!item?.predictions) {
      return NextResponse.json(
        { error: "Prediksi belum tersedia untuk pertandingan ini. Coba pertandingan lain." },
        { status: 404 }
      );
    }

    const p = item.predictions;
    const c = item.comparison ?? {};

    return NextResponse.json({
      fixtureId,
      available: true,
      teams: {
        home: item.teams?.home?.name ?? "Tim kandang",
        away: item.teams?.away?.name ?? "Tim tandang",
      },
      league: item.league?.name ?? "",
      predictions: {
        winner: p.winner?.name ?? null,
        advice: p.advice ?? null,
        goals: p.goals ?? {},
        probabilities: p.percent ?? {},
        form: c.form ?? {},
        attack: c.att ?? {},
        defense: c.def ?? {},
        headToHead: c.h2h ?? {},
        poisson: c.poisson ?? {},
      },
      updatedAt: new Date().toISOString(),
      source: "API-Football Predictions",
      note: "Prediksi statistik, bukan jaminan hasil. Ketersediaan dan akurasi bergantung pada cakupan serta kualitas data.",
    });
  } catch {
    return NextResponse.json(
      { error: "Tidak dapat menghubungi API-Football." },
      { status: 502 }
    );
  }
}