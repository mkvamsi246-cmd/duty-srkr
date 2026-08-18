-- ============================================================
-- Invigilation Duty Allocation System — Complete Database Schema
-- PostgreSQL
-- ============================================================

-- 1. Users table for multi-tenant department isolation
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(50) UNIQUE NOT NULL,
    password        VARCHAR(255) NOT NULL,
    department_name VARCHAR(100),
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

-- Seed default department accounts
INSERT INTO users (username, password, department_name) VALUES
    ('mech-srkr',  'mech@123',  'Mechanical Engineering'),
    ('CSE-srkr',   'cse@123',   'Computer Science & Engineering'),
    ('civil-srkr', 'civil@123', 'Civil Engineering'),
    ('eee-srkr',   'eee@123',   'Electrical & Electronics Engineering'),
    ('ece-srkr',   'ece@123',   'Electronics & Communication Engineering'),
    ('it-srkr',    'it@123',    'Information Technology')
ON CONFLICT (username) DO NOTHING;

-- 2. Faculty table
CREATE TABLE IF NOT EXISTS faculty (
    id              SERIAL PRIMARY KEY,
    serial_no       INTEGER,
    name            VARCHAR(150) NOT NULL,
    shortcuts       VARCHAR(200),
    designation     VARCHAR(30) NOT NULL
                        CHECK (designation IN ('professor','associate_professor','assistant_professor')),
    department      VARCHAR(100),
    email           VARCHAR(150),
    phone           VARCHAR(20),
    contact         VARCHAR(50),
    room_no         VARCHAR(50),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    duty_count      INTEGER NOT NULL DEFAULT 0,   -- running total, used for fairness
    priority        INTEGER NOT NULL DEFAULT 3,   -- lower number = assigned first (Prof=1,Assoc=2,Asst=3)
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

-- 3. Faculty unavailability overrides
CREATE TABLE IF NOT EXISTS faculty_unavailability (
    id              SERIAL PRIMARY KEY,
    faculty_id      INTEGER NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
    date            DATE NOT NULL,
    session         VARCHAR(10) NOT NULL DEFAULT 'ALL', -- 'FN', 'AN', or 'ALL'
    reason          VARCHAR(200),
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(faculty_id, date, session)
);

-- 4. Faculty weekly teaching timetable
CREATE TABLE IF NOT EXISTS faculty_timetable (
    id              SERIAL PRIMARY KEY,
    faculty_id      INTEGER NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
    day_of_week     VARCHAR(3) NOT NULL CHECK (day_of_week IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
    period          INTEGER NOT NULL CHECK (period BETWEEN 1 AND 12),
    subject_code    VARCHAR(150),
    year_sem        VARCHAR(10),
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(faculty_id, day_of_week, period)
);

-- 5. Classrooms table
CREATE TABLE IF NOT EXISTS classrooms (
    id              SERIAL PRIMARY KEY,
    room_no         VARCHAR(50) NOT NULL UNIQUE,
    building        VARCHAR(100),
    capacity        INTEGER NOT NULL CHECK (capacity > 0),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

-- 6. Exam sessions table
CREATE TABLE IF NOT EXISTS exam_sessions (
    id                      SERIAL PRIMARY KEY,
    exam_name               VARCHAR(150) NOT NULL,
    course                  VARCHAR(50),
    exam_date               DATE NOT NULL,
    session                 VARCHAR(10) NOT NULL DEFAULT 'FN', -- 'FN' / 'AN' / custom label
    start_time              TIME,
    end_time                TIME,
    required_invigilators   INTEGER,
    year_sem                VARCHAR(10),
    user_id                 INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at              TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT exam_sessions_unique_session_key UNIQUE(user_id, exam_name, course, exam_date, session, year_sem)
);

-- 7. Exam room allocations
CREATE TABLE IF NOT EXISTS exam_room_allocation (
    id                  SERIAL PRIMARY KEY,
    exam_session_id     INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    classroom_id        INTEGER NOT NULL REFERENCES classrooms(id),
    students_count      INTEGER NOT NULL CHECK (students_count >= 0),
    faculty_required     INTEGER NOT NULL DEFAULT 1,
    created_at          TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(exam_session_id, classroom_id)
);

-- 8. Invigilation duties (room-based)
CREATE TABLE IF NOT EXISTS invigilation_duty (
    id                          SERIAL PRIMARY KEY,
    exam_room_allocation_id     INTEGER NOT NULL REFERENCES exam_room_allocation(id) ON DELETE CASCADE,
    faculty_id                  INTEGER NOT NULL REFERENCES faculty(id),
    status                      VARCHAR(20) NOT NULL DEFAULT 'assigned', -- assigned / swapped / cancelled
    notes                       VARCHAR(200),
    created_at                  TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(exam_room_allocation_id, faculty_id)
);

-- 9. Session duties (session-level / room-free)
CREATE TABLE IF NOT EXISTS session_duty (
    id              SERIAL PRIMARY KEY,
    exam_session_id INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    faculty_id      INTEGER NOT NULL REFERENCES faculty(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'assigned',  -- assigned / swapped / cancelled
    notes           VARCHAR(200),
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(exam_session_id, faculty_id)
);

-- 10. Settings key-value store
CREATE TABLE IF NOT EXISTS settings (
    key         VARCHAR(50) PRIMARY KEY,
    value       JSONB NOT NULL,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO settings (key, value) VALUES
    ('priority_order', '["assistant_professor","associate_professor","professor"]'),
    ('students_per_faculty', '24'),
    ('session_periods', '{"FN": [1,2,3,4], "AN": [5,6,7,8]}')
ON CONFLICT (key) DO NOTHING;

-- 11. Import batch log
CREATE TABLE IF NOT EXISTS import_log (
    id              SERIAL PRIMARY KEY,
    file_name       VARCHAR(255),
    import_type     VARCHAR(30),
    rows_imported   INTEGER,
    rows_skipped    INTEGER,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    uploaded_at     TIMESTAMP NOT NULL DEFAULT now()
);

-- 12. Idempotent ALTER TABLE statements to upgrade pre-existing database instances safely
ALTER TABLE faculty ADD COLUMN IF NOT EXISTS serial_no INTEGER;
ALTER TABLE faculty ADD COLUMN IF NOT EXISTS shortcuts VARCHAR(200);
ALTER TABLE faculty ADD COLUMN IF NOT EXISTS contact VARCHAR(50);
ALTER TABLE faculty ADD COLUMN IF NOT EXISTS room_no VARCHAR(50);
ALTER TABLE faculty ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS course VARCHAR(50);
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS required_invigilators INTEGER;
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS year_sem VARCHAR(10);
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE faculty_timetable ADD COLUMN IF NOT EXISTS year_sem VARCHAR(10);

ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE import_log ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE session_duty ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- 13. Indexes for fast lookup and query optimization
CREATE UNIQUE INDEX IF NOT EXISTS idx_faculty_serial_no ON faculty(serial_no) WHERE serial_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_timetable_year_sem ON faculty_timetable(year_sem);
CREATE INDEX IF NOT EXISTS idx_session_duty_session ON session_duty(exam_session_id);
CREATE INDEX IF NOT EXISTS idx_session_duty_faculty ON session_duty(faculty_id);

CREATE INDEX IF NOT EXISTS idx_duty_faculty ON invigilation_duty(faculty_id);
CREATE INDEX IF NOT EXISTS idx_allocation_session ON exam_room_allocation(exam_session_id);
CREATE INDEX IF NOT EXISTS idx_unavail_faculty_date ON faculty_unavailability(faculty_id, date);
CREATE INDEX IF NOT EXISTS idx_timetable_faculty_day ON faculty_timetable(faculty_id, day_of_week);

-- 14. Session storage table for express-session (connect-pg-simple)
CREATE TABLE IF NOT EXISTS session (
    sid         VARCHAR PRIMARY KEY NOT DEFERRABLE INITIALLY IMMEDIATE,
    sess        JSONB NOT NULL,
    expire      TIMESTAMP(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);
