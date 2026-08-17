const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { parseImportFile } = require('../services/importParser');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

router.use(requireAuth);

/**
 * POST /api/upload/:importType
 * importType: faculty | classrooms | exam_rooms | workload
 * form field name: "file"
 */
router.post('/:importType', upload.single('file'), async (req, res) => {
    const { importType } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    let parsed;
    try {
        parsed = await parseImportFile({
            buffer: req.file.buffer,
            mimetype: req.file.mimetype,
            originalname: req.file.originalname,
            importType,
        });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }

    const { records, skipped } = parsed;
    let imported = 0;

    try {
        if (importType === 'faculty') {
            for (const r of records) {
                if (r.sno !== null && r.sno !== undefined) {
                    const existing = await db.query(
                        `SELECT id FROM faculty WHERE serial_no = $1 AND user_id = $2`,
                        [r.sno, req.userId]
                    );
                    const contactVal = r.contact || null;
                    const roomNoVal  = r.roomNo || null;
                    if (existing.rows.length > 0) {
                        await db.query(
                            `UPDATE faculty SET
                                name        = $1,
                                designation = $2,
                                department  = COALESCE($3, department),
                                shortcuts   = $4,
                                email       = COALESCE($5, email),
                                contact     = COALESCE($6, contact),
                                room_no     = COALESCE($7, room_no),
                                updated_at  = now()
                             WHERE id = $8 AND user_id = $9`,
                            [r.name, r.designation, r.department, r.shortcuts, r.email, contactVal, roomNoVal, existing.rows[0].id, req.userId]
                        );
                    } else {
                        await db.query(
                            `INSERT INTO faculty (user_id, serial_no, name, designation, department, shortcuts, email, contact, room_no)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                            [req.userId, r.sno, r.name, r.designation, r.department, r.shortcuts, r.email, contactVal, roomNoVal]
                        );
                    }
                } else {
                    await db.query(
                        `INSERT INTO faculty (user_id, name, designation, department, shortcuts, email, phone)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)
                         ON CONFLICT DO NOTHING`,
                        [req.userId, r.name, r.designation, r.department, r.shortcuts, r.email, r.phone]
                    );
                }
                imported++;
            }
        } else if (importType === 'classrooms') {
            for (const r of records) {
                const existing = await db.query('SELECT id FROM classrooms WHERE room_no = $1 AND user_id = $2', [r.roomNo, req.userId]);
                if (existing.rows.length > 0) {
                    await db.query(
                        `UPDATE classrooms SET capacity = $1, building = COALESCE($2, building), updated_at = now() WHERE id = $3 AND user_id = $4`,
                        [r.capacity, r.building, existing.rows[0].id, req.userId]
                    );
                } else {
                    await db.query(
                        `INSERT INTO classrooms (user_id, room_no, building, capacity) VALUES ($1, $2, $3, $4)`,
                        [req.userId, r.roomNo, r.building, r.capacity]
                    );
                }
                imported++;
            }
        } else if (importType === 'exam_rooms') {
            for (const r of records) {
                const sessionRes = await db.query(
                    `INSERT INTO exam_sessions
                         (user_id, exam_name, exam_date, session, year_sem, required_invigilators)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (exam_name, exam_date, session) DO UPDATE SET
                         exam_name             = EXCLUDED.exam_name,
                         year_sem              = COALESCE(EXCLUDED.year_sem, exam_sessions.year_sem),
                         required_invigilators = COALESCE(EXCLUDED.required_invigilators, exam_sessions.required_invigilators)
                     RETURNING id`,
                    [req.userId, r.examName, r.date, r.session, r.yearSem || null, r.requiredInvigilators || null]
                );
                const examSessionId = sessionRes.rows[0].id;

                const classroomRes = await db.query('SELECT id FROM classrooms WHERE room_no = $1 AND user_id = $2', [r.roomNo, req.userId]);
                if (classroomRes.rows.length === 0) { continue; }
                const classroomId = classroomRes.rows[0].id;
                const facultyRequired = Math.max(1, Math.ceil(r.studentsCount / 24));

                await db.query(
                    `INSERT INTO exam_room_allocation (exam_session_id, classroom_id, students_count, faculty_required)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (exam_session_id, classroom_id)
                     DO UPDATE SET students_count = EXCLUDED.students_count, faculty_required = EXCLUDED.faculty_required`,
                    [examSessionId, classroomId, r.studentsCount, facultyRequired]
                );
                imported++;
            }
            const sessionConflicts = parsed.sessionConflicts || 0;
            if (sessionConflicts > 0) {
                return res.json({
                    imported, skipped, total: records.length,
                    warning: `${sessionConflicts} rows had conflicting year_sem or required_invigilators values for the same exam session — first-row values were used.`,
                });
            }
        } else if (importType === 'exam_sessions') {
            for (const r of records) {
                const existing = await db.query(
                    'SELECT id FROM exam_sessions WHERE exam_name = $1 AND exam_date = $2 AND session = $3 AND user_id = $4',
                    [r.examName, r.date, r.session, req.userId]
                );
                if (existing.rows.length > 0) {
                    await db.query(
                        `UPDATE exam_sessions SET
                            year_sem = COALESCE($1, year_sem),
                            required_invigilators = COALESCE($2, required_invigilators),
                            start_time = COALESCE($3, start_time),
                            end_time = COALESCE($4, end_time)
                         WHERE id = $5 AND user_id = $6`,
                        [r.yearSem || null, r.requiredInvigilators || null, r.startTime || null, r.endTime || null, existing.rows[0].id, req.userId]
                    );
                } else {
                    await db.query(
                        `INSERT INTO exam_sessions
                             (user_id, exam_name, exam_date, session, year_sem, required_invigilators, start_time, end_time)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [req.userId, r.examName, r.date, r.session, r.yearSem || null, r.requiredInvigilators || null, r.startTime || null, r.endTime || null]
                    );
                }
                imported++;
            }
        } else if (importType === 'workload') {
            for (const r of records) {
                await db.query(
                    `UPDATE faculty SET duty_count = $1 WHERE name = $2 AND user_id = $3`,
                    [r.workloadTotal, r.name, req.userId]
                );
                imported++;
            }
        } else if (importType === 'timetable') {
            const facultyRes = await db.query('SELECT id, name FROM faculty WHERE user_id = $1', [req.userId]);
            const nameToId = new Map(facultyRes.rows.map((f) => [f.name.trim().toLowerCase(), f.id]));

            const matchedFacultyIds = new Set();
            for (const r of records) {
                const facultyId = nameToId.get(r.facultyName.trim().toLowerCase());
                if (facultyId) matchedFacultyIds.add(facultyId);
            }
            for (const facultyId of matchedFacultyIds) {
                await db.query('DELETE FROM faculty_timetable WHERE faculty_id = $1', [facultyId]);
            }

            let unmatchedNames = 0;
            for (const r of records) {
                const facultyId = nameToId.get(r.facultyName.trim().toLowerCase());
                if (!facultyId) { unmatchedNames++; continue; }
                await db.query(
                    `INSERT INTO faculty_timetable (faculty_id, day_of_week, period, subject_code, year_sem)
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (faculty_id, day_of_week, period)
                     DO UPDATE SET subject_code = EXCLUDED.subject_code, year_sem = EXCLUDED.year_sem`,
                    [facultyId, r.dayOfWeek, r.period, r.subjectCode, r.yearSem || null]
                );
                imported++;
            }
            if (unmatchedNames > 0) {
                return res.json({
                    imported, skipped: skipped + unmatchedNames, total: records.length,
                    warning: `${unmatchedNames} timetable entries didn't match any existing faculty name â€” import Faculty first, then re-upload the timetable.`,
                });
            }
        } else {
            return res.status(400).json({ error: `Unknown importType: ${importType}` });
        }

        await db.query(
            `INSERT INTO import_log (file_name, import_type, rows_imported, rows_skipped)
             VALUES ($1, $2, $3, $4)`,
            [req.file.originalname, importType, imported, skipped]
        );

        res.json({ imported, skipped, total: records.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

