"use client";
import { useCallback, useEffect, useState } from "react";

type Match = {
  id: number;
  league: string;
  country: string;
  home: string;
  away: string;
  homeLogo: string;
  awayLogo: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  statusText: string;
  elapsed: number | null;
  date: string;
  venue: string;
};

type Result = {
  mode: string;
  total: number;
  matches: Match[];
  error?: string;
  details?: unknown;
  updatedAt?: string;
  quota?: { remaining: string | null; limit: string | null };
};

type PredictionData = {
  fixtureId: number;
  teams: { home: string; away: string };
  league: string;
  predictions: {
    winner: string | null;
    advice: string | null;
    goals: { home?: string | null; away?: string | null };
    probabilities: { home?: string; draw?: string; away?: string };
    form: { home?: string; away?: string };
    attack: { home?: string; away?: string };
    defense: { home?: string; away?: string };
  };
  updatedAt: string;
  source: string;
  note: string;
};
type GoalPrediction = {
  fixtureId: number;
  finished: boolean;
  match?: {
    elapsed: number;
    remainingMinutes: number;
    score: { home: number; away: number };
  };
  additionalGoals?: {
    expectedHome: number;
    expectedAway: number;
    expectedTotal: number;
  };
  mostLikelyScore?: { home: number; away: number };
  totalAdditionalGoalsProbability?: {
    zero: string;
    one: string;
    twoOrMore: string;
  };
  inputs?: {
    liveStatisticsAvailable: boolean;
  };
  score?: { home: number; away: number };
  message?: string;
  error?: string;
  detail?: string;
  note?: string;
};

type PreMatchResult = {
  available: boolean;
  source: string;
  method: string;
  league: string;
  kickoff: string;
  teams: { home: string; away: string };
  expectedGoals: { home: number; away: number };
  mostLikelyScore: { home: number; away: number; probability: number };
  topScores: Array<{ score: string; probability: number }>;
  probabilities: {
    homeWin: number;
    draw: number;
    awayWin: number;
    under2_5Goals: number;
  };
  sampleSize: {
    competitionMatches?: number;
    leagueMatches?: number;
    homeMatchesAvailable?: number;
    awayMatchesAvailable?: number;
    homeMatchesUsed?: number;
    awayMatchesUsed?: number;
    homeTeamMatches?: number;
    awayTeamMatches?: number;

  };
  predictionCutoff?: string;
  latestHistoricalMatchDate?: string | null;
  dataCutoff?: string;
  disclaimer: string;
};

type PreMatchLeague = {
  name: string;
  available: boolean;
  matches: number;
  teams: string[];
};
const liveStatuses = ["1H", "HT", "2H", "ET", "BT", "P", "LIVE"];

function score(value: number | null) {
  return value === null || value === undefined ? "-" : value;
}

export default function Home() {
  const [mode, setMode] = useState<"live" | "today">("live");
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [predictions, setPredictions] = useState<Record<number, PredictionData>>({});
  const [predictingId, setPredictingId] = useState<number | null>(null);
  const [predictionErrors, setPredictionErrors] = useState<Record<number, string>>({});
  const [goalPredictions, setGoalPredictions] = useState<Record<number, GoalPrediction>>({});
  const [goalPredictingId, setGoalPredictingId] = useState<number | null>(null);
  const [goalPredictionErrors, setGoalPredictionErrors] = useState<Record<number, string>>({});
  const [goalAutoIds, setGoalAutoIds] = useState<Record<number, boolean>>({});
  // pre-match-panel-v1
  const [preLeagues, setPreLeagues] = useState<PreMatchLeague[]>([]);
  const [preLeague, setPreLeague] = useState("English Premier League");
  const [preHome, setPreHome] = useState("");
  const [preAway, setPreAway] = useState("");
  const [preKickoff, setPreKickoff] = useState(""); // PREKICKOFF_INIT_FIX
  useEffect(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setMinutes(0, 0, 0);

    const localDate = new Date(
      date.getTime() - date.getTimezoneOffset() * 60000
    ).toISOString().slice(0, 16);

    setPreKickoff(localDate);
  }, []);
  const [preResult, setPreResult] = useState<PreMatchResult | null>(null);
  const [preLoading, setPreLoading] = useState(false);
  const [preError, setPreError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/pre-match/options", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Pilihan tim gagal dimuat.");
        return result as { leagues: PreMatchLeague[] };
      })
      .then((result) => {
        if (!active) return;
        setPreLeagues(result.leagues);
        const first = result.leagues.find((league) => league.available);
        if (first) {
          setPreLeague(first.name);
          setPreHome(first.teams[0] ?? "");
          setPreAway(first.teams[1] ?? "");
        }
      })
      .catch((error) => {
        if (active) setPreError(error instanceof Error ? error.message : "Gagal memuat tim.");
      });
    return () => { active = false; };
  }, []);

  const selectedPreLeague = preLeagues.find((league) => league.name === preLeague);
  const preTeams = selectedPreLeague?.teams ?? [];

  async function runPreMatchPrediction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPreLoading(true);
    setPreError("");
    setPreResult(null);

    try {
      const endpoint = preLeague.startsWith("UEFA ") ? "/api/european/pre-match" : "/api/pre-match";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          league: preLeague,
          home: preHome,
          away: preAway,
          kickoff: new Date(preKickoff).toISOString(),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        const detail = result.detail ? ` ${result.detail}` : "";
        throw new Error(`${result.error ?? "Prediksi gagal."}${detail}`);
      }
      setPreResult(result as PreMatchResult);
    } catch (error) {
      setPreError(error instanceof Error ? error.message : "Prediksi gagal diproses.");
    } finally {
      setPreLoading(false);
    }
  }


  const loadMatches = useCallback(async (selectedMode: "live" | "today") => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/live?mode=${selectedMode}`, {
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.details === "string"
            ? `${result.error ?? "Gagal mengambil data"}: ${result.details}`
            : result.error ?? "Gagal mengambil data pertandingan."
        );
      }

      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let inFlight = false;

    async function fetchMatches() {
      if (inFlight || document.visibilityState === "hidden") return;

      inFlight = true;

      try {
        const response = await fetch(`/api/live?mode=${mode}`, {
          cache: "no-store",
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            typeof result.details === "string"
              ? `${result.error ?? "Gagal mengambil data"}: ${result.details}`
              : result.error ?? "Gagal mengambil data pertandingan."
          );
        }

        if (active) {
          setData(result);
          setError("");
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Terjadi kesalahan."
          );
        }
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    }

    void fetchMatches();

    // Paket dengan kuota terbatas: perbarui setiap 15 menit.
    const interval = window.setInterval(() => {
      void fetchMatches();
    }, 15 * 60 * 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchMatches();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [mode]);
  async function runPrediction(fixtureId: number) {
    setPredictingId(fixtureId);
    setPredictionErrors((prev) => ({ ...prev, [fixtureId]: "" }));

    try {
      const response = await fetch(`/api/predict?fixtureId=${fixtureId}`, {
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.error ?? "Prediksi gagal.");

      setPredictions((prev) => ({
        ...prev,
        [fixtureId]: result as PredictionData,
      }));
    } catch (err) {
      setPredictionErrors((prev) => ({
        ...prev,
        [fixtureId]: err instanceof Error ? err.message : "Prediksi gagal.",
      }));
    } finally {
      setPredictingId(null);
    }
  }
  async function runGoalPrediction(fixtureId: number) {
    setGoalPredictingId(fixtureId);
    setGoalPredictionErrors((prev) => ({ ...prev, [fixtureId]: "" }));

    try {
      const response = await fetch(
        `/api/predict-goals?fixtureId=${fixtureId}`,
        { cache: "no-store" }
      );
      const result = (await response.json()) as GoalPrediction;

      if (!response.ok) {
        throw new Error(result.detail ?? result.error ?? "Prediksi gol gagal.");
      }

      setGoalPredictions((prev) => ({ ...prev, [fixtureId]: result }));

      if (result.match && result.additionalGoals) {
        const key = "goalpredict-backtest-v1";
        const snapshots = JSON.parse(
          window.localStorage.getItem(key) ?? "[]"
        ) as Array<Record<string, unknown>>;

        snapshots.push({
          fixtureId,
          capturedAt: new Date().toISOString(),
          elapsed: result.match.elapsed,
          scoreHome: result.match.score.home,
          scoreAway: result.match.score.away,
          expectedHome: result.additionalGoals.expectedHome,
          expectedAway: result.additionalGoals.expectedAway,
          expectedTotal: result.additionalGoals.expectedTotal,
          liveStatisticsAvailable: result.inputs?.liveStatisticsAvailable ?? false
        });

        window.localStorage.setItem(key, JSON.stringify(snapshots));
      }

      if (result.finished) {
        setGoalAutoIds((prev) => ({ ...prev, [fixtureId]: false }));
      }
    } catch (err) {
      setGoalPredictionErrors((prev) => ({
        ...prev,
        [fixtureId]: err instanceof Error ? err.message : "Prediksi gol gagal."
      }));
    } finally {
      setGoalPredictingId(null);
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;

      const enabledIds = Object.entries(goalAutoIds)
        .filter(([, enabled]) => enabled)
        .map(([id]) => Number(id));

      for (const fixtureId of enabledIds) {
        const match = data?.matches.find((item) => item.id === fixtureId);

        if (match && liveStatuses.includes(match.status)) {
          void runGoalPrediction(fixtureId);
        } else if (match && ["FT", "AET", "PEN", "CANC", "ABD", "AWD", "WO"].includes(match.status)) {
          setGoalAutoIds((prev) => ({ ...prev, [fixtureId]: false }));
        }
      }
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [goalAutoIds, data]);
const matches = (data?.matches ?? []).filter((match) => {
    const term = search.toLowerCase();
    return (
      match.home.toLowerCase().includes(term) ||
      match.away.toLowerCase().includes(term) ||
      match.league.toLowerCase().includes(term) ||
      match.country.toLowerCase().includes(term)
    );
  });

  return (
    <main className="min-h-screen bg-[#080d18] text-slate-100">
      <header className="border-b border-white/10 bg-[#0d1423]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400 text-xl font-black text-slate-950">
              G
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">
                Goal<span className="text-emerald-400">Predict</span>
              </h1>
              <p className="text-xs text-slate-400">
                Football data & score analytics
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">

            <a

              href="/history"

              className="rounded-full border border-emerald-400/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10"

            >

              Statistik

            </a>

            <span className="rounded-full border border-emerald-400/30 px-3 py-1.5 text-xs text-emerald-300">

              API mode

            </span>

          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-8">
        <div className="mb-8">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Match center
          </p>
          <h2 className="text-3xl font-black sm:text-4xl">
            Semua pertandingan, <span className="text-emerald-400">satu tempat.</span>
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Pantau skor langsung dan jadwal pertandingan dari data API-Football.
            Prediksi akan ditambahkan setelah data berhasil terhubung.
          </p>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#111a2b] p-5">
            <p className="text-sm text-slate-400">Pertandingan ditampilkan</p>
            <p className="mt-2 text-3xl font-black">{data?.total ?? "â€”"}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#111a2b] p-5">
            <p className="text-sm text-slate-400">Mode data</p>
            <p className="mt-2 text-xl font-bold">
              {mode === "live" ? "Live sekarang" : "Jadwal hari ini"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#111a2b] p-5">
            <p className="text-sm text-slate-400">Sisa kuota API</p>
            <p className="mt-2 text-3xl font-black">
              {data?.quota?.remaining ?? "â€”"}
            </p>
          </div>
        </div>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setMode("live")}
              className={`rounded-xl px-4 py-2.5 text-sm font-bold ${
                mode === "live"
                  ? "bg-emerald-400 text-slate-950"
                  : "bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              â— Live
            </button>
            <button
              onClick={() => setMode("today")}
              className={`rounded-xl px-4 py-2.5 text-sm font-bold ${
                mode === "today"
                  ? "bg-emerald-400 text-slate-950"
                  : "bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              Jadwal hari ini
            </button>
            <button
              onClick={() => void loadMatches(mode)}
              disabled={loading}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/5 disabled:opacity-50"
            >
              {loading ? "Memuat..." : "â†» Muat ulang"}
            </button>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari tim atau liga..."
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#111a2b] px-4 py-3 text-sm outline-none placeholder:text-slate-500 focus:border-emerald-400"
          />
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm leading-6 text-red-200">
            <strong>Gagal memuat data.</strong>
            <p>{error}</p>
            <p className="mt-2 text-red-100/70">
              Periksa API key, kuota akun, dan terminal PowerShell tempat Next.js berjalan.
            </p>
          </div>
        )}

        {loading && !data && (
          <div className="rounded-2xl border border-white/10 bg-[#111a2b] p-10 text-center text-slate-400">
            Mengambil data pertandingan...
          </div>
        )}

        {!loading && !error && data && matches.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-[#111a2b] p-10 text-center">
            <p className="text-lg font-bold">
              {search
                ? "Pertandingan tidak ditemukan"
                : mode === "live"
                  ? "Belum ada pertandingan live"
                  : "Tidak ada pertandingan yang tersedia"}
            </p>
            <p className="mt-2 text-sm text-slate-400">
              {search
                ? "Coba kata kunci lain."
                : "Coba muat ulang beberapa saat lagi. Ketersediaan data mengikuti API dan paket akunmu."}
            </p>
          </div>
        )}

        <div className="space-y-3">
          {matches.map((match) => {
            const live = liveStatuses.includes(match.status);

            return (
              <article
                key={match.id}
                className="rounded-2xl border border-white/10 bg-[#111a2b] p-4 transition hover:border-emerald-400/40 sm:p-5"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">{match.league}</p>
                    <p className="mt-1 text-xs text-slate-500">{match.country}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      live
                        ? "bg-red-400/10 text-red-300"
                        : ["FT", "AET", "PEN"].includes(match.status)
                          ? "bg-slate-700 text-slate-300"
                          : "bg-amber-400/10 text-amber-300"
                    }`}
                  >
                    {live && match.elapsed !== null
                      ? `LIVE ${match.elapsed}'`
                      : match.statusText || match.status}
                  </span>
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {match.homeLogo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={match.homeLogo}
                        alt=""
                        className="h-8 w-8 shrink-0 object-contain"
                      />
                    )}
                    <span className="text-sm font-semibold sm:text-base">
                      {match.home}
                    </span>
                  </div>

                  <div className="rounded-xl bg-black/20 px-3 py-2 text-xl font-black tabular-nums">
                    {score(match.homeScore)} : {score(match.awayScore)}
                  </div>

                  <div className="flex min-w-0 items-center justify-end gap-2 text-right">
                    <span className="text-sm font-semibold sm:text-base">
                      {match.away}
                    </span>
                    {match.awayLogo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={match.awayLogo}
                        alt=""
                        className="h-8 w-8 shrink-0 object-contain"
                      />
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <button
                    onClick={() => void runPrediction(match.id)}
                    disabled={predictingId === match.id}
                    className="rounded-xl border border-emerald-400/30 px-4 py-2 text-sm font-bold text-emerald-300 hover:bg-emerald-400/10 disabled:opacity-50"
                  >
                    {predictingId === match.id ? "Menganalisis..." : "Analisis & Prediksi"}
                  </button>

                  {predictionErrors[match.id] && (
                    <p className="mt-2 text-sm text-amber-300">
                      {predictionErrors[match.id]}
                    </p>
                  )}

                  {predictions[match.id] && (
                    <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-sm">
                      <p className="font-bold text-emerald-300">
                        Prediksi: {predictions[match.id].predictions.winner ?? "Belum ada favorit jelas"}
                      </p>
                      <p className="mt-2 text-slate-300">
                        {predictions[match.id].predictions.advice ?? "Saran tidak tersedia."}
                      </p>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div><p className="text-xs text-slate-400">Kandang</p><p className="font-bold">{predictions[match.id].predictions.probabilities.home ?? "â€”"}</p></div>
                        <div><p className="text-xs text-slate-400">Seri</p><p className="font-bold">{predictions[match.id].predictions.probabilities.draw ?? "â€”"}</p></div>
                        <div><p className="text-xs text-slate-400">Tandang</p><p className="font-bold">{predictions[match.id].predictions.probabilities.away ?? "â€”"}</p></div>
                      </div>
                      <p className="mt-3 text-xs text-slate-400">
                        Estimasi rentang gol: {predictions[match.id].predictions.goals.home ?? "â€”"} : {predictions[match.id].predictions.goals.away ?? "â€”"}
                      </p>
                      <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-400 sm:grid-cols-3">
                        <p>Form: {predictions[match.id].predictions.form.home ?? "â€”"} / {predictions[match.id].predictions.form.away ?? "â€”"}</p>
                        <p>Serangan: {predictions[match.id].predictions.attack.home ?? "â€”"} / {predictions[match.id].predictions.attack.away ?? "â€”"}</p>
                        <p>Pertahanan: {predictions[match.id].predictions.defense.home ?? "â€”"} / {predictions[match.id].predictions.defense.away ?? "â€”"}</p>
                      </div>
                      <p className="mt-3 text-xs text-slate-500">{predictions[match.id].note}</p>
                    </div>
                  )}
                </div>
{live && (
                  <div className="mt-4 border-t border-white/5 pt-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => void runGoalPrediction(match.id)}
                        disabled={goalPredictingId === match.id}
                        className="rounded-xl bg-sky-400/10 px-4 py-2 text-sm font-bold text-sky-300 disabled:opacity-50"
                      >
                        {goalPredictingId === match.id ? "Menghitung..." : "Prediksi gol tambahan"}
                      </button>
                      <button
                        onClick={() => setGoalAutoIds((prev) => ({ ...prev, [match.id]: !prev[match.id] }))}
                        className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300"
                      >
                        {goalAutoIds[match.id] ? "Matikan refresh otomatis" : "Aktifkan refresh otomatis"}
                      </button>
                    </div>

                    {goalAutoIds[match.id] && (
                      <p className="mt-2 text-xs text-sky-300">Refresh setiap 60 detik selama tab terbuka.</p>
                    )}

                    {goalPredictionErrors[match.id] && (
                      <p className="mt-2 text-sm text-amber-300">{goalPredictionErrors[match.id]}</p>
                    )}

                    {goalPredictions[match.id] && (
                      <div className="mt-3 rounded-xl border border-sky-400/20 bg-sky-400/5 p-4 text-sm">
                        {goalPredictions[match.id].finished ? (
                          <p>Pertandingan selesai. Skor akhir: {goalPredictions[match.id].score?.home ?? "-"} : {goalPredictions[match.id].score?.away ?? "-"}</p>
                        ) : goalPredictions[match.id].additionalGoals ? (
                          <>
                            <p className="font-bold text-sky-300">
                              Estimasi gol tambahan: {goalPredictions[match.id].additionalGoals?.expectedHome} – {goalPredictions[match.id].additionalGoals?.expectedAway}
                            </p>
                            <p className="mt-1">Skor paling mungkin: {goalPredictions[match.id].mostLikelyScore?.home ?? "-"} : {goalPredictions[match.id].mostLikelyScore?.away ?? "-"}</p>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                              <div><p className="text-xs text-slate-400">0 gol lagi</p><p className="font-bold">{goalPredictions[match.id].totalAdditionalGoalsProbability?.zero ?? "-"}</p></div>
                              <div><p className="text-xs text-slate-400">1 gol lagi</p><p className="font-bold">{goalPredictions[match.id].totalAdditionalGoalsProbability?.one ?? "-"}</p></div>
                              <div><p className="text-xs text-slate-400">2+ gol lagi</p><p className="font-bold">{goalPredictions[match.id].totalAdditionalGoalsProbability?.twoOrMore ?? "-"}</p></div>
                            </div>
                            <p className="mt-3 text-xs text-slate-400">Statistik live: {goalPredictions[match.id].inputs?.liveStatisticsAvailable ? "tersedia" : "tidak tersedia; model menggunakan fallback"}.</p>
                            <p className="mt-2 text-xs text-slate-500">{goalPredictions[match.id].note}</p>
                          </>
                        ) : (
                          <p>{goalPredictions[match.id].message ?? "Prediksi belum tersedia."}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-white/5 pt-3 text-xs text-slate-500">
                  <span>
                    {new Date(match.date).toLocaleString("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Jakarta",
                    })} WIB
                  </span>
                  <span>{match.venue}</span>
                  <span>ID: {match.id}</span>
                </div>
              </article>
            );
          })}
        </div>

        <section id="pre-match-panel-v1" className="mt-10 rounded-2xl border border-emerald-400/20 bg-[#0d1423] p-5 sm:p-7">
          <div className="mb-6">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-400">Statistik historis</p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">Prediksi Pra-Pertandingan</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Prediksi berdasarkan hasil historis liga dan performa kandang/tandang.
              Ini adalah estimasi statistik, bukan jaminan hasil pertandingan.
            </p>
          </div>

          <form onSubmit={runPreMatchPrediction} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-300">
              Kompetisi
              <select value={preLeague} onChange={(event) => {
                const next = preLeagues.find((item) => item.name === event.target.value);
                setPreLeague(event.target.value);
                setPreHome(next?.teams[0] ?? "");
                setPreAway(next?.teams[1] ?? "");
                setPreResult(null);
                setPreError("");
              }} required className="mt-2 w-full rounded-xl border border-white/10 bg-[#111a2b] px-3 py-3 text-white">
                {preLeagues.map((league) => (
                  <option key={league.name} value={league.name} disabled={!league.available}>
                    {league.name} {!league.available ? "(data belum cukup)" : `(${league.matches} laga historis)`}
                  </option>
                ))}
                                              </select>
            </label>

            <label className="text-sm text-slate-300">
              Waktu kickoff
              <input type="datetime-local" value={preKickoff} onChange={(event) => setPreKickoff(event.target.value)} required
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#111a2b] px-3 py-3 text-white" />
            </label>

            <label className="text-sm text-slate-300">
              Tim kandang
              <select value={preHome} onChange={(event) => setPreHome(event.target.value)} required
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#111a2b] px-3 py-3 text-white">
                {preTeams.map((team) => <option key={team} value={team}>{team}</option>)}
              </select>
            </label>

            <label className="text-sm text-slate-300">
              Tim tandang
              <select value={preAway} onChange={(event) => setPreAway(event.target.value)} required
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#111a2b] px-3 py-3 text-white">
                {preTeams.map((team) => <option key={team} value={team}>{team}</option>)}
              </select>
            </label>

            <div className="sm:col-span-2">
              <button type="submit" disabled={preLoading || !preHome || !preAway || preHome === preAway || !selectedPreLeague?.available}
                className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50">
                {preLoading ? "Menganalisis data..." : "Prediksi Pertandingan"}
              </button>
              {preHome === preAway && preHome && <p className="mt-2 text-sm text-amber-300">Pilih dua tim yang berbeda.</p>}
            </div>
          </form>

          {preError && <div role="alert" className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-200">{preError}</div>}

          {preResult && (
            <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4 sm:p-6">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">Hasil model statistik</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-slate-400">Estimasi gol</p>
                  <p className="mt-1 text-2xl font-black">{preResult.expectedGoals.home} – {preResult.expectedGoals.away}</p>
                  <p className="mt-1 text-xs text-slate-400">{preHome} – {preAway}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Skor paling mungkin</p>
                  <p className="mt-1 text-2xl font-black">{preResult.mostLikelyScore.home} – {preResult.mostLikelyScore.away}</p>
                  <p className="mt-1 text-xs text-slate-400">Probabilitas {preResult.mostLikelyScore.probability}%</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Sampel historis</p>
                  <p className="mt-1 text-2xl font-black">{preResult.sampleSize.leagueMatches}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Pertandingan kompetisi sebelum tanggal kickoff
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-slate-400">Menang kandang</p><p className="mt-1 font-bold">{preResult.probabilities.homeWin}%</p></div>
                <div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-slate-400">Seri</p><p className="mt-1 font-bold">{preResult.probabilities.draw}%</p></div>
                <div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-slate-400">Menang tandang</p><p className="mt-1 font-bold">{preResult.probabilities.awayWin}%</p></div>
                <div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-slate-400">Under 2.5 gol</p><p className="mt-1 font-bold">{preResult.probabilities.under2_5Goals}%</p></div>
              </div>

              <div className="mt-5">
                <p className="font-bold">Lima skor dengan probabilitas tertinggi</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {preResult.topScores.map((item) => (
                    <span key={item.score} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
                      {item.score} <strong className="text-emerald-300">{item.probability}%</strong>
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-5 space-y-2 text-xs leading-5 text-slate-400">
                <p>
                  Metode: {preResult.method}. Dataset: {preResult.source}.
                </p>
                <p>
                  Sampel kompetisi: {preResult.sampleSize.competitionMatches} laga.
                  Sampel kandang yang digunakan: {preResult.sampleSize.homeMatchesUsed} laga.
                  Sampel tandang yang digunakan: {preResult.sampleSize.awayMatchesUsed} laga.
                </p>
                <p>
                  Batas tanggal prediksi: {preResult.predictionCutoff ?? preResult.dataCutoff ?? "Tidak tersedia"}.
                </p>
                <p>
                  Pertandingan historis terakhir yang digunakan: {preResult.latestHistoricalMatchDate ?? "Tidak tersedia"}.
                </p>
              </div>
              <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100">
                {preResult.disclaimer}
              </p>
            </div>
          )}

          <p className="mt-5 text-xs leading-5 text-slate-500">
            Statistik teknis seperti xG, penguasaan bola, tembakan, sepak pojok,
            dan kartu tidak digunakan jika nilainya tidak tersedia dalam dataset.
            Prediksi bukan kepastian hasil pertandingan.
          </p>
        </section>
        <footer className="mt-8 border-t border-white/10 pt-4 text-xs leading-6 text-slate-500">
          {data?.updatedAt && (
            <p>
              Data diambil:{" "}
              {new Date(data.updatedAt).toLocaleString("id-ID", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Jakarta",
              })} WIB
            </p>
          )}
          Data pertandingan disediakan API-Football. Skor dan jadwal mengikuti
          ketersediaan paket API. Belum ada prediksi otomatis pada tahap ini.
        </footer>
      </section>
    </main>
  );
}



