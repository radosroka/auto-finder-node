-- SQLite schema for auto-finder (migrated from PostgreSQL)
-- This file is run once at startup via CREATE ... IF NOT EXISTS,
-- so it is safe to re-run on every launch.

CREATE TABLE IF NOT EXISTS users (
    user_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name        TEXT NOT NULL UNIQUE,
    user_passwd_hash TEXT NOT NULL
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
    owner_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_name      TEXT,
    owner_age       TEXT,
    owner_street    TEXT,
    owner_postnumber TEXT,
    owner_city      TEXT,
    owner_phone     TEXT
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

-- ── Views ───────────────────────────────────────────────────────────────────

CREATE VIEW IF NOT EXISTS my_view AS
    SELECT car_id, car_plate, car_model, type_name, car_color, car_year
    FROM cars;

CREATE VIEW IF NOT EXISTS list_count_view AS
    SELECT
        l.list_id,
        l.list_name,
        l.user_id,
        COUNT(li.car_id) AS count
    FROM lists l
    LEFT JOIN list_items li ON l.list_id = li.list_id
    GROUP BY l.list_id, l.list_name, l.user_id;

CREATE VIEW IF NOT EXISTS list_view2 AS
    SELECT
        c.car_plate,
        c.car_model,
        c.type_name,
        c.car_color,
        c.car_year,
        o.owner_name,
        o.owner_age,
        o.owner_street,
        o.owner_postnumber,
        o.owner_city,
        o.owner_phone,
        lm.link,
        li.list_id,
        c.car_id,
        o.owner_id,
        l.user_id
    FROM list_items li
    JOIN  cars  c  ON li.car_id  = c.car_id
    JOIN  lists l  ON li.list_id = l.list_id
    LEFT JOIN owner_cars       oc ON c.car_id   = oc.car_id
    LEFT JOIN owners            o ON oc.owner_id = o.owner_id
    LEFT JOIN link_to_merinfo  lm ON lm.car_id   = c.car_id
                                  AND lm.owner_id = o.owner_id;

CREATE VIEW IF NOT EXISTS in_list_no_owner AS
    SELECT DISTINCT c.car_plate, c.car_id
    FROM list_items li
    JOIN  cars c  ON li.car_id = c.car_id
    LEFT JOIN owner_cars oc ON c.car_id = oc.car_id
    WHERE oc.owner_id IS NULL;
