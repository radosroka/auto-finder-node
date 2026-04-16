#!/usr/bin/env node
/**
 * Migrate PostgreSQL biluppgifter database → SQLite
 *
 * Usage:
 *   node db/migrate-pg-to-sqlite.js [options]
 *
 * Options (all have env-var fallbacks):
 *   --pg-host      PG host        (env: DB_HOST,   default: localhost)
 *   --pg-port      PG port        (env: DB_PORT,   default: 5432)
 *   --pg-db        PG database    (env: DB,        default: biluppgifter)
 *   --pg-user      PG user        (env: DB_USER)
 *   --pg-password  PG password    (env: DB_USER_PASSWD)
 *   --output       SQLite path    (env: DB_PATH,   default: ./biluppgifter.db)
 *   --dry-run      Print row counts, don't write SQLite
 *
 * Example:
 *   node db/migrate-pg-to-sqlite.js \
 *     --pg-host localhost --pg-user myuser --pg-password secret \
 *     --output /path/to/biluppgifter.db
 *
 * Dependencies (install if not present):
 *   npm install pg better-sqlite3
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i].replace(/^--/, '');
    const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    opts[key] = val;
  }
  return opts;
}

const args = parseArgs();

const pgConfig = {
  host:     args['pg-host']     || process.env.DB_HOST        || 'localhost',
  port:     parseInt(args['pg-port'] || process.env.DB_PORT || '5432'),
  database: args['pg-db']       || process.env.DB             || 'biluppgifter',
  user:     args['pg-user']     || process.env.DB_USER,
  password: args['pg-password'] || process.env.DB_USER_PASSWD,
};

const sqlitePath = args['output'] || process.env.DB_PATH || path.join(process.cwd(), 'biluppgifter.db');
const dryRun     = args['dry-run'] === true || args['dry-run'] === 'true';

if (!pgConfig.user) {
  console.error('Error: PostgreSQL user is required (--pg-user or DB_USER env var)');
  process.exit(1);
}

// ── Load drivers ─────────────────────────────────────────────────────────────

let pg, Database;

try {
  pg = require('pg');
} catch {
  console.error('Missing dependency: run  npm install pg');
  process.exit(1);
}

try {
  Database = require('better-sqlite3');
} catch {
  console.error('Missing dependency: run  npm install better-sqlite3');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) { process.stdout.write(msg + '\n'); }
function ok(msg)  { log('  ✓ ' + msg); }
function info(msg){ log('  · ' + msg); }

async function fetchAll(client, sql) {
  const res = await client.query(sql);
  return res.rows;
}

// Copy one table: fetch from PG, bulk-insert into SQLite inside a transaction.
// The INSERT uses INSERT OR IGNORE so re-running the script is safe.
function copyTable(pgRows, sqliteDb, tableName, columns) {
  if (pgRows.length === 0) {
    info(`${tableName}: 0 rows (skipped)`);
    return;
  }

  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT OR IGNORE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
  const stmt = sqliteDb.prepare(sql);

  const insertMany = sqliteDb.transaction((rows) => {
    for (const row of rows) {
      // Coerce values: PostgreSQL may return numbers/dates; keep as primitive.
      const vals = columns.map(c => {
        const v = row[c];
        if (v === null || v === undefined) return null;
        if (typeof v === 'object' && !(v instanceof Date)) return String(v);
        if (v instanceof Date) return v.toISOString();
        return v;
      });
      stmt.run(vals);
    }
  });

  insertMany(pgRows);
  ok(`${tableName}: ${pgRows.length} rows copied`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log('');
  log('PostgreSQL → SQLite migration');
  log('─────────────────────────────');
  log(`  Source : ${pgConfig.user}@${pgConfig.host}:${pgConfig.port}/${pgConfig.database}`);
  log(`  Target : ${sqlitePath}`);
  log(`  Dry run: ${dryRun}`);
  log('');

  // ── Connect to PostgreSQL ────────────────────────────────────────────────
  const pgClient = new pg.Client(pgConfig);
  try {
    await pgClient.connect();
    ok('Connected to PostgreSQL');
  } catch (err) {
    console.error('Could not connect to PostgreSQL:', err.message);
    process.exit(1);
  }

  // ── Fetch all tables ─────────────────────────────────────────────────────
  log('');
  log('Fetching data from PostgreSQL…');

  const [users, cars, owners, ownerCars, lists, listItems, linkToMerinfo] = await Promise.all([
    fetchAll(pgClient, 'SELECT user_id, user_name, digest FROM users'),
    fetchAll(pgClient, 'SELECT car_id, car_plate, car_model, type_name, car_color, car_year FROM cars'),
    fetchAll(pgClient, 'SELECT owner_id, owner_name, owner_age, owner_street, owner_postnumber, owner_city, owner_phone FROM owners'),
    fetchAll(pgClient, 'SELECT owner_id, car_id FROM owner_cars'),
    fetchAll(pgClient, 'SELECT list_id, list_name, user_id FROM lists'),
    fetchAll(pgClient, 'SELECT list_id, car_id FROM list_items'),
    fetchAll(pgClient, 'SELECT owner_id, car_id, link FROM link_to_merinfo'),
  ]);

  await pgClient.end();
  ok('Disconnected from PostgreSQL');

  log('');
  log('Row counts:');
  log(`  users           : ${users.length}`);
  log(`  cars            : ${cars.length}`);
  log(`  owners          : ${owners.length}`);
  log(`  owner_cars      : ${ownerCars.length}`);
  log(`  lists           : ${lists.length}`);
  log(`  list_items      : ${listItems.length}`);
  log(`  link_to_merinfo : ${linkToMerinfo.length}`);

  if (dryRun) {
    log('');
    log('Dry run — no SQLite file written.');
    return;
  }

  // ── Prepare SQLite ───────────────────────────────────────────────────────
  log('');
  log('Writing to SQLite…');

  const sqliteDir = path.dirname(sqlitePath);
  if (!fs.existsSync(sqliteDir)) fs.mkdirSync(sqliteDir, { recursive: true });

  const sqliteDb = new Database(sqlitePath);
  sqliteDb.pragma('journal_mode = WAL');
  // Disable FK checks during bulk insert so order doesn't matter within a
  // transaction; we re-enable afterwards.
  sqliteDb.pragma('foreign_keys = OFF');

  // Apply schema (creates tables + views if they don't exist yet)
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error('schema.sql not found at', schemaPath);
    process.exit(1);
  }
  sqliteDb.exec(fs.readFileSync(schemaPath, 'utf8'));
  ok('Schema applied');

  // ── Copy tables in FK-safe order ─────────────────────────────────────────
  // (foreign_keys is OFF so the order only matters for clarity, but we keep
  //  parent tables first as a good practice)
  copyTable(users,        sqliteDb, 'users',           ['user_id', 'user_name', 'digest']);
  copyTable(cars,         sqliteDb, 'cars',            ['car_id', 'car_plate', 'car_model', 'type_name', 'car_color', 'car_year']);
  copyTable(owners,       sqliteDb, 'owners',          ['owner_id', 'owner_name', 'owner_age', 'owner_street', 'owner_postnumber', 'owner_city', 'owner_phone']);
  copyTable(ownerCars,    sqliteDb, 'owner_cars',      ['owner_id', 'car_id']);
  copyTable(lists,        sqliteDb, 'lists',           ['list_id', 'list_name', 'user_id']);
  copyTable(listItems,    sqliteDb, 'list_items',      ['list_id', 'car_id']);
  copyTable(linkToMerinfo,sqliteDb, 'link_to_merinfo', ['owner_id', 'car_id', 'link']);

  sqliteDb.pragma('foreign_keys = ON');

  // ── Verify ───────────────────────────────────────────────────────────────
  log('');
  log('Verification (SQLite row counts):');
  for (const tbl of ['users','cars','owners','owner_cars','lists','list_items','link_to_merinfo']) {
    const { count } = sqliteDb.prepare(`SELECT COUNT(*) AS count FROM ${tbl}`).get();
    log(`  ${tbl.padEnd(20)}: ${count}`);
  }

  sqliteDb.close();

  log('');
  log(`Migration complete → ${sqlitePath}`);
  log('');
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
