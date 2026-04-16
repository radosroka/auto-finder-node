#!/usr/bin/env python3
"""
Migrate PostgreSQL biluppgifter database → SQLite

Usage:
    python3 db/migrate-pg-to-sqlite.py [options]

Options:
    --pg-host      PG host        (env: DB_HOST,        default: localhost)
    --pg-port      PG port        (env: DB_PORT,        default: 5432)
    --pg-db        PG database    (env: DB,             default: biluppgifter)
    --pg-user      PG user        (env: DB_USER)
    --pg-password  PG password    (env: DB_USER_PASSWD)
    --output       SQLite path    (env: DB_PATH,        default: ./biluppgifter.db)
    --dry-run      Print row counts, don't write SQLite

Example:
    python3 db/migrate-pg-to-sqlite.py \\
        --pg-host localhost --pg-user myuser --pg-password secret \\
        --output /path/to/biluppgifter.db

Dependencies:
    pip install psycopg2-binary
    (sqlite3 is part of the Python standard library)
"""

import argparse
import os
import sqlite3
import sys
from pathlib import Path

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    sys.exit("Missing dependency: run  pip install psycopg2-binary")


# ── Argument parsing ──────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="Migrate PostgreSQL → SQLite")
    p.add_argument("--pg-host",     default=os.environ.get("DB_HOST", "localhost"))
    p.add_argument("--pg-port",     default=int(os.environ.get("DB_PORT", "5432")), type=int)
    p.add_argument("--pg-db",       default=os.environ.get("DB", "biluppgifter"))
    p.add_argument("--pg-user",     default=os.environ.get("DB_USER"))
    p.add_argument("--pg-password", default=os.environ.get("DB_USER_PASSWD"))
    p.add_argument("--output",      default=os.environ.get("DB_PATH", "biluppgifter.db"))
    p.add_argument("--dry-run",     action="store_true")
    return p.parse_args()


# ── Helpers ───────────────────────────────────────────────────────────────────

def ok(msg):   print(f"  \u2713 {msg}")
def info(msg): print(f"  \u00b7 {msg}")


def copy_table(pg_rows, sqlite_conn, table, columns):
    if not pg_rows:
        info(f"{table}: 0 rows (skipped)")
        return

    placeholders = ", ".join("?" * len(columns))
    col_list     = ", ".join(columns)
    sql          = f"INSERT OR IGNORE INTO {table} ({col_list}) VALUES ({placeholders})"

    rows = [tuple(row[c] for c in columns) for row in pg_rows]
    sqlite_conn.executemany(sql, rows)
    ok(f"{table}: {len(rows)} rows copied")


# ── Schema ────────────────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    user_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT NOT NULL UNIQUE,
    digest    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cars (
    car_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    car_plate TEXT NOT NULL UNIQUE,
    car_model TEXT,
    type_name TEXT,
    car_color TEXT,
    car_year  TEXT
);

CREATE TABLE IF NOT EXISTS owners (
    owner_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_name       TEXT,
    owner_age        TEXT,
    owner_street     TEXT,
    owner_postnumber TEXT,
    owner_city       TEXT,
    owner_phone      TEXT
);

CREATE TABLE IF NOT EXISTS owner_cars (
    owner_id INTEGER NOT NULL REFERENCES owners(owner_id),
    car_id   INTEGER NOT NULL REFERENCES cars(car_id),
    PRIMARY KEY (owner_id, car_id)
);

CREATE TABLE IF NOT EXISTS lists (
    list_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    list_name TEXT NOT NULL,
    user_id   INTEGER NOT NULL REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS list_items (
    list_id INTEGER NOT NULL REFERENCES lists(list_id),
    car_id  INTEGER NOT NULL REFERENCES cars(car_id),
    PRIMARY KEY (list_id, car_id)
);

CREATE TABLE IF NOT EXISTS link_to_merinfo (
    owner_id INTEGER NOT NULL REFERENCES owners(owner_id),
    car_id   INTEGER NOT NULL REFERENCES cars(car_id),
    link     TEXT,
    PRIMARY KEY (owner_id, car_id)
);

CREATE VIEW IF NOT EXISTS my_view AS
    SELECT car_id, car_plate, car_model, type_name, car_color, car_year
    FROM cars;

CREATE VIEW IF NOT EXISTS list_count_view AS
    SELECT l.list_id, l.list_name, l.user_id, COUNT(li.car_id) AS count
    FROM lists l
    LEFT JOIN list_items li ON l.list_id = li.list_id
    GROUP BY l.list_id, l.list_name, l.user_id;

CREATE VIEW IF NOT EXISTS list_view2 AS
    SELECT
        c.car_plate, c.car_model, c.type_name, c.car_color, c.car_year,
        o.owner_name, o.owner_age, o.owner_street, o.owner_postnumber, o.owner_city, o.owner_phone,
        lm.link,
        li.list_id, c.car_id, o.owner_id, l.user_id
    FROM list_items li
    JOIN  cars  c  ON li.car_id  = c.car_id
    JOIN  lists l  ON li.list_id = l.list_id
    LEFT JOIN owner_cars      oc ON c.car_id   = oc.car_id
    LEFT JOIN owners           o ON oc.owner_id = o.owner_id
    LEFT JOIN link_to_merinfo lm ON lm.car_id   = c.car_id
                                AND lm.owner_id  = o.owner_id;

CREATE VIEW IF NOT EXISTS in_list_no_owner AS
    SELECT DISTINCT c.car_plate, c.car_id
    FROM list_items li
    JOIN  cars c  ON li.car_id = c.car_id
    LEFT JOIN owner_cars oc ON c.car_id = oc.car_id
    WHERE oc.owner_id IS NULL;
"""


# ── Tables to migrate (name, columns, SELECT query) ──────────────────────────

TABLES = [
    ("users",           ["user_id", "user_name", "digest"],
     "SELECT user_id, user_name, digest FROM users"),

    ("cars",            ["car_id", "car_plate", "car_model", "type_name", "car_color", "car_year"],
     "SELECT car_id, car_plate, car_model, type_name, car_color, car_year FROM cars"),

    ("owners",          ["owner_id", "owner_name", "owner_age", "owner_street",
                         "owner_postnumber", "owner_city", "owner_phone"],
     "SELECT owner_id, owner_name, owner_age, owner_street, "
     "owner_postnumber, owner_city, owner_phone FROM owners"),

    ("owner_cars",      ["owner_id", "car_id"],
     "SELECT owner_id, car_id FROM owner_cars"),

    ("lists",           ["list_id", "list_name", "user_id"],
     "SELECT list_id, list_name, user_id FROM lists"),

    ("list_items",      ["list_id", "car_id"],
     "SELECT list_id, car_id FROM list_items"),

    ("link_to_merinfo", ["owner_id", "car_id", "link"],
     "SELECT owner_id, car_id, link FROM link_to_merinfo"),
]


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()

    if not args.pg_user:
        sys.exit("Error: PostgreSQL user is required (--pg-user or DB_USER env var)")

    print()
    print("PostgreSQL → SQLite migration")
    print("─────────────────────────────")
    print(f"  Source : {args.pg_user}@{args.pg_host}:{args.pg_port}/{args.pg_db}")
    print(f"  Target : {args.output}")
    print(f"  Dry run: {args.dry_run}")
    print()

    # ── Connect to PostgreSQL ────────────────────────────────────────────────
    try:
        pg = psycopg2.connect(
            host=args.pg_host,
            port=args.pg_port,
            dbname=args.pg_db,
            user=args.pg_user,
            password=args.pg_password,
        )
        pg.set_session(readonly=True, autocommit=True)
    except psycopg2.OperationalError as e:
        sys.exit(f"Could not connect to PostgreSQL: {e}")

    ok("Connected to PostgreSQL")

    # ── Fetch all tables ─────────────────────────────────────────────────────
    print()
    print("Fetching data from PostgreSQL…")

    cur = pg.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    data = {}
    for table, columns, query in TABLES:
        cur.execute(query)
        data[table] = cur.fetchall()

    cur.close()
    pg.close()
    ok("Disconnected from PostgreSQL")

    print()
    print("Row counts:")
    for table, _, _ in TABLES:
        print(f"  {table:<20}: {len(data[table])}")

    if args.dry_run:
        print()
        print("Dry run — no SQLite file written.")
        return

    # ── Write SQLite ─────────────────────────────────────────────────────────
    print()
    print("Writing to SQLite…")

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    sqlite = sqlite3.connect(output_path)
    sqlite.execute("PRAGMA journal_mode = WAL")
    sqlite.execute("PRAGMA foreign_keys = OFF")   # re-enabled after bulk insert

    sqlite.executescript(SCHEMA)
    ok("Schema applied")

    for table, columns, _ in TABLES:
        copy_table(data[table], sqlite, table, columns)

    sqlite.commit()
    sqlite.execute("PRAGMA foreign_keys = ON")

    # ── Verify ───────────────────────────────────────────────────────────────
    print()
    print("Verification (SQLite row counts):")
    for table, _, _ in TABLES:
        (count,) = sqlite.execute(f"SELECT COUNT(*) FROM {table}").fetchone()
        print(f"  {table:<20}: {count}")

    sqlite.close()

    print()
    print(f"Migration complete → {output_path.resolve()}")
    print()


if __name__ == "__main__":
    main()
