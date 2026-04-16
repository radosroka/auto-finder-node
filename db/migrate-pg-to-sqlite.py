#!/usr/bin/env python3
"""
Migrate PostgreSQL biluppgifter database → SQLite

Memory-efficient: rows are streamed from PostgreSQL in small batches using a
server-side cursor and written to SQLite immediately — only CHUNK_SIZE rows
are ever held in RAM at once, regardless of table size.

Columns are auto-detected from PostgreSQL so no hardcoded schema assumptions.

Usage:
    python3 db/migrate-pg-to-sqlite.py [options]

Options:
    --pg-host      PG host        (env: DB_HOST,        default: localhost)
    --pg-port      PG port        (env: DB_PORT,        default: 5432)
    --pg-db        PG database    (env: DB,             default: biluppgifter)
    --pg-user      PG user        (env: DB_USER)
    --pg-password  PG password    (env: DB_USER_PASSWD)
    --output       SQLite path    (env: DB_PATH,        default: ./biluppgifter.db)
    --chunk-size   Rows per batch (default: 500)
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


# ── Tables to migrate (FK-safe order) ────────────────────────────────────────

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
    "integer":                     "INTEGER",
    "bigint":                      "INTEGER",
    "smallint":                    "INTEGER",
    "serial":                      "INTEGER",
    "bigserial":                   "INTEGER",
    "boolean":                     "INTEGER",
    "real":                        "REAL",
    "double precision":            "REAL",
    "numeric":                     "REAL",
    "decimal":                     "REAL",
    "text":                        "TEXT",
    "varchar":                     "TEXT",
    "character varying":           "TEXT",
    "char":                        "TEXT",
    "character":                   "TEXT",
    "date":                        "TEXT",
    "timestamp":                   "TEXT",
    "timestamp without time zone": "TEXT",
    "timestamp with time zone":    "TEXT",
    "bytea":                       "BLOB",
}

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


# ── Helpers ───────────────────────────────────────────────────────────────────

def ok(msg):     print(f"  \u2713 {msg}")
def warn(msg):   print(f"  ! {msg}")
def header(msg): print(f"\n{msg}")


def pg_columns(cur, table):
    """Introspect column names/types from information_schema (plain cursor)."""
    cur.execute("""
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = %s
        ORDER BY ordinal_position
    """, (table,))
    result = []
    for col_name, pg_type, nullable in cur.fetchall():
        result.append({
            "name":     col_name,
            "type":     PG_TO_SQLITE.get(pg_type.lower(), "TEXT"),
            "nullable": nullable == "YES",
        })
    return result


def pg_primary_key(cur, table):
    """Return ordered list of PK column names (plain cursor)."""
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
    col_defs = []
    for c in columns:
        parts = [f'"{c["name"]}"', c["type"]]
        if not c["nullable"]:
            parts.append("NOT NULL")
        col_defs.append("  " + " ".join(parts))
    if pk_cols:
        quoted = ", ".join(f'"{c}"' for c in pk_cols)
        col_defs.append(f"  PRIMARY KEY ({quoted})")
    body = ",\n".join(col_defs)
    return f'CREATE TABLE IF NOT EXISTS "{table}" (\n{body}\n);'


def stream_table(pg_conn, table, col_names, chunk_size):
    """
    Yield tuples in batches using a PostgreSQL server-side cursor.
    Only `chunk_size` rows are fetched from the server at a time.
    """
    quoted = ", ".join(f'"{c}"' for c in col_names)
    # Named cursor → server-side cursor; with autocommit=True psycopg2
    # automatically adds WITH HOLD so it survives outside a transaction.
    with pg_conn.cursor(f"migrate_{table}") as cur:
        cur.itersize = chunk_size
        cur.execute(f'SELECT {quoted} FROM "{table}"')
        while True:
            batch = cur.fetchmany(chunk_size)
            if not batch:
                break
            yield batch


def copy_table(pg_conn, sqlite_conn, table, col_names, chunk_size):
    """Stream from PG and insert into SQLite one chunk at a time."""
    quoted_cols  = ", ".join(f'"{c}"' for c in col_names)
    placeholders = ", ".join("?" * len(col_names))
    insert_sql   = f'INSERT OR IGNORE INTO "{table}" ({quoted_cols}) VALUES ({placeholders})'

    total = 0
    for batch in stream_table(pg_conn, table, col_names, chunk_size):
        sqlite_conn.executemany(insert_sql, batch)
        sqlite_conn.commit()
        total += len(batch)
        print(f"\r    {table}: {total} rows...", end="", flush=True)

    if total == 0:
        print(f"\r  · {table}: 0 rows (skipped)        ")
    else:
        print(f"\r  \u2713 {table}: {total} rows copied        ")


# ── Arg parsing ───────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="Migrate PostgreSQL → SQLite")
    p.add_argument("--pg-host",     default=os.environ.get("DB_HOST", "localhost"))
    p.add_argument("--pg-port",     default=int(os.environ.get("DB_PORT", "5432")), type=int)
    p.add_argument("--pg-db",       default=os.environ.get("DB", "biluppgifter"))
    p.add_argument("--pg-user",     default=os.environ.get("DB_USER"))
    p.add_argument("--pg-password", default=os.environ.get("DB_USER_PASSWD"))
    p.add_argument("--output",      default=os.environ.get("DB_PATH", "biluppgifter.db"))
    p.add_argument("--chunk-size",  default=500, type=int,
                   help="Rows fetched/inserted per batch (default: 500)")
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
    print(f"  Source     : {args.pg_user}@{args.pg_host}:{args.pg_port}/{args.pg_db}")
    print(f"  Target     : {args.output}")
    print(f"  Chunk size : {args.chunk_size} rows")
    print(f"  Dry run    : {args.dry_run}")

    # ── Connect ──────────────────────────────────────────────────────────────
    try:
        pg = psycopg2.connect(
            host=args.pg_host, port=args.pg_port,
            dbname=args.pg_db, user=args.pg_user, password=args.pg_password,
        )
        # autocommit=True so named cursors work as holdable cursors
        pg.set_session(readonly=True, autocommit=True)
    except psycopg2.OperationalError as e:
        sys.exit(f"\nCould not connect to PostgreSQL: {e}")

    ok("Connected to PostgreSQL")

    # ── Introspect schema ────────────────────────────────────────────────────
    header("Detected schema:")
    meta_cur    = pg.cursor()   # plain tuple cursor for information_schema
    table_meta  = {}
    missing     = []

    for table in TABLES:
        cols = pg_columns(meta_cur, table)
        pk   = pg_primary_key(meta_cur, table)
        if not cols:
            warn(f"{table}: not found in PostgreSQL — will be skipped")
            missing.append(table)
            continue
        table_meta[table] = {"columns": cols, "pk": pk}
        col_summary = ", ".join(f'{c["name"]} ({c["type"]})' for c in cols)
        print(f"  {table:<20}: {col_summary}")

    meta_cur.close()

    # ── Dry run: just print counts, no SQLite writes ─────────────────────────
    if args.dry_run:
        header("Row counts (dry run):")
        count_cur = pg.cursor()
        for table in table_meta:
            count_cur.execute(f'SELECT COUNT(*) FROM "{table}"')
            (n,) = count_cur.fetchone()
            print(f"  {table:<20}: {n}")
        count_cur.close()
        pg.close()
        print("\nDry run — no SQLite file written.")
        return

    # ── Prepare SQLite ───────────────────────────────────────────────────────
    header("Writing to SQLite…")

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    sqlite = sqlite3.connect(output_path)
    sqlite.execute("PRAGMA journal_mode = WAL")
    sqlite.execute("PRAGMA synchronous = NORMAL")   # safe with WAL, faster than FULL
    sqlite.execute("PRAGMA foreign_keys = OFF")     # re-enabled after bulk insert

    for table, meta in table_meta.items():
        ddl = build_create_table(table, meta["columns"], meta["pk"])
        sqlite.execute(ddl)
    sqlite.commit()
    ok("Tables created")

    # ── Stream PG → SQLite ───────────────────────────────────────────────────
    print()
    for table, meta in table_meta.items():
        col_names = [c["name"] for c in meta["columns"]]
        copy_table(pg, sqlite, table, col_names, args.chunk_size)

    sqlite.execute("PRAGMA foreign_keys = ON")

    # ── Views ────────────────────────────────────────────────────────────────
    header("Creating views…")
    for view_name, view_sql in VIEWS.items():
        try:
            sqlite.execute(f'CREATE VIEW IF NOT EXISTS "{view_name}" AS {view_sql}')
            ok(view_name)
        except sqlite3.OperationalError as e:
            warn(f"{view_name}: skipped — {e}")
    sqlite.commit()

    # ── Verify ───────────────────────────────────────────────────────────────
    header("Verification (SQLite row counts):")
    for table in table_meta:
        (count,) = sqlite.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()
        print(f"  {table:<20}: {count}")

    sqlite.close()
    pg.close()

    print(f"\nMigration complete → {output_path.resolve()}\n")

    if missing:
        print("Skipped (not found in PostgreSQL):", ", ".join(missing))
        print()


if __name__ == "__main__":
    main()
