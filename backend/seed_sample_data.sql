-- ============================================================
-- Sample Data Seed for Invigilation System
-- ============================================================

-- 10 Faculty members: mix of designations and departments
INSERT INTO faculty (name, designation, department, email, phone) VALUES
  ('Dr. A. Ramesh',        'professor',             'CSE',  'ramesh@college.edu',    '9000000001'),
  ('Dr. B. Lakshmi',       'professor',             'ECE',  'lakshmi@college.edu',   '9000000002'),
  ('Dr. C. Suresh',        'associate_professor',   'CSE',  'suresh@college.edu',    '9000000003'),
  ('Dr. D. Kavitha',       'associate_professor',   'ECE',  'kavitha@college.edu',   '9000000004'),
  ('Dr. E. Vijay',         'associate_professor',   'MECH', 'vijay@college.edu',     '9000000005'),
  ('Ms. F. Priya',         'assistant_professor',   'CSE',  'priya@college.edu',     '9000000006'),
  ('Mr. G. Kiran',         'assistant_professor',   'CSE',  'kiran@college.edu',     '9000000007'),
  ('Ms. H. Divya',         'assistant_professor',   'ECE',  'divya@college.edu',     '9000000008'),
  ('Mr. I. Arun',          'assistant_professor',   'MECH', 'arun@college.edu',      '9000000009'),
  ('Ms. J. Swetha',        'assistant_professor',   'CIVIL','swetha@college.edu',    '9000000010')
ON CONFLICT DO NOTHING;

-- 5 Classrooms
INSERT INTO classrooms (room_no, building, capacity) VALUES
  ('A101', 'Block A', 60),
  ('A102', 'Block A', 60),
  ('A103', 'Block A', 48),
  ('B201', 'Block B', 72),
  ('B202', 'Block B', 72)
ON CONFLICT (room_no) DO NOTHING;

-- 1 Exam session: Monday 2026-08-17 Forenoon
INSERT INTO exam_sessions (exam_name, exam_date, session)
VALUES ('Mid-1 CSE Sem 3', '2026-08-17', 'FN')
ON CONFLICT (exam_name, exam_date, session) DO NOTHING;

-- Room allocations for that session (student counts within room capacity)
WITH sess AS (SELECT id FROM exam_sessions WHERE exam_name='Mid-1 CSE Sem 3' AND exam_date='2026-08-17' AND session='FN'),
     r1 AS (SELECT id FROM classrooms WHERE room_no='A101'),
     r2 AS (SELECT id FROM classrooms WHERE room_no='A102'),
     r3 AS (SELECT id FROM classrooms WHERE room_no='A103'),
     r4 AS (SELECT id FROM classrooms WHERE room_no='B201'),
     r5 AS (SELECT id FROM classrooms WHERE room_no='B202')
INSERT INTO exam_room_allocation (exam_session_id, classroom_id, students_count, faculty_required)
VALUES
  ((SELECT id FROM sess), (SELECT id FROM r1), 48, 2),
  ((SELECT id FROM sess), (SELECT id FROM r2), 24, 1),
  ((SELECT id FROM sess), (SELECT id FROM r3), 36, 2),
  ((SELECT id FROM sess), (SELECT id FROM r4), 60, 3),
  ((SELECT id FROM sess), (SELECT id FROM r5), 48, 2)
ON CONFLICT (exam_session_id, classroom_id) DO NOTHING;

-- Some timetable entries for Mon (to test conflict exclusion):
-- Ms. F. Priya has class in period 1 on Monday -> excluded from FN duty
-- Mr. G. Kiran has class in period 2 on Monday -> excluded from FN duty
WITH fp AS (SELECT id FROM faculty WHERE name='Ms. F. Priya'),
     gk AS (SELECT id FROM faculty WHERE name='Mr. G. Kiran')
INSERT INTO faculty_timetable (faculty_id, day_of_week, period, subject_code)
VALUES
  ((SELECT id FROM fp), 'Mon', 1, 'CN-CSE-B'),
  ((SELECT id FROM gk), 'Mon', 2, 'DBMS-CSE-A')
ON CONFLICT (faculty_id, day_of_week, period) DO NOTHING;
