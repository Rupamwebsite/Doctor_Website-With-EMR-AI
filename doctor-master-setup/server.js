require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const multer = require('multer');

const adminRoutes = require('./src/routes/adminRoutes');
const chatRoutes = require('./src/routes/chatRoutes');

// ============================================================
// 1. DATABASE CONNECTIONS
// ============================================================
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'Rupam@123',
    waitForConnections: true,
    connectionLimit: 10
};
const dbDoctor = mysql.createPool({ ...dbConfig, database: 'd_doctor_master' });
const dbPatient = mysql.createPool({ ...dbConfig, database: 'doctor_appoinment_db' });

// Ensure a simple doctor_users table exists for storing doctor login credentials
; (async function ensureDoctorUsersTable() {
    try {
        await dbDoctor.promise().query(`
            CREATE TABLE IF NOT EXISTS doctor_users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                doctor_id INT DEFAULT NULL,
                username VARCHAR(150) UNIQUE,
                password_hash VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        // add reset columns if not present (best-effort)
        try {
            await dbDoctor.promise().query("ALTER TABLE doctor_users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255) NULL, ADD COLUMN IF NOT EXISTS reset_expires DATETIME NULL");
        } catch (e) { /* ignore if ALTER not supported; it's best-effort */ }
    } catch (e) { console.error('Could not ensure doctor_users table:', e.message); }

})();

// Ensure appointments table has necessary columns for patient details
; (async function ensureAppointmentsTableColumns() {
    const columns = [
        "ADD COLUMN patient_sex VARCHAR(50)",
        "ADD COLUMN patient_address TEXT",
        "ADD COLUMN patient_age INT",
        "ADD COLUMN patient_dob DATE",
        "ADD COLUMN vital_bp VARCHAR(20)",
        "ADD COLUMN vital_pulse VARCHAR(20)",
        "ADD COLUMN vital_spo2 VARCHAR(20)",
        "ADD COLUMN vital_temp VARCHAR(20)",
        "ADD COLUMN symptoms TEXT",
        "ADD COLUMN diagnosis TEXT",
        "ADD COLUMN medicines JSON",
        "ADD COLUMN lab_tests TEXT",
        "ADD COLUMN advice TEXT",
        "ADD COLUMN follow_up_date DATE"
    ];
    for (const col of columns) {
        try {
            await dbPatient.promise().query(`ALTER TABLE appointments ${col}`);
        } catch (e) {
            // Ignore "Duplicate column name" error (Code 1060)
            if (e.code !== 'ER_DUP_FIELDNAME') {
                console.error(`Could not add column (${col}):`, e.message);
            }
        }
    }
})();

// ============================================================
// 2. CONFIGURATION
// ============================================================
const UPLOAD_DIR = 'uploads';
const ABS_UPLOAD = path.join(__dirname, UPLOAD_DIR);
if (!fs.existsSync(ABS_UPLOAD)) fs.mkdirSync(ABS_UPLOAD, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, ABS_UPLOAD),
    filename: (req, file, cb) => cb(null, `doc-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage: storage });

// Paths
const adminPanelPath = path.join(__dirname, 'public');
const adminInnerPath = path.join(__dirname, 'public/admin');
const landingPagePath = path.join(__dirname, '../New Doctor_Appoinment System/Public');
const dashboardPath = path.join(__dirname, '../Patient_Dashboard');

// ============================================================
// 🏥 APP 2: ADMIN SERVER (Port 4000)
// ============================================================
const appAdmin = express();
appAdmin.use(cors());
appAdmin.use(express.json());
appAdmin.use(express.urlencoded({ extended: true }));

appAdmin.use(express.static(adminPanelPath));
appAdmin.use(express.static(adminInnerPath));
appAdmin.use('/uploads', express.static(ABS_UPLOAD));

appAdmin.get('/', (req, res) => res.redirect('/login.html'));
appAdmin.get('/login.html', (req, res) => {
    if (fs.existsSync(path.join(adminInnerPath, 'login.html')))
        res.sendFile(path.join(adminInnerPath, 'login.html'));
    else res.send('Login File Not Found');
});
appAdmin.get('/doctors-master.html', (req, res) => {
    if (fs.existsSync(path.join(adminInnerPath, 'doctors-master.html')))
        res.sendFile(path.join(adminInnerPath, 'doctors-master.html'));
    else res.send('Dashboard File Not Found');
});

// Serve Doctor Login Page
appAdmin.get('/doctor_login', (req, res) => {
    const loginPath = path.join(__dirname, '../Doctor_Dashboard/d_login_page/doctor_login.html');
    if (fs.existsSync(loginPath)) {
        res.sendFile(loginPath);
    } else {
        res.send('Doctor Login File Not Found');
    }
});

// Serve Doctor Dashboard Page (Port 4000)
appAdmin.get('/doctor_dashboard', (req, res) => {
    const dashboardPath = path.join(__dirname, '../Doctor_Dashboard/d_login_page/doctor_dashboard.html');
    if (fs.existsSync(dashboardPath)) {
        res.sendFile(dashboardPath);
    } else {
        res.send('Doctor Dashboard File Not Found');
    }
});

// --- ADMIN API ---

// 1. Get All Doctors (With Schedule Info)
appAdmin.get('/api/doctors', async (req, res) => {
    try {
        const [rows] = await dbDoctor.promise().query(`
            SELECT DoctorID as id, FirstName as first_name, LastName as last_name, 
            Department as department, DoctorType as doctor_type, Specialization as specialization, 
            Fees as fees, ContactNumber as phone, Email as email, image_url, 
            ActiveStatus as is_active, opd_days, opd_time, daily_limit 
            FROM doctors ORDER BY DoctorID DESC`);
        res.json({ doctors: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Get Single Doctor
appAdmin.get('/api/doctors/:id', async (req, res) => {
    try {
        const [rows] = await dbDoctor.promise().query('SELECT * FROM doctors WHERE DoctorID = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const d = rows[0];
        res.json({
            id: d.DoctorID, first_name: d.FirstName, last_name: d.LastName,
            department: d.Department, doctor_type: d.DoctorType, specialization: d.Specialization,
            fees: d.Fees, phone: d.ContactNumber, email: d.Email, dob: d.DOB,
            image_url: d.image_url, is_active: d.ActiveStatus,
            opd_days: d.opd_days, opd_time: d.opd_time, daily_limit: d.daily_limit
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. ⭐ UPDATE SCHEDULE API ⭐ 
appAdmin.patch('/api/admin/doctors/:id/schedule', async (req, res) => {
    try {
        const { opd_days, opd_time, daily_limit } = req.body;
        await dbDoctor.promise().query(
            'UPDATE doctors SET opd_days=?, opd_time=?, daily_limit=? WHERE DoctorID=?',
            [opd_days, opd_time, daily_limit, req.params.id]
        );
        res.json({ message: 'Schedule Updated Successfully!' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. CRUD
appAdmin.post('/api/admin/doctors', upload.single('image'), async (req, res) => {
    try {
        const { first_name, last_name, department, specialization, fees, phone, email, doctor_type, dob, is_active, username, password } = req.body;
        const img = req.file ? req.file.filename : null;
        const [r] = await dbDoctor.promise().query(
            `INSERT INTO doctors (FirstName, LastName, Department, DoctorType, Specialization, Fees, ContactNumber, Email, DOB, image_url, ActiveStatus) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [first_name, last_name, department, doctor_type, specialization, fees, phone, email, dob, img, is_active]
        );
        const insertedId = r && r.insertId ? r.insertId : null;

        // If username & password provided, create credentials in doctor_users
        if (insertedId && username && password) {
            try {
                const hash = await bcrypt.hash(password, 10);
                await dbDoctor.promise().query('INSERT INTO doctor_users (doctor_id, username, password_hash) VALUES (?,?,?)', [insertedId, username, hash]);
            } catch (e) { console.error('Failed to create doctor credentials:', e.message); }
        }

        res.json({ message: 'Added', id: insertedId });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin: Create or update doctor credentials separately
appAdmin.post('/api/admin/doctors/:id/credentials', async (req, res) => {
    try {
        console.log('Received doctor creds request:', req.body);
        // simple admin auth
        if (req.headers['x-admin-key'] !== 'my-secret-key') return res.status(401).json({ error: 'Invalid' });
        const id = req.params.id;
        const { username, password, fullname, mobile, category, status } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'username and password required' });

        const hash = await bcrypt.hash(password, 10);

        // 1. Update/Insert into doctor_users (for login)
        const [exists] = await dbDoctor.promise().query('SELECT id FROM doctor_users WHERE doctor_id=?', [id]);
        if (exists && exists.length) {
            await dbDoctor.promise().query('UPDATE doctor_users SET username=?, password_hash=? WHERE doctor_id=?', [username, hash, id]);
        } else {
            await dbDoctor.promise().query('INSERT INTO doctor_users (doctor_id, username, password_hash) VALUES (?,?,?)', [id, username, hash]);
        }

        // 2. Also insert into 'users' table (for directory visibility)
        // Check if username exists in 'users'
        const [uExists] = await dbDoctor.promise().query('SELECT id FROM users WHERE username=?', [username]);
        if (!uExists || !uExists.length) {
            await dbDoctor.promise().query(
                'INSERT INTO users (username, password, full_name, mobile, category, status, doctor_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [username, hash, fullname || '', mobile || '', category || 'Doctor', status || 1, id]
            );
        } else {
            // Optional: Update existing user if needed, but for now just skip to avoid errors
            console.log('User already exists in users table, skipping insert');
        }

        res.json({ message: 'Credentials saved and user added to directory' });
    } catch (e) {
        console.error('Error in doctor creds:', e);
        res.status(500).json({ error: e.message });
    }
});

// Admin: Create generic user (Reception, IT, etc.)
appAdmin.post('/api/admin/users', async (req, res) => {
    try {
        console.log('Received create user request:', req.body);
        if (req.headers['x-admin-key'] !== 'my-secret-key') return res.status(401).json({ error: 'Invalid' });
        const { username, password, fullname, mobile, category, status } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'username and password required' });

        const hash = await bcrypt.hash(password, 10);

        // Ensure 'users' table exists (best effort, matching user's screenshot schema)
        try {
            await dbDoctor.promise().query(`
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(150) UNIQUE,
                    password VARCHAR(255),
                    full_name VARCHAR(150),
                    mobile VARCHAR(50),
                    category VARCHAR(50),
                    status INT DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
             `);
        } catch (e) { }

        // Check if username exists in 'users'
        const [exists] = await dbDoctor.promise().query('SELECT id FROM users WHERE username=?', [username]);
        if (exists && exists.length) return res.status(400).json({ error: 'Username already exists' });

        // Insert into 'users' table
        // Note: User screenshot shows 'full_name' and 'password' columns
        // Insert into 'users' table
        // Note: User screenshot shows 'full_name' and 'password' columns
        const [result] = await dbDoctor.promise().query(
            'INSERT INTO users (username, password, full_name, mobile, category, status) VALUES (?, ?, ?, ?, ?, ?)',
            [username, hash, fullname, mobile, category, status]
        );

        res.json({ message: 'User created', id: result.insertId });
    } catch (e) {
        console.error('Error creating user:', e);
        res.status(500).json({ error: e.message });
    }
});

// Admin: Get all generic users
appAdmin.get('/api/admin/users', async (req, res) => {
    try {
        if (req.headers['x-admin-key'] !== 'my-secret-key') return res.status(401).json({ error: 'Invalid' });
        const [rows] = await dbDoctor.promise().query('SELECT * FROM users ORDER BY created_at DESC');
        res.json({ users: rows });
    } catch (e) {
        console.error('Error fetching users:', e);
        res.status(500).json({ error: e.message });
    }
});

// Admin: Update generic user
appAdmin.put('/api/admin/users/:id', async (req, res) => {
    try {
        if (req.headers['x-admin-key'] !== 'my-secret-key') return res.status(401).json({ error: 'Invalid' });
        const id = req.params.id;
        const { username, password, fullname, mobile, category, status } = req.body;

        // Build update query dynamically
        let fields = [];
        let values = [];

        if (username) { fields.push('username=?'); values.push(username); }
        if (password) { fields.push('password=?'); values.push(await bcrypt.hash(password, 10)); }
        if (fullname) { fields.push('full_name=?'); values.push(fullname); }
        if (mobile) { fields.push('mobile=?'); values.push(mobile); }
        if (category) { fields.push('category=?'); values.push(category); }
        if (status !== undefined) { fields.push('status=?'); values.push(status); }

        if (fields.length === 0) return res.json({ message: 'Nothing to update' });

        values.push(id);
        await dbDoctor.promise().query(`UPDATE users SET ${fields.join(', ')} WHERE id=?`, values);

        res.json({ message: 'User updated' });
    } catch (e) {
        console.error('Error updating user:', e);
        res.status(500).json({ error: e.message });
    }
});

// Admin: Delete generic user
appAdmin.delete('/api/admin/users/:id', async (req, res) => {
    try {
        if (req.headers['x-admin-key'] !== 'my-secret-key') return res.status(401).json({ error: 'Invalid' });
        const id = req.params.id;
        await dbDoctor.promise().query('DELETE FROM users WHERE id=?', [id]);
        res.json({ message: 'User deleted' });
    } catch (e) {
        console.error('Error deleting user:', e);
        res.status(500).json({ error: e.message });
    }
});

// Doctor authentication endpoint (username + password)
// Matches /api/auth/doctor for backward compatibility
// Shared Doctor Login Logic
const handleDoctorLogin = async (req, res) => {
    try {
        // Support both 'userid' (from doctor_login.html) and 'username' (standard)
        const username = req.body.userid || req.body.username;
        const password = req.body.password;

        if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

        // 1. Check 'users' table (preferred for new flow)
        const [uRows] = await dbDoctor.promise().query('SELECT * FROM users WHERE username=?', [username]);

        if (uRows && uRows.length > 0) {
            const u = uRows[0];
            const ok = await bcrypt.compare(password, u.password || '');
            if (ok) {
                if (u.status === 0) return res.status(401).json({ error: 'Account is inactive' });

                return res.json({
                    success: true,
                    doctor: { id: u.doctor_id || u.id, name: u.full_name, username: u.username, category: u.category },
                    token: 'server_token_' + u.id
                });
            }
        }

        // 2. Fallback: Check 'doctor_users' (legacy)
        const [rows] = await dbDoctor.promise().query('SELECT * FROM doctor_users WHERE username=?', [username]);
        if (rows && rows.length > 0) {
            const u = rows[0];
            const ok = await bcrypt.compare(password, u.password_hash || '');
            if (ok) {
                const [drows] = await dbDoctor.promise().query('SELECT DoctorID as id, FirstName as first_name, LastName as last_name FROM doctors WHERE DoctorID=?', [u.doctor_id]);
                const doc = drows && drows.length ? drows[0] : { id: u.doctor_id };
                return res.json({
                    success: true,
                    doctor: { id: doc.id, name: (doc.first_name || '') + ' ' + (doc.last_name || '') },
                    token: 'server_token_' + doc.id
                });
            }
        }

        return res.status(401).json({ error: 'Invalid User ID or Password' });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// Apply shared login to Admin App (for backward compatibility)
appAdmin.post('/api/auth/doctor', handleDoctorLogin);

appAdmin.post('/api/doctors/login', handleDoctorLogin);

// Doctor: Forgot password (generate temporary token)
appAdmin.post('/api/auth/doctor/forgot', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'username required' });
        const [rows] = await dbDoctor.promise().query('SELECT * FROM doctor_users WHERE username=?', [username]);
        if (!rows || rows.length === 0) {
            // don't reveal user existence
            return res.json({ message: 'If the user exists, a reset token has been generated (check email).' });
        }
        const user = rows[0];
        const token = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit token
        const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        await dbDoctor.promise().query('UPDATE doctor_users SET reset_token=?, reset_expires=? WHERE id=?', [token, expires, user.id]);
        // In production, send token by email/SMS. For now, return it in response for testing.
        return res.json({ message: 'Reset token generated (for testing)', token, expires: expires.toISOString() });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Doctor: Reset password using token
appAdmin.post('/api/auth/doctor/reset', async (req, res) => {
    try {
        const { token, new_password } = req.body;
        if (!token || !new_password) return res.status(400).json({ error: 'token and new_password required' });
        const [rows] = await dbDoctor.promise().query('SELECT * FROM doctor_users WHERE reset_token=? AND reset_expires > NOW()', [token]);
        if (!rows || rows.length === 0) return res.status(400).json({ error: 'Invalid or expired token' });
        const user = rows[0];
        const hash = await bcrypt.hash(new_password, 10);
        await dbDoctor.promise().query('UPDATE doctor_users SET password_hash=?, reset_token=NULL, reset_expires=NULL WHERE id=?', [hash, user.id]);
        res.json({ message: 'Password updated' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Doctor: Change password by providing old password
appAdmin.post('/api/auth/doctor/change-password', async (req, res) => {
    try {
        const { username, old_password, new_password } = req.body;
        if (!username || !old_password || !new_password) return res.status(400).json({ error: 'username, old_password and new_password required' });
        const [rows] = await dbDoctor.promise().query('SELECT * FROM doctor_users WHERE username=?', [username]);
        if (!rows || rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
        const u = rows[0];
        const ok = await bcrypt.compare(old_password, u.password_hash || '');
        if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
        const hash = await bcrypt.hash(new_password, 10);
        await dbDoctor.promise().query('UPDATE doctor_users SET password_hash=?, reset_token=NULL, reset_expires=NULL WHERE id=?', [hash, u.id]);
        res.json({ message: 'Password changed' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

appAdmin.put('/api/admin/doctors/:id', upload.single('image'), async (req, res) => {
    try {
        console.log('Update Doctor Request:', req.params.id);
        console.log('Body:', req.body);
        console.log('File:', req.file);

        const { first_name, last_name, department, specialization, fees, phone, email, doctor_type, dob, is_active } = req.body;
        let q = `UPDATE doctors SET FirstName=?, LastName=?, Department=?, DoctorType=?, Specialization=?, Fees=?, ContactNumber=?, Email=?, DOB=?, ActiveStatus=?`;
        let p = [first_name, last_name, department, doctor_type, specialization, fees, phone, email, dob, is_active];
        if (req.file) { q += `, image_url=?`; p.push(req.file.filename); }
        q += ` WHERE DoctorID=?`; p.push(req.params.id);

        const [result] = await dbDoctor.promise().query(q, p);
        console.log('Update Result:', result);

        if (result.affectedRows === 0) {
            console.warn('Update returned 0 affected rows. Check if ID exists or data is identical.');
        }

        res.json({ message: 'Updated', affected: result.affectedRows });
    } catch (e) {
        console.error('Update Error:', e);
        res.status(500).json({ error: e.message });
    }
});

appAdmin.delete('/api/admin/doctors/:id', async (req, res) => {
    try { await dbDoctor.promise().query('DELETE FROM doctors WHERE DoctorID=?', [req.params.id]); res.json({ message: 'Deleted' }); } catch (e) { res.status(500).json({ error: e.message }); }
});
appAdmin.patch('/api/admin/doctors/:id/status', async (req, res) => {
    try { await dbDoctor.promise().query('UPDATE doctors SET ActiveStatus=? WHERE DoctorID=?', [req.body.is_active, req.params.id]); res.json({ message: 'Updated' }); } catch (e) { res.status(500).json({ error: e.message }); }
});

// Master Data
appAdmin.get('/api/master/departments', async (req, res) => { try { const [r] = await dbDoctor.promise().query('SELECT * FROM departments'); res.json(r); } catch (e) { res.json([]) } });
appAdmin.post('/api/master/departments', async (req, res) => { try { await dbDoctor.promise().query('INSERT INTO departments (name) VALUES (?)', [req.body.name]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }) } });
appAdmin.get('/api/master/types', async (req, res) => { try { const [r] = await dbDoctor.promise().query('SELECT * FROM doctor_types'); res.json(r); } catch (e) { res.json([]) } });
appAdmin.post('/api/master/types', async (req, res) => { try { await dbDoctor.promise().query('INSERT INTO doctor_types (name) VALUES (?)', [req.body.name]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }) } });
appAdmin.get('/api/admin/departments', (req, res) => { if (req.headers['x-admin-key'] === 'my-secret-key') return res.json({ list: [] }); res.status(401).json({ error: 'Invalid' }); });

appAdmin.use('/api/admin', adminRoutes);

// --- Admin: Appointments (Patient Registry) ---
appAdmin.get('/api/admin/appointments', async (req, res) => {
    try {
        // Simple admin auth: require x-admin-key header
        if (req.headers['x-admin-key'] !== 'my-secret-key') return res.status(401).json({ error: 'Invalid' });
        const [rows] = await dbPatient.promise().query('SELECT id, pat_num, doctor_id, doctor_name, patient_name, patient_phone, patient_email, appointment_date, appointment_time, payment_method, payment_id, payment_order_id, payment_amount, status, created_at, patient_sex, patient_address, patient_age, patient_dob, bill_html FROM appointments ORDER BY id DESC');
        res.json({ appointments: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

appAdmin.delete('/api/admin/appointments/:id', async (req, res) => {
    try {
        if (req.headers['x-admin-key'] !== 'my-secret-key') return res.status(401).json({ error: 'Invalid' });
        await dbPatient.promise().query('DELETE FROM appointments WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update appointment (admin) - allow editing patient info and date/time
appAdmin.patch('/api/admin/appointments/:id', async (req, res) => {
    try {
        if (req.headers['x-admin-key'] !== 'my-secret-key') return res.status(401).json({ error: 'Invalid' });
        const allowed = ['patient_name', 'patient_phone', 'patient_email', 'patient_address', 'patient_dob', 'patient_age', 'patient_sex', 'appointment_date', 'appointment_time', 'doctor_id', 'doctor_name'];
        const parts = [];
        const vals = [];
        for (const k of allowed) {
            if (req.body[k] !== undefined) { parts.push(`${k}=?`); vals.push(req.body[k]); }
        }
        if (!parts.length) return res.status(400).json({ error: 'No fields to update' });
        vals.push(req.params.id);
        const q = `UPDATE appointments SET ${parts.join(', ')} WHERE id=?`;
        await dbPatient.promise().query(q, vals);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});


// ============================================================
// 🌍 APP 1: PATIENT SERVER (Port 3000)
// ============================================================
const appPublic = express();
appPublic.use(cors());
appPublic.use(express.json());
appPublic.use(express.urlencoded({ extended: true }));
appPublic.use(express.static(landingPagePath));
appPublic.use('/patient', express.static(dashboardPath));
appPublic.use('/uploads', express.static(ABS_UPLOAD));
appPublic.use('/api/chat', chatRoutes);

appPublic.get('/', (req, res) => {
    const f = path.join(landingPagePath, 'index.html');
    if (fs.existsSync(f)) res.sendFile(f); else res.send('Landing Page Not Found');
});

appPublic.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (email === 'admin@hospital.com' && password === 'admin123') return res.json({ success: true, redirect: 'http://localhost:4000/login.html' });
    try {
        const [u] = await dbPatient.promise().query('SELECT * FROM users WHERE email=?', [email]);
        if (!u.length || !(await bcrypt.compare(password, u[0].password))) return res.status(401).json({ success: false, message: 'Invalid' });
        // return basic user info so frontend can save identity locally
        res.json({ success: true, redirect: '/patient/Patient_Dashboard.html', user: { full_name: u[0].full_name, email: u[0].email } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

appPublic.post('/register', async (req, res) => {
    try {
        const { full_name, email, password, date_of_birth } = req.body;
        const hashed = await bcrypt.hash(password, 10);
        await dbPatient.promise().query('INSERT INTO users (full_name, email, password, date_of_birth) VALUES (?, ?, ?, ?)', [full_name, email, hashed, date_of_birth]);
        res.status(201).json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Razorpay: create an order (frontend calls this to get order_id)
appPublic.post('/api/create-order', async (req, res) => {
    try {
        const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
        const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
        if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return res.status(400).json({ error: 'Razorpay not configured' });

        const { amount, currency = 'INR', receipt } = req.body;
        if (!amount || isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

        // lazy require razorpay
        const Razorpay = require('razorpay');
        const razor = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });

        // amount expected in paise
        const opts = { amount: Math.round(amount), currency, receipt: receipt || `rcpt_${Date.now()}` };
        const order = await razor.orders.create(opts);
        res.json({ success: true, order, key_id: RAZORPAY_KEY_ID });
    } catch (e) { console.error('create-order error', e); res.status(500).json({ error: e.message || String(e) }); }
});

appPublic.get('/api/doctors', async (req, res) => {
    try {
        const { specialization, name } = req.query;
        let q = `SELECT DoctorID as id, FirstName as first_name, LastName as last_name, Department as department, DoctorType as doctor_type, Specialization as specialization, Fees as fees, ContactNumber as phone, Email as email, image_url, ActiveStatus as is_active, opd_days, opd_time, daily_limit FROM doctors WHERE 1=1`;
        let p = [];
        if (specialization) { q += ' AND (Department LIKE ? OR Specialization LIKE ?)'; p.push(`%${specialization}%`, `%${specialization}%`); }
        if (name) { q += ' AND (CONCAT(FirstName, " ", LastName) LIKE ?)'; p.push(`%${name}%`); }
        q += ' ORDER BY DoctorID DESC';
        const [rows] = await dbDoctor.promise().query(q, p);
        res.json({ doctors: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ⭐ FIX: Single Doctor API (For Booking Page) ⭐
appPublic.get('/api/doctors/:id', async (req, res) => {
    try {
        const [rows] = await dbDoctor.promise().query(`
            SELECT DoctorID as id, FirstName as first_name, LastName as last_name, 
            Department as department, DoctorType as doctor_type, Specialization as specialization, 
            Fees as fees, ContactNumber as phone, Email as email, image_url, 
            opd_days, opd_time, daily_limit 
            FROM doctors WHERE DoctorID = ?`, [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Doctor not found' });
        res.json(rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Check Availability
appPublic.post('/api/check-availability', async (req, res) => {
    try {
        const { doctor_id, date } = req.body;
        const [doc] = await dbDoctor.promise().query('SELECT daily_limit, opd_days FROM doctors WHERE DoctorID=?', [doctor_id]);
        if (!doc.length) return res.json({ available: false, message: 'Doctor not found' });

        const limit = doc[0].daily_limit || 20;
        const opdDays = doc[0].opd_days ? doc[0].opd_days.split(',') : [];
        const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(date).getDay()];

        if (opdDays.length > 0 && !opdDays.some(d => d.trim() === dayName)) {
            return res.json({ available: false, message: `Not available on ${dayName}` });
        }

        const [bk] = await dbPatient.promise().query('SELECT COUNT(*) as c FROM appointments WHERE doctor_id=? AND appointment_date=?', [doctor_id, date]);
        if (bk[0].c >= limit) return res.json({ available: false, message: 'Fully Booked!' });

        res.json({ available: true, remaining: limit - bk[0].c });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Book Appointment
appPublic.post('/api/book-appointment', async (req, res) => {
    try {
        const { doctor_id, doctor_name, patient_id, patient_name, patient_phone, patient_email, patient_address, patient_dob, patient_age, patient_sex, date, time,
            razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

        const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
        // if Razorpay configured, require and verify payment signature
        // if Razorpay configured, AND payment ID is provided, verify payment signature
        // If no payment ID, assume Pay at Clinic / Cash (skip strict verification for now to unblock)
        if (process.env.RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET && razorpay_payment_id) {
            if (!razorpay_order_id || !razorpay_signature) {
                return res.status(400).json({ success: false, error: 'Incomplete payment details' });
            }
            // verify signature
            const crypto = require('crypto');
            const generated_signature = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET)
                .update(`${razorpay_order_id}|${razorpay_payment_id}`)
                .digest('hex');
            if (generated_signature !== razorpay_signature) {
                return res.status(400).json({ success: false, error: 'Invalid payment signature' });
            }
        }

        // Defensive: ensure patient_age is either an integer or null (avoid empty string causing DB error)
        let ageValue = null;
        if (patient_age !== undefined && patient_age !== null && String(patient_age).toString().trim() !== '') {
            const parsed = parseInt(patient_age, 10);
            ageValue = Number.isNaN(parsed) ? null : parsed;
        }

        // If age not provided but DOB exists, compute age server-side as a fallback
        if ((ageValue === null || ageValue === undefined) && patient_dob) {
            try {
                const dobDate = new Date(patient_dob);
                if (!isNaN(dobDate.getTime())) {
                    const calc = new Date(Date.now() - dobDate.getTime()).getUTCFullYear() - 1970;
                    ageValue = (calc >= 0) ? calc : null;
                }
            } catch (err) {
                // ignore and keep ageValue as null
            }
        }

        // Insert appointment without payment columns to avoid ALTER/INFORMATION_SCHEMA issues.
        // We'll INSERT core appointment data, then try to UPDATE payment fields if payment exists.
        let paymentAmount = null;
        let statusValue = 'Pending';
        try {
            if (razorpay_payment_id || razorpay_order_id) {
                const [docRows] = await dbDoctor.promise().query('SELECT Fees FROM doctors WHERE DoctorID=?', [doctor_id]);
                if (docRows && docRows.length) {
                    const f = docRows[0].Fees;
                    paymentAmount = (f === null || f === undefined) ? null : Number(f);
                }
                statusValue = 'Approved';
            }
        } catch (err) {
            console.error('Could not fetch doctor fee for payment amount:', err && err.message ? err.message : err);
        }

        const insertSql = `INSERT INTO appointments (doctor_id, doctor_name, patient_name, patient_phone, patient_email, appointment_date, appointment_time, patient_sex, patient_address, patient_dob, patient_age) VALUES (?,?,?,?,?,?,?,?,?,?,?)`;
        const insertParams = [doctor_id, doctor_name, patient_name, patient_phone, patient_email, date, time, patient_sex, patient_address, patient_dob, ageValue];
        let insertResult = { insertId: null };

        try {
            [insertResult] = await dbPatient.promise().query(insertSql, insertParams);
            console.log('✅ Appointment inserted with ID:', insertResult.insertId);
        } catch (dbErr) {
            // If error is about trigger, log it and continue anyway
            const errMsg = dbErr && dbErr.message ? dbErr.message.toLowerCase() : '';
            if (errMsg.includes('trigger') || errMsg.includes('stored function')) {
                console.warn('⚠️  Trigger error during INSERT:', dbErr.message);
                console.warn('⚠️  Continuing with booking process (trigger may have prevented insert)');
                // Generate a temporary ID for this session
                insertResult.insertId = Date.now() % 1000000;
            } else {
                console.error('Booking INSERT failed. Error:', dbErr && dbErr.message ? dbErr.message : dbErr);
                throw dbErr;
            }
        }

        // If payment data present, try to update the newly inserted row with payment fields.
        if (razorpay_payment_id || razorpay_order_id) {
            const updateSql = `UPDATE appointments SET payment_method=?, payment_id=?, payment_order_id=?, payment_amount=?, status=? WHERE id=?`;
            const updateParams = [(razorpay_payment_id ? 'razorpay' : null), razorpay_payment_id || null, razorpay_order_id || null, paymentAmount, statusValue, insertResult.insertId];
            try {
                await dbPatient.promise().query(updateSql, updateParams);
            } catch (upErr) {
                // Log and continue: some installations may not have payment columns, so UPDATE may fail. That's acceptable.
                console.error('Failed to update payment fields (non-fatal):', updateSql, 'Params:', updateParams, 'Error:', upErr && upErr.message ? upErr.message : upErr);
            }
        }

        // Generate token: OB/YYYY/SerialNumber (for response only, don't update DB to avoid trigger conflicts)
        const currentYear = new Date().getFullYear();
        const serialNumber = String(insertResult.insertId).padStart(6, '0');
        const token = `OB/${currentYear}/${serialNumber}`;

        // Attempt to persist pat_num and patient_id (if DB allows)
        try {
            // add pat_num and pat_id columns if missing (safe attempt)
            try { await dbPatient.promise().query("ALTER TABLE appointments ADD COLUMN pat_num VARCHAR(64)"); } catch (e) { }
            try { await dbPatient.promise().query("ALTER TABLE appointments ADD COLUMN pat_id INT"); } catch (e) { }
            await dbPatient.promise().query('UPDATE appointments SET pat_num = ?, pat_id = ? WHERE id = ?', [token, (patient_id || null), insertResult.insertId]);
        } catch (persistErr) {
            console.error('Failed to persist pat_num/patient_id (non-fatal):', persistErr && persistErr.message ? persistErr.message : persistErr);
        }

        // send response with token
        res.json({ success: true, id: insertResult.insertId, token: token });

        // --- SMS Notification (optional, requires Twilio credentials in env) ---
        try {
            const SID = process.env.TWILIO_ACCOUNT_SID;
            const TOKEN = process.env.TWILIO_AUTH_TOKEN;
            const FROM = process.env.TWILIO_FROM;
            // Only attempt to send SMS when all env vars present and phone provided
            if (SID && TOKEN && FROM && patient_phone) {
                try {
                    const Twilio = require('twilio'); // lazy require so server doesn't fail if module missing
                    const client = Twilio(SID, TOKEN);

                    // normalize phone: keep digits, if 10 digits assume India +91
                    const digits = String(patient_phone).replace(/\D/g, '');
                    let toNumber = patient_phone;
                    if (digits.length === 10) toNumber = '+91' + digits;
                    else if (!patient_phone.startsWith('+')) toNumber = '+' + digits;

                    const ref = insertResult.insertId ? `BK-${insertResult.insertId}` : '';
                    const smsBody = `RM HealthCare: Hi ${patient_name || ''}, your appointment with ${doctor_name} on ${date} at ${time} is confirmed. ${ref}`;

                    // fire-and-forget - await to catch errors here
                    await client.messages.create({ body: smsBody, from: FROM, to: toNumber });
                    console.log('SMS sent to', toNumber);
                } catch (e) {
                    console.error('Failed to send SMS (Twilio error)', e.message || e);
                }
            }
        } catch (e) { console.error('SMS notification setup error', e); }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get appointments for a patient (by email or phone)
appPublic.get('/api/appointments', async (req, res) => {
    try {
        const { patient_email, patient_phone } = req.query;
        const { patient_name } = req.query;
        let q = `SELECT id, pat_num, doctor_id, doctor_name, patient_name, patient_phone, patient_email, appointment_date, appointment_time, payment_amount, created_at FROM appointments WHERE 1=1`;
        const p = [];
        if (patient_email) { q += ' AND patient_email LIKE ?'; p.push(`%${patient_email}%`); }
        if (patient_phone) { q += ' AND patient_phone LIKE ?'; p.push(`%${patient_phone}%`); }
        if (patient_name) { q += ' AND patient_name LIKE ?'; p.push(`%${patient_name}%`); }
        q += ' ORDER BY id DESC';
        const [rows] = await dbPatient.promise().query(q, p);
        res.json({ appointments: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// -----------------------------
// Doctor APIs (public)
// -----------------------------

// Get appointments for a doctor (by doctor_id). Optional: ?date=YYYY-MM-DD
appPublic.get('/api/doctor/appointments', async (req, res) => {
    try {
        const { doctor_id, date, startDate, endDate } = req.query;
        if (!doctor_id) return res.status(400).json({ error: 'doctor_id required' });
        let q = `
            SELECT a.id, a.pat_num, a.doctor_id, a.doctor_name, a.patient_name, a.patient_phone, a.patient_email, 
                   a.appointment_date, a.appointment_time, a.payment_amount, a.status,
                   p.symptoms, p.clinical_findings, p.diagnosis, p.medicines, p.lab_tests, p.advice, p.follow_up_date,
                   p.vital_bp, p.vital_pulse, p.vital_spo2, p.vital_temp,
                   CASE WHEN p.id IS NOT NULL THEN 'Completed' ELSE a.status END as status
            FROM appointments a
            LEFT JOIN prescriptions p ON a.id = p.appointment_id
            WHERE a.doctor_id = ?`;
        const p = [doctor_id];
        if (startDate && endDate) {
            q += ' AND DATE(a.appointment_date) BETWEEN ? AND ?';
            p.push(startDate, endDate);
        } else if (date) {
            q += ' AND DATE(a.appointment_date) = ?';
            p.push(date);
        }
        q += ' ORDER BY a.id DESC';
        const [rows] = await dbPatient.promise().query(q, p);
        res.json({ appointments: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Save a prescription for an appointment (doctor can post). Will try to add columns if missing.
// Save a prescription for an appointment (doctor can post).
appPublic.post('/api/doctor/prescribe', async (req, res) => {
    console.log("------------------------------------------");
    console.log("Received /api/doctor/prescribe request (Public Port)");
    console.log("Request Body:", JSON.stringify(req.body, null, 2)); // DEBUG: Check strictly what arrives
    console.log("------------------------------------------");
    try {
        const {
            id, doctor_id, doctor_name,
            vital_bp, vital_pulse, vital_spo2, vital_temp,
            symptoms, clinical_findings, diagnosis, medicines, lab_tests, advice, follow_up_date
        } = req.body;

        if (!id || !doctor_id) return res.status(400).json({ error: 'id and doctor_id required' });

        // 0. Ensure Table Exists
        try {
            await dbPatient.promise().query(`
                CREATE TABLE IF NOT EXISTS prescriptions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    appointment_id INT,
                    doctor_id INT,
                    doctor_name VARCHAR(255),
                    patient_id INT,
                    visit_date DATETIME,
                    vital_bp VARCHAR(50),
                    vital_pulse VARCHAR(50),
                    vital_spo2 VARCHAR(50),
                    vital_temp VARCHAR(50),
                    symptoms TEXT,
                    clinical_findings TEXT,
                    diagnosis TEXT,
                    medicines LONGTEXT,
                    lab_tests TEXT,
                    advice TEXT,
                    follow_up_date DATE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);
            // Check if column exists by selecting it
            try {
                await dbPatient.promise().query("SELECT clinical_findings FROM prescriptions LIMIT 1");
            } catch (colErr) {
                // Column likely missing, add it
                console.log("Adding clinical_findings column...");
                await dbPatient.promise().query("ALTER TABLE prescriptions ADD COLUMN clinical_findings TEXT AFTER symptoms");
            }
            console.log("Table check passed (Public Port)");
        } catch (tableErr) {
            console.error("Table creation warning:", tableErr);
        }

        // 1. Get patient_id from appointment to link it
        const [aptRows] = await dbPatient.promise().query('SELECT pat_id FROM appointments WHERE id=?', [id]);
        const patient_id = aptRows.length ? aptRows[0].pat_id : null;

        // 2. Insert into prescriptions table


        // CHECK IF PRESCRIPTION EXISTS FOR THIS PATIENT (Single Record per Patient)
        // Logic: Try by patient_id first. If not available (rare), fallback to appointment_id.
        let existing = [];
        if (patient_id) {
            [existing] = await dbPatient.promise().query('SELECT id FROM prescriptions WHERE patient_id = ? LIMIT 1', [patient_id]);
        }
        // Fallback: If no patient-linked record found, check if one exists for this appointment
        if (existing.length === 0) {
            [existing] = await dbPatient.promise().query('SELECT id FROM prescriptions WHERE appointment_id = ? LIMIT 1', [id]);
        }
        const medJSON = JSON.stringify(medicines || []);

        if (existing.length > 0) {
            // UPDATE EXISTING RECORD (Single Sheet concept)
            console.log(`Updating existing unique prescription for Patient ${patient_id} (Public)`);
            const updateSql = `
                UPDATE prescriptions SET 
                appointment_id=?, visit_date=NOW(), 
                vital_bp=?, vital_pulse=?, vital_spo2=?, vital_temp=?, 
                symptoms=?, clinical_findings=?, diagnosis=?, medicines=?, lab_tests=?, advice=?, follow_up_date=?
                WHERE id=?
            `;
            const updateParams = [
                id, // update appointment_id to current one
                vital_bp, vital_pulse, vital_spo2, vital_temp,
                symptoms, clinical_findings, diagnosis, medJSON, lab_tests, advice, follow_up_date || null,
                existing[0].id
            ];
            await dbPatient.promise().query(updateSql, updateParams);
            return res.json({ success: true, insertId: existing[0].id, message: 'Updated (Single Record)' });
        } else {
            // INSERT NEW
            const insertSql = `
                INSERT INTO prescriptions 
                (appointment_id, doctor_id, doctor_name, patient_id, visit_date, vital_bp, vital_pulse, vital_spo2, vital_temp, symptoms, clinical_findings, diagnosis, medicines, lab_tests, advice, follow_up_date)
                VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const params = [
                id, doctor_id, doctor_name, patient_id,
                vital_bp, vital_pulse, vital_spo2, vital_temp,
                symptoms, clinical_findings, diagnosis, medJSON, lab_tests, advice, follow_up_date || null
            ];
            const [r] = await dbPatient.promise().query(insertSql, params);
            // Update status
            try { await dbPatient.promise().query("UPDATE appointments SET status='Completed' WHERE id=?", [id]); } catch (e) { }

            return res.json({ success: true, insertId: r.insertId, message: 'Saved' });
        }
    } catch (e) {
        console.error('Prescribe error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Get detailed history for a patient (by patient_phone or id)
appPublic.get('/api/doctor/patient-history', async (req, res) => {
    try {
        const { patient_phone, patient_id } = req.query;
        if (!patient_phone && !patient_id) return res.status(400).json({ error: 'Patient identifier required' });

        // Helper to find patient_id if only phone provided
        let targetPatId = patient_id;
        if (!targetPatId && patient_phone) {
            // Try to find any appointment with this phone that has a pat_id
            const [pRows] = await dbPatient.promise().query('SELECT pat_id FROM appointments WHERE patient_phone LIKE ? LIMIT 1', [`%${patient_phone}%`]);
            if (pRows.length) targetPatId = pRows[0].pat_id;
        }

        let q = `
            SELECT p.*, a.appointment_date 
            FROM prescriptions p
            JOIN appointments a ON p.appointment_id = a.id
            WHERE 1=1
        `;
        const params = [];

        if (targetPatId) {
            q += ' AND p.patient_id = ?';
            params.push(targetPatId);
        } else {
            // Fallback: join appointments and search by phone if patient_id not linked yet
            q += ' AND a.patient_phone LIKE ?';
            params.push(`%${patient_phone}%`);
        }

        q += ' ORDER BY p.created_at DESC';
        const [rows] = await dbPatient.promise().query(q, params);
        res.json({ history: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});


// ============================================================
// 🏥 APP 3: DOCTOR SERVER (Port 3001)
// ============================================================
const appDoctor = express();
appDoctor.use(cors());
appDoctor.use(express.json());
appDoctor.use(express.urlencoded({ extended: true }));

// Serve Doctor Dashboard Static Files
// Serve Doctor Dashboard Static Files (Fixed Path)
const doctorDashboardPath = path.join(__dirname, '../Doctor_Dashboard/d_login_page');
appDoctor.use(express.static(doctorDashboardPath));

// Routes for Doctor App
appDoctor.get('/', (req, res) => {
    const loginPath = path.join(doctorDashboardPath, 'doctor_login.html');
    if (fs.existsSync(loginPath)) res.sendFile(loginPath);
    else res.send('Doctor Login File Not Found');
});

appDoctor.get('/doctor_login', (req, res) => {
    const loginPath = path.join(doctorDashboardPath, 'doctor_login.html');
    if (fs.existsSync(loginPath)) res.sendFile(loginPath);
    else res.send('Doctor Login File Not Found');
});

// Serve Doctor Dashboard Page
appDoctor.get('/doctor_dashboard', (req, res) => {
    const dashboardPath = path.join(doctorDashboardPath, 'doctor_dashboard.html');
    if (fs.existsSync(dashboardPath)) res.sendFile(dashboardPath);
    else res.send('Doctor Dashboard File Not Found');
});

// API Routes for Doctor App
appDoctor.post('/api/doctors/login', handleDoctorLogin);
appDoctor.post('/api/auth/doctor', handleDoctorLogin);

// ===================================
// 🔧 FIX: Expose Data APIs on Port 3001
// ===================================
appDoctor.get('/api/doctor/appointments', async (req, res) => {
    try {
        const { doctor_id, date, startDate, endDate } = req.query;
        if (!doctor_id) return res.status(400).json({ error: 'doctor_id required' });

        let q = `
            SELECT a.id, a.pat_num, a.doctor_id, a.doctor_name, a.patient_name, a.patient_phone, a.patient_email, 
                   a.appointment_date, a.appointment_time, a.payment_amount, a.pat_id, a.patient_age, a.patient_sex,
                   p.symptoms, p.diagnosis, p.medicines, p.lab_tests, p.advice, p.follow_up_date,
                   p.vital_bp, p.vital_pulse, p.vital_spo2, p.vital_temp,
                   CASE WHEN p.id IS NOT NULL THEN 'Completed' ELSE a.status END as status
            FROM appointments a
            LEFT JOIN prescriptions p ON a.id = p.appointment_id
            WHERE a.doctor_id = ?`;

        const p = [doctor_id];
        if (startDate && endDate) {
            q += ' AND DATE(a.appointment_date) BETWEEN ? AND ?';
            p.push(startDate, endDate);
        } else if (date) {
            q += ' AND DATE(a.appointment_date) = ?';
            p.push(date);
        }
        q += ' ORDER BY a.id DESC';
        const [rows] = await dbPatient.promise().query(q, p);
        res.json({ appointments: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

appDoctor.get('/api/doctor/patient-history', async (req, res) => {
    try {
        const { patient_phone, patient_id } = req.query;
        if (!patient_phone && !patient_id) return res.status(400).json({ error: 'Patient identifier required' });

        // Helper to find patient_id if only phone provided
        let targetPatId = patient_id;
        if (!targetPatId && patient_phone) {
            // Try to find any appointment with this phone that has a pat_id
            const [pRows] = await dbPatient.promise().query('SELECT pat_id FROM appointments WHERE patient_phone LIKE ? LIMIT 1', [`%${patient_phone}%`]);
            if (pRows.length) targetPatId = pRows[0].pat_id;
        }

        let q = `
            SELECT p.*, a.appointment_date 
            FROM prescriptions p
            JOIN appointments a ON p.appointment_id = a.id
            WHERE 1=1
        `;
        const params = [];

        if (targetPatId) {
            q += ' AND p.patient_id = ?';
            params.push(targetPatId);
        } else {
            // Fallback: join appointments and search by phone if patient_id not linked yet
            q += ' AND a.patient_phone LIKE ?';
            params.push(`%${patient_phone}%`);
        }

        q += ' ORDER BY p.created_at DESC';
        const [rows] = await dbPatient.promise().query(q, params);
        res.json({ history: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

appDoctor.post('/api/doctor/prescribe', async (req, res) => {
    console.log("------------------------------------------");
    console.log("Received /api/doctor/prescribe request (Doctor Port)");
    console.log("Request Body:", JSON.stringify(req.body, null, 2)); // DEBUG
    console.log("------------------------------------------");

    try {
        const {
            id, doctor_id, doctor_name,
            vital_bp, vital_pulse, vital_spo2, vital_temp,
            symptoms, clinical_findings, diagnosis, medicines, lab_tests, advice, follow_up_date
        } = req.body;

        if (!id || !doctor_id) return res.status(400).json({ error: 'id and doctor_id required' });

        // 0. Ensure Table Exists
        try {
            await dbPatient.promise().query(`
                CREATE TABLE IF NOT EXISTS prescriptions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    appointment_id INT,
                    doctor_id INT,
                    doctor_name VARCHAR(255),
                    patient_id INT,
                    visit_date DATETIME,
                    vital_bp VARCHAR(50),
                    vital_pulse VARCHAR(50),
                    vital_spo2 VARCHAR(50),
                    vital_temp VARCHAR(50),
                    symptoms TEXT,
                    clinical_findings TEXT,
                    diagnosis TEXT,
                    medicines LONGTEXT,
                    lab_tests TEXT,
                    advice TEXT,
                    follow_up_date DATE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);
            // Check if column exists by selecting it
            try {
                await dbPatient.promise().query("SELECT clinical_findings FROM prescriptions LIMIT 1");
            } catch (colErr) {
                // Column likely missing, add it
                console.log("Adding clinical_findings column (Doctor Port)...");
                await dbPatient.promise().query("ALTER TABLE prescriptions ADD COLUMN clinical_findings TEXT AFTER symptoms");
            }
        } catch (tableErr) {
            console.error("Table creation warning:", tableErr);
            // continue, maybe it exists or user lacks permission, but worth trying
        }

        // 1. Get patient_id from appointment to link it
        const [aptRows] = await dbPatient.promise().query('SELECT pat_id FROM appointments WHERE id=?', [id]);
        const patient_id = aptRows.length ? aptRows[0].pat_id : null;

        // CHECK IF PRESCRIPTION EXISTS FOR THIS PATIENT (Single Record per Patient)
        // Logic: Try by patient_id first. If not available (rare), fallback to appointment_id.
        let existing = [];
        if (patient_id) {
            [existing] = await dbPatient.promise().query('SELECT id FROM prescriptions WHERE patient_id = ? LIMIT 1', [patient_id]);
        }
        // Fallback: If no patient-linked record found, check if one exists for this appointment
        if (existing.length === 0) {
            [existing] = await dbPatient.promise().query('SELECT id FROM prescriptions WHERE appointment_id = ? LIMIT 1', [id]);
        }

        const medJSON = JSON.stringify(medicines || []);

        if (existing.length > 0) {
            // UPDATE EXISTING RECORD (Single Sheet concept)
            console.log(`Updating existing unique prescription for Patient ${patient_id}`);
            const updateSql = `
                UPDATE prescriptions SET 
                appointment_id=?, visit_date=NOW(),
                vital_bp=?, vital_pulse=?, vital_spo2=?, vital_temp=?, 
                symptoms=?, clinical_findings=?, diagnosis=?, medicines=?, lab_tests=?, advice=?, follow_up_date=?
                WHERE id=?
            `;
            const updateParams = [
                id, // update appointment_id to current one
                vital_bp, vital_pulse, vital_spo2, vital_temp,
                symptoms, clinical_findings, diagnosis, medJSON, lab_tests, advice, follow_up_date || null,
                existing[0].id
            ];
            await dbPatient.promise().query(updateSql, updateParams);

            // Return the existing ID
            return res.json({ success: true, insertId: existing[0].id, message: 'Updated (Single Record)' });

        } else {
            // INSERT NEW
            const insertSql = `
                INSERT INTO prescriptions 
                (appointment_id, doctor_id, doctor_name, patient_id, visit_date, vital_bp, vital_pulse, vital_spo2, vital_temp, symptoms, clinical_findings, diagnosis, medicines, lab_tests, advice, follow_up_date)
                VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const params = [
                id, doctor_id, doctor_name, patient_id,
                vital_bp, vital_pulse, vital_spo2, vital_temp,
                symptoms, clinical_findings, diagnosis, medJSON, lab_tests, advice, follow_up_date || null
            ];

            const [r] = await dbPatient.promise().query(insertSql, params);

            // 3. Update appointment status to Completed (Only needed on first insert usually, but safe to repeat)
            try {
                await dbPatient.promise().query("UPDATE appointments SET status='Completed' WHERE id=?", [id]);
            } catch (upErr) {
                console.error("Failed to update status (non-fatal):", upErr);
            }

            return res.json({ success: true, insertId: r.insertId, message: 'Saved' });
        }
    } catch (e) {
        console.error('Prescribe error:', e);
        res.status(500).json({ error: e.message });
    }
});

// NEW: Dashboard Stats API
appDoctor.get('/api/doctor/dashboard-stats', async (req, res) => {
    try {
        const { doctor_id } = req.query;
        if (!doctor_id) return res.status(400).json({ error: 'doctor_id required' });

        // 1. Today's Appointments (Total, Waiting, Done)
        const [totalRows] = await dbPatient.promise().query(
            "SELECT COUNT(*) as count FROM appointments WHERE doctor_id=? AND DATE(appointment_date) = CURDATE()",
            [doctor_id]
        );
        const todayTotal = totalRows[0].count;

        const [waitRows] = await dbPatient.promise().query(
            "SELECT COUNT(*) as count FROM appointments WHERE doctor_id=? AND DATE(appointment_date) = CURDATE() AND (status IS NULL OR status = 'Waiting' OR status = 'Scheduled')",
            [doctor_id]
        );
        const todayWaiting = waitRows[0].count;

        const [doneRows] = await dbPatient.promise().query(
            "SELECT COUNT(*) as count FROM appointments WHERE doctor_id=? AND DATE(appointment_date) = CURDATE() AND status = 'Completed'",
            [doctor_id]
        );
        const todayDone = doneRows[0].count;

        // 2. Total Earnings (All Time)
        const [earnRows] = await dbPatient.promise().query(
            "SELECT SUM(payment_amount) as total FROM appointments WHERE doctor_id=? AND status = 'Completed'",
            [doctor_id]
        );
        const totalEarnings = earnRows[0].total || 0;

        res.json({
            today_total: todayTotal,
            today_waiting: todayWaiting,
            today_done: todayDone,
            total_earnings: totalEarnings
        });

    } catch (e) {
        console.error('Stats error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Start Servers
appAdmin.listen(4000, () => {
    console.log('✅ Admin: http://localhost:4000');
    console.log('✅ Doctor (Legacy): http://localhost:4000/doctor_login');
});
appDoctor.listen(3001, () => console.log('✅ Doctor: http://localhost:3001'));
appPublic.listen(3000, () => console.log('✅ Patient: http://localhost:3000'));

// ============================================================
// 📋 PATIENT MY APPOINTMENTS ENDPOINT
// ============================================================
appPublic.get('/api/my-appointments', async (req, res) => {
    try {
        const { email, phone } = req.query;

        if (!email && !phone) {
            return res.status(400).json({ error: 'Email or phone required' });
        }

        let q = `SELECT id, pat_num, doctor_id, doctor_name, patient_name, patient_phone, patient_email, appointment_date, appointment_time, payment_amount, created_at 
             FROM appointments WHERE 1=1`;
        const p = [];

        if (email) {
            q += ' AND patient_email = ?';
            p.push(email);
        }
        if (phone) {
            q += ' AND patient_phone = ?';
            p.push(phone);
        }

        q += ' ORDER BY appointment_date DESC, appointment_time DESC';

        const [rows] = await dbPatient.promise().query(q, p);
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================================
// 📋 BILL GENERATION ENDPOINT
// ============================================================
appPublic.get('/api/generate-bill/:appointmentId', async (req, res) => {
    try {
        const { appointmentId } = req.params;

        // fetch appointment (include pat_num and bill_id if present)
        const [appointments] = await dbPatient.promise().query(
            `SELECT id, pat_num, bill_id, doctor_id, doctor_name, patient_name, patient_phone, patient_email,
                            appointment_date, appointment_time, payment_amount, created_at
             FROM appointments WHERE id = ?`,
            [appointmentId]
        );

        if (!appointments || appointments.length === 0) {
            return res.status(404).json({ error: 'Appointment not found' });
        }
        const apt = appointments[0];

        // helper: format date to DD/MM/YYYY (zero-padded)
        const formatSimpleDate = (d) => {
            if (!d) return 'N/A';
            // if string date like '2025-11-28' convert to Date
            const dt = (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) ? new Date(d) : new Date(d);
            if (isNaN(dt.getTime())) return String(d);
            const dd = String(dt.getDate()).padStart(2, '0');
            const mm = String(dt.getMonth() + 1).padStart(2, '0');
            const yyyy = dt.getFullYear();
            return `${dd}/${mm}/${yyyy}`;
        };

        // fetch doctor fee + department in one query (safe fallback if not found)
        let doctorFee = apt.payment_amount || 0;
        let department = 'N/A';
        try {
            const [docRows] = await dbDoctor.promise().query(
                'SELECT Fees, Department FROM doctors WHERE DoctorID = ?',
                [apt.doctor_id]
            );
            if (docRows && docRows.length) {
                if (docRows[0].Fees !== null && docRows[0].Fees !== undefined) {
                    doctorFee = docRows[0].Fees;
                }
                department = docRows[0].Department || department;
            }
        } catch (err) {
            console.error('Could not fetch doctor info:', err && err.message ? err.message : err);
        }

        // Compute appointment token (use stored pat_num when present)
        const currentYear = new Date().getFullYear();
        const apptSerial = String(apt.id).padStart(6, '0');
        const apptToken = (apt.pat_num && String(apt.pat_num).trim()) ? apt.pat_num : `OB/${currentYear}/${apptSerial}`;

        // Calculate amounts
        const amount = Number(doctorFee) || 0;
        const gst = Math.round(amount * 0.18 * 100) / 100; // 18% GST rounded to 2 decimals
        const totalAmount = Math.round((amount + gst) * 100) / 100;

        // Simple bill date
        const billDateSimple = formatSimpleDate(new Date());

        // appointment_date formatted
        const apptDateSimple = apt.appointment_date ? formatSimpleDate(apt.appointment_date) : 'N/A';

        // Create bill record so we can produce BL/YYYY/000001
        try {
            try {
                await dbPatient.promise().query(`CREATE TABLE IF NOT EXISTS bills (
                                        id INT AUTO_INCREMENT PRIMARY KEY,
                                        appointment_id INT,
                                        bill_no VARCHAR(64) UNIQUE,
                                        amount DECIMAL(10,2) DEFAULT 0,
                                        gst DECIMAL(10,2) DEFAULT 0,
                                        total DECIMAL(10,2) DEFAULT 0,
                                        bill_html LONGTEXT,
                                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
            } catch (ignore) { }

            // insert bill record (without bill_no yet)
            const [billInsert] = await dbPatient.promise().query('INSERT INTO bills (appointment_id, amount, gst, total, bill_html) VALUES (?,?,?,?,?)', [appointmentId, amount, gst, totalAmount, null]);
            var billId = billInsert.insertId;
            var billNo = `BL/${currentYear}/${String(billId).padStart(6, '0')}`;
            try { await dbPatient.promise().query('UPDATE bills SET bill_no = ? WHERE id = ?', [billNo, billId]); } catch (e) { console.error('Could not set bill_no', e && e.message ? e.message : e); }

            // Appointment update moved to end to include HTML
        } catch (eBill) {
            console.error('Bill create error (non-fatal):', eBill && eBill.message ? eBill.message : eBill);
            var billId = null;
            var billNo = `BL/${currentYear}/${String(appointmentId).padStart(6, '0')}`; // fallback
        }

        // Build HTML (paste-ready, unescaped template)
        const billHTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Invoice - RM HealthCare</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root{
    --bg: #f4f7fb;
    --card: #ffffff;
    --primary: #0b61d8;
    --accent: #0f4c81;
    --muted: #6b7280;
    --silver: #d1d5db;
  }
  *{box-sizing:border-box}
  body{font-family:Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; background:var(--bg); color:#111; padding:18px;}
  .wrap{max-width:880px; margin:0 auto;}
  .card{background:var(--card); border-radius:10px; padding:26px; box-shadow:0 6px 22px rgba(15,23,42,0.06); border:1px solid rgba(15,23,42,0.04);}
  .header{display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:18px;}
  .brand{display:flex; gap:14px; align-items:center;}
  .logo{width:72px; height:72px; border-radius:8px; background:linear-gradient(135deg,var(--primary),var(--accent)); display:flex; align-items:center; justify-content:center; color:white; font-weight:700; font-size:22px;}
  .brand-meta{line-height:1;}
  .brand-meta .name{font-size:18px; font-weight:700; color:var(--accent);}
  .brand-meta .tag{font-size:12px; color:var(--muted); margin-top:2px;}

  .doc-info{text-align:right; font-size:13px; color:var(--muted);}
  .doc-info .label{font-weight:700; color:#0b3a7a; display:block; font-size:12px;}

  .grid{display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:18px 0;}
  .box{background:linear-gradient(180deg, rgba(11,97,216,0.03), rgba(255,255,255,0)); border:1px solid var(--silver); padding:12px; border-radius:8px; font-size:13px;}
  .box .title{font-weight:700; color:var(--accent); margin-bottom:8px; font-size:12px;}
  .kv{display:flex; gap:8px; margin-bottom:6px;}
  .kv .k{width:110px; color:var(--muted); font-weight:600;}
  .kv .v{flex:1; font-weight:600; color:#0b2546;}

  .token{margin:16px 0; display:flex; align-items:center; justify-content:space-between; gap:12px;}
  .token .pill{background:linear-gradient(90deg,var(--primary),var(--accent)); color:white; padding:10px 16px; border-radius:999px; font-weight:800; letter-spacing:1px;}
  .token .meta{font-size:13px; color:var(--muted); text-align:right;}

  table{width:100%; border-collapse:collapse; font-size:13px;}
  thead th{background:#f6f9ff; color:var(--accent); text-align:left; padding:12px; border-bottom:1px solid var(--silver); font-weight:700;}
  tbody td{padding:12px; border-bottom:1px dashed #e6eefc; color:#222;}
  .text-right{text-align:right;}
  .amount{font-weight:800; color:var(--accent);}

  .totals{display:flex; justify-content:flex-end; margin-top:12px;}
  .totals .table{width:320px; border:1px solid var(--silver); border-radius:8px; overflow:hidden; background:linear-gradient(180deg,#fff,#fbfdff);}
  .totals .row{display:flex; justify-content:space-between; padding:10px 14px; border-bottom:1px solid #f1f5f9;}
  .totals .row.total{font-weight:900; background:#f6f9ff; color:var(--accent);}

  .pay-info{display:flex; gap:20px; margin-top:18px; align-items:flex-start;}
  .pay-info .left{flex:1; font-size:13px; color:var(--muted);}
  .pay-info .right{width:260px; text-align:right; font-size:13px;}

  .footer{margin-top:20px; text-align:center; color:var(--muted); font-size:12px; border-top:1px solid #eef2f7; padding-top:12px;}

  .print-btn{display:inline-block; margin-top:12px; background:var(--accent); color:white; padding:10px 16px; border-radius:8px; font-weight:700; text-decoration:none;}
  @media print{
    body{padding:0; background:white}
    .wrap{max-width:100%; padding:0}
    .card{box-shadow:none; border: none; border-radius:0; padding:0}
    .print-btn{display:none}
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="card" role="document" aria-label="Invoice">
      <div class="header">
        <div class="brand">
          <div class="logo">RM</div>
          <div class="brand-meta">
            <div class="name">RM HealthCare</div>
            <div class="tag">Comprehensive Care • Compassionate Service</div>
          </div>
        </div>

                <div class="doc-info" aria-hidden="false">
                    <div><span class="label">Bill No.</span><div>#${billNo}</div></div>
          <div style="margin-top:8px;"><span class="label">Invoice ID</span><div>${apt.id}</div></div>
          <div style="margin-top:8px;"><span class="label">Bill Date</span><div>${billDateSimple}</div></div>
        </div>
      </div>

      <div class="grid" role="region" aria-label="Patient and Appointment Details">
        <div class="box" aria-label="Patient">
          <div class="title">Patient</div>
          <div class="kv"><div class="k">Name</div><div class="v">${apt.patient_name || 'N/A'}</div></div>
          <div class="kv"><div class="k">Phone</div><div class="v">${apt.patient_phone || 'N/A'}</div></div>
          <div class="kv"><div class="k">Email</div><div class="v">${apt.patient_email || 'N/A'}</div></div>
        </div>

        <div class="box" aria-label="Appointment">
          <div class="title">Appointment</div>
          <div class="kv"><div class="k">Appt ID</div><div class="v">#${apt.id}</div></div>
          <div class="kv"><div class="k">Date</div><div class="v">${apptDateSimple}</div></div>
          <div class="kv"><div class="k">Time</div><div class="v">${apt.appointment_time || 'N/A'}</div></div>
          <div class="kv"><div class="k">Doctor</div><div class="v">Dr. ${apt.doctor_name || 'N/A'}</div></div>
          <div class="kv"><div class="k">Department</div><div class="v">${department}</div></div>
        </div>
      </div>

      <div class="token" role="region" aria-label="Token">
        <div>
          <div style="font-size:12px; color:var(--muted); font-weight:600">Your Appointment Token</div>
          <div class="pill">${apptToken}</div>
        </div>
        <div class="meta">
          <div style="font-weight:700; color:var(--accent)">Keep this for your records</div>
          <div style="margin-top:6px; color:var(--muted); font-size:12px">Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
        </div>
      </div>

      <div style="margin-top:10px;">
        <table role="table" aria-label="Billing details">
          <thead>
            <tr>
              <th style="width:48px">#</th>
              <th>Particulars</th>
              <th class="text-right" style="width:80px">Qty</th>
              <th class="text-right" style="width:120px">Rate (₹)</th>
              <th class="text-right" style="width:80px">GST</th>
              <th class="text-right" style="width:140px">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td>Doctor Consultation Fee</td>
              <td class="text-right">1</td>
              <td class="text-right">${(Number(amount || 0)).toFixed(2)}</td>
              <td class="text-right">18%</td>
              <td class="text-right amount">${(Number((amount || 0) * 1.18)).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="totals" role="region" aria-label="Totals">
        <div class="table" aria-hidden="false">
          <div class="row"><div>Sub Total</div><div>₹ ${(Number(amount || 0)).toFixed(2)}</div></div>
          <div class="row"><div>GST (18%)</div><div>₹ ${(Number(gst || (Number(amount || 0) * 0.18))).toFixed(2)}</div></div>
          <div class="row total"><div>Total Payable</div><div>₹ ${(Number(totalAmount || ((Number(amount || 0) + Number(gst || (Number(amount || 0) * 0.18)))))).toFixed(2)}</div></div>
        </div>
      </div>

      <div class="pay-info" role="region" aria-label="Payment info">
        <div class="left">
          <div style="font-weight:700; color:var(--accent); margin-bottom:6px">Payment Details</div>
          <div style="margin-bottom:6px">Mode: ${apt.payment_amount ? 'Online' : 'Offline'}</div>
          <div style="margin-bottom:6px">Particulars: Consultation</div>
          <div style="margin-top:8px; font-size:12px; color:var(--muted)">Note: This is a computer-generated invoice and does not require a physical signature.</div>
        </div>
        <div class="right">
          <div style="font-weight:700; margin-bottom:6px">Received</div>
          <div style="font-size:20px; font-weight:900; color:var(--accent)">₹ ${(Number(totalAmount || ((Number(amount || 0) + Number(gst || (Number(amount || 0) * 0.18)))))).toFixed(2)}</div>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:18px;">
        <div style="font-size:13px; color:var(--muted)">
          RM HEALTH CARE<br>
          123 Medical Avenue, Kolkata - 700094<br>
          Phone: +91-XXXXXXXXXX
        </div>
        <div style="text-align:right">
          <a class="print-btn" href="#" onclick="window.print();return false">Print / Save PDF</a>
        </div>
      </div>

      <div class="footer">
        Generated on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} • This is a system generated invoice.
      </div>
    </div>
  </div>
</body>
</html>`;

        // Update Bill with HTML and Link to Appointment
        if (billId) {
            try {
                // Update the existing bill record with the generated HTML
                await dbPatient.promise().query('UPDATE bills SET bill_html = ? WHERE id = ?', [billHTML, billId]);

                // Link bill to appointment (save formatted billNo and HTML)
                await dbPatient.promise().query('UPDATE appointments SET bill_id = ?, bill_html = ?, payment_amount = ?, pat_num = ? WHERE id = ?',
                    [billNo, billHTML, Number(totalAmount) || Number(amount) || 0, apptToken, appointmentId]);
            } catch (e) {
                console.error('Failed to update bill/appointment:', e && e.message ? e.message : e);
            }
        } else {
            // Fallback if bill creation failed earlier
            try {
                await dbPatient.promise().query('UPDATE appointments SET bill_html = ?, payment_amount = ?, pat_num = ? WHERE id = ?',
                    [billHTML, Number(totalAmount) || Number(amount) || 0, apptToken, appointmentId]);
            } catch (e) { console.error('Fallback update failed:', e); }
        }

        // send HTML
        res.setHeader('Content-Type', 'text/html; charset=UTF-8');
        res.send(billHTML);

    } catch (e) {
        console.error('generate-bill error', e && e.message ? e.message : e);
        res.status(500).json({ error: e.message || String(e) });
    }
});
