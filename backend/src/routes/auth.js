const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

    try {
        // Query users table (case-insensitive username check)
        const { rows } = await db.query(
            `SELECT id, username, password, department_name FROM users WHERE LOWER(username) = LOWER($1)`,
            [username.trim()]
        );

        if (rows.length > 0 && rows[0].password === password) {
            const user = rows[0];
            req.session.userId = user.id;
            req.session.username = user.username;
            return res.json({ success: true, username: user.username, departmentName: user.department_name });
        }

        return res.status(401).json({ error: 'Invalid username or password' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
});

router.get('/status', (req, res) => {
    const authenticated = !!(req.session && req.session.userId);
    res.json({
        authenticated,
        username: req.session ? req.session.username : null,
        userId: req.session ? req.session.userId : null
    });
});

router.post('/change-password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (newPassword.length < 4) {
        return res.status(400).json({ error: 'New password must be at least 4 characters long' });
    }

    try {
        const { rows } = await db.query('SELECT password FROM users WHERE id = $1', [req.userId]);
        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

        if (rows[0].password !== currentPassword) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }

        await db.query('UPDATE users SET password = $1 WHERE id = $2', [newPassword, req.userId]);
        res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
