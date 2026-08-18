const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const ExcelJS  = require('exceljs');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return `${months[m - 1]} ${y}`;
}
function monthYearRange(sessionCols) {
    if (!sessionCols || sessionCols.length === 0) return 'AUG 2026';
    const dates = sessionCols.map(s => s.date).sort();
    const firstMonthYear = monthYear(dates[0]);
    const lastMonthYear  = monthYear(dates[dates.length - 1]);
    if (firstMonthYear === lastMonthYear) {
        return firstMonthYear;
    }
    const firstMonth = firstMonthYear.split(' ')[0];
    const lastMonth  = lastMonthYear.split(' ')[0];
    const year       = firstMonthYear.split(' ')[1];
    return `${firstMonth}-${lastMonth} ${year}`;
}

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

function formatYearSemLabel(yearSemStr, examName, course, sessionExamName) {
    const targetExam = (examName && String(examName).toUpperCase() !== 'ALL')
        ? examName
        : (sessionExamName || 'Exams');

    let courseLabel = course ? String(course).trim().toUpperCase().replace(/\./g, '') : 'BTECH';
    if (!courseLabel || courseLabel === 'NULL') courseLabel = 'BTECH';

    const examSuffix = String(targetExam).toLowerCase().includes('exam') ? targetExam : `${targetExam} Exams`;

    if (!yearSemStr) return `${courseLabel} ${examSuffix}`;
    const str = String(yearSemStr).trim();
    const romanYears = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV' };
    const parts = str.split('-');
    if (parts.length === 2 && romanYears[parts[0]]) {
        return `${romanYears[parts[0]]} ${courseLabel} SEM-${parts[1]} ${examSuffix}`;
    }
    if (/sem|btech|bba|mtech/i.test(str)) {
        return `${str} ${examSuffix}`;
    }
    return `${courseLabel} ${str} ${examSuffix}`;
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

async function buildSheetData(examName, yearSem, userId, course, startDate, endDate) {
    let sql = `SELECT id, exam_name, course, exam_date, session, year_sem, required_invigilators, start_time, end_time
               FROM exam_sessions WHERE user_id = $1`;
    const params = [userId];

    if (examName && String(examName).toUpperCase() !== 'ALL') {
        params.push(examName);
        sql += ` AND exam_name = $${params.length}`;
    }
    if (yearSem) {
        params.push(yearSem);
        sql += ` AND year_sem = $${params.length}`;
    }
    if (course) {
        params.push(course);
        sql += ` AND course = $${params.length}`;
    }
    if (startDate) {
        params.push(startDate);
        sql += ` AND exam_date >= $${params.length}`;
    }
    if (endDate) {
        params.push(endDate);
        sql += ` AND exam_date <= $${params.length}`;
    }
    sql += ` ORDER BY exam_date ASC, CASE session WHEN 'FN' THEN 0 ELSE 1 END`;

    const { rows: sessions } = await db.query(sql, params);
    if (sessions.length === 0) {
        return {
            examName, yearSem, course, sessionCols: [], facultyRows: [], legendList: [],
            monthYearLabel: ''
        };
    }

    let sessionCols = [];
    const legendList = [];
    const courseYearSemMap = new Map();

    sessionCols = sessions.map((s, i) => {
        const ys = s.year_sem || yearSem || '1-1';
        const c  = s.course || 'B.Tech';
        const startTime = s.start_time || (s.session === 'AN' ? '01:30 PM' : '09:30 AM');
        const endTime   = s.end_time   || (s.session === 'AN' ? '03:30 PM' : '11:30 AM');
        const key = `${s.exam_name}|||${c}|||${ys}|||${startTime}|||${endTime}`;
        const letter = getSessionLetter(ys, s.session);

        if (!courseYearSemMap.has(key)) {
            courseYearSemMap.set(key, {
                examName: s.exam_name, course: c, yearSem: ys,
                startTime, endTime, letters: new Set()
            });
        }
        courseYearSemMap.get(key).letters.add(letter);

        const dateStr = toYYYYMMDD(s.exam_date);
        const dateNum = parseInt(dateStr.split('-')[2], 10);

        return {
            id: i, sessionId: s.id,
            date: dateStr,
            dateNum: dateNum,
            day: dayAbbr(dateStr),
            session: s.session, yearSem: ys, course: c, examName: s.exam_name,
            letter: letter,
            startTime,
            endTime,
            requiredInvigilators: s.required_invigilators || 0,
        };
    });

    for (const item of courseYearSemMap.values()) {
        const lettersArr = Array.from(item.letters);
        const letterKey = lettersArr.join('&');
        const examLabel = formatYearSemLabel(item.yearSem, examName, item.course, item.examName);
        const timingStr = `${item.startTime} - ${item.endTime}`;
        legendList.push({
            letterKey,
            description: `${examLabel}  (${timingStr})`,
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
        const cells = sessionCols.map(sc =>
            assigned.has(sc.sessionId) ? (f.shortcuts || '\u2713') : null
        );
        const sheetDutyCount = cells.filter(c => c !== null).length;
        return {
            facultyId: f.id, serialNo: f.serial_no, name: f.name,
            shortcuts: f.shortcuts || '', department: f.department || '',
            totalDuties: sheetDutyCount,
            satDuties: wk.sat, sunDuties: wk.sun,
            isActive: f.is_active,
            contact: f.contact || f.phone || '',
            roomNo: f.room_no || '',
            cells: cells,
        };
    });

    const monthYearLabel = monthYearRange(sessionCols);

    return {
        examName, yearSem, course, sessionCols, facultyRows, legendList,
        monthYearLabel
    };
}

/** GET /api/duty-sheet/preview */
router.get('/preview', async (req, res) => {
    const { examName, yearSem, course, startDate, endDate } = req.query;
    if (!examName) return res.status(400).json({ error: 'examName required' });
    try {
        res.json(await buildSheetData(examName, yearSem || null, req.userId, course || null, startDate || null, endDate || null));
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/** GET /api/duty-sheet/export */
router.get('/export', async (req, res) => {
    const { examName, yearSem, course, startDate, endDate } = req.query;
    if (!examName) return res.status(400).json({ error: 'examName required' });
    try {
        const {
            sessionCols, facultyRows, legendList, monthYearLabel
        } = await buildSheetData(examName, yearSem || null, req.userId, course || null, startDate || null, endDate || null);

        const wb = new ExcelJS.Workbook();
        wb.creator = 'Invigilation System';
        const ws = wb.addWorksheet('Duty Sheet');

        const sessStartCol  = 3;
        const dutiesThisCol = sessStartCol + sessionCols.length;
        const scCol         = dutiesThisCol + 1;
        const contactCol    = scCol + 1;
        const tcCol         = contactCol + 1;
        const saCol         = tcCol + 1;
        const suCol         = saCol + 1;
        const roomCol       = suCol + 1;

        ws.columns = [
            { width: 6 }, { width: 32 },
            ...sessionCols.map(() => ({ width: 8 })),
            { width: 14 }, // DUTIES THIS EXAM
            { width: 12 }, { width: 14 },
            { width: 6 },  { width: 6 },  { width: 6 }, { width: 12 },
        ];

        // Styles & Fills
        const hdrFill        = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
        const orangeRowFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFED7D31' } };
        const whiteFill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
        const reqFill        = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
        const altFill        = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };

        const hdrFont        = { bold: true, size: 10, name: 'Arial', color: { argb: 'FF000000' } };
        const dataFont       = { size: 10, name: 'Arial' };
        const blackBoldFont  = { bold: true, size: 10, name: 'Arial', color: { argb: 'FF000000' } };
        const inactiveFont   = { size: 10, name: 'Arial', color: { argb: 'FF000000' }, bold: true };
        const border         = { top:{style:'thin', color:{argb:'FFCCCCCC'}}, bottom:{style:'thin', color:{argb:'FFCCCCCC'}}, left:{style:'thin', color:{argb:'FFCCCCCC'}}, right:{style:'thin', color:{argb:'FFCCCCCC'}} };

        const cen = { horizontal: 'center', vertical: 'middle', wrapText: true };
        const lft = { horizontal: 'left',   vertical: 'middle', wrapText: true };

        function setCell(cell, val, font, align, fill, bdr) {
            cell.value = (val !== null && val !== undefined && val !== '') ? val : null;
            cell.font = font || dataFont; cell.alignment = align || cen;
            if (fill) cell.fill = fill; if (bdr) cell.border = bdr;
        }

        // ── Table Header (Rows 1, 2, 3) ────────────────────────────────────
        // Row 1: S.No | Month-Year | Date Numbers (e.g. 24, 24, 25) | Summary Titles
        const r1 = ws.getRow(1); r1.height = 20;
        setCell(r1.getCell(1), 'S. NO', hdrFont, cen, hdrFill, border);
        setCell(r1.getCell(2), monthYearLabel, hdrFont, cen, hdrFill, border);
        sessionCols.forEach((sc, i) => {
            setCell(r1.getCell(sessStartCol + i), sc.dateNum, hdrFont, cen, hdrFill, border);
        });
        setCell(r1.getCell(dutiesThisCol), 'DUTIES THIS EXAM', hdrFont, cen, hdrFill, border);
        setCell(r1.getCell(scCol),         'SHORT CUT',        hdrFont, cen, hdrFill, border);
        setCell(r1.getCell(contactCol),    'CONTACT',          hdrFont, cen, hdrFill, border);
        setCell(r1.getCell(tcCol),         'TC',               hdrFont, cen, hdrFill, border);
        setCell(r1.getCell(saCol),         'S A',              hdrFont, cen, hdrFill, border);
        setCell(r1.getCell(suCol),         'S U',              hdrFont, cen, hdrFill, border);
        setCell(r1.getCell(roomCol),       'ROOM NO',          hdrFont, cen, hdrFill, border);

        // Row 2: - | CSE | Day Abbrs (MON, MON, TUE...)
        const r2 = ws.getRow(2); r2.height = 18;
        setCell(r2.getCell(1), '-', hdrFont, cen, hdrFill, border);
        setCell(r2.getCell(2), 'CSE', hdrFont, cen, hdrFill, border);
        sessionCols.forEach((sc, i) => {
            setCell(r2.getCell(sessStartCol + i), sc.day, hdrFont, cen, hdrFill, border);
        });
        [dutiesThisCol, scCol, contactCol, tcCol, saCol, suCol, roomCol].forEach(c => setCell(r2.getCell(c), '', hdrFont, cen, hdrFill, border));

        // Row 3: - | FACULTY NAME | Session Letters (A, E, F...)
        const r3 = ws.getRow(3); r3.height = 18;
        setCell(r3.getCell(1), '-', hdrFont, cen, hdrFill, border);
        setCell(r3.getCell(2), 'FACULTY NAME', hdrFont, lft, hdrFill, border);
        sessionCols.forEach((sc, i) => {
            setCell(r3.getCell(sessStartCol + i), sc.letter, hdrFont, cen, hdrFill, border);
        });
        [dutiesThisCol, scCol, contactCol, tcCol, saCol, suCol, roomCol].forEach(c => setCell(r3.getCell(c), '', hdrFont, cen, hdrFill, border));

        // Merge Header Cells
        ws.mergeCells(1, 1, 3, 1); // S.NO merged A1:A3
        [dutiesThisCol, scCol, contactCol, tcCol, saCol, suCol, roomCol].forEach(c => ws.mergeCells(1, c, 3, c));

        // ── Data Rows (Row 4 onwards) ────────────────────────────────────
        facultyRows.forEach((fr, idx) => {
            const rn = 4 + idx;
            const row = ws.getRow(rn); row.height = 16;
            const isInactive = !fr.isActive;
            const rowFont = isInactive ? inactiveFont : dataFont;
            const rowBg = isInactive ? orangeRowFill : (idx % 2 !== 0 ? altFill : null);

            // Col 1: S.No
            setCell(row.getCell(1), fr.serialNo || idx + 1, isInactive ? blackBoldFont : dataFont, cen, rowBg, border);
            // Col 2: Faculty Name
            setCell(row.getCell(2), fr.name, isInactive ? inactiveFont : blackBoldFont, lft, rowBg, border);

            // Session Grid Columns
            fr.cells.forEach((val, si) => {
                let cellFill = rowBg;
                let cellFont = dataFont;

                if (isInactive) {
                    cellFill = orangeRowFill;
                    cellFont = blackBoldFont;
                } else if (val) {
                    cellFill = whiteFill;
                    cellFont = blackBoldFont;
                } else {
                    cellFill = whiteFill;
                    cellFont = dataFont;
                }

                setCell(row.getCell(sessStartCol + si), val, val ? blackBoldFont : cellFont, cen, cellFill, border);
            });

            // Summary Right Columns
            // DUTIES THIS EXAM (Counts duties allocated in the session columns)
            const fc = ws.getCell(rn, sessStartCol);
            const lc = ws.getCell(rn, sessStartCol + sessionCols.length - 1);
            const dtCell = row.getCell(dutiesThisCol);
            dtCell.value = { formula: `COUNTA(${fc.address}:${lc.address})` };
            dtCell.font = blackBoldFont; dtCell.alignment = cen; dtCell.border = border;
            if (isInactive) dtCell.fill = orangeRowFill; else if (rowBg) dtCell.fill = rowBg;

            // Shortcut
            setCell(row.getCell(scCol), fr.shortcuts, blackBoldFont, cen, isInactive ? orangeRowFill : rowBg, border);
            // Contact
            setCell(row.getCell(contactCol), fr.contact, dataFont, cen, isInactive ? orangeRowFill : rowBg, border);

            // TC (Total Count formula)
            const dc = row.getCell(tcCol);
            dc.value = { formula: `COUNTA(${fc.address}:${lc.address})` };
            dc.font = blackBoldFont; dc.alignment = cen; dc.border = border;
            if (isInactive) dc.fill = orangeRowFill; else if (rowBg) dc.fill = rowBg;

            // Sa, Su, Room No
            setCell(row.getCell(saCol), fr.satDuties, dataFont, cen, isInactive ? orangeRowFill : rowBg, border);
            setCell(row.getCell(suCol), fr.sunDuties, dataFont, cen, isInactive ? orangeRowFill : rowBg, border);
            setCell(row.getCell(roomCol), fr.roomNo, dataFont, cen, isInactive ? orangeRowFill : rowBg, border);
        });

        // ── Required Row ─────────────────────────────────────────────────
        const reqRn  = 4 + facultyRows.length;
        const reqRow = ws.getRow(reqRn); reqRow.height = 16;
        setCell(reqRow.getCell(1), '',         blackBoldFont, cen, reqFill, border);
        setCell(reqRow.getCell(2), 'Required', blackBoldFont, lft, reqFill, border);
        sessionCols.forEach((sc, i) =>
            setCell(reqRow.getCell(sessStartCol + i), sc.requiredInvigilators || '', blackBoldFont, cen, reqFill, border));
        [dutiesThisCol, scCol, contactCol, tcCol, saCol, suCol, roomCol].forEach(c =>
            setCell(reqRow.getCell(c), '', blackBoldFont, cen, reqFill, border));

        // ── Legend Block (below Required row) ───────────────────────────
        if (legendList && legendList.length > 0) {
            const legendStartRow = reqRn + 2;
            legendList.forEach((leg, i) => {
                const rowNum = legendStartRow + i;
                const keyCell = ws.getCell(rowNum, 1);
                const descCell = ws.getCell(rowNum, 2);

                keyCell.value = `${leg.letterKey}:`;
                keyCell.font = { bold: true, size: 10, name: 'Arial', color: { argb: 'FFC00000' } };
                keyCell.alignment = { horizontal: 'left', vertical: 'middle' };

                descCell.value = leg.description;
                descCell.font = { bold: true, size: 10, name: 'Arial', color: { argb: 'FF000000' } };
                descCell.alignment = { horizontal: 'left', vertical: 'middle' };
            });
        }

        ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 3 }];

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
