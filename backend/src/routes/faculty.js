const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// List all faculty
router.get('/', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM faculty WHERE user_id = $1 ORDER BY serial_no DESC NULLS LAST, name', [req.userId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create faculty
router.post('/', async (req, res) => {
    const { name, designation, department, email, phone, contact, room_no, duty_count, serial_no, shortcuts } = req.body;
    if (!name || !designation) return res.status(400).json({ error: 'name and designation are required' });
    try {
        const { rows } = await db.query(
            `INSERT INTO faculty (user_id, name, designation, department, email, phone, contact, room_no, duty_count, serial_no, shortcuts)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [req.userId, name, designation, department || null, email || null, phone || null, contact || phone || null, room_no || null,
             parseInt(duty_count, 10) || 0,
             serial_no !== undefined && serial_no !== null && serial_no !== '' ? parseInt(serial_no, 10) || null : null,
             shortcuts || null]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Update faculty
router.put('/:id', async (req, res) => {
    const { name, designation, department, email, phone, contact, room_no, is_active, duty_count, priority, serial_no, shortcuts } = req.body;
    const hasSerialNo = Object.prototype.hasOwnProperty.call(req.body, 'serial_no');
    try {
        const { rows } = await db.query(
            `UPDATE faculty SET
                name        = COALESCE($1, name),
                designation = COALESCE($2, designation),
                department  = COALESCE($3, department),
                email       = COALESCE($4, email),
                phone       = COALESCE($5, phone),
                contact     = COALESCE($6, contact),
                room_no     = COALESCE($7, room_no),
                is_active   = COALESCE($8, is_active),
                duty_count  = COALESCE($9, duty_count),
                priority    = COALESCE($10, priority),
                serial_no   = CASE WHEN $11 THEN $12 ELSE serial_no END,
                shortcuts   = COALESCE($13, shortcuts),
                updated_at  = now()
             WHERE id = $14 AND user_id = $15 RETURNING *`,
            [name, designation, department, email, phone, contact, room_no, is_active, duty_count,
             priority !== undefined ? parseInt(priority, 10) : null,
             hasSerialNo,
             hasSerialNo ? (serial_no !== null && serial_no !== '' ? parseInt(serial_no, 10) : null) : null,
             shortcuts !== undefined ? (shortcuts || null) : null,
             req.params.id, req.userId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Faculty not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Delete faculty
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM faculty WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
        res.json({ success: true });
    } catch (err) {
        if (err.code === '23503') {
            return res.status(409).json({
                error: 'Cannot delete: this faculty member has invigilation duties assigned. Cancel their duties first, then delete.'
            });
        }
        res.status(500).json({ error: err.message });
    }
});

// Update duty count directly (avoids COALESCE(0) ambiguity with the generic PUT)
router.patch('/:id/duty-count', async (req, res) => {
    const count = parseInt(req.body.duty_count, 10);
    if (isNaN(count) || count < 0) return res.status(400).json({ error: 'duty_count must be a non-negative integer' });
    try {
        const { rows } = await db.query(
            `UPDATE faculty SET duty_count = $1, updated_at = now() WHERE id = $2 RETURNING *`,
            [count, req.params.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Faculty not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Mark unavailability (date / session / reason)
router.post('/:id/unavailability', async (req, res) => {
    const { date, session, reason } = req.body;
    if (!date) return res.status(400).json({ error: 'date is required' });
    try {
        const { rows } = await db.query(
            `INSERT INTO faculty_unavailability (faculty_id, date, session, reason)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (faculty_id, date, session) DO UPDATE SET reason = EXCLUDED.reason
             RETURNING *`,
            [req.params.id, date, session || 'ALL', reason || null]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/:id/unavailability', async (req, res) => {
    const { rows } = await db.query(
        'SELECT * FROM faculty_unavailability WHERE faculty_id = $1 ORDER BY date',
        [req.params.id]
    );
    res.json(rows);
});

router.delete('/unavailability/:entryId', async (req, res) => {
    try {
        await db.query('DELETE FROM faculty_unavailability WHERE id = $1', [req.params.entryId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// View a faculty member's weekly timetable (classes/labs), as imported
router.get('/:id/timetable', async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT day_of_week, period, subject_code FROM faculty_timetable
             WHERE faculty_id = $1 ORDER BY
                CASE day_of_week WHEN 'Mon' THEN 1 WHEN 'Tue' THEN 2 WHEN 'Wed' THEN 3
                    WHEN 'Thu' THEN 4 WHEN 'Fri' THEN 5 WHEN 'Sat' THEN 6 ELSE 7 END,
                period`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
