-- Incremental migration: adds weekly-timetable support to an existing database.
-- Safe to run on a fresh database too (schema.sql already includes this),
-- and safe to re-run (uses IF NOT EXISTS / ON CONFLICT throughout).
--
-- Run with: psql -d invigilation_db -f src/migrations/001_faculty_timetable.sql

CREATE TABLE IF NOT EXISTS faculty_timetable (
    id              SERIAL PRIMARY KEY,
    faculty_id      INTEGER NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
    day_of_week     VARCHAR(3) NOT NULL CHECK (day_of_week IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
    period          INTEGER NOT NULL CHECK (period BETWEEN 1 AND 12),
    subject_code    VARCHAR(150),
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(faculty_id, day_of_week, period)
);

CREATE INDEX IF NOT EXISTS idx_timetable_faculty_day ON faculty_timetable(faculty_id, day_of_week);

INSERT INTO settings (key, value) VALUES
    ('session_periods', '{"FN": [1,2,3,4], "AN": [5,6,7,8]}')
ON CONFLICT (key) DO NOTHING;
