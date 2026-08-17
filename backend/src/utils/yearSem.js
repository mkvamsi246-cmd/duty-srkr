/**
 * yearSem.js — shared helpers for year/semester extraction and validation.
 *
 * Convention: timetable subject codes embed the year-sem as a leading token,
 * e.g. "3-1-CN-CSE-B", "2-1-DBMS LAB-CSE-D", "4-2-MP-ECE-A".
 * This helper extracts that token so the allocation engine and import parser
 * can both use the same logic without duplicating it.
 */

/** The canonical set of valid year-sem tokens (all 8 semesters). */
const VALID_YEAR_SEMS = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];

// Pre-build a regex that matches any valid token at the START of the string
// (optionally followed by a separator: hyphen, space, underscore, or end-of-string).
// Anchored to the start so "10-1-XYZ" won't accidentally match "1-1".
const YEAR_SEM_RE = /^((?:[1-4])-(?:[12]))(?:[-\s_]|$)/;

/**
 * Extracts the leading year-sem token from a subject code string.
 *
 * Examples:
 *   extractYearSem("3-1-CN-CSE-B")   ? "3-1"
 *   extractYearSem("2-1-DBMS LAB")   ? "2-1"
 *   extractYearSem("4-2-MP-ECE-A")   ? "4-2"
 *   extractYearSem("DBMS")           ? null   (no valid prefix)
 *   extractYearSem("5-1-XYZ")        ? null   (5-1 not a valid sem)
 *   extractYearSem("")               ? null
 *   extractYearSem(null)             ? null
 *
 * @param {string|null|undefined} subjectCode
 * @returns {string|null} a value from VALID_YEAR_SEMS, or null if not found
 */
function extractYearSem(subjectCode) {
    if (!subjectCode) return null;
    const s = String(subjectCode).trim();
    const match = s.match(YEAR_SEM_RE);
    if (!match) return null;
    const token = match[1]; // e.g. "3-1"
    return VALID_YEAR_SEMS.includes(token) ? token : null;
}

module.exports = { extractYearSem, VALID_YEAR_SEMS };
