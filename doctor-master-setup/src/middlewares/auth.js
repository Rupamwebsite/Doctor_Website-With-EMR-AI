// src/middlewares/auth.js
// Final, robust authentication check for x-admin-key

const ADMIN_KEY = process.env.ADMIN_KEY;

module.exports = function adminAuth(req, res, next) {
    const clientKey = req.headers['x-admin-key']; 
    // টার্মিনালে '[AUTH CHECK] Server Key Status: LOADED' দেখতে পাওয়া উচিত
    console.log(`[AUTH CHECK] Server Key Status: ${ADMIN_KEY ? 'LOADED' : 'MISSING'}`);
    
    if (!ADMIN_KEY) {
        return res.status(500).json({ error: 'Server configuration error: Admin Key not loaded.' });
    }

    // Key চেক করা হচ্ছে
    if (clientKey && clientKey === ADMIN_KEY) {
        console.log(`[AUTH CHECK] SUCCESS for client key: ${clientKey}`);
        return next();
    }
    
    // 401 Unauthorized
    console.warn(`[AUTH CHECK] FAILURE. Client sent: ${clientKey}`);
    return res.status(401).json({ error: 'Unauthorized. Invalid or missing Admin Auth Key.' });
};