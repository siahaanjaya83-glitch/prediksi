import fs from "node:fs/promises";
import path from "node:path";

const BASE = "https://raw.githubusercontent.com/oladeeayo/open-matchday/master";
const ROOT = process.cwd();
const DATA = path.join(ROOT, "data");
const BACKUP = path.join(DATA, "backups");

const resultsPath = path.join(DATA, "football-2026-results.json");
const fixturesPath = path.join(DATA, "football-2026-fixtures.json");
const syncPath = path.join(DATA, "football-2026-sync.json");

function csvRows(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const parseLine = (line) => {
    const cells = [];
    let value = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && quoted && line[i + 1] === '"') {
        value += '"'; i++;
      } else if (c === '"') quoted = !quoted;
      else if (c === "," && !quoted) {
        cells.push(value); value = "";
      } else value += c;
    }
    cells.push(value);
    return cells;
  };
  const headers = parseLine(lines[0]).map(x => x.trim());
  return lines.slice(1).map(line => {
    const cells = parseLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
  });
}

function num(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalize(row, competition, status) {
  const date = String(row.date ?? "").trim();
  const home = String(row.home ?? "").trim();
  const away = String(row.away ?? "").trim();
  if (!date || !home || !away) return null;

  const homeGoals = num(row.ft_home);
  const awayGoals = num(row.ft_away);
  const played = homeGoals !== null && awayGoals !== null;

  return {
    source: "Open Matchday",
    sourceUrl: "https://github.com/oladeeayo/open-matchday",
    competition,
    season: String(row.season ?? "2026"),
    date,
    time: String(row.time ?? "").trim() || null,
    home,
    away,
    homeGoals: played ? homeGoals : null,
    awayGoals: played ? awayGoals : null,
    matchStatus: status === "fixture" ? "scheduled" : "played",
    homeShots: num(row.home_shots),
    awayShots: num(row.away_shots),
    homeShotsOnTarget: num(row.home_shots_on_target),
    awayShotsOnTarget: num(row.away_shots_on_target),
    homeCorners: num(row.home_corners),
    awayCorners: num(row.away_corners),
    homeFouls: num(row.home_fouls),
    awayFouls: num(row.away_fouls),
    homeYellowCards: num(row.home_yellow),
    awayYellowCards: num(row.away_yellow),
    homeRedCards: num(row.home_red),
    awayRedCards: num(row.away_red),
    homePossession: null,
    awayPossession: null,
    homeXg: null,
    awayXg: null
  };
}

function key(m) {
  return [
    m.date.slice(0, 10),
    m.competition.toLowerCase(),
    m.home.toLowerCase().replace(/[^a-z0-9]/g, ""),
    m.away.toLowerCase().replace(/[^a-z0-9]/g, "")
  ].join("|");
}

async function readJson(file) {
  try {
    const data = JSON.parse(await fs.readFile(file, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeJson(file, data) {
  const temp = file + ".tmp";
  await fs.writeFile(temp, JSON.stringify(data, null, 2) + "\n", "utf8");
  await fs.rename(temp, file);
}

async function backupExisting(file) {
  try {
    await fs.access(file);
    await fs.mkdir(BACKUP, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await fs.copyFile(file, path.join(BACKUP, `${path.basename(file)}.${stamp}.bak`));
  } catch {}
}

async function main() {
  await fs.mkdir(DATA, { recursive: true });

  // Registry adalah daftar kompetisi yang tersedia pada sumber.
  const registryResponse = await fetch(`${BASE}/leagues.py`);
  if (!registryResponse.ok) throw new Error("Registry kompetisi gagal diunduh.");
  const registryText = await registryResponse.text();

  // Ambil nama folder kompetisi dari registry Python.
  const folders = [...registryText.matchAll(
    /["']([A-Z]{2,5}_\d+_[a-z0-9-]+)["']/g
  )].map(m => m[1]);

  const competitions = [...new Set(folders)];
  if (competitions.length < 10) {
    throw new Error(`Registry tidak valid: hanya ${competitions.length} folder terdeteksi. File tidak diganti.`);
  }

  const downloadedResults = [];
  const downloadedFixtures = [];
  const errors = [];

  for (const folder of competitions) {
    // 2026/27 untuk liga musim Eropa, 2026 untuk liga kalender.
    const seasons = folder.startsWith("BRA_") ||
      folder.startsWith("ARG_") ||
      folder.startsWith("MEX_") ||
      folder.startsWith("USA_") ||
      folder.startsWith("JPN_") ||
      folder.startsWith("CHN_")
      ? ["2026"]
      : ["2627"];

    for (const season of seasons) {
      const seasonSuffix = season === "2026" ? "2026" : "2627";
      const competition = folder;

      for (const kind of ["results", "fixtures"]) {
        const url = `${BASE}/data/${folder}/${kind}_${seasonSuffix}.csv`;
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
          if (!response.ok) continue;
          const text = await response.text();
          if (!text.trim() || !text.includes("home") || !text.includes("away")) continue;

          const rows = csvRows(text);
          const mapped = rows
            .map(row => normalize(row, competition, kind === "fixtures" ? "fixture" : "result"))
            .filter(Boolean);

          if (kind === "results") downloadedResults.push(...mapped);
          else downloadedFixtures.push(...mapped);
        } catch (error) {
          errors.push(`${folder}/${kind}: ${error.message}`);
        }
      }
    }
  }

  if (downloadedResults.length < 100) {
    throw new Error(
      `Data hasil terlalu sedikit (${downloadedResults.length}); data lama tidak diubah.`
    );
  }

  const oldResults = await readJson(resultsPath);
  const oldFixtures = await readJson(fixturesPath);

  // Upsert berdasarkan tanggal, kompetisi, dan nama kedua tim.
  const resultMap = new Map(oldResults.map(m => [key(m), m]));
  for (const m of downloadedResults) {
    const id = key(m);
    const old = resultMap.get(id);
    resultMap.set(id, old ? { ...old, ...m } : m);
  }

  const fixtureMap = new Map(oldFixtures.map(m => [key(m), m]));
  for (const m of downloadedFixtures) {
    const id = key(m);
    fixtureMap.set(id, { ...(fixtureMap.get(id) ?? {}), ...m });
  }

  const results = [...resultMap.values()].sort((a, b) =>
    `${b.date}${b.time ?? ""}`.localeCompare(`${a.date}${a.time ?? ""}`)
  );
  const fixtures = [...fixtureMap.values()].sort((a, b) =>
    `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`)
  );

  // Backup sebelum mengganti file.
  await backupExisting(resultsPath);
  await backupExisting(fixturesPath);
  await backupExisting(syncPath);

  await writeJson(resultsPath, results);
  await writeJson(fixturesPath, fixtures);
  await writeJson(syncPath, {
    source: "Open Matchday",
    sourceUrl: "https://github.com/oladeeayo/open-matchday",
    updatedAt: new Date().toISOString(),
    competitionsDetected: competitions.length,
    downloadedResults: downloadedResults.length,
    totalResults: results.length,
    downloadedFixtures: downloadedFixtures.length,
    totalFixtures: fixtures.length,
    errors: errors.slice(0, 100)
  });

  console.log(JSON.stringify({
    competitions: competitions.length,
    downloadedResults: downloadedResults.length,
    totalResults: results.length,
    downloadedFixtures: downloadedFixtures.length,
    totalFixtures: fixtures.length,
    errors: errors.length
  }, null, 2));
}

main().catch(error => {
  console.error("SYNC FAILED:", error.message);
  process.exitCode = 1;
});
