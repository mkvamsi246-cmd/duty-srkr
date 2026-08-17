const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const db = require('../db');

async function getDutyChartData(examSessionId) {
    const sessionRes = await db.query('SELECT * FROM exam_sessions WHERE id = $1', [examSessionId]);
    if (sessionRes.rows.length === 0) throw new Error('Exam session not found');
    const session = sessionRes.rows[0];

    const { rows } = await db.query(
        `SELECT c.room_no, era.students_count, era.faculty_required,
                f.name AS faculty_name, f.designation, d.status
         FROM exam_room_allocation era
         JOIN classrooms c ON c.id = era.classroom_id
         LEFT JOIN invigilation_duty d ON d.exam_room_allocation_id = era.id
         LEFT JOIN faculty f ON f.id = d.faculty_id
         WHERE era.exam_session_id = $1
         ORDER BY c.room_no, f.name`,
        [examSessionId]
    );

    return { session, rows };
}

async function generateDutyChartExcel(examSessionId) {
    const { session, rows } = await getDutyChartData(examSessionId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Duty Chart');

    sheet.mergeCells('A1:E1');
    sheet.getCell('A1').value = `${session.exam_name} â€” ${session.exam_date} (${session.session})`;
    sheet.getCell('A1').font = { bold: true, size: 14 };

    sheet.addRow([]);
    const headerRow = sheet.addRow(['Room No', 'Students', 'Faculty Required', 'Invigilator', 'Designation']);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    });

    for (const r of rows) {
        sheet.addRow([
            r.room_no,
            r.students_count,
            r.faculty_required,
            r.faculty_name || 'â€” unassigned â€”',
            r.designation ? r.designation.replace('_', ' ') : '',
        ]);
    }

    sheet.columns.forEach((col) => { col.width = 22; });

    return workbook.xlsx.writeBuffer();
}

function generateDutyChartPdf(examSessionId) {
    return getDutyChartData(examSessionId).then(({ session, rows }) => {
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ margin: 40 });
            const chunks = [];
            doc.on('data', (c) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            doc.fontSize(16).text(`${session.exam_name}`, { align: 'center' });
            doc.fontSize(12).text(`${session.exam_date}  |  Session: ${session.session}`, { align: 'center' });
            doc.moveDown();

            const colX = [40, 140, 220, 330, 470];
            const headers = ['Room No', 'Students', 'Required', 'Invigilator', 'Designation'];
            let y = doc.y;
            headers.forEach((h, i) => doc.fontSize(11).font('Helvetica-Bold').text(h, colX[i], y));
            doc.moveDown();
            doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();

            for (const r of rows) {
                y = doc.y + 6;
                if (y > 760) { doc.addPage(); y = 40; }
                doc.font('Helvetica').fontSize(10);
                doc.text(String(r.room_no), colX[0], y);
                doc.text(String(r.students_count), colX[1], y);
                doc.text(String(r.faculty_required), colX[2], y);
                doc.text(r.faculty_name || 'â€” unassigned â€”', colX[3], y);
                doc.text(r.designation ? r.designation.replace('_', ' ') : '', colX[4], y);
                doc.moveDown();
            }

            doc.end();
        });
    });
}

// ─── Session-level (room-free) export ────────────────────────────────────────

async function getSessionDutyData(sessionIds) {
    const { rows: sessions } = await db.query(
        `SELECT id, exam_name, exam_date, session, year_sem
         FROM exam_sessions WHERE id = ANY($1::int[]) ORDER BY session`,
        [sessionIds]
    );
    const { rows: duties } = await db.query(
        `SELECT sd.exam_session_id, es.session, es.exam_name, es.exam_date,
                f.name AS faculty_name, f.designation, f.priority, sd.status
         FROM session_duty sd
         JOIN exam_sessions es ON es.id = sd.exam_session_id
         JOIN faculty f ON f.id = sd.faculty_id
         WHERE sd.exam_session_id = ANY($1::int[])
         ORDER BY es.session, f.priority, f.name`,
        [sessionIds]
    );
    return { sessions, duties };
}

async function generateSessionDutyChartExcel(sessionIds) {
    const { sessions, duties } = await getSessionDutyData(sessionIds);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Duty Chart');

    const title = sessions.map(s => `${s.exam_name} ${String(s.exam_date).slice(0,10)} (${s.session})`).join(' + ');
    sheet.mergeCells('A1:E1');
    sheet.getCell('A1').value = title;
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.addRow([]);

    const hr = sheet.addRow(['Session', 'S.No', 'Invigilator', 'Designation', 'Status']);
    hr.font = { bold: true };
    hr.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e293b' } };
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    });

    let sno = 1;
    for (const d of duties) {
        sheet.addRow([
            d.session,
            sno++,
            d.faculty_name,
            d.designation ? d.designation.replace(/_/g, ' ') : '',
            d.status,
        ]);
    }
    sheet.columns.forEach(c => { c.width = 24; });
    return workbook.xlsx.writeBuffer();
}

async function generateSessionDutyChartPdf(sessionIds) {
    const { sessions, duties } = await getSessionDutyData(sessionIds);
    return new Promise((resolve, reject) => {
        const doc    = new PDFDocument({ margin: 40 });
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const title = sessions.map(s => `${s.exam_name} — ${String(s.exam_date).slice(0,10)} (${s.session})`).join(' + ');
        doc.fontSize(14).font('Helvetica-Bold').text(title, { align: 'center' });
        doc.moveDown();

        let sno = 1;
        for (const d of duties) {
            doc.fontSize(11).font('Helvetica')
               .text(`${d.session}  |  ${sno++}. ${d.faculty_name}  (${d.designation ? d.designation.replace(/_/g,' ') : ''})  — ${d.status}`);
        }
        doc.end();
    });
}

module.exports = {
    generateDutyChartExcel,
    generateDutyChartPdf,
    generateSessionDutyChartExcel,
    generateSessionDutyChartPdf,
};

