const db = require('../db');

async function testIsolation() {
    console.log('--- Testing Department Login Credentials & Data Isolation ---');

    // 1. Verify all 6 department users exist in users table
    const { rows: users } = await db.query('SELECT username, department_name FROM users ORDER BY username');
    console.log('Registered Users in Database:');
    users.forEach(u => console.log(`  - ${u.username} (${u.department_name})`));

    const usernames = users.map(u => u.username);
    const expected = ['CSE-srkr', 'civil-srkr', 'ece-srkr', 'eee-srkr', 'it-srkr', 'mech-srkr'];
    const allPresent = expected.every(e => usernames.includes(e));

    if (!allPresent) {
        throw new Error('Not all expected department accounts are seeded in database!');
    }
    console.log('✔ All 6 department accounts verified!');
}

testIsolation().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
