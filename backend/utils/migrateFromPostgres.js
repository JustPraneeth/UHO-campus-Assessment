require("../lib/loadEnv")();
const { Pool } = require("pg");
const { getPool, prepareValue } = require("../lib/database");

const tables = ["profiles", "questions", "assessments", "assessment_registrations", "submissions"];

function quoteIdentifier(identifier) {
  if (!/^[a-z][a-z0-9_]*$/i.test(identifier)) throw new Error("Invalid database identifier");
  return `"${identifier}"`;
}

async function getColumns(client, table) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [table]
  );
  return rows.map((row) => row.column_name);
}

async function importTable(source, target, table) {
  const [sourceColumns, targetColumns] = await Promise.all([
    getColumns(source, table),
    getColumns(target, table),
  ]);
  const columns = sourceColumns.filter((column) => targetColumns.includes(column));
  if (!columns.includes("id")) throw new Error(`The source table public.${table} is missing its id column`);

  const selected = columns.map(quoteIdentifier).join(", ");
  const { rows } = await source.query(`SELECT ${selected} FROM public.${quoteIdentifier(table)}`);
  if (!rows.length) return 0;

  const columnSql = columns.map(quoteIdentifier).join(", ");
  const updateSql = columns.filter((column) => column !== "id")
    .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`).join(", ");
  const conflictSql = updateSql
    ? `ON CONFLICT (id) DO UPDATE SET ${updateSql}`
    : "ON CONFLICT (id) DO NOTHING";

  for (let offset = 0; offset < rows.length; offset += 250) {
    const batch = rows.slice(offset, offset + 250);
    const values = [];
    const placeholders = batch.map((row) => `(${columns.map((column) => {
      values.push(prepareValue(column, row[column]));
      return `$${values.length}`;
    }).join(", ")})`).join(", ");
    await target.query(
      `INSERT INTO public.${quoteIdentifier(table)} (${columnSql}) VALUES ${placeholders} ${conflictSql}`,
      values
    );
  }
  return rows.length;
}

async function migrateFromPostgres() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  if (!sourceUrl) throw new Error("Set SOURCE_DATABASE_URL locally to the existing PostgreSQL database before importing");
  const source = new Pool({ connectionString: sourceUrl });
  const targetPool = getPool();
  const target = await targetPool.connect();
  try {
    await target.query("BEGIN");
    const counts = {};
    for (const table of tables) counts[table] = await importTable(source, target, table);
    await target.query("COMMIT");
    console.log(`Imported source rows by table: ${JSON.stringify(counts)}`);
  } catch (error) {
    await target.query("ROLLBACK");
    throw error;
  } finally {
    target.release();
    await Promise.all([source.end(), targetPool.end()]);
  }
}

migrateFromPostgres().catch((error) => {
  console.error(`[data-migration] ${error.message}`);
  process.exitCode = 1;
});