const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const XLSX    = require('xlsx');

// Map import-type keys to the pre-built template files in backend/templates/
const TEMPLATE_FILES = {
    faculty:       'Faculty_Master_Template.xlsx',
    classrooms:    'Classroom_Master_Template.xlsx',
    exam_rooms:    'Exam_Room_Allocation_Template.xlsx',
    exam_sessions: null, // generated inline
    timetable:     'Faculty_Timetable_Template.xlsx',
    workload:      null, // generated inline
};

const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'templates');

router.get('/:type', (req, res) => {
    const { type } = req.params;

    if (!(type in TEMPLATE_FILES)) {
        return res.status(404).json({ error: `No template for type: ${type}` });
    }

    if (type === 'faculty') {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([
            ['S.No', 'Name', 'Designation', 'Department', 'Shortcuts', 'Email', 'Contact', 'Room No'],
            [1, 'Dr. A. Kumar', 'Professor', 'CSE', 'AK', 'akumar@college.edu', '9876543210', 'A-101'],
            [2, 'Smt. B. Rao', 'Assistant Professor', 'CSE', 'BR', 'brao@college.edu', '9876543211', 'B-202'],
        ]);
        ws['!cols'] = [{ wch: 8 }, { wch: 25 }, { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 24 }, { wch: 15 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Faculty Master');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Faculty_Master_Template.xlsx"');
        return res.send(buf);
    }

    if (type === 'exam_sessions') {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([
            ['Exam Name', 'Date',       'Session', 'Year/Sem', 'Required Invigilators', 'Start Time', 'End Time'],
            ['MID-1',     '2026-08-25', 'BOTH',    '4-1',      10,                       '09:30',      '12:30'],
            ['Mid-2',     '2026-08-26', 'FN',      '3-1',      8,                        '09:30',      '12:30'],
        ]);
        ws['!cols'] = [{ wch: 15 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Exam Sessions');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Exam_Sessions_Template.xlsx"');
        return res.send(buf);
    }

    const fileName = TEMPLATE_FILES[type];

    // workload — build a simple inline sample workbook on the fly
    if (!fileName) {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([
            ['Faculty Name', 'Total'],
            ['Dr. A Kumar',  5],
            ['Prof. B Rao',  3],
            ['Dr. C Reddy',  7],
        ]);
        ws['!cols'] = [{ wch: 30 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Work Load');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Workload_Template.xlsx"');
        return res.send(buf);
    }

    const filePath = path.join(TEMPLATES_DIR, fileName);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `Template file not found: ${fileName}` });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.sendFile(filePath);
});

module.exports = router;
