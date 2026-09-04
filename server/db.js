const { Pool, types } = require("pg");

types.setTypeParser(1082, (val) => val);
types.setTypeParser(1083, (val) => String(val).slice(0, 8));

let pool;

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

// 只補資料表，絕不 DROP / TRUNCATE / 用本機舊檔灌進去。
async function ensureSchema() {
  const db = getPool();
  if (!db) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS punches (
      id SERIAL PRIMARY KEY,
      punch_date DATE NOT NULL,
      punch_time TIME NOT NULL,
      staff TEXT NOT NULL,
      punch_type TEXT NOT NULL,
      area TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '員工打卡',
      status TEXT NOT NULL DEFAULT '待確認',
      lunch TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS punches_day_staff ON punches (punch_date, staff);
  `);
}

module.exports = { getPool, ensureSchema };
