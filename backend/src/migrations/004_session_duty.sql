-- Migration 004: session_duty table
-- Stores invigilator assignments at the session level (no room dependency).
-- This replaces the room-based invigilation_duty flow for the "no-room" mode.
--
-- Run with:
--   psql -d invigilation_db -f src/migrations/004_session_duty.sql

CREATE TABLE IF NOT EXISTS session_duty (
    id              SERIAL PRIMARY KEY,
    exam_session_id INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    faculty_id      INTEGER NOT NULL REFERENCES faculty(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'assigned',  -- assigned / swapped / cancelled
    notes           VARCHAR(200),
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(exam_session_id, faculty_id)
);

CREATE INDEX IF NOT EXISTS idx_session_duty_session ON session_duty(exam_session_id);
CREATE INDEX IF NOT EXISTS idx_session_duty_faculty ON session_duty(faculty_id);
