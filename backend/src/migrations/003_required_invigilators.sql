-- Migration 003: required_invigilators + year_sem on exam_sessions,
--               year_sem on faculty_timetable
--
-- Safe to run on an existing database (uses ADD COLUMN IF NOT EXISTS).
-- Fresh databases should also run this after schema.sql.
--
-- Run with:
--   psql -d invigilation_db -f src/migrations/003_required_invigilators.sql

-- Change 1: let coordinators set a manual session-level headcount
ALTER TABLE exam_sessions
    ADD COLUMN IF NOT EXISTS required_invigilators INTEGER;   -- NULL = fall back to per-room sum

-- Change 2: which year/semester is sitting this exam
--   Values: '1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'
ALTER TABLE exam_sessions
    ADD COLUMN IF NOT EXISTS year_sem VARCHAR(10);

-- Change 4: store parsed year_sem on timetable rows so the allocation engine
--   can filter by year without re-parsing subject_code at query time.
ALTER TABLE faculty_timetable
    ADD COLUMN IF NOT EXISTS year_sem VARCHAR(10);

-- Index to speed up the "still-in-class" join in getEligibleFacultyPool
CREATE INDEX IF NOT EXISTS idx_timetable_year_sem
    ON faculty_timetable(year_sem);
