-- Migration 005: faculty serial_no + shortcuts
-- Adds two new columns to support the updated faculty import format:
--   serial_no  — the S.No from the upload sheet; used as the match key on re-upload.
--   shortcuts  — free-text shorthand / alias for the faculty member.
--
-- Run with:
--   psql -d invigilation_db -f src/migrations/005_faculty_sno_shortcuts.sql

ALTER TABLE faculty ADD COLUMN IF NOT EXISTS serial_no INTEGER;
ALTER TABLE faculty ADD COLUMN IF NOT EXISTS shortcuts  VARCHAR(200);

-- Unique constraint so two faculty cannot share the same S.No
CREATE UNIQUE INDEX IF NOT EXISTS idx_faculty_serial_no ON faculty(serial_no)
    WHERE serial_no IS NOT NULL;
