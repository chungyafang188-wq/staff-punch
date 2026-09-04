const fs = require("fs");
const path = require("path");
const { getPool, ensureSchema } = require("./db");
const logic = require("./logic");

const DATA_FILE = process.env.DATA_FILE || path.join(process.cwd(), "data", "punches.json");

let fileQueue = Promise.resolve();
let importedOnce = false;

function slashDate(value) {
  const key = logic.parseDayKeyFromText(value);
  return key ? logic.slashFromDayKey(key) : String(value || "").replace(/-/g, "/");
}

function isoDate(value) {
  return logic.parseDayKeyFromText(value) || String(value || "").slice(0, 10);
}

function publicRow(row) {
  return {
    id: String(row.id),
    date: slashDate(row.punch_date || row.date),
    time: logic.cellTimeText(row.punch_time || row.time),
    name: row.staff || row.name,
    type: row.punch_type || row.type,
    area: logic.areaKey(row.area),
    source: row.source || "",
    status: row.status || "",
    lunch: row.lunch || "",
  };
}

function emptyFile() {
  return { nextId: 1, rows: [] };
}

function readFileSync() {
  try {
    if (!fs.existsSync(DATA_FILE)) return emptyFile();
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (!parsed || !Array.isArray(parsed.rows)) return emptyFile();
    return parsed;
  } catch {
    return emptyFile();
  }
}

function writeFileSync(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data), "utf8");
}

function withFile(fn) {
  const run = fileQueue.then(async () => fn(readFileSync()));
  fileQueue = run.then(
    () => {},
    () => {},
  );
  return run;
}

async function ready() {
  await ensureSchema();
}

function usePg() {
  return Boolean(getPool());
}

async function count() {
  if (usePg()) {
    const got = await getPool().query("SELECT COUNT(*)::int AS n FROM punches");
    return got.rows[0].n;
  }
  return readFileSync().rows.length;
}

async function insertPunch(row) {
  const punchDate = isoDate(row.date);
  const punchTime = logic.cellTimeText(row.time);
  const staff = String(row.name || "").trim();
  const punchType = String(row.type || "").trim();
  const area = logic.areaKey(row.area);
  const source = String(row.source || "員工打卡").trim();
  const status = String(row.status || logic.punchStatusForSource(source)).trim();
  const lunch = row.lunch == null ? "" : String(row.lunch);
  if (usePg()) {
    const got = await getPool().query(
      `INSERT INTO punches (punch_date, punch_time, staff, punch_type, area, source, status, lunch)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [punchDate, punchTime, staff, punchType, area, source, status, lunch],
    );
    return publicRow(got.rows[0]);
  }
  return withFile((data) => {
    const saved = {
      id: data.nextId++,
      punch_date: punchDate,
      punch_time: punchTime,
      staff,
      punch_type: punchType,
      area,
      source,
      status,
      lunch,
    };
    data.rows.push(saved);
    writeFileSync(data);
    return publicRow(saved);
  });
}

async function listRange(fromKey, toKey, names) {
  const from = isoDate(fromKey);
  const to = isoDate(toKey);
  const nameSet = Array.isArray(names) && names.length ? new Set(names.map(String)) : null;
  let rows;
  if (usePg()) {
    const got = await getPool().query(
      `SELECT * FROM punches
       WHERE punch_date >= $1 AND punch_date <= $2
       ORDER BY punch_date, punch_time, id`,
      [from, to],
    );
    rows = got.rows.map(publicRow);
  } else {
    rows = readFileSync()
      .rows.map(publicRow)
      .filter((row) => {
        const day = isoDate(row.date);
        return day >= from && day <= to;
      });
  }
  if (nameSet) rows = rows.filter((row) => nameSet.has(row.name));
  return rows;
}

async function listAll() {
  if (usePg()) {
    const got = await getPool().query("SELECT * FROM punches ORDER BY id");
    return got.rows.map(publicRow);
  }
  return readFileSync().rows.map(publicRow);
}

async function getById(id) {
  const key = String(id);
  if (usePg()) {
    const n = Number(key);
    if (!n) return null;
    const got = await getPool().query("SELECT * FROM punches WHERE id = $1", [n]);
    return got.rows[0] ? publicRow(got.rows[0]) : null;
  }
  const hit = readFileSync().rows.find((row) => String(row.id) === key);
  return hit ? publicRow(hit) : null;
}

async function updateById(id, patch) {
  const key = String(id);
  if (usePg()) {
    const current = await getById(key);
    if (!current) return null;
    const next = { ...current, ...patch };
    await getPool().query(
      `UPDATE punches SET status = $1, lunch = $2 WHERE id = $3`,
      [next.status || "", next.lunch || "", Number(key)],
    );
    return getById(key);
  }
  return withFile((data) => {
    const row = data.rows.find((item) => String(item.id) === key);
    if (!row) return null;
    if (patch.status != null) row.status = patch.status;
    if (patch.lunch != null) row.lunch = patch.lunch;
    writeFileSync(data);
    return publicRow(row);
  });
}

async function replaceAll(rows) {
  if (usePg()) {
    const db = getPool();
    await db.query("DELETE FROM punches");
    for (const row of rows) {
      await insertPunch(row);
    }
    return;
  }
  return withFile((data) => {
    data.nextId = 1;
    data.rows = [];
    rows.forEach((row) => {
      data.rows.push({
        id: data.nextId++,
        punch_date: isoDate(row.date),
        punch_time: logic.cellTimeText(row.time),
        staff: row.name,
        punch_type: row.type,
        area: logic.areaKey(row.area),
        source: row.source || "",
        status: row.status || "",
        lunch: row.lunch || "",
      });
    });
    writeFileSync(data);
  });
}

async function importIfEmpty(loader) {
  await ready();
  if (importedOnce) return { imported: false, count: await count() };
  const n = await count();
  if (n > 0) {
    importedOnce = true;
    return { imported: false, count: n };
  }
  const rows = await loader();
  if (!rows.length) return { imported: false, count: 0 };
  await replaceAll(rows);
  importedOnce = true;
  return { imported: true, count: rows.length };
}

module.exports = {
  ready,
  count,
  insertPunch,
  listRange,
  listAll,
  getById,
  updateById,
  importIfEmpty,
  publicRow,
};
