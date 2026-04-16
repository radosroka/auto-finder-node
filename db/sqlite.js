const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db;

function getDb() {
  if (!db) {
    const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/biluppgifter.db');

    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(database) {
  // In a packaged Electron app the asar archive is read-only but __dirname
  // still resolves correctly inside it for reads.
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    database.exec(schema);
  } else {
    console.warn('db/sqlite.js: schema.sql not found at', schemaPath);
  }
}

// No-op connect() so app.js doesn't need changing
const client = {
  connect: () => Promise.resolve(),
};

function query(opts) {
  const database = getDb();
  const text = typeof opts === 'string' ? opts : opts.text;
  const rowMode = typeof opts === 'object' ? opts.rowMode : null;

  try {
    const stmt = database.prepare(text);
    if (stmt.reader) {
      const rows = rowMode === 'array' ? stmt.raw().all() : stmt.all();
      return Promise.resolve({ rows });
    } else {
      const info = stmt.run();
      return Promise.resolve({ rows: [], rowCount: info.changes });
    }
  } catch (err) {
    return Promise.reject(err);
  }
}

module.exports = { query, client };
