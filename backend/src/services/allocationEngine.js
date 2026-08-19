/**
 * Allocation Engine — Session-Level (Room-Free) Mode
 * ---------------------------------------------------
 * Assigns invigilators to an exam session WITHOUT needing rooms to be
 * pre-allocated. The coordinator simply enters how many faculty are
 * needed and the engine picks them from the eligible pool.
 *
 * Eligibility rules (unchanged):
 *  1. Faculty must be active and not marked unavailable for that date/session.
 *  2. Faculty must have no class/lab during the session's timetable periods.
 *  3. Faculty who teach a year still running normal classes on that day/session
 *     are excluded with a distinct reason tag.
 *
 * Selection order:
 *  - Eligible faculty sorted by serial_no DESC (highest S.No picked first;
 *    NULL serial_no go last, sorted by name).
 *  - Consecutive-day rule: faculty who had a duty on the immediately preceding
 *    calendar day are pushed to the back of the pool (used only if no one else
 *    is available).
 *  Priority tiers and duty_count are no longer used for ordering.
 */

const db = require('../db');
const { extractYearSem, VALID_YEAR_SEMS } = require('../utils/yearSem');

const DAY_ABBREVIATIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

async function getSettings() {
    const { rows } = await db.query('SELECT key, value FROM settings');
    const s = {};
    for (const r of rows) s[r.key] = r.value;
    return {
        priorityOrder: s.priority_order || ['assistant_professor', 'associate_professor', 'professor'],
        studentsPerFaculty: Number(s.students_per_faculty) || 24,
        sessionPeriods:   s.session_periods   || { FN: [1, 2, 3, 4], AN: [5, 6, 7, 8] },
    };
}

function dayOfWeekAbbrev(dateStr) {
    const s = dateStr instanceof Date
        ? dateStr.toISOString().slice(0, 10)
        : String(dateStr).slice(0, 10);
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return DAY_ABBREVIATIONS[dt.getUTCDay()];
}

/** year_sems NOT sitting an exam on this date+session → those years are still teaching */
async function getStillInClassYears(examDate, session) {
    const { rows } = await db.query(
        `SELECT DISTINCT year_sem FROM exam_sessions
         WHERE exam_date = $1 AND session = $2 AND year_sem IS NOT NULL`,
        [examDate, session]
    );
    const examYearSems = new Set(rows.map(r => r.year_sem));
    return VALID_YEAR_SEMS.filter(ys => !examYearSems.has(ys));
}

function getCalendarDayDiff(dateStr1, dateStr2) {
    const [y1, m1, d1] = dateStr1.split('-').map(Number);
    const [y2, m2, d2] = dateStr2.split('-').map(Number);
    const utc1 = Date.UTC(y1, m1 - 1, d1);
    const utc2 = Date.UTC(y2, m2 - 1, d2);
    return Math.abs(Math.round((utc2 - utc1) / (1000 * 60 * 60 * 24)));
}

/**
 * Returns a map of facultyId -> Set of assigned date strings (YYYY-MM-DD)
 * for dates around examDate (within +/- 3 days).
 */
async function getAssignedDutyDatesMap(examDate) {
    const s = examDate instanceof Date
        ? examDate.toISOString().slice(0, 10)
        : String(examDate).slice(0, 10);
    const { rows } = await db.query(
        `SELECT sd.faculty_id, es.exam_date::text AS duty_date
         FROM session_duty sd
         JOIN exam_sessions es ON es.id = sd.exam_session_id
         WHERE es.exam_date >= ($1::date - INTERVAL '3 days')
           AND es.exam_date <= ($1::date + INTERVAL '3 days')
         UNION
         SELECT idu.faculty_id, es.exam_date::text AS duty_date
         FROM invigilation_duty idu
         JOIN exam_room_allocation era ON era.id = idu.exam_room_allocation_id
         JOIN exam_sessions es ON es.id = era.exam_session_id
         WHERE es.exam_date >= ($1::date - INTERVAL '3 days')
           AND es.exam_date <= ($1::date + INTERVAL '3 days')`,
        [s]
    );
    const map = new Map();
    for (const r of rows) {
        const fid = r.faculty_id;
        const dStr = String(r.duty_date).slice(0, 10);
        if (!map.has(fid)) map.set(fid, new Set());
        map.get(fid).add(dStr);
    }
    return map;
}

/**
 * Returns the eligible faculty pool for a date+session, ordered for selection.
 *
 * Filtering layers:
 *   1. SQL: inactive / unavailable / direct timetable conflict
 *   2. JS:  "still-in-class year" conflict
 *
 * Tiered Ordering:
 *   - Tier 1: Fresh faculty (NO duty on same date, NO duty on consecutive date)
 *   - Tier 2: Consecutive-day fallback (NO duty on same date, BUT has duty on D-1 or D+1)
 *   - Tier 3: Same-day fallback (ALREADY has duty on same date)
 *
 * Within each tier:
 *   - Primary: serial_no DESC NULLS LAST
 *   - Secondary: duty_count ASC (lowest total duties first)
 *   - Tiebreak: name ASC
 */
async function getEligibleFacultyPool(examDate, session, sessionPeriods, batchAssignedDatesMap = null) {
    const dayAbbrev       = dayOfWeekAbbrev(examDate);
    const isWeekend       = (dayAbbrev === 'Sat' || dayAbbrev === 'Sun');
    const relevantPeriods = sessionPeriods[session] || [];
    const examDateStr     = examDate instanceof Date
        ? examDate.toISOString().slice(0, 10)
        : String(examDate).slice(0, 10);

    const { rows } = await db.query(
        `SELECT f.id, f.name, f.designation, f.duty_count,
                COALESCE(f.sat_duty_count, 0) AS sat_duty_count,
                COALESCE(f.sun_duty_count, 0) AS sun_duty_count,
                f.serial_no, f.shortcuts,
                COALESCE(cf.conflict_count, 0) AS conflict_count
         FROM faculty f
         LEFT JOIN (
             SELECT faculty_id, COUNT(*) AS conflict_count
             FROM faculty_timetable
             WHERE day_of_week = $1 AND period = ANY($2::int[]) GROUP BY faculty_id
         ) cf ON cf.faculty_id = f.id
         WHERE f.is_active = true
           AND f.id NOT IN (
               SELECT faculty_id FROM faculty_unavailability
               WHERE date = $3 AND (session = $4 OR session = 'ALL')
           )
         ORDER BY f.serial_no DESC NULLS LAST, f.duty_count ASC, f.name ASC`,
        [dayAbbrev, relevantPeriods, examDateStr, session]
    );

    // Layer 1: hard exclude — class during exam periods
    const afterConflict = rows.filter(r => Number(r.conflict_count) === 0);

    // Layer 2: still-in-class year exclusion
    const stillInClassYears = await getStillInClassYears(examDate, session);
    let eligible = [];

    if (stillInClassYears.length === 0 || afterConflict.length === 0) {
        eligible = afterConflict;
    } else {
        const ids = afterConflict.map(f => f.id);
        const { rows: stillRows } = await db.query(
            `SELECT DISTINCT faculty_id, year_sem FROM faculty_timetable
             WHERE faculty_id = ANY($1::int[])
               AND day_of_week = $2 AND period = ANY($3::int[])
               AND year_sem = ANY($4::text[])`,
            [ids, dayAbbrev, relevantPeriods, stillInClassYears]
        );
        const blocked = new Map();
        for (const r of stillRows) {
            if (!blocked.has(r.faculty_id)) blocked.set(r.faculty_id, r.year_sem);
        }
        for (const f of afterConflict) {
            if (!blocked.has(f.id)) eligible.push(f);
        }
    }

    // Layer 3: Constraint tiering (Same-day, Next-day, and Weekend avoidance)
    const dbAssignedDatesMap = await getAssignedDutyDatesMap(examDate);

    const tier1 = []; // Fresh: no same-day, no consecutive-day / recent weekend duty
    const tier2 = []; // Fallback 1: no same-day, but has consecutive-day or recent weekend (within 7 days) duty
    const tier3 = []; // Fallback 2: has same-day duty

    for (const f of eligible) {
        const allAssignedDates = new Set();
        if (dbAssignedDatesMap.has(f.id)) {
            for (const d of dbAssignedDatesMap.get(f.id)) allAssignedDates.add(d);
        }
        if (batchAssignedDatesMap && batchAssignedDatesMap.has(f.id)) {
            for (const d of batchAssignedDatesMap.get(f.id)) allAssignedDates.add(d);
        }

        let hasSameDay = false;
        let hasConsecutiveDay = false;
        let hasRecentWeekend = false;

        for (const assignedDateStr of allAssignedDates) {
            const diffDays = getCalendarDayDiff(examDateStr, assignedDateStr);
            if (diffDays === 0) {
                hasSameDay = true;
            } else if (diffDays === 1) {
                hasConsecutiveDay = true;
            }

            if (isWeekend && diffDays > 0 && diffDays <= 7) {
                hasRecentWeekend = true;
            }
        }

        if (hasSameDay) {
            tier3.push(f);
        } else if (hasConsecutiveDay || (isWeekend && hasRecentWeekend)) {
            tier2.push(f);
        } else {
            tier1.push(f);
        }
    }

    // If session is on a weekend (Sat/Sun), sort each tier by weekend duty count ASC for round-robin weekend fairness
    if (isWeekend) {
        const sortWeekendTier = (arr) => {
            arr.sort((a, b) => {
                const wA = (Number(a.sat_duty_count) || 0) + (Number(a.sun_duty_count) || 0);
                const wB = (Number(b.sat_duty_count) || 0) + (Number(b.sun_duty_count) || 0);
                if (wA !== wB) return wA - wB; // Prioritize faculty with fewer weekend duties first
                const sA = a.serial_no != null ? Number(a.serial_no) : -1;
                const sB = b.serial_no != null ? Number(b.serial_no) : -1;
                if (sA !== sB) return sB - sA; // serial_no DESC
                if (a.duty_count !== b.duty_count) return a.duty_count - b.duty_count;
                return a.name.localeCompare(b.name);
            });
        };
        sortWeekendTier(tier1);
        sortWeekendTier(tier2);
        sortWeekendTier(tier3);
    }

    return [...tier1, ...tier2, ...tier3];
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION-LEVEL (ROOM-FREE) DUTY GENERATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dry-run: returns which faculty would be assigned to each session,
 * without writing anything to the database.
 *
 * @param {number[]} sessionIds   — one or two exam_session IDs (FN + AN)
 * @param {number|null} overrideCount — per-session headcount override
 */
async function previewSessionDuties(sessionIds, overrideCount, sessionCounts = null) {
    const { sessionPeriods } = await getSettings();
    const results = [];

    const assignedAcrossSessions = new Set();
    const batchAssignedDatesMap = new Map(); // facultyId -> Set of date strings

    for (const examSessionId of sessionIds) {
        const { rows: sr } = await db.query(
            'SELECT * FROM exam_sessions WHERE id = $1', [examSessionId]
        );
        if (sr.length === 0) throw new Error(`Exam session ${examSessionId} not found`);
        const sess = sr[0];
        const dateStr = String(sess.exam_date).slice(0, 10);

        const fullPool = await getEligibleFacultyPool(
            sess.exam_date, sess.session, sessionPeriods, batchAssignedDatesMap
        );
        const freshPool = fullPool.filter(f => !assignedAcrossSessions.has(f.id));

        const specCount = (sessionCounts && (sessionCounts[examSessionId] != null || sessionCounts[String(examSessionId)] != null))
            ? (parseInt(sessionCounts[examSessionId] || sessionCounts[String(examSessionId)], 10) || null)
            : null;

        const count = specCount
            || overrideCount
            || (sess.required_invigilators ? parseInt(sess.required_invigilators, 10) : null)
            || fullPool.length;

        let assigned = freshPool.slice(0, count);

        // Fallback: if fresh faculty aren't enough to meet requested count, pull from remaining eligible faculty
        if (assigned.length < count) {
            const assignedIds = new Set(assigned.map(f => f.id));
            const reusablePool = fullPool.filter(f => !assignedIds.has(f.id));
            const extraNeeded = count - assigned.length;
            assigned = assigned.concat(reusablePool.slice(0, extraNeeded));
        }

        assigned.forEach(f => {
            assignedAcrossSessions.add(f.id);
            if (!batchAssignedDatesMap.has(f.id)) batchAssignedDatesMap.set(f.id, new Set());
            batchAssignedDatesMap.get(f.id).add(dateStr);
        });
        const shortfall = Math.max(0, count - assigned.length);

        results.push({
            examSessionId,
            session: sess.session,
            examName: sess.exam_name,
            course:   sess.course,
            examDate: dateStr,
            yearSem: sess.year_sem,
            requestedCount: count,
            assignees: assigned.map(f => ({
                id:              f.id,
                name:            f.name,
                designation:     f.designation,
                serialNo:        f.serial_no,
                shortcuts:       f.shortcuts || '',
                currentDutyCount: f.duty_count,
            })),
            shortfall,
            totalEligible: poolLength(fullPool),
        });
    }
    return results;
}

function poolLength(pool) {
    return pool ? pool.length : 0;
}

/**
 * Writes session-level duties to `session_duty`.
 * Clears previous duties for the given sessions first (idempotent).
 *
 * @param {number[]} sessionIds
 * @param {number|null} overrideCount
 * @param {object|null} sessionCounts
 */
async function generateSessionDuties(sessionIds, overrideCount, sessionCounts = null) {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        const { sessionPeriods } = await getSettings();
        const results = [];

        const assignedAcrossSessions = new Set();
        const batchAssignedDatesMap = new Map();

        for (const examSessionId of sessionIds) {
            const { rows: sr } = await client.query(
                'SELECT * FROM exam_sessions WHERE id = $1', [examSessionId]
            );
            if (sr.length === 0) throw new Error(`Exam session ${examSessionId} not found`);
            const sess = sr[0];
            const dateStr = String(sess.exam_date).slice(0, 10);

            // Decrement duty_count for previously assigned faculty
            const { rows: prev } = await client.query(
                'SELECT faculty_id FROM session_duty WHERE exam_session_id = $1', [examSessionId]
            );
            for (const p of prev) {
                await client.query(
                    'UPDATE faculty SET duty_count = GREATEST(duty_count - 1, 0) WHERE id = $1',
                    [p.faculty_id]
                );
            }
            await client.query(
                'DELETE FROM session_duty WHERE exam_session_id = $1', [examSessionId]
            );

            const specCount = (sessionCounts && (sessionCounts[examSessionId] != null || sessionCounts[String(examSessionId)] != null))
                ? (parseInt(sessionCounts[examSessionId] || sessionCounts[String(examSessionId)], 10) || null)
                : null;

            if (specCount) {
                await client.query(
                    'UPDATE exam_sessions SET required_invigilators = $1 WHERE id = $2',
                    [specCount, examSessionId]
                );
            } else if (overrideCount) {
                await client.query(
                    'UPDATE exam_sessions SET required_invigilators = $1 WHERE id = $2',
                    [overrideCount, examSessionId]
                );
            }

            const fullPool = await getEligibleFacultyPool(
                sess.exam_date, sess.session, sessionPeriods, batchAssignedDatesMap
            );
            const freshPool = fullPool.filter(f => !assignedAcrossSessions.has(f.id));

            const count = specCount
                || overrideCount
                || (sess.required_invigilators ? parseInt(sess.required_invigilators, 10) : null)
                || fullPool.length;

            let assigned = freshPool.slice(0, count);

            // Fallback: if fresh faculty aren't enough to meet requested count, pull from remaining eligible faculty
            if (assigned.length < count) {
                const assignedIds = new Set(assigned.map(f => f.id));
                const reusablePool = fullPool.filter(f => !assignedIds.has(f.id));
                const extraNeeded = count - assigned.length;
                assigned = assigned.concat(reusablePool.slice(0, extraNeeded));
            }

            assigned.forEach(f => {
                assignedAcrossSessions.add(f.id);
                if (!batchAssignedDatesMap.has(f.id)) batchAssignedDatesMap.set(f.id, new Set());
                batchAssignedDatesMap.get(f.id).add(dateStr);
            });
            const shortfall = Math.max(0, count - assigned.length);

            for (const f of assigned) {
                await client.query(
                    `INSERT INTO session_duty (exam_session_id, faculty_id, status)
                     VALUES ($1, $2, 'assigned')
                     ON CONFLICT (exam_session_id, faculty_id) DO NOTHING`,
                    [examSessionId, f.id]
                );
                await client.query(
                    'UPDATE faculty SET duty_count = duty_count + 1, updated_at = now() WHERE id = $1',
                    [f.id]
                );
            }

            results.push({
                examSessionId,
                session: sess.session,
                examName: sess.exam_name,
                course:   sess.course,
                examDate: String(sess.exam_date).slice(0, 10),
                yearSem: sess.year_sem,
                totalAssigned: assigned.length,
                requestedCount: count,
                shortfall,
            });
        }

        await client.query('COMMIT');
        return results;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Reads saved session duties for one or more sessions.
 */
async function getSessionDuties(sessionIds) {
    const { rows } = await db.query(
        `SELECT sd.id AS duty_id, sd.exam_session_id, sd.status,
                es.session, es.exam_name, es.course, es.exam_date, es.year_sem,
                f.id AS faculty_id, f.name AS faculty_name,
                f.designation, f.serial_no, f.shortcuts, f.duty_count
         FROM session_duty sd
         JOIN exam_sessions es ON es.id = sd.exam_session_id
         JOIN faculty f ON f.id = sd.faculty_id
         WHERE sd.exam_session_id = ANY($1::int[])
         ORDER BY es.session, f.serial_no DESC NULLS LAST, f.name`,
        [sessionIds]
    );
    return rows;
}

/**
 * Cancel a single session duty (frees the faculty member).
 */
async function cancelSessionDuty(dutyId) {
    const { rows } = await db.query(
        'SELECT faculty_id FROM session_duty WHERE id = $1', [dutyId]
    );
    if (rows.length === 0) throw new Error('Duty not found');
    await db.query(
        'UPDATE faculty SET duty_count = GREATEST(duty_count - 1, 0) WHERE id = $1',
        [rows[0].faculty_id]
    );
    await db.query('DELETE FROM session_duty WHERE id = $1', [dutyId]);
    return { success: true };
}

/**
 * Returns eligible faculty for a session — used for the Reassign dropdown.
 */
async function getAvailableFacultyForSession(examSessionId) {
    const { rows: sr } = await db.query(
            'SELECT * FROM exam_sessions WHERE id = $1', [examSessionId]
    );
    if (sr.length === 0) throw new Error('Exam session not found');
    const sess = sr[0];
    const { sessionPeriods } = await getSettings();

    // Get assigned faculty IDs for this exam session to exclude them
    const { rows: assignedRows } = await db.query(
        'SELECT faculty_id FROM session_duty WHERE exam_session_id = $1',
        [examSessionId]
    );
    const assignedIds = new Set(assignedRows.map(r => r.faculty_id));

    const pool = await getEligibleFacultyPool(
        sess.exam_date, sess.session, sessionPeriods
    );

    // Filter out already-assigned faculty
    const available = pool.filter(f => !assignedIds.has(f.id));

    // Sort ascending by serial_no (S.No order), then by name
    available.sort((a, b) => {
        const sA = a.serial_no != null ? Number(a.serial_no) : 999999;
        const sB = b.serial_no != null ? Number(b.serial_no) : 999999;
        if (sA !== sB) return sA - sB;
        return a.name.localeCompare(b.name);
    });

    return available.map(f => ({
        id: f.id,
        name: f.name,
        designation: f.designation,
        duty_count: f.duty_count,
        serial_no: f.serial_no,
        shortcuts: f.shortcuts || '',
    }));
}

/**
 * Manually swap a session duty to a different faculty member.
 */
async function swapSessionDuty(dutyId, newFacultyId) {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            'SELECT * FROM session_duty WHERE id = $1', [dutyId]
        );
        if (rows.length === 0) throw new Error('Duty not found');
        const duty = rows[0];
        await client.query(
            'UPDATE faculty SET duty_count = GREATEST(duty_count - 1, 0) WHERE id = $1',
            [duty.faculty_id]
        );
        await client.query(
            'UPDATE faculty SET duty_count = duty_count + 1 WHERE id = $1', [newFacultyId]
        );
        await client.query(
            `UPDATE session_duty SET faculty_id = $1, status = 'swapped' WHERE id = $2`,
            [newFacultyId, dutyId]
        );
        await client.query('COMMIT');
        return { success: true };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// Keep old room-based functions for backward-compat (existing saved duties still work)
async function checkTimetableConflict(facultyId, examSessionId) {
    const { rows: sr } = await db.query('SELECT * FROM exam_sessions WHERE id = $1', [examSessionId]);
    if (sr.length === 0) throw new Error('Exam session not found');
    const es = sr[0];
    const { sessionPeriods } = await getSettings();
    const dayAbbrev = dayOfWeekAbbrev(es.exam_date);
    const periods   = sessionPeriods[es.session] || [];
    const { rows } = await db.query(
        `SELECT period, subject_code FROM faculty_timetable
         WHERE faculty_id = $1 AND day_of_week = $2 AND period = ANY($3::int[])`,
        [facultyId, dayAbbrev, periods]
    );
    return { hasConflict: rows.length > 0, conflicts: rows };
}

module.exports = {
    getSettings,
    // Session-level (new, room-free)
    previewSessionDuties,
    generateSessionDuties,
    getSessionDuties,
    cancelSessionDuty,
    swapSessionDuty,
    getAvailableFacultyForSession,
    checkTimetableConflict,
};

