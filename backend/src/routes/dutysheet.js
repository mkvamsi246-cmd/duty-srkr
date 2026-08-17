const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const ExcelJS  = require('exceljs');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SESSION_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function toYYYYMMDD(d) {
    if (!d) return '';
    return typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
}
function dayAbbr(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return DAY_ABBR[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
function monthYear(dateStr) {
    const [y, m] = dateStr.split('-').map(Number);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[m - 1]}-${y}`;
}

/** GET /api/duty-sheet/list-exams */
/** GET /api/duty-sheet/list-exams */
router.get('/list-exams', async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT DISTINCT es.exam_name
             FROM exam_sessions es
             JOIN session_duty sd ON sd.exam_session_id = es.id
             WHERE es.user_id = $1
             ORDER BY es.exam_name`,
            [req.userId]
        );
        res.json(rows.map(r => r.exam_name));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function formatYearSemLabel(yearSemStr, examName) {
    if (!yearSemStr) return `${examName} Exams`;
    const str = String(yearSemStr).trim();
    const romanYears = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV' };
    const parts = str.split('-');
    if (parts.length === 2 && romanYears[parts[0]]) {
        return `${romanYears[parts[0]]} BTECH SEM-${parts[1]} ${examName} Exams`;
    }
    if (/sem|btech|bba/i.test(str)) {
        return `${str} ${examName} Exams`;
    }
    return `${str} ${examName} Exams`;
}

function getSessionLetter(yearSemStr, sessionStr) {
    const isAN = sessionStr && String(sessionStr).toUpperCase() === 'AN';
    const yearNum = yearSemStr ? String(yearSemStr).trim().charAt(0) : '1';

    if (yearNum === '3') {
        return isAN ? 'D' : 'C';
    } else if (yearNum === '4') {
        return isAN ? 'F' : 'E';
    } else if (yearNum === '2') {
        return isAN ? 'B' : 'A';
    } else {
        return isAN ? 'B' : 'A';
    }
}

async function buildSheetData(examName, yearSem, userId) {
    let sql = `SELECT id, exam_name, exam_date, session, year_sem, required_invigilators
               FROM exam_sessions WHERE exam_name = $1 AND user_id = $2`;
    const params = [examName, userId];
    if (yearSem) {
        sql += ` AND year_sem = $3`;
        params.push(yearSem);
    }
    sql += ` ORDER BY exam_date ASC, CASE session WHEN 'FN' THEN 0 ELSE 1 END`;

    const { rows: sessions } = await db.query(sql, params);
    if (sessions.length === 0) {
        return { examName, yearSem, sessionCols: [], facultyRows: [], legendList: [], monthYearLabel: '' };
    }

    let sessionCols = [];
    const legendList = [];
    const yearSemMap = new Map();

    sessionCols = sessions.map((s, i) => {
        const ys = s.year_sem || yearSem || '1-1';
        const letter = getSessionLetter(ys, s.session);

        if (!yearSemMap.has(ys)) yearSemMap.set(ys, new Set());
        yearSemMap.get(ys).add(letter);

        return {
            id: i, sessionId: s.id,
            date: toYYYYMMDD(s.exam_date), day: dayAbbr(toYYYYMMDD(s.exam_date)),
            session: s.session, yearSem: ys,
            letter: letter,
            requiredInvigilators: s.required_invigilators || 0,
        };
    });

    for (const [ys, letterSet] of yearSemMap.entries()) {
        const lettersArr = Array.from(letterSet);
        const letterKey = lettersArr.join('&');
        legendList.push({
            letterKey,
            description: formatYearSemLabel(ys, examName),
        });
    }

    const { rows: faculty } = await db.query(
        `SELECT id, name, serial_no, shortcuts, department, duty_count, is_active, phone, contact, room_no
         FROM faculty WHERE user_id = $1 ORDER BY serial_no ASC NULLS LAST, name`,
        [userId]
    );

    const sessionIds = sessions.map(s => s.id);
    const { rows: duties } = await db.query(
        `SELECT sd.faculty_id, sd.exam_session_id FROM session_duty sd
         WHERE sd.exam_session_id = ANY($1::int[])`,
        [sessionIds]
    );

    const assignMap = new Map();
    for (const d of duties) {
        if (!assignMap.has(d.faculty_id)) assignMap.set(d.faculty_id, new Set());
        assignMap.get(d.faculty_id).add(d.exam_session_id);
    }

    const { rows: wkendRows } = await db.query(
        `SELECT sd.faculty_id,
            SUM(CASE WHEN EXTRACT(DOW FROM es.exam_date::date) = 6 THEN 1 ELSE 0 END) AS sat,
            SUM(CASE WHEN EXTRACT(DOW FROM es.exam_date::date) = 0 THEN 1 ELSE 0 END) AS sun
         FROM session_duty sd JOIN exam_sessions es ON es.id = sd.exam_session_id
         WHERE es.user_id = $1
         GROUP BY sd.faculty_id`,
        [userId]
    );
    const wkendMap = new Map();
    for (const r of wkendRows) wkendMap.set(r.faculty_id, { sat: Number(r.sat), sun: Number(r.sun) });

    const facultyRows = faculty.map(f => {
        const assigned = assignMap.get(f.id) || new Set();
        const wk = wkendMap.get(f.id) || { sat: 0, sun: 0 };
        return {
            facultyId: f.id, serialNo: f.serial_no, name: f.name,
            shortcuts: f.shortcuts || '', department: f.department || '',
            totalDuties: f.duty_count || 0, satDuties: wk.sat, sunDuties: wk.sun,
            isActive: f.is_active,
            contact: f.contact || f.phone || '',
            roomNo: f.room_no || '',
            cells: sessionCols.map(sc =>
                assigned.has(sc.sessionId) ? (f.shortcuts || '\u2713') : null
            ),
        };
    });

    return { examName, yearSem, sessionCols, facultyRows, legendList, monthYearLabel: sessionCols.length ? monthYear(sessionCols[0].date) : '' };
}

/** GET /api/duty-sheet/preview?examName=&yearSem= */
router.get('/preview', async (req, res) => {
    const { examName, yearSem } = req.query;
    if (!examName) return res.status(400).json({ error: 'examName required' });
    try {
        res.json(await buildSheetData(examName, yearSem || null, req.userId));
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/** GET /api/duty-sheet/export?examName=&yearSem= */
router.get('/export', async (req, res) => {
    const { examName, yearSem } = req.query;
    if (!examName) return res.status(400).json({ error: 'examName required' });
    try {
        const { sessionCols, facultyRows, legendList, monthYearLabel } = await buildSheetData(examName, yearSem || null, req.userId);

        const wb = new ExcelJS.Workbook();
        wb.creator = 'Invigilation System';
        const ws = wb.addWorksheet('Duty Sheet');

        const sessStartCol = 3;
        const dutiesCol    = sessStartCol + sessionCols.length;
        const scCol        = dutiesCol + 1;
        const contactCol   = scCol + 1;
        const tcCol        = contactCol + 1;
        const saCol        = tcCol + 1;
        const suCol        = saCol + 1;
        const roomCol      = suCol + 1;

        ws.columns = [
            { width: 6 }, { width: 28 },
            ...sessionCols.map(() => ({ width: 9 })),
            { width: 10 }, { width: 10 }, { width: 13 },
            { width: 6 },  { width: 6 },  { width: 6 }, { width: 13 },
        ];

        const hdrFill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
        const hdrFont      = { bold: true, size: 10, name: 'Arial', color: { argb: 'FFFFFFFF' } };
        const dataFont     = { size: 10, name: 'Arial' };
        const inactiveFont = { size: 10, name: 'Arial', color: { argb: 'FF595959' }, italic: true };
        const altFill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDE3F0' } };
        const inactiveFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
        const greenFill    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
        const reqFill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
        const border       = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
        const cen = { horizontal: 'center', vertical: 'middle', wrapText: true };
        const lft = { horizontal: 'left',   vertical: 'middle', wrapText: true };

        function setCell(cell, val, font, align, fill, bdr) {
            cell.value = (val !== null && val !== undefined && val !== '') ? val : null;
            cell.font = font || dataFont; cell.alignment = align || cen;
            if (fill) cell.fill = fill; if (bdr) cell.border = bdr;
        }

        // ── Rows 1-3 header ──────────────────────────────────────────────
        [1, 2, 3].forEach(rn => {
            const r = ws.getRow(rn); r.height = rn === 1 ? 22 : 18;
            setCell(r.getCell(1), rn === 1 ? 'S.No' : '', hdrFont, cen, hdrFill, border);
            setCell(r.getCell(2), rn === 1 ? monthYearLabel : (rn === 3 ? 'CSE' : ''), hdrFont, cen, hdrFill, border);
            sessionCols.forEach((sc, i) => {
                const vals = [sc.date, sc.day, sc.yearSem || 'CSE'];
                setCell(r.getCell(sessStartCol + i), vals[rn - 1], hdrFont, cen, hdrFill, border);
            });
            [dutiesCol, scCol, contactCol, tcCol, saCol, suCol, roomCol].forEach(c => {
                const r1lbl = { [dutiesCol]: 'Duties\nThis Exam', [scCol]: 'Shortcut', [contactCol]: 'Contact', [tcCol]: 'TC', [saCol]: 'Sa', [suCol]: 'Su', [roomCol]: 'Room No' };
                setCell(r.getCell(c), rn === 1 ? (r1lbl[c] || '') : '', hdrFont, cen, hdrFill, border);
            });
        });

        ws.mergeCells(1, 1, 3, 1); // A1:A3
        [dutiesCol, scCol, contactCol, tcCol, saCol, suCol, roomCol].forEach(c => {
            ws.mergeCells(1, c, 3, c);
        });

        // ── Row 4: sub-header ────────────────────────────────────────────
        const r4 = ws.getRow(4); r4.height = 18;
        setCell(r4.getCell(1), 'S.No',        hdrFont, cen, hdrFill, border);
        setCell(r4.getCell(2), 'Faculty Name', hdrFont, lft, hdrFill, border);
        sessionCols.forEach((sc, i) => setCell(r4.getCell(sessStartCol + i), sc.letter, hdrFont, cen, hdrFill, border));
        [dutiesCol, scCol, contactCol, tcCol, saCol, suCol, roomCol].forEach(c =>
            setCell(r4.getCell(c), '', hdrFont, cen, hdrFill, border));

        // ── Data rows ────────────────────────────────────────────────────
        facultyRows.forEach((fr, idx) => {
            const rn   = 5 + idx;
            const row  = ws.getRow(rn); row.height = 16;
            const rowFont = fr.isActive ? dataFont : inactiveFont;
            const bgf  = !fr.isActive ? inactiveFill : (idx % 2 !== 0 ? altFill : null);

            setCell(row.getCell(1), fr.serialNo || idx + 1, rowFont, cen, bgf, border);
            setCell(row.getCell(2), fr.name,                rowFont, lft, bgf, border);
            fr.cells.forEach((val, si) => {
                setCell(row.getCell(sessStartCol + si), val, rowFont, cen, val ? greenFill : bgf, border);
            });
            const fc = ws.getCell(rn, sessStartCol);
            const lc = ws.getCell(rn, sessStartCol + sessionCols.length - 1);
            const dc = row.getCell(dutiesCol);
            dc.value = { formula: 'COUNTA(' + fc.address + ':' + lc.address + ')' };
            dc.font = rowFont; dc.alignment = cen; dc.border = border; if (bgf) dc.fill = bgf;
            setCell(row.getCell(scCol),      fr.shortcuts,   rowFont, cen, bgf, border);
            setCell(row.getCell(contactCol), fr.contact,     rowFont, cen, bgf, border);
            setCell(row.getCell(tcCol),      fr.totalDuties, rowFont, cen, bgf, border);
            setCell(row.getCell(saCol),      fr.satDuties,   rowFont, cen, bgf, border);
            setCell(row.getCell(suCol),      fr.sunDuties,   rowFont, cen, bgf, border);
            setCell(row.getCell(roomCol),    fr.roomNo,      rowFont, cen, bgf, border);
        });

        // ── Required row ─────────────────────────────────────────────────
        const reqRn  = 5 + facultyRows.length;
        const reqRow = ws.getRow(reqRn); reqRow.height = 16;
        const boldF  = { bold: true, size: 10, name: 'Arial' };
        setCell(reqRow.getCell(1), '',         boldF, cen, reqFill, border);
        setCell(reqRow.getCell(2), 'Required', boldF, lft, reqFill, border);
        sessionCols.forEach((sc, i) =>
            setCell(reqRow.getCell(sessStartCol + i), sc.requiredInvigilators || '', boldF, cen, reqFill, border));
        [dutiesCol, scCol, contactCol, tcCol, saCol, suCol, roomCol].forEach(c =>
            setCell(reqRow.getCell(c), '', boldF, cen, reqFill, border));

        // ── Legend Block (below Required row) ───────────────────────────
        if (legendList && legendList.length > 0) {
            const legendStartRow = reqRn + 2;

            legendList.forEach((leg, i) => {
                const rowNum = legendStartRow + i;
                const keyCell = ws.getCell(rowNum, 1);
                const descCell = ws.getCell(rowNum, 2);

                keyCell.value = `${leg.letterKey}:`;
                keyCell.font = { bold: true, size: 10, name: 'Arial', color: { argb: 'FFC00000' } }; // RED BOLD
                keyCell.alignment = { horizontal: 'left', vertical: 'middle' };

                descCell.value = leg.description;
                descCell.font = { bold: true, size: 10, name: 'Arial', color: { argb: 'FF000000' } }; // BLACK BOLD
                descCell.alignment = { horizontal: 'left', vertical: 'middle' };
            });
        }

        ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 4 }];

        const safeName = examName.replace(/[^a-zA-Z0-9\-_]/g, '_');
        const fileSuffix = yearSem ? `_${yearSem}` : '';
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Duty_Sheet_${safeName}${fileSuffix}.xlsx"`);
        await wb.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Duty sheet export error:', err);
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
});

module.exports = router;
