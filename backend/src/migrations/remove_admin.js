const db = require('../db');

async function run() {
    await db.query("DELETE FROM users WHERE username = 'admin'");
    console.log('✔ Removed admin user account from database.');
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
