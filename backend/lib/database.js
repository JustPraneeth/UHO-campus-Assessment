const { Pool } = require("pg");

let pool;
const jsonColumns = new Set(["answers", "options", "option_orders", "section_scores", "test_cases"]);

function normalizeSslMode(connectionString) {
  return connectionString.replace(
    /([?&]sslmode=)(?:prefer|require|verify-ca)(?=&|$)/i,
    "$1verify-full"
  );
}

function prepareValue(column, value) {
  if (jsonColumns.has(column) && value !== null && typeof value !== "string") return JSON.stringify(value);
  return value;
}

function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) {
    const error = new Error("Set DATABASE_URL to connect to the PostgreSQL database");
    error.statusCode = 503;
    throw error;
  }
  pool = new Pool({
    connectionString: normalizeSslMode(process.env.DATABASE_URL),
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });
  // Serverless Postgres (Neon) drops idle connections; without this listener the
  // resulting 'error' event would crash the process.
  pool.on("error", (error) => console.error(`[database] Idle client error: ${error.code || ""} ${error.message}`));
  return pool;
}

function query(text, values) {
  const pool = getPool();
  const poolQuery = pool.query.bind(pool);
  return queryWithDnsRetry(poolQuery, text, values);
}

async function queryWithDnsRetry(queryFn, text, values) {
  const retryableDnsCodes = new Set(["ENOTFOUND", "EAI_AGAIN"]);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await queryFn(text, values);
    } catch (error) {
      if (!retryableDnsCodes.has(error.code) || attempt >= 3) throw error;
      const delayMs = 150 * (2 ** attempt);
      console.warn(`[database] Temporary DNS lookup failure (${error.code}); retrying query in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function quoteIdentifier(identifier) {
  if (!/^[a-z][a-z0-9_]*$/i.test(identifier)) throw new Error("Invalid database identifier");
  return `"${identifier}"`;
}

async function insertRow(table, record, allowedColumns) {
  const entries = Object.entries(record).filter(([column]) => allowedColumns.includes(column));
  if (!entries.length) throw new Error("No valid database fields provided");
  const columns = entries.map(([column]) => quoteIdentifier(column)).join(", ");
  const placeholders = entries.map((_, index) => `$${index + 1}`).join(", ");
  const { rows } = await query(
    `INSERT INTO ${quoteIdentifier(table)} (${columns}) VALUES (${placeholders}) RETURNING *`,
    entries.map(([column, value]) => prepareValue(column, value))
  );
  return rows[0];
}

async function updateRow(table, record, allowedColumns, whereSql, whereValues) {
  const entries = Object.entries(record).filter(([column]) => allowedColumns.includes(column));
  if (!entries.length) throw new Error("No valid database fields provided");
  const assignments = entries.map(([column], index) => `${quoteIdentifier(column)} = $${index + 1}`).join(", ");
  const { rows } = await query(
    `UPDATE ${quoteIdentifier(table)} SET ${assignments} WHERE ${whereSql} RETURNING *`,
    [...entries.map(([column, value]) => prepareValue(column, value)), ...whereValues]
  );
  return rows[0] || null;
}

async function checkDatabase() {
  await query("SELECT 1");
  return true;
}

function toCamel(value) {
  if (Array.isArray(value)) return value.map(toCamel);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key === "id" ? "_id" : key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
    toCamel(item),
  ]));
}

function toSnake(value) {
  if (Array.isArray(value)) return value.map(toSnake);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
    toSnake(item),
  ]));
}

module.exports = {
  checkDatabase,
  getPool,
  insertRow,
  normalizeSslMode,
  prepareValue,
  query,
  queryWithDnsRetry,
  toCamel,
  toSnake,
  updateRow,
};