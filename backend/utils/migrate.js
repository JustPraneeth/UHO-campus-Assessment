const fs = require("node:fs/promises");
const path = require("node:path");
require("../lib/loadEnv")();
const { Pool } = require("pg");
const { normalizeSslMode } = require("../lib/database");

function getMigrationConnectionString() {
  const configuredUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!configuredUrl) throw new Error("Set DATABASE_URL or DATABASE_URL_UNPOOLED before running migrations");

  const connectionUrl = new URL(configuredUrl);
  connectionUrl.hostname = connectionUrl.hostname.replace(/-pooler(?=\.)/, "");
  return normalizeSslMode(connectionUrl.toString());
}

async function migrate() {
  const migrationDirectory = path.join(__dirname, "../migrations");
  const migrations = (await fs.readdir(migrationDirectory))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();
  const pool = new Pool({ connectionString: getMigrationConnectionString() });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const migration of migrations) {
      const schema = await fs.readFile(path.join(migrationDirectory, migration), "utf8");
      await client.query(schema);
    }
    await client.query("COMMIT");
    console.log(`PostgreSQL schema applied successfully (${migrations.length} migrations).`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error(`[migration] ${error.message}`);
  process.exitCode = 1;
});