import { NextResponse } from "next/server";


export async function GET(request: Request) {
  const apiKey = process.env.API_FOOTBALL_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "API_FOOTBALL_KEY belum diatur di .env.local" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") === "today" ? "today" : "live";

  const url = new URL("https://v3.football.api-sports.io/fixtures");

  if (mode === "live") {
    url.searchParams.set("live", "all");
  } else {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    url.searchParams.set("date", today);
    url.searchParams.set("timezone", "Asia/Jakarta");
  }

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { "x-apisports-key": apiKey },
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok || (data.errors && Object.keys(data.errors).length > 0)) {
      return NextResponse.json(
        {
          error: "API-Football menolak permintaan.",
          details: data.errors ?? `HTTP ${response.status}`,
        },
        { status: response.ok ? 502 : response.status }
      );
    }

    const matches = (data.response ?? []).map((item: any) => ({
      id: item.fixture?.id,
      league: item.league?.name ?? "Liga tidak diketahui",
      country: item.league?.country ?? "",
      home: item.teams?.home?.name ?? "Tim kandang",
      away: item.teams?.away?.name ?? "Tim tandang",
      homeLogo: item.teams?.home?.logo ?? "",
      awayLogo: item.teams?.away?.logo ?? "",
      homeScore: item.goals?.home,
      awayScore: item.goals?.away,
      status: item.fixture?.status?.short ?? "NS",
      statusText: item.fixture?.status?.long ?? "",
      elapsed: item.fixture?.status?.elapsed,
      date: item.fixture?.date,
      venue: item.fixture?.venue?.name ?? "",
    }));

    return NextResponse.json({
      mode,
      total: matches.length,
      matches,
      errors: [],
      updatedAt: new Date().toISOString(),
      quota: {
        remaining: response.headers.get("x-ratelimit-requests-remaining"),
        limit: response.headers.get("x-ratelimit-requests-limit"),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Tidak dapat menghubungi API-Football. Periksa koneksi internet." },
      { status: 502 }
    );
  }
}

