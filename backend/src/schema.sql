-- ============================================================
-- Invigilation Duty Allocation System — Database Schema
-- PostgreSQL
-- ============================================================

CREATE TABLE IF NOT EXISTS faculty (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    designation     VARCHAR(30) NOT NULL
                        CHECK (designation IN ('professor','associate_professor','assistant_professor')),
    department      VARCHAR(100),
    email           VARCHAR(150),
    phone           VARCHAR(20),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    duty_count      INTEGER NOT NULL DEFAULT 0,   -- running total, used for fairness
    priority        INTEGER NOT NULL DEFAULT 3,   -- lower number = assigned first (Prof=1,Assoc=2,Asst=3)
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS faculty_unavailability (
    id              SERIAL PRIMARY KEY,
    faculty_id      INTEGER NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
    date            DATE NOT NULL,
    session         VARCHAR(10) NOT NULL DEFAULT 'ALL', -- 'FN', 'AN', or 'ALL'
    reason          VARCHAR(200),
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(faculty_id, date, session)
);

-- Faculty's regular weekly teaching timetable (classes + labs).
-- Recurring by day-of-week, not tied to a specific date, since it repeats every week of the semester.
-- Used so invigilation duty is never assigned to a faculty member during a period
-- where they already have a class or lab scheduled.
CREATE TABLE IF NOT EXISTS faculty_timetable (
    id              SERIAL PRIMARY KEY,
    faculty_id      INTEGER NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
    day_of_week     VARCHAR(3) NOT NULL CHECK (day_of_week IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
    period          INTEGER NOT NULL CHECK (period BETWEEN 1 AND 12),
    subject_code    VARCHAR(150),  -- e.g. "3-1-CN-CSE-B" or "2-1-DBMS LAB-CSE-D"
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(faculty_id, day_of_week, period)
);

CREATE TABLE IF NOT EXISTS classrooms (
    id              SERIAL PRIMARY KEY,
    room_no         VARCHAR(50) NOT NULL UNIQUE,
    building        VARCHAR(100),
    capacity        INTEGER NOT NULL CHECK (capacity > 0),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_sessions (
    id              SERIAL PRIMARY KEY,
    exam_name       VARCHAR(150) NOT NULL,
    exam_date       DATE NOT NULL,
    session         VARCHAR(10) NOT NULL DEFAULT 'FN', -- 'FN' / 'AN' / custom label
    start_time      TIME,
    end_time        TIME,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(exam_name, exam_date, session)
);

-- Which rooms are used for a given exam session, and how many students sit in each
CREATE TABLE IF NOT EXISTS exam_room_allocation (
    id                  SERIAL PRIMARY KEY,
    exam_session_id     INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    classroom_id        INTEGER NOT NULL REFERENCES classrooms(id),
    students_count      INTEGER NOT NULL CHECK (students_count >= 0),
    faculty_required     INTEGER NOT NULL DEFAULT 1,
    created_at          TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(exam_session_id, classroom_id)
);

-- The actual generated/assigned duties
CREATE TABLE IF NOT EXISTS invigilation_duty (
    id                          SERIAL PRIMARY KEY,
    exam_room_allocation_id     INTEGER NOT NULL REFERENCES exam_room_allocation(id) ON DELETE CASCADE,
    faculty_id                  INTEGER NOT NULL REFERENCES faculty(id),
    status                      VARCHAR(20) NOT NULL DEFAULT 'assigned', -- assigned / swapped / cancelled
    notes                       VARCHAR(200),
    created_at                  TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(exam_room_allocation_id, faculty_id)
);

-- Simple key-value settings store (priority order, faculty-student ratio, etc.)
CREATE TABLE IF NOT EXISTS settings (
    key         VARCHAR(50) PRIMARY KEY,
    value       JSONB NOT NULL
);

-- session_periods maps an exam "session" label (FN/AN) to the timetable
-- periods it overlaps, so a faculty member with a class in any of those
-- periods on the matching weekday is excluded from that exam's duty pool.
INSERT INTO settings (key, value) VALUES
    ('priority_order', '["assistant_professor","associate_professor","professor"]'),
    ('students_per_faculty', '24'),
    ('session_periods', '{"FN": [1,2,3,4], "AN": [5,6,7,8]}')
ON CONFLICT (key) DO NOTHING;

-- Import batch log, for traceability of what was uploaded
CREATE TABLE IF NOT EXISTS import_log (
    id              SERIAL PRIMARY KEY,
    file_name       VARCHAR(255),
    import_type     VARCHAR(30), -- faculty / classrooms / exam_rooms / workload / timetable
    rows_imported   INTEGER,
    rows_skipped    INTEGER,
    uploaded_at     TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_duty_faculty ON invigilation_duty(faculty_id);
CREATE INDEX IF NOT EXISTS idx_allocation_session ON exam_room_allocation(exam_session_id);
CREATE INDEX IF NOT EXISTS idx_unavail_faculty_date ON faculty_unavailability(faculty_id, date);
CREATE INDEX IF NOT EXISTS idx_timetable_faculty_day ON faculty_timetable(faculty_id, day_of_week);

-- Session table for connect-pg-simple to store session data in production
CREATE TABLE IF NOT EXISTS session (
    sid         VARCHAR PRIMARY KEY NOT DEFERRABLE INITIALLY IMMEDIATE,
    sess        JSONB NOT NULL,
    expire      TIMESTAMP(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);
