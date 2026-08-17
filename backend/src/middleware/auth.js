function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        req.userId = req.session.userId;
        req.username = req.session.username;
        return next();
    }
    return res.status(401).json({ error: 'Not authenticated' });
}

module.exports = { requireAuth };
