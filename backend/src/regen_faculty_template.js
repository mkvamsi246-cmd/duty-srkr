/**
 * Regenerates the Faculty Master Excel template with the new column layout:
 * S.No | Name | Designation | Department | Shortcuts | Email | Phone
 *
 * Run with: node regen_faculty_template.js
 */

const XLSX = require('xlsx');
const path = require('path');

const headers = [['S.No', 'Name', 'Designation', 'Department', 'Shortcuts', 'Email', 'Phone']];

// Sample rows to give users a clear example
const sampleRows = [
    [1, 'Dr. A. Example', 'Professor', 'CSE', 'AE', 'a.example@college.edu', '9876543210'],
    [2, 'Ms. B. Sample', 'Associate Professor', 'ECE', 'BS', 'b.sample@college.edu', '9123456780'],
    [3, 'Mr. C. Demo', 'Assistant Professor', 'MECH', 'CD', 'c.demo@college.edu', ''],
];

const wb = XLSX.utils.book_new();
const wsData = [...headers, ...sampleRows];
const ws = XLSX.utils.aoa_to_sheet(wsData);

// Column widths
ws['!cols'] = [
    { wch: 6  },  // S.No
    { wch: 28 },  // Name
    { wch: 22 },  // Designation
    { wch: 16 },  // Department
    { wch: 12 },  // Shortcuts
    { wch: 30 },  // Email
    { wch: 14 },  // Phone
];

XLSX.utils.book_append_sheet(wb, ws, 'Faculty');

const outPath = path.join(__dirname, '..', 'templates', 'Faculty_Master_Template.xlsx');
XLSX.writeFile(wb, outPath);
console.log('Written:', outPath);
