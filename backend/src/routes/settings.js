const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const engine = require('../services/allocationEngine');

router.use(requireAuth);

// GET settings for active user
router.get('/', async (req, res) => {
    try {
        const settings = await engine.getSettings();
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPDATE settings for active user
router.put('/', async (req, res) => {
    try {
        const { priorityOrder, studentsPerFaculty, sessionPeriods } = req.body;
        if (priorityOrder) {
            await db.query(
                `INSERT INTO settings (user_id, key, value) VALUES ($1, 'priority_order', $2)
                 ON CONFLICT (key) DO UPDATE SET value = $2`,
                [req.userId, JSON.stringify(priorityOrder)]
            );
        }
        if (studentsPerFaculty) {
            await db.query(
                `INSERT INTO settings (user_id, key, value) VALUES ($1, 'students_per_faculty', $2)
                 ON CONFLICT (key) DO UPDATE SET value = $2`,
                [req.userId, JSON.stringify(studentsPerFaculty)]
            );
        }
        if (sessionPeriods) {
            await db.query(
                `INSERT INTO settings (user_id, key, value) VALUES ($1, 'session_periods', $2)
                 ON CONFLICT (key) DO UPDATE SET value = $2`,
                [req.userId, JSON.stringify(sessionPeriods)]
            );
        }
        res.json(await engine.getSettings());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Clear all department data for active user workspace
router.post('/clear-data', async (req, res) => {
    try {
        const userId = req.userId;

        // Delete all session duties linked to exam sessions of this user
        await db.query(
            `DELETE FROM session_duty WHERE exam_session_id IN (SELECT id FROM exam_sessions WHERE user_id = $1)`,
            [userId]
        );

        // Delete room allocations linked to exam sessions of this user
        await db.query(
            `DELETE FROM exam_room_allocation WHERE exam_session_id IN (SELECT id FROM exam_sessions WHERE user_id = $1)`,
            [userId]
        );

        // Delete timetables for faculty of this user
        await db.query(
            `DELETE FROM faculty_timetable WHERE faculty_id IN (SELECT id FROM faculty WHERE user_id = $1)`,
            [userId]
        );

        // Delete unavailability records for faculty of this user
        await db.query(
            `DELETE FROM faculty_unavailability WHERE faculty_id IN (SELECT id FROM faculty WHERE user_id = $1)`,
            [userId]
        );

        // Delete exam sessions for this user
        await db.query(`DELETE FROM exam_sessions WHERE user_id = $1`, [userId]);

        // Delete classrooms for this user
        await db.query(`DELETE FROM classrooms WHERE user_id = $1`, [userId]);

        // Delete faculty for this user
        await db.query(`DELETE FROM faculty WHERE user_id = $1`, [userId]);

        // Delete import log for this user
        await db.query(`DELETE FROM import_log WHERE user_id = $1`, [userId]);

        res.json({ success: true, message: 'All data for your department has been successfully cleared.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
