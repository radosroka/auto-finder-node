#!/usr/bin/env python3
"""
Migrate PostgreSQL biluppgifter database → SQLite

Columns are auto-detected from PostgreSQL — no hardcoded schema assumptions.
The script also prints a column map so you can see exactly what landed in SQLite.

Usage:
    python3 db/migrate-pg-to-sqlite.py [options]

Options:
    --pg-host      PG host        (env: DB_HOST,        default: localhost)
    --pg-port      PG port        (env: DB_PORT,        default: 5432)
    --pg-db        PG database    (env: DB,             default: biluppgifter)
    --pg-user      PG user        (env: DB_USER)
    --pg-password  PG password    (env: DB_USER_PASSWD)
    --output       SQLite path    (env: DB_PATH,        default: ./biluppgifter.db)
    --dry-run      Print schema + row counts, don't write SQLite

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


# ── Tables to migrate (in FK-safe order) ─────────────────────────────────────

TABLES = [
    "users",
    "cars",
    "owners",
    "owner_cars",
    "lists",
    "list_items",
    "link_to_merinfo",
]

# PostgreSQL type → SQLite affinity
PG_TO_SQLITE = {
    "integer":           "INTEGER",
    "bigint":            "INTEGER",
    "smallint":          "INTEGER",
    "serial":            "INTEGER",
    "bigserial":         "INTEGER",
    "boolean":           "INTEGER",
    "real":              "REAL",
    "double precision":  "REAL",
    "numeric":           "REAL",
    "decimal":           "REAL",
    "text":              "TEXT",
    "varchar":           "TEXT",
    "character varying": "TEXT",
    "char":              "TEXT",
    "character":         "TEXT",
    "date":              "TEXT",
    "timestamp":         "TEXT",
    "timestamp without time zone": "TEXT",
    "timestamp with time zone":    "TEXT",
    "bytea":             "BLOB",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def ok(msg):    print(f"  \u2713 {msg}")
def info(msg):  print(f"  \u00b7 {msg}")
def warn(msg):  print(f"  ! {msg}")
def header(msg):print(f"\n{msg}")


def pg_columns(cur, table):
    """Return list of column dicts for a table, using a plain (tuple) cursor."""
    cur.execute("""
        SELECT column_name,
               data_type,
               is_nullable,
               column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = %s
        ORDER BY ordinal_position
    """, (table,))
    result = []
    for col_name, pg_type, nullable, default in cur.fetchall():
        sqlite_type = PG_TO_SQLITE.get(pg_type.lower(), "TEXT")
        result.append({
            "name":     col_name,
            "type":     sqlite_type,
            "nullable": nullable == "YES",
            "default":  default,
        })
    return result


def pg_primary_key(cur, table):
    """Return list of PK column names for a table, using a plain (tuple) cursor."""
    cur.execute("""
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema    = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema    = 'public'
          AND tc.table_name      = %s
        ORDER BY kcu.ordinal_position
    """, (table,))
    return [row[0] for row in cur.fetchall()]


def build_create_table(table, columns, pk_cols):
    """Generate CREATE TABLE IF NOT EXISTS DDL for SQLite."""
    col_defs = []
    for c in columns:
        parts = [f'"{c["name"]}"', c["type"]]
        if not c["nullable"]:
            parts.append("NOT NULL")
        col_defs.append(" ".join(parts))

    if pk_cols:
        quoted = ", ".join(f'"{c}"' for c in pk_cols)
        col_defs.append(f"PRIMARY KEY ({quoted})")

    body = ",\n    ".join(col_defs)
    return f'CREATE TABLE IF NOT EXISTS "{table}" (\n    {body}\n);'


def copy_table(pg_rows, sqlite_conn, table, col_names):
    if not pg_rows:
        info(f"{table}: 0 rows (skipped)")
        return

    quoted_cols  = ", ".join(f'"{c}"' for c in col_names)
    placeholders = ", ".join("?" * len(col_names))
    sql = f'INSERT OR IGNORE INTO "{table}" ({quoted_cols}) VALUES ({placeholders})'

    rows = [tuple(row[c] for c in col_names) for row in pg_rows]
    sqlite_conn.executemany(sql, rows)
    ok(f"{table}: {len(rows)} rows copied")


# ── Static views (reference well-known column names from the app) ─────────────
# These are created after the tables; if your column names differ the view
# creation will fail gracefully with a warning rather than aborting the migration.

VIEWS = {
    "my_view": """
        SELECT car_id, car_plate, car_model, type_name, car_color, car_year
        FROM cars
    """,
    "list_count_view": """
        SELECT l.list_id, l.list_name, l.user_id, COUNT(li.car_id) AS count
        FROM lists l
        LEFT JOIN list_items li ON l.list_id = li.list_id
        GROUP BY l.list_id, l.list_name, l.user_id
    """,
    "list_view2": """
        SELECT
            c.car_plate, c.car_model, c.type_name, c.car_color, c.car_year,
            o.owner_name, o.owner_age, o.owner_street, o.owner_postnumber,
            o.owner_city, o.owner_phone,
            lm.link,
            li.list_id, c.car_id, o.owner_id, l.user_id
        FROM list_items li
        JOIN  cars  c  ON li.car_id  = c.car_id
        JOIN  lists l  ON li.list_id = l.list_id
        LEFT JOIN owner_cars      oc ON c.car_id   = oc.car_id
        LEFT JOIN owners           o ON oc.owner_id = o.owner_id
        LEFT JOIN link_to_merinfo lm ON lm.car_id   = c.car_id
                                    AND lm.owner_id  = o.owner_id
    """,
    "in_list_no_owner": """
        SELECT DISTINCT c.car_plate, c.car_id
        FROM list_items li
        JOIN  cars c  ON li.car_id = c.car_id
        LEFT JOIN owner_cars oc ON c.car_id = oc.car_id
        WHERE oc.owner_id IS NULL
    """,
}


# ── Arg parsing ───────────────────────────────────────────────────────────────

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

    # ── Connect ──────────────────────────────────────────────────────────────
    try:
        pg = psycopg2.connect(
            host=args.pg_host, port=args.pg_port,
            dbname=args.pg_db, user=args.pg_user, password=args.pg_password,
        )
        pg.set_session(readonly=True, autocommit=True)
    except psycopg2.OperationalError as e:
        sys.exit(f"\nCould not connect to PostgreSQL: {e}")

    ok("Connected to PostgreSQL")

    meta_cur = pg.cursor()  # plain tuple cursor — required for information_schema unpacking

    # ── Introspect schema ────────────────────────────────────────────────────
    header("Detected schema:")
    table_meta = {}   # table → {columns: [...], pk: [...]}
    missing = []

    for table in TABLES:
        cols = pg_columns(meta_cur, table)
        pk   = pg_primary_key(meta_cur, table)
        if not cols:
            warn(f"{table}: table not found in PostgreSQL — will be skipped")
            missing.append(table)
            continue
        table_meta[table] = {"columns": cols, "pk": pk}
        col_summary = ", ".join(
            f'{c["name"]} ({c["type"]})' for c in cols
        )
        print(f"  {table:<20}: {col_summary}")

    # ── Fetch data ───────────────────────────────────────────────────────────
    header("Fetching data from PostgreSQL…")
    data = {}
    data_cur = pg.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    for table, meta in table_meta.items():
        col_names = [c["name"] for c in meta["columns"]]
        quoted    = ", ".join(f'"{c}"' for c in col_names)
        data_cur.execute(f'SELECT {quoted} FROM "{table}"')
        data[table] = data_cur.fetchall()
        ok(f"{table}: {len(data[table])} rows")

    data_cur.close()
    meta_cur.close()
    pg.close()
    ok("Disconnected from PostgreSQL")

    if args.dry_run:
        print("\nDry run — no SQLite file written.")
        return

    # ── Write SQLite ─────────────────────────────────────────────────────────
    header("Writing to SQLite…")

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    sqlite = sqlite3.connect(output_path)
    sqlite.execute("PRAGMA journal_mode = WAL")
    sqlite.execute("PRAGMA foreign_keys = OFF")

    # Create tables
    for table, meta in table_meta.items():
        ddl = build_create_table(table, meta["columns"], meta["pk"])
        sqlite.execute(ddl)
    sqlite.commit()
    ok("Tables created")

    # Copy rows
    for table, meta in table_meta.items():
        col_names = [c["name"] for c in meta["columns"]]
        copy_table(data[table], sqlite, table, col_names)
    sqlite.commit()

    # Create views
    header("Creating views…")
    for view_name, view_sql in VIEWS.items():
        try:
            sqlite.execute(
                f'CREATE VIEW IF NOT EXISTS "{view_name}" AS {view_sql}'
            )
            ok(view_name)
        except sqlite3.OperationalError as e:
            warn(f"{view_name}: skipped — {e}")
    sqlite.commit()

    sqlite.execute("PRAGMA foreign_keys = ON")

    # ── Verify ───────────────────────────────────────────────────────────────
    header("Verification (SQLite row counts):")
    for table in table_meta:
        (count,) = sqlite.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()
        print(f"  {table:<20}: {count}")

    sqlite.close()

    print(f"\nMigration complete → {output_path.resolve()}\n")

    if missing:
        print("Tables not found in PostgreSQL (skipped):", ", ".join(missing))
        print()


if __name__ == "__main__":
    main()
