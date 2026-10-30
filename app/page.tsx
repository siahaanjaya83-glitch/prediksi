"use client";

import { useEffect, useMemo, useState } from "react";

type PreMatchLeague = {
  name: string;
  available: boolean;
  matches: number;
  teams: string[];
};

type ScoreItem = {
  score: string;
  probability: number;
};

type PreMatchResult = {
  league: string;
  source: string;
  method: string;
  kickoff: string;
  teams: {
    home: string;
    away: string;
  };
  expectedGoals: {
    home: number;
    away: number;
  };
  mostLikelyScore: {
    home: number;
    away: number;
    probability: number;
  };
  topScores: ScoreItem[];
  probabilities: {
    homeWin: number;
    draw: number;
    awayWin: number;
    under2_5Goals: number | null;
  };
  sampleSize: {
    competition: number;
    homeAvailable: number;
    awayAvailable: number;
    homeUsed: number;
    awayUsed: number;
  };
  predictionCutoff: string;
  latestHistoricalMatchDate: string | null;
  disclaimer: string;
};

type RawObject = Record<string, unknown>;

const card =
  "rounded-2xl border border-white/10 bg-[#111a2b] p-5";

const field =
  "mt-2 w-full rounded-xl border border-white/10 bg-[#111a2b] px-3 py-3 text-white outline-none focus:border-emerald-400";

function numberValue(value: unknown, fallback = 0): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function probabilityPercent(value: unknown): number {
  const n = numberValue(value);
  return Number((n <= 1 ? n * 100 : n).toFixed(2));
}

function poissonProbability(lambda: number, goals: number): number {
  let probability = Math.exp(-lambda);

  for (let i = 1; i <= goals; i++) {
    probability *= lambda / i;
  }

  return probability;
}

function goalMarkets(homeLambda: number, awayLambda: number) {
  const maxGoals = 20;
  const homeDistribution = Array.from(
    { length: maxGoals + 1 },
    (_, goals) => poissonProbability(homeLambda, goals)
  );
  const awayDistribution = Array.from(
    { length: maxGoals + 1 },
    (_, goals) => poissonProbability(awayLambda, goals)
  );

  let under15 = 0;
  let under25 = 0;
  let under35 = 0;
  let btts = 0;

  for (let home = 0; home <= maxGoals; home++) {
    for (let away = 0; away <= maxGoals; away++) {
      const p = homeDistribution[home] * awayDistribution[away];
      const total = home + away;

      if (total <= 1) under15 += p;
      if (total <= 2) under25 += p;
      if (total <= 3) under35 += p;
      if (home > 0 && away > 0) btts += p;
    }
  }

  return {
    over15: (1 - under15) * 100,
    under15: under15 * 100,
    over25: (1 - under25) * 100,
    under25: under25 * 100,
    over35: (1 - under35) * 100,
    under35: under35 * 100,
    btts: btts * 100,
    noBtts: (1 - btts) * 100,
  };
}

function normalizeResult(raw: RawObject): PreMatchResult {
  const expected = raw.expectedGoals as RawObject;
  const teams = (
    (raw.teams as RawObject | undefined) ?? {
      home: raw.home,
      away: raw.away,
    }
  ) as RawObject;

  const probabilities = raw.probabilities as RawObject;
  const sample = (
    (raw.sampleSize as RawObject | undefined) ?? {}
  );

  const rawTopScores = Array.isArray(raw.topScores)
    ? raw.topScores as RawObject[]
    : [];

  const mostLikely = raw.mostLikelyScore as RawObject;

  const homeLambda = numberValue(expected.home);
  const awayLambda = numberValue(expected.away);

  const rawMostLikelyProbability = numberValue(
    mostLikely.probability
  );

  const scoreProbability = rawMostLikelyProbability <= 1
    ? rawMostLikelyProbability * 100
    : rawMostLikelyProbability;

  const topScores = rawTopScores.map((item) => {
    const rawProbability = numberValue(item.probability);

    return {
      score: typeof item.score === "string"
        ? item.score
        : `${item.home}-${item.away}`,
      probability: Number(
        (rawProbability <= 1
          ? rawProbability * 100
          : rawProbability).toFixed(2)
      ),
    };
  });

  return {
    league: String(raw.league ?? ""),
    source: String(raw.source ?? ""),
    method: String(raw.method ?? ""),
    kickoff: String(raw.kickoff ?? ""),
    teams: {
      home: String(teams.home ?? ""),
      away: String(teams.away ?? ""),
    },
    expectedGoals: {
      home: homeLambda,
      away: awayLambda,
    },
    mostLikelyScore: {
      home: numberValue(mostLikely.home),
      away: numberValue(mostLikely.away),
      probability: Number(scoreProbability.toFixed(2)),
    },
    topScores,
    probabilities: {
      homeWin: probabilityPercent(
        probabilities.homeWin ?? probabilities.home
      ),
      draw: probabilityPercent(probabilities.draw),
      awayWin: probabilityPercent(
        probabilities.awayWin ?? probabilities.away
      ),
      under2_5Goals:
        probabilities.under2_5Goals == null
          ? null
          : probabilityPercent(probabilities.under2_5Goals),
    },
    sampleSize: {
      competition: numberValue(
        sample.competitionMatches ??
        sample.leagueMatchesBeforeKickoff ??
        raw.historyMatches
      ),
      homeAvailable: numberValue(
        sample.homeMatchesAvailable ??
        sample.homeVenueMatchesAvailable ??
        sample.homeVenueMatches
      ),
      awayAvailable: numberValue(
        sample.awayMatchesAvailable ??
        sample.awayVenueMatchesAvailable ??
        sample.awayVenueMatches
      ),
      homeUsed: numberValue(
        sample.homeMatchesUsed ??
        sample.homeVenueMatchesUsed ??
        sample.homeVenueMatches
      ),
      awayUsed: numberValue(
        sample.awayMatchesUsed ??
        sample.awayVenueMatchesUsed ??
        sample.awayVenueMatches
      ),
    },
    predictionCutoff: String(
      raw.predictionCutoff ?? raw.dataCutoff ?? raw.kickoff ?? ""
    ).slice(0, 10),
    latestHistoricalMatchDate:
      typeof raw.latestHistoricalMatchDate === "string"
        ? raw.latestHistoricalMatchDate
        : null,
    disclaimer: String(
      raw.disclaimer ?? raw.note ??
      "Prediksi merupakan estimasi statistik, bukan jaminan hasil."
    ),
  };
}

function Metric({
  label,
  value,
  suffix = "%",
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-black tabular-nums">
        {value.toFixed(2)}{suffix}
      </p>
    </div>
  );
}

function ProbabilityBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div>
      <div className="mb-2 flex justify-between gap-3 text-sm">
        <span className="text-slate-300">{label}</span>
        <strong>{value.toFixed(2)}%</strong>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

export default function Home() {
  const [leagues, setLeagues] = useState<PreMatchLeague[]>([]);
  const [league, setLeague] = useState("");
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [kickoff, setKickoff] = useState("");
  useEffect(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setMinutes(0, 0, 0);

    const pad = (value: number) => String(value).padStart(2, "0");

    const localKickoff =
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      `T${pad(date.getHours())}:00`;

    setKickoff(localKickoff);
  }, []);

  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingPrediction, setLoadingPrediction] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PreMatchResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadOptions() {
      setLoadingOptions(true);
      setError("");

      try {
        const response = await fetch("/api/pre-match/options", {
          cache: "no-store",
          signal: controller.signal,
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(
            payload.error ?? "Pilihan kompetisi gagal dimuat."
          );
        }

        const available = (payload.leagues ?? []) as PreMatchLeague[];
        setLeagues(available);

        const first = available.find((item) => item.available);

        if (first) {
          setLeague(first.name);
          setHome(first.teams[0] ?? "");
          setAway(first.teams[1] ?? "");
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Gagal membaca dataset lokal."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingOptions(false);
        }
      }
    }

    void loadOptions();

    return () => controller.abort();
  }, []);

  const selectedLeague = leagues.find(
    (item) => item.name === league
  );

  const teams = selectedLeague?.teams ?? [];

  const markets = useMemo(() => {
    if (!result) return null;

    return goalMarkets(
      result.expectedGoals.home,
      result.expectedGoals.away
    );
  }, [result]);

  async function submitPrediction(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!league || !home || !away || home === away || !kickoff) {
      setError("Lengkapi kompetisi, kedua tim, dan waktu kickoff.");
      return;
    }

    const kickoffDate = new Date(kickoff);

    if (
      Number.isNaN(kickoffDate.getTime()) ||
      kickoffDate.getTime() <= Date.now()
    ) {
      setError("Waktu kickoff harus berada di masa mendatang.");
      return;
    }

    setLoadingPrediction(true);
    setError("");
    setResult(null);

    try {
      const normalizedLeague = league
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    const isBundesliga =
      normalizedLeague.includes("bundesliga") &&
      !normalizedLeague.includes("uefa");

    const isEuropean = league.startsWith("UEFA ");

    const endpoint = isEuropean
      ? "/api/european/pre-match"
      : "/api/pre-match";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          league,
          home,
          away,
          kickoff: kickoffDate.toISOString(),
        }),
      });

      const payload = await response.json();

      if (!response.ok || payload.available === false) {
        const detail = payload.detail
          ? ` ${payload.detail}`
          : "";

        const reason = payload.reason
          ? ` ${payload.reason}`
          : "";

        throw new Error(
          `${payload.error ?? "Prediksi belum tersedia."}${detail}${reason}`
        );
      }

      setResult(normalizeResult(payload));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Prediksi gagal diproses."
      );
    } finally {
      setLoadingPrediction(false);
    }
  }

  function changeLeague(value: string) {
    const next = leagues.find((item) => item.name === value);

    setLeague(value);
    setHome(next?.teams[0] ?? "");
    setAway(next?.teams[1] ?? "");
    setResult(null);
    setError("");
  }

  const probabilityTotal = result
    ? result.probabilities.homeWin +
      result.probabilities.draw +
      result.probabilities.awayWin
    : 0;

  return (
    <main className="min-h-screen bg-[#080d18] text-slate-100">
      <header className="border-b border-white/10 bg-[#0d1423]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400 text-xl font-black text-slate-950">
              G
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">
                Goal<span className="text-emerald-400">Predict</span>
              </h1>
              <p className="text-xs text-slate-400">
                Historical Football Analytics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-emerald-400/30 px-3 py-1.5 text-xs text-emerald-300">
              Local Data Model
            </span>
            <a
              href="/history"
              className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-emerald-400/50"
            >
              Statistik Historis
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8">
        <section className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-400">
            Pre-Match Prediction
          </p>
          <h2 className="mt-3 text-3xl font-black sm:text-4xl">
            Prediksi Pra-Pertandingan
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Analisis probabilitas hasil pertandingan, expected goals,
            prediksi skor, dan pasar gol berdasarkan dataset historis lokal.
            Tidak memerlukan API-Football.
          </p>
        </section>

        <section className={`${card} mb-8`}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-bold">Atur pertandingan</h3>
              <p className="mt-1 text-xs text-slate-400">
                Pilih kompetisi dan dua tim yang berbeda.
              </p>
            </div>
            <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              Dataset historis
            </span>
          </div>

          {loadingOptions ? (
            <p className="py-6 text-sm text-slate-400">
              Membaca dataset dan daftar tim...
            </p>
          ) : (
            <form
              onSubmit={submitPrediction}
              className="grid gap-4 sm:grid-cols-2"
            >
              <label className="text-sm text-slate-300">
                Kompetisi
                <select
                  value={league}
                  onChange={(event) => changeLeague(event.target.value)}
                  required
                  className={field}
                >
                  {leagues.map((item) => (
                    <option
                      key={item.name}
                      value={item.name}
                      disabled={!item.available}
                    >
                      {item.name} â€” {item.matches.toLocaleString("id-ID")} laga
                      {!item.available ? " (data belum cukup)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-slate-300">
                Waktu kickoff
                <input
                  type="datetime-local"
                  value={kickoff}
                  onChange={(event) => setKickoff(event.target.value)}
                  required
                  className={field}
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Mengikuti zona waktu perangkat.
                </span>
              </label>

              <label className="text-sm text-slate-300">
                Tim kandang
                <select
                  value={home}
                  onChange={(event) => {
                    setHome(event.target.value);
                    setResult(null);
                  }}
                  required
                  className={field}
                >
                  {teams.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-slate-300">
                Tim tandang
                <select
                  value={away}
                  onChange={(event) => {
                    setAway(event.target.value);
                    setResult(null);
                  }}
                  required
                  className={field}
                >
                  {teams.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
              </label>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={
                    loadingPrediction ||
                    !selectedLeague?.available ||
                    !home ||
                    !away ||
                    home === away
                  }
                  className="w-full rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {loadingPrediction
                    ? "Menghitung prediksi..."
                    : "Analisis & Prediksi Pertandingan"}
                </button>

                {home && away && home === away && (
                  <p className="mt-2 text-sm text-amber-300">
                    Tim kandang dan tandang harus berbeda.
                  </p>
                )}
              </div>
            </form>
          )}

          {error && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100"
            >
              {error}
            </div>
          )}
        </section>

        {loadingPrediction && (
          <div className={`${card} mb-8 text-center`}>
            <p className="font-bold text-emerald-300">
              Model sedang menganalisis data historis...
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Menghitung expected goals dan distribusi probabilitas skor.
            </p>
          </div>
        )}

        {result && markets && (
          <section className="space-y-6">
            <div className={`${card} border-emerald-400/30`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                    Hasil prediksi
                  </p>
                  <h3 className="mt-2 text-xl font-black">
                    {result.teams.home}
                    <span className="mx-2 text-emerald-400">vs</span>
                    {result.teams.away}
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    {result.league}
                  </p>
                </div>
                <span className="rounded-full border border-emerald-400/30 px-3 py-1.5 text-xs text-emerald-300">
                  Selesai dianalisis
                </span>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-black/20 p-4">
                  <p className="text-xs text-slate-400">Expected goals kandang</p>
                  <p className="mt-2 text-3xl font-black text-emerald-300">
                    {result.expectedGoals.home.toFixed(2)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {result.teams.home}
                  </p>
                </div>
                <div className="rounded-xl bg-black/20 p-4">
                  <p className="text-xs text-slate-400">Prediksi skor utama</p>
                  <p className="mt-2 text-3xl font-black">
                    {result.mostLikelyScore.home} â€“ {result.mostLikelyScore.away}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Probabilitas {result.mostLikelyScore.probability.toFixed(2)}%
                  </p>
                </div>
                <div className="rounded-xl bg-black/20 p-4">
                  <p className="text-xs text-slate-400">Expected goals tandang</p>
                  <p className="mt-2 text-3xl font-black text-sky-300">
                    {result.expectedGoals.away.toFixed(2)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {result.teams.away}
                  </p>
                </div>
              </div>
            </div>

            <div className={card}>
              <h3 className="text-lg font-bold">Probabilitas hasil 1X2</h3>
              <p className="mt-1 text-xs text-slate-400">
                Peluang hasil berdasarkan distribusi skor model.
              </p>

              <div className="mt-5 space-y-5">
                <ProbabilityBar
                  label={`Menang ${result.teams.home}`}
                  value={result.probabilities.homeWin}
                  color="bg-emerald-400"
                />
                <ProbabilityBar
                  label="Seri"
                  value={result.probabilities.draw}
                  color="bg-amber-400"
                />
                <ProbabilityBar
                  label={`Menang ${result.teams.away}`}
                  value={result.probabilities.awayWin}
                  color="bg-sky-400"
                />
              </div>

              <p className="mt-4 text-xs text-slate-500">
                Total probabilitas 1X2: {probabilityTotal.toFixed(2)}%.
                Perbedaan kecil dapat terjadi karena pembulatan.
              </p>
            </div>

            <div className={card}>
              <h3 className="text-lg font-bold">Analisis total gol</h3>
              <p className="mt-1 text-xs text-slate-400">
                Perhitungan dari distribusi Poisson dengan expected goals kedua tim.
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Metric label="Over 1.5" value={markets.over15} />
                <Metric label="Under 1.5" value={markets.under15} />
                <Metric label="Over 2.5" value={markets.over25} />
                <Metric label="Under 2.5" value={markets.under25} />
                <Metric label="Over 3.5" value={markets.over35} />
                <Metric label="Under 3.5" value={markets.under35} />
              </div>
            </div>

            <div className={card}>
              <h3 className="text-lg font-bold">Both Teams To Score (BTTS)</h3>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Metric label="Kedua tim mencetak gol" value={markets.btts} />
                <Metric label="Minimal satu tim tanpa gol" value={markets.noBtts} />
              </div>
            </div>

            <div className={card}>
              <h3 className="text-lg font-bold">Lima skor paling mungkin</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[300px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs text-slate-400">
                      <th className="py-3">Peringkat</th>
                      <th className="py-3">Skor</th>
                      <th className="py-3 text-right">Probabilitas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.topScores.map((item, index) => (
                      <tr
                        key={`${item.score}-${index}`}
                        className="border-b border-white/5"
                      >
                        <td className="py-3 text-slate-400">
                          {index + 1}
                        </td>
                        <td className="py-3 font-bold">
                          {item.score}
                        </td>
                        <td className="py-3 text-right font-bold text-emerald-300">
                          {item.probability.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={card}>
              <h3 className="text-lg font-bold">Kualitas dan cakupan data</h3>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Metric
                  label="Riwayat kompetisi"
                  value={result.sampleSize.competition}
                  suffix=" laga"
                />
                <Metric
                  label="Riwayat kandang tersedia"
                  value={result.sampleSize.homeAvailable}
                  suffix=" laga"
                />
                <Metric
                  label="Riwayat tandang tersedia"
                  value={result.sampleSize.awayAvailable}
                  suffix=" laga"
                />
                <Metric
                  label="Sampel kandang digunakan"
                  value={result.sampleSize.homeUsed}
                  suffix=" laga"
                />
                <Metric
                  label="Sampel tandang digunakan"
                  value={result.sampleSize.awayUsed}
                  suffix=" laga"
                />
              </div>

              <div className="mt-5 space-y-2 text-xs leading-5 text-slate-400">
                <p>
                  <strong className="text-slate-300">Metode:</strong>{" "}
                  {result.method}
                </p>
                <p>
                  <strong className="text-slate-300">Sumber:</strong>{" "}
                  {result.source}
                </p>
                <p>
                  <strong className="text-slate-300">Batas data prediksi:</strong>{" "}
                  {result.predictionCutoff || "Tidak tersedia"}
                </p>
                <p>
                  <strong className="text-slate-300">Pertandingan historis terakhir:</strong>{" "}
                  {result.latestHistoricalMatchDate || "Tidak disediakan API"}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-xs leading-6 text-amber-100">
              <strong>Catatan model dan keterbatasan</strong>
              <p className="mt-2">{result.disclaimer}</p>
              <p className="mt-2">
                Over/Under dan BTTS pada dashboard dihitung dari expected goals
                menggunakan asumsi gol kedua tim independen. Angka tersebut
                merupakan estimasi model, bukan informasi pasar taruhan.
              </p>
            </div>
          </section>
        )}

        {!result && !loadingPrediction && (
          <section className={`${card} border-dashed text-center`}>
            <p className="text-lg font-bold">
              Hasil prediksi akan ditampilkan di sini
            </p>
            <p className="mt-2 text-sm text-slate-400">
              Pilih kompetisi, tim kandang, tim tandang, dan kickoff untuk
              menghasilkan analisis pra-pertandingan.
            </p>
          </section>
        )}

        <footer className="mt-10 border-t border-white/10 pt-5 text-xs leading-6 text-slate-500">
          <p>GoalPredict â€” Local Historical Football Analytics.</p>
          <p>
            Sistem menggunakan dataset historis lokal dan model statistik
            Independent Poisson. Data historis tidak menjamin hasil pertandingan
            mendatang.
          </p>
          <p className="mt-2">
            <a
              href="/history"
              className="text-emerald-300 hover:underline"
            >
              Buka Pusat Statistik Historis
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}