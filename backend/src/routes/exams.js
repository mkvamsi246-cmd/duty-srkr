const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { VALID_YEAR_SEMS } = require('../utils/yearSem');

router.use(requireAuth);

// List exam sessions
router.get('/', async (req, res) => {
    try {
        const { rows } = await db.query(
            'SELECT * FROM exam_sessions WHERE user_id = $1 ORDER BY exam_date DESC, session',
            [req.userId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/grouped', async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT id, exam_name, exam_date, session, year_sem, required_invigilators,
                    start_time, end_time
             FROM exam_sessions
             WHERE user_id = $1
             ORDER BY exam_date DESC, exam_name, session`,
            [req.userId]
        );
        const map = new Map();
        for (const r of rows) {
            const key = `${r.exam_name}|||${String(r.exam_date).slice(0,10)}|||${r.year_sem || ''}`;
            if (!map.has(key)) {
                map.set(key, {
                    examName: r.exam_name,
                    examDate: String(r.exam_date).slice(0, 10),
                    yearSem:  r.year_sem,
                    sessions: [],
                });
            }
            map.get(key).sessions.push({
                id:                   r.id,
                session:              r.session,
                requiredInvigilators: r.required_invigilators,
                startTime:            r.start_time,
                endTime:              r.end_time,
            });
        }
        res.json([...map.values()]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create exam session
router.post('/', async (req, res) => {
    const { exam_name, exam_date, session, start_time, end_time, year_sem, required_invigilators } = req.body;
    if (!exam_name || !exam_date) {
        return res.status(400).json({ error: 'exam_name and exam_date are required' });
    }
    if (!year_sem || !VALID_YEAR_SEMS.includes(String(year_sem).trim())) {
        return res.status(400).json({
            error: `year_sem is required and must be one of: ${VALID_YEAR_SEMS.join(', ')}`,
        });
    }
    const reqInvig = required_invigilators != null
        ? (parseInt(required_invigilators, 10) || null)
        : null;

    try {
        const { rows } = await db.query(
            `INSERT INTO exam_sessions
                 (user_id, exam_name, exam_date, session, start_time, end_time, year_sem, required_invigilators)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                req.userId,
                exam_name,
                exam_date,
                session || 'FN',
                start_time || null,
                end_time   || null,
                year_sem.trim(),
                reqInvig,
            ]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Update required_invigilators (or year_sem) on an existing session
router.patch('/:id', async (req, res) => {
    const { required_invigilators, year_sem } = req.body;
    const updates = [];
    const values = [];

    if (required_invigilators !== undefined) {
        values.push(required_invigilators != null ? (parseInt(required_invigilators, 10) || null) : null);
        updates.push(`required_invigilators = $${values.length}`);
    }
    if (year_sem !== undefined) {
        if (!VALID_YEAR_SEMS.includes(String(year_sem).trim())) {
            return res.status(400).json({ error: `year_sem must be one of: ${VALID_YEAR_SEMS.join(', ')}` });
        }
        values.push(year_sem.trim());
        updates.push(`year_sem = $${values.length}`);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    values.push(req.params.id);
    values.push(req.userId);
    try {
        const { rows } = await db.query(
            `UPDATE exam_sessions SET ${updates.join(', ')} WHERE id = $${values.length - 1} AND user_id = $${values.length} RETURNING *`,
            values
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Exam session not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM exam_sessions WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Room allocations within a session ---

router.get('/:id/rooms', async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT era.*, c.room_no, c.capacity
             FROM exam_room_allocation era
             JOIN classrooms c ON c.id = era.classroom_id
             WHERE era.exam_session_id = $1 ORDER BY c.room_no`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:id/rooms', async (req, res) => {
    const { classroom_id, students_count } = req.body;
    if (!classroom_id || students_count === undefined) {
        return res.status(400).json({ error: 'classroom_id and students_count are required' });
    }
    const facultyRequired = Math.max(1, Math.ceil(students_count / 24));
    try {
        const { rows } = await db.query(
            `INSERT INTO exam_room_allocation (exam_session_id, classroom_id, students_count, faculty_required)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (exam_session_id, classroom_id)
             DO UPDATE SET students_count = EXCLUDED.students_count, faculty_required = EXCLUDED.faculty_required
             RETURNING *`,
            [req.params.id, classroom_id, students_count, facultyRequired]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.delete('/rooms/:allocationId', async (req, res) => {
    try {
        await db.query('DELETE FROM exam_room_allocation WHERE id = $1', [req.params.allocationId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Duty chart (assigned invigilators) for a session ---

router.get('/:id/duties', async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT d.id AS duty_id, d.status, era.id AS allocation_id, era.students_count,
                    era.faculty_required, c.room_no, f.id AS faculty_id, f.name AS faculty_name,
                    f.designation
             FROM exam_room_allocation era
             LEFT JOIN invigilation_duty d ON d.exam_room_allocation_id = era.id
             LEFT JOIN faculty f ON f.id = d.faculty_id
             JOIN classrooms c ON c.id = era.classroom_id
             WHERE era.exam_session_id = $1
             ORDER BY c.room_no, f.name`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

