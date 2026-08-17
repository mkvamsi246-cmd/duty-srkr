-- Migration 002: Add faculty priority column
-- Safe to run on existing databases — uses ADD COLUMN IF NOT EXISTS.
-- Fresh databases created from schema.sql already include this column.
--
-- Run with: psql -d invigilation_db -f src/migrations/002_faculty_priority.sql

ALTER TABLE faculty ADD COLUMN IF NOT EXISTS
    priority INTEGER NOT NULL DEFAULT 3;

-- Back-fill sensible defaults based on existing designation values
UPDATE faculty SET priority = 1 WHERE designation = 'professor'           AND priority = 3;
UPDATE faculty SET priority = 2 WHERE designation = 'associate_professor' AND priority = 3;
-- assistant_professor stays at 3 (the column default)
