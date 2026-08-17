const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');
const engine  = require('../services/allocationEngine');
const exportService = require('../services/exportService');

router.use(requireAuth);

// ─── Session-level (room-free) endpoints ─────────────────────────────────────

/**
 * POST /api/allocation/session-preview
 * Body: { sessionIds: [id, ...], required_invigilators?: number }
 * Dry-run: returns proposed faculty list per session, nothing written.
 */
router.post('/session-preview', async (req, res) => {
    try {
        const { sessionIds, required_invigilators } = req.body;
        if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
            return res.status(400).json({ error: 'sessionIds array is required' });
        }
        const count = required_invigilators ? parseInt(required_invigilators, 10) : null;
        const result = await engine.previewSessionDuties(sessionIds.map(Number), count);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/**
 * POST /api/allocation/session-generate
 * Body: { sessionIds: [id, ...], required_invigilators?: number }
 * Finalizes duties and writes to session_duty table.
 */
router.post('/session-generate', async (req, res) => {
    try {
        const { sessionIds, required_invigilators } = req.body;
        if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
            return res.status(400).json({ error: 'sessionIds array is required' });
        }
        const count = required_invigilators ? parseInt(required_invigilators, 10) : null;
        const result = await engine.generateSessionDuties(sessionIds.map(Number), count);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/**
 * GET /api/allocation/session-duties?sessionIds=1,2
 * Returns saved session_duty rows for one or more sessions.
 */
router.get('/session-duties', async (req, res) => {
    try {
        const ids = String(req.query.sessionIds || '').split(',').map(Number).filter(Boolean);
        if (ids.length === 0) return res.status(400).json({ error: 'sessionIds query param required' });
        const rows = await engine.getSessionDuties(ids);
        res.json(rows);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/**
 * DELETE /api/allocation/session-duty/:dutyId
 * Cancels a single session duty.
 */
router.delete('/session-duty/:dutyId', async (req, res) => {
    try {
        const result = await engine.cancelSessionDuty(parseInt(req.params.dutyId, 10));
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/**
 * PUT /api/allocation/session-duty/:dutyId/reassign
 * Body: { faculty_id }
 */
router.put('/session-duty/:dutyId/reassign', async (req, res) => {
    const { faculty_id } = req.body;
    if (!faculty_id) return res.status(400).json({ error: 'faculty_id is required' });
    try {
        const result = await engine.swapSessionDuty(parseInt(req.params.dutyId, 10), faculty_id);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Returns eligible faculty for a session (for Reassign dropdown)
router.get('/available/:examSessionId', async (req, res) => {
    try {
        const result = await engine.getAvailableFacultyForSession(req.params.examSessionId);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Settings
router.get('/settings', async (req, res) => {
    const settings = await engine.getSettings();
    res.json(settings);
});

router.put('/settings', async (req, res) => {
    const { priorityOrder, studentsPerFaculty, sessionPeriods } = req.body;
    if (priorityOrder) {
        await db.query(`UPDATE settings SET value = $1 WHERE key = 'priority_order'`,
            [JSON.stringify(priorityOrder)]);
    }
    if (studentsPerFaculty) {
        await db.query(`UPDATE settings SET value = $1 WHERE key = 'students_per_faculty'`,
            [JSON.stringify(studentsPerFaculty)]);
    }
    if (sessionPeriods) {
        await db.query(
            `INSERT INTO settings (key, value) VALUES ('session_periods', $1)
             ON CONFLICT (key) DO UPDATE SET value = $1`,
            [JSON.stringify(sessionPeriods)]
        );
    }
    res.json(await engine.getSettings());
});

// Check timetable conflict for manual reassign warning
router.get('/conflict/:examSessionId/:facultyId', async (req, res) => {
    try {
        const result = await engine.checkTimetableConflict(req.params.facultyId, req.params.examSessionId);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Export session duty chart
router.get('/export/session/excel', async (req, res) => {
    try {
        const ids = String(req.query.sessionIds || '').split(',').map(Number).filter(Boolean);
        if (ids.length === 0) return res.status(400).json({ error: 'sessionIds required' });
        const buffer = await exportService.generateSessionDutyChartExcel(ids);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="duty-chart-${ids.join('-')}.xlsx"`);
        res.send(buffer);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/export/session/pdf', async (req, res) => {
    try {
        const ids = String(req.query.sessionIds || '').split(',').map(Number).filter(Boolean);
        if (ids.length === 0) return res.status(400).json({ error: 'sessionIds required' });
        const buffer = await exportService.generateSessionDutyChartPdf(ids);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="duty-chart-${ids.join('-')}.pdf"`);
        res.send(buffer);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
