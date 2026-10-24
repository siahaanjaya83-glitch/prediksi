"use client";

import { useCallback, useEffect, useState } from "react";

type Match = {
  id: string; source: string; league: string; season: string; date: string;
  home: string; away: string; homeGoals: number; awayGoals: number;
  result: "H" | "D" | "A";
};

type Data = {
  total: number;
  validRecords: number;
  page: number;
  totalPages: number;
  summary: any;
  competitions: string[];
  seasons: string[];
  teams: string[];
  competitionStats: any[];
  seasonStats: any[];
  h2h: {
    team1: string; team2: string; matches: Match[]; summary: any;
    team1Stats: any; team2Stats: any;
  };
  matches: Match[];
};

const card = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";
const field = "mt-1 block w-full rounded-lg border border-slate-300 bg-transparent p-2.5 dark:border-slate-700";
const fmt = (v: unknown) => typeof v === "number" ? v.toLocaleString("id-ID") : "—";

function Metric({ label, value }: { label: string; value: unknown }) {
  return <div className={card}>
    <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
    <p className="mt-2 text-2xl font-bold tabular-nums">{fmt(value)}</p>
  </div>;
}

function ResultsTable({ rows }: { rows: Match[] }) {
  return <div className="overflow-x-auto">
    <table className="w-full min-w-[650px] text-left text-sm">
      <thead className="bg-slate-50 dark:bg-slate-800">
        <tr>
          <th className="p-3">Tanggal</th><th className="p-3">Kompetisi</th>
          <th className="p-3 text-right">Tuan rumah</th><th className="p-3 text-center">Skor</th>
          <th className="p-3">Tim tamu</th>
        </tr>
      </thead>
      <tbody>{rows.map(m => <tr key={m.id} className="border-t border-slate-100 dark:border-slate-800">
        <td className="whitespace-nowrap p-3">{m.date?.slice(0, 10) || "—"}</td>
        <td className="p-3"><div>{m.league}</div><div className="text-xs text-slate-500">{m.season}</div></td>
        <td className="p-3 text-right">{m.home}</td>
        <td className="p-3 text-center font-bold">{m.homeGoals} – {m.awayGoals}</td>
        <td className="p-3">{m.away}</td>
      </tr>)}
      {rows.length === 0 && <tr><td colSpan={5} className="p-5 text-center text-slate-500">Tidak ada data.</td></tr>}</tbody>
    </table>
  </div>;
}

export default function HistoryPage() {
  const [data, setData] = useState<Data | null>(null);
  const [source, setSource] = useState("all");
  const [league, setLeague] = useState("");
  const [season, setSeason] = useState("");
  const [team1, setTeam1] = useState("");
  const [team2, setTeam2] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams({
        source, page: String(page), limit: "50",
      });
      if (league) p.set("league", league);
      if (season) p.set("season", season);
      if (query.trim()) p.set("q", query.trim());
      if (team1) p.set("team1", team1);
      if (team2) p.set("team2", team2);

      const response = await fetch(`/api/history?${p}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData(await response.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [source, league, season, query, team1, team2, page]);

  useEffect(() => { void load(); }, [load]);

  function resetPage() { setPage(1); }

  const s = data?.summary;
  const h = data?.h2h;
  const tech = s?.technical;

  return <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 text-slate-900 dark:text-slate-100 sm:px-6 lg:px-8">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-bold uppercase tracking-wider text-blue-600">GoalPredict</p>
        <h1 className="mt-1 text-3xl font-bold">Pusat Statistik Historis</h1>
        <p className="mt-2 text-sm text-slate-500">Menggunakan dataset lokal, tanpa API-Football.</p>
      </div>
      <a href="/" className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">Kembali ke beranda</a>
    </header>

    {loading && <p className="mb-4">Memuat statistik...</p>}
    {error && <div className="mb-4 rounded-lg border border-red-300 p-4 text-red-600">Gagal: {error} <button onClick={() => void load()} className="underline">Coba lagi</button></div>}

    <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
      <Metric label="Pertandingan valid" value={s?.matches} />
      <Metric label="Kompetisi" value={s ? data?.competitions.length : undefined} />
      <Metric label="Musim" value={s ? data?.seasons.length : undefined} />
      <Metric label="Total gol" value={s?.totalGoals} />
      <Metric label="Menang kandang" value={s?.homeWins} />
      <Metric label="Seri" value={s?.draws} />
      <Metric label="Menang tandang" value={s?.awayWins} />
      <Metric label="Rata-rata gol/laga" value={s?.averageGoals} />
    </section>

    <section className={`${card} mb-8`}>
      <h2 className="mb-4 text-xl font-bold">Filter data historis</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">Dataset<select className={field} value={source} onChange={e => { setSource(e.target.value); setLeague(""); setSeason(""); resetPage(); }}>
          <option value="all">Semua dataset</option><option value="general">Statistik umum</option><option value="uefa">UEFA</option>
        </select></label>
        <label className="text-sm">Kompetisi<select className={field} value={league} onChange={e => { setLeague(e.target.value); resetPage(); }}>
          <option value="">Semua kompetisi</option>{(data?.competitions ?? []).map(x => <option key={x}>{x}</option>)}
        </select></label>
        <label className="text-sm">Musim<select className={field} value={season} onChange={e => { setSeason(e.target.value); resetPage(); }}>
          <option value="">Semua musim</option>{(data?.seasons ?? []).map(x => <option key={x}>{x}</option>)}
        </select></label>
        <form className="text-sm" onSubmit={e => { e.preventDefault(); setQuery(search); resetPage(); }}>
          Cari tim<input className={field} value={search} onChange={e => setSearch(e.target.value)} placeholder="Nama tim..." />
          <button className="mt-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">Cari</button>
        </form>
      </div>
    </section>

    <section className="mb-8">
      <h2 className="mb-3 text-xl font-bold">Statistik hasil dan gol</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Gol kandang" value={s?.homeGoals} />
        <Metric label="Gol tandang" value={s?.awayGoals} />
        <Metric label="Over 1,5 gol" value={s?.over15} />
        <Metric label="Over 2,5 gol" value={s?.over25} />
        <Metric label="Over 3,5 gol" value={s?.over35} />
        <Metric label="Under 2,5 gol" value={s?.under25} />
        <Metric label="BTTS (kedua tim gol)" value={s?.btts} />
        <Metric label="Clean sheet kandang" value={s?.cleanSheetsHome} />
      </div>
      <p className="mt-2 text-xs text-slate-500">Angka over/under, BTTS, dan clean sheet adalah jumlah pertandingan, bukan persentase.</p>
    </section>

    <section className={`${card} mb-8`}>
      <h2 className="mb-4 text-xl font-bold">Head-to-Head (H2H)</h2>
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm">Tim pertama<select className={field} value={team1} onChange={e => { setTeam1(e.target.value); resetPage(); }}>
          <option value="">Pilih tim</option>{(data?.teams ?? []).map(t => <option key={t}>{t}</option>)}
        </select></label>
        <label className="text-sm">Tim kedua<select className={field} value={team2} onChange={e => { setTeam2(e.target.value); resetPage(); }}>
          <option value="">Pilih tim</option>{(data?.teams ?? []).map(t => <option key={t}>{t}</option>)}
        </select></label>
      </div>
      {team1 && team2 && team1 === team2 && <p className="text-amber-600">Pilih dua tim yang berbeda.</p>}
      {team1 && team2 && team1 !== team2 && h && <>
        <p className="mb-3 text-sm text-slate-500">Pertemuan yang ditemukan dalam filter kompetisi dan musim saat ini: {h.summary.matches}</p>
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label={`Menang ${team1}`} value={h.summary.homeWins + h.summary.awayWins} />
          <Metric label="Seri" value={h.summary.draws} />
          <Metric label={`Menang ${team2}`} value={h.summary.matches - h.summary.homeWins - h.summary.draws - h.summary.awayWins} />
          <Metric label="Total gol H2H" value={h.summary.totalGoals} />
        </div>
        <ResultsTable rows={h.matches} />
      </>}
      {(!team1 || !team2) && <p className="text-sm text-slate-500">Pilih dua tim untuk melihat riwayat pertemuan.</p>}
    </section>

    <section className={`${card} mb-8`}>
      <h2 className="mb-4 text-xl font-bold">Statistik teknis yang tersedia</h2>
      <p className="mb-4 text-sm text-slate-500">Rata-rata dihitung hanya dari pertandingan yang memiliki nilai untuk statistik tersebut. Jika tidak tersedia, akan tampil tanda —.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[650px] text-left text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800"><tr><th className="p-3">Statistik</th><th className="p-3">Rata-rata kandang</th><th className="p-3">Sampel kandang</th><th className="p-3">Rata-rata tandang</th><th className="p-3">Sampel tandang</th></tr></thead>
          <tbody>{[
            ["Tembakan", tech?.shots], ["Tembakan tepat sasaran", tech?.shotsOnTarget],
            ["Sepak pojok", tech?.corners], ["Penguasaan bola (%)", tech?.possession],
            ["Expected goals (xG)", tech?.xG], ["Pelanggaran", tech?.fouls],
            ["Kartu kuning", tech?.yellowCards], ["Kartu merah", tech?.redCards],
          ].map(([label, v]: any) => <tr key={label} className="border-t border-slate-100 dark:border-slate-800">
            <td className="p-3">{label}</td><td className="p-3">{fmt(v?.home?.average)}</td>
            <td className="p-3">{fmt(v?.home?.availableMatches)}</td><td className="p-3">{fmt(v?.away?.average)}</td>
            <td className="p-3">{fmt(v?.away?.availableMatches)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <section className={`${card} mb-8`}>
      <h2 className="mb-4 text-xl font-bold">Skor yang paling sering terjadi</h2>
      <div className="flex flex-wrap gap-2">{(s?.scorelines ?? []).map((x: any) =>
        <span key={x.score} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">{x.score}: <b>{x.count}</b></span>
      )}</div>
    </section>

    <section className={`${card} mb-8`}>
      <h2 className="mb-4 text-xl font-bold">Statistik per kompetisi</h2>
      <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800"><tr><th className="p-3">Kompetisi</th><th className="p-3">Laga</th><th className="p-3">Gol</th><th className="p-3">Kandang menang</th><th className="p-3">Seri</th><th className="p-3">Tandang menang</th></tr></thead>
        <tbody>{(data?.competitionStats ?? []).map((x: any) => <tr key={x.league} className="border-t border-slate-100 dark:border-slate-800">
          <td className="p-3">{x.league}</td><td className="p-3">{x.matches}</td><td className="p-3">{x.totalGoals}</td><td className="p-3">{x.homeWins}</td><td className="p-3">{x.draws}</td><td className="p-3">{x.awayWins}</td>
        </tr>)}</tbody>
      </table></div>
    </section>

    <section className={`${card} mb-8`}>
      <h2 className="mb-4 text-xl font-bold">Statistik per musim</h2>
      <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800"><tr><th className="p-3">Musim</th><th className="p-3">Laga</th><th className="p-3">Gol</th><th className="p-3">Kandang menang</th><th className="p-3">Seri</th><th className="p-3">Tandang menang</th></tr></thead>
        <tbody>{(data?.seasonStats ?? []).map((x: any) => <tr key={x.season} className="border-t border-slate-100 dark:border-slate-800">
          <td className="p-3">{x.season}</td><td className="p-3">{x.matches}</td><td className="p-3">{x.totalGoals}</td><td className="p-3">{x.homeWins}</td><td className="p-3">{x.draws}</td><td className="p-3">{x.awayWins}</td>
        </tr>)}</tbody>
      </table></div>
    </section>

    <section className={`${card} mb-8`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Riwayat seluruh pertandingan</h2>
        <span className="text-sm text-slate-500">{fmt(data?.total)} pertandingan ditemukan</span>
      </div>
      <ResultsTable rows={data?.matches ?? []} />
      <div className="mt-4 flex items-center justify-between gap-3">
        <button disabled={page <= 1 || loading} onClick={() => setPage(x => Math.max(1, x - 1))} className="rounded-lg border border-slate-300 px-4 py-2 disabled:opacity-40 dark:border-slate-700">Sebelumnya</button>
        <span className="text-sm">Halaman {data?.page ?? page} / {data?.totalPages ?? 1}</span>
        <button disabled={page >= (data?.totalPages ?? 1) || loading} onClick={() => setPage(x => x + 1)} className="rounded-lg border border-slate-300 px-4 py-2 disabled:opacity-40 dark:border-slate-700">Berikutnya</button>
      </div>
    </section>

    <footer className="text-xs text-slate-500">
      Sumber: dataset lokal GoalPredict. Record tanpa nama tim atau skor yang valid tidak masuk ke perhitungan hasil. Statistik teknis hanya dihitung dari nilai yang tersedia. Data historis tidak menjamin hasil pertandingan mendatang.
    </footer>
  </main>;
}