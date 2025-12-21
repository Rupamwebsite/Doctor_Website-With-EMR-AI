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
const masterController = require('./src/controllers/masterController');

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

// NEW: Serve Doctor Dashboard files (including login)
appAdmin.use('/doctor_dashboard', express.static(path.join(__dirname, 'public/Doctor_Dashboard')));

const unifiedLoginPath = path.join(__dirname, 'public/admin/login.html');

appAdmin.get('/', (req, res) => {
    if (fs.existsSync(unifiedLoginPath)) res.sendFile(unifiedLoginPath);
    else res.send('Login File Not Found: ' + unifiedLoginPath);
});

appAdmin.get('/login.html', (req, res) => {
    if (fs.existsSync(unifiedLoginPath)) res.sendFile(unifiedLoginPath);
    else res.send('Login File Not Found');
});

appAdmin.get('/doctors-master.html', (req, res) => {
    // Admin Panel Entry Point
    if (fs.existsSync(path.join(adminInnerPath, 'doctors-master.html')))
        res.sendFile(path.join(adminInnerPath, 'doctors-master.html'));
    else res.send('Dashboard File Not Found');
});

// Serve Doctor Login Page (Legacy route support)
appAdmin.get('/doctor_login', (req, res) => {
    if (fs.existsSync(unifiedLoginPath)) {
        res.sendFile(unifiedLoginPath);
    } else {
        res.send('Doctor Login File Not Found');
    }
});

// Serve Doctor Dashboard HTML files via clean URLs if needed, or rely on static middleware
appAdmin.get('/doctor_dashboard_view', (req, res) => {
    const dPath = path.join(__dirname, 'public/Doctor_Dashboard/doctor_dashboard.html');
    if (fs.existsSync(dPath)) res.sendFile(dPath);
    else res.send('Dashboard Not Found');
});

// Ensure doctors table has created_at
; (async function ensureDoctorsTableColumns() {
    try {
        await dbDoctor.promise().query("SELECT created_at FROM doctors LIMIT 1");
    } catch (colErr) {
        try {
            await dbDoctor.promise().query("ALTER TABLE doctors ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
            console.log("Added created_at column to doctors table");
        } catch (e) { console.error("Error adding created_at to doctors:", e.message); }
    }
})();

// --- ADMIN API ---

// 1. Get All Doctors (With Schedule Info)
appAdmin.get('/api/doctors', async (req, res) => {
    try {
        const [rows] = await dbDoctor.promise().query(`
            SELECT DoctorID as id, FirstName as first_name, LastName as last_name, 
            Department as department, DoctorType as doctor_type, Specialization as specialization, 
            Fees as fees, ContactNumber as phone, Email as email, image_url, 
            ActiveStatus as is_active, opd_days, opd_time, daily_limit,
            Degrees as degrees, RegNumber as reg_number, created_at, 
            created_by, updated_by, updated_at
            FROM doctors ORDER BY DoctorID DESC`);
        res.json({ doctors: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Ensure doctors table has audit columns
; (async function ensureDoctorsAuditColumns() {
    try {
        const cols = [
            "ADD COLUMN created_by VARCHAR(100) NULL",
            "ADD COLUMN updated_by VARCHAR(100) NULL",
            "ADD COLUMN updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP"
        ];
        for (const c of cols) {
            try { await dbDoctor.promise().query(`ALTER TABLE doctors ${c}`); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.error(e.message); }
        }
    } catch (e) { console.error("Error adding audit columns:", e.message); }
})();

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
            opd_days: d.opd_days, opd_time: d.opd_time, daily_limit: d.daily_limit,
            degrees: d.Degrees, reg_number: d.RegNumber
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
        const { first_name, last_name, department, specialization, fees, phone, email, doctor_type, dob, is_active, username, password, degrees, reg_number } = req.body;
        const img = req.file ? req.file.filename : null;
        const [r] = await dbDoctor.promise().query(
            `INSERT INTO doctors (FirstName, LastName, Department, DoctorType, Specialization, Fees, ContactNumber, Email, DOB, image_url, ActiveStatus, Degrees, RegNumber) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [first_name, last_name, department, doctor_type, specialization, fees, phone, email, dob, img, is_active, degrees, reg_number]
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

// Ensure 'roles' table exists
; (async function ensureRolesTable() {
    try {
        await dbDoctor.promise().query(`
            CREATE TABLE IF NOT EXISTS roles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                role_name VARCHAR(100) UNIQUE NOT NULL,
                permissions JSON DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        // Add permissions column if it doesn't exist (for existing tables)
        try {
            await dbDoctor.promise().query(`ALTER TABLE roles ADD COLUMN permissions JSON DEFAULT NULL`);
        } catch (e) {
            // Ignore error if column already exists (Error 1060: Duplicate column name)
            if (e.errno !== 1060) console.error('Error adding permissions column:', e.message);
        }

        // Insert default roles if table is empty
        const [rows] = await dbDoctor.promise().query('SELECT count(*) as count FROM roles');
        if (rows[0].count === 0) {
            await dbDoctor.promise().query('INSERT INTO roles (role_name) VALUES (?), (?), (?), (?), (?)',
                ['Receptionist', 'Staff', 'Nurse', 'Admin', 'Billing']);
        }
    } catch (e) { console.error('Could not ensure roles table:', e.message); }
})();

// --- Roles API ---
appAdmin.get('/api/admin/roles', masterController.getRoles);
appAdmin.post('/api/admin/roles', masterController.addRole);
appAdmin.put('/api/admin/roles/:id', masterController.updateRole);
appAdmin.delete('/api/admin/roles/:id', masterController.deleteRole);

// Admin: Create or update doctor credentials separately
appAdmin.post('/api/admin/doctors/:id/credentials', async (req, res) => {
    try {
        console.log('Received doctor creds request:', req.body);
        // simple admin auth
        if (req.headers['x-admin-key'] !== 'my-secret-key') return res.status(401).json({ error: 'Invalid' });
        const id = req.params.id;
        const { username, password, fullname, mobile, role, status } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'username and password required' });

        // 1. Update/Insert into doctor_users (for login)
        const [exists] = await dbDoctor.promise().query('SELECT id FROM doctor_users WHERE doctor_id=?', [id]);
        if (exists && exists.length) {
            await dbDoctor.promise().query('UPDATE doctor_users SET username=?, password_hash=? WHERE doctor_id=?', [username, password, id]);
        } else {
            await dbDoctor.promise().query('INSERT INTO doctor_users (doctor_id, username, password_hash) VALUES (?,?,?)', [id, username, password]);
        }

        // 2. Also insert into 'users' table (for directory visibility)
        // Check if username exists in 'users'
        const [uExists] = await dbDoctor.promise().query('SELECT id FROM users WHERE username=?', [username]);
        if (!uExists || !uExists.length) {
            await dbDoctor.promise().query(
                'INSERT INTO users (username, password, full_name, mobile, role, status, doctor_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [username, password, fullname || '', mobile || '', role || 'Doctor', status || 1, id]
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
                    role VARCHAR(50),
                    status INT DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
             `);
            // Migration: Rename category to role if it exists
            try { await dbDoctor.promise().query("ALTER TABLE users CHANGE COLUMN category role VARCHAR(50)"); } catch (e) { }
        } catch (e) { }

        // Check if username exists in 'users'
        const [exists] = await dbDoctor.promise().query('SELECT id FROM users WHERE username=?', [username]);
        if (exists && exists.length) return res.status(400).json({ error: 'Username already exists' });

        // Insert into 'users' table
        // Note: User screenshot shows 'full_name' and 'password' columns
        const [result] = await dbDoctor.promise().query(
            'INSERT INTO users (username, password, full_name, mobile, role, status) VALUES (?, ?, ?, ?, ?, ?)',
            [username, password, fullname, mobile, category, status]
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
        const { username, password, fullname, mobile, role, status } = req.body;

        // Build update query dynamically
        let fields = [];
        let values = [];

        if (username) { fields.push('username=?'); values.push(username); }
        if (password) { fields.push('password=?'); values.push(password); }
        if (fullname) { fields.push('full_name=?'); values.push(fullname); }
        if (mobile) { fields.push('mobile=?'); values.push(mobile); }
        if (role) { fields.push('role=?'); values.push(role); }
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

        // 1. Get username before deleting
        const [uRows] = await dbDoctor.promise().query('SELECT username FROM users WHERE id=?', [id]);

        // 2. Delete from users
        await dbDoctor.promise().query('DELETE FROM users WHERE id=?', [id]);

        // 3. Delete from doctor_users (legacy fallback) if username found
        if (uRows.length > 0) {
            const username = uRows[0].username;
            if (username) {
                await dbDoctor.promise().query('DELETE FROM doctor_users WHERE username=?', [username]);
            }
        }

        res.json({ message: 'User deleted' });
    } catch (e) {
        console.error('Error deleting user:', e);
        res.status(500).json({ error: e.message });
    }
});

// Doctor authentication endpoint (username + password)
// Matches /api/auth/doctor for backward compatibility
// Shared Doctor Login Logic
// Doctor authentication endpoint (username + password)
// Matches /api/auth/doctor for backward compatibility
// Shared Doctor Login Logic
const handleDoctorLogin = async (req, res) => {
    try {
        // Support both 'userid' (from doctor_login.html) and 'username' (standard)
        const username = req.body.userid || req.body.username;
        const password = req.body.password;

        if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

        // Helper to check password (supports legacy bcrypt and new plaintext)
        const checkPassword = async (inputPw, storedPw) => {
            if (!storedPw) return false;
            // Legacy: if it starts with $2b$, it's likely bcrypt
            if (storedPw.startsWith('$2b$')) {
                return await bcrypt.compare(inputPw, storedPw);
            }
            // New: Plain text
            return inputPw === storedPw;
        };

        // 1. Check 'users' table (preferred for new flow)
        const [uRows] = await dbDoctor.promise().query('SELECT * FROM users WHERE username=?', [username]);

        if (uRows && uRows.length > 0) {
            const u = uRows[0];
            const ok = await checkPassword(password, u.password);
            if (ok) {
                if (u.status === 0) return res.status(401).json({ error: 'Account is inactive' });

                // Fetch linked doctor details if available
                let docDetails = {};
                if (u.doctor_id) {
                    const [dRows] = await dbDoctor.promise().query('SELECT * FROM Doctors WHERE DoctorID=?', [u.doctor_id]);
                    if (dRows.length) docDetails = dRows[0];
                }

                // Fetch Role Permissions
                let permissions = [];
                try {
                    const [rRows] = await dbDoctor.promise().query('SELECT permissions FROM roles WHERE role_name=?', [u.role]);
                    if (rRows.length > 0 && rRows[0].permissions) {
                        // Handle if stored as string or JSON object
                        if (typeof rRows[0].permissions === 'string') {
                            permissions = JSON.parse(rRows[0].permissions);
                        } else {
                            permissions = rRows[0].permissions;
                        }
                    }
                } catch (err) { console.error('Error fetching permissions:', err); }

                return res.json({
                    success: true,
                    doctor: {
                        id: u.doctor_id || u.id,
                        name: u.full_name,
                        username: u.username,
                        role: u.role,
                        permissions: permissions, // Add permissions to response
                        // Merge doctor details
                        degrees: docDetails.Degrees || '',
                        reg_number: docDetails.RegNumber || '',
                        specialization: docDetails.Specialization || '',
                        department: docDetails.Department || '',
                        email: docDetails.Email || '',
                        phone: docDetails.ContactNumber || ''
                    },
                    // FIX: Return the secret key from env
                    token: process.env.ADMIN_KEY || 'my-secret-key'
                });
            }
        }

        // 2. Fallback: Check 'doctor_users' (legacy)
        const [rows] = await dbDoctor.promise().query('SELECT * FROM doctor_users WHERE username=?', [username]);
        if (rows && rows.length > 0) {
            const u = rows[0];
            const ok = await checkPassword(password, u.password_hash);
            if (ok) {
                const [drows] = await dbDoctor.promise().query('SELECT * FROM Doctors WHERE DoctorID=?', [u.doctor_id]);
                const doc = drows && drows.length ? drows[0] : { DoctorID: u.doctor_id };
                return res.json({
                    success: true,
                    doctor: {
                        id: doc.DoctorID,
                        name: (doc.FirstName || '') + ' ' + (doc.LastName || ''),
                        degrees: doc.Degrees || '',
                        reg_number: doc.RegNumber || '',
                        specialization: doc.Specialization || '',
                        department: doc.Department || ''
                    },
                    token: process.env.ADMIN_KEY || 'my-secret-key'
                });
            }
        }

        return res.status(401).json({ error: 'Invalid User ID or Password' });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// Ensure Doctors table has new columns (Migration)
(async function migrateDoctorsTable() {
    try {
        try { await dbDoctor.promise().query("ALTER TABLE Doctors ADD COLUMN Degrees VARCHAR(255)"); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.error(e.message); }
        try { await dbDoctor.promise().query("ALTER TABLE Doctors ADD COLUMN RegNumber VARCHAR(100)"); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.error(e.message); }
        console.log("✅ Doctors table schema updated (Degrees, RegNumber)");
    } catch (e) {
        console.error("Schema migration fatal:", e.message);
    }
})();

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

        const { first_name, last_name, department, specialization, fees, phone, email, doctor_type, dob, is_active, degrees, reg_number } = req.body;
        let q = `UPDATE doctors SET FirstName=?, LastName=?, Department=?, DoctorType=?, Specialization=?, Fees=?, ContactNumber=?, Email=?, DOB=?, ActiveStatus=?, Degrees=?, RegNumber=?`;
        let p = [first_name, last_name, department, doctor_type, specialization, fees, phone, email, dob, is_active, degrees, reg_number];
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
        const [rows] = await dbPatient.promise().query('SELECT id, pat_num, bill_id, doctor_id, doctor_name, patient_name, patient_phone, patient_email, appointment_date, appointment_time, payment_method, payment_id, payment_order_id, payment_amount, status, created_at, patient_sex, patient_address, patient_age, patient_dob, bill_html FROM appointments ORDER BY id DESC');
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
        const { full_name, email, password } = req.body;
        const hashed = await bcrypt.hash(password, 10);
        await dbPatient.promise().query('INSERT INTO users (full_name, email, password) VALUES (?, ?, ?)', [full_name, email, hashed]);
        res.status(201).json({ success: true, message: 'Registered successfully!' });
    } catch (e) { res.status(500).json({ success: false, message: e.message, error: e.message }); }
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
            opd_days, opd_time, daily_limit, Degrees as degrees, RegNumber as reg_number 
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

// Admin: Get All Prescriptions (Merged with Doctor Info)
appPublic.get('/api/admin/prescriptions', async (req, res) => {
    try {
        // 1. Fetch all doctors
        const [docs] = await dbDoctor.promise().query("SELECT DoctorID, FirstName, LastName, Degrees, RegNumber, Specialization, Department FROM Doctors");
        const docMap = {};
        docs.forEach(d => {
            docMap[d.DoctorID] = {
                degrees: d.Degrees,
                reg_number: d.RegNumber,
                specialization: d.Specialization,
                department: d.Department
            };
        });

        // 2. Fetch all prescriptions
        const [rows] = await dbPatient.promise().query(`
            SELECT a.id, a.doctor_id, a.doctor_name, a.patient_name, a.appointment_date,
                   p.medicines, p.diagnosis, p.symptoms, p.clinical_findings 
            FROM appointments a
            JOIN prescriptions p ON a.id = p.appointment_id
            ORDER BY a.appointment_date DESC, a.id DESC
        `);

        // 3. Merge
        const results = rows.map(r => {
            const extra = docMap[r.doctor_id] || {};
            return {
                ...r,
                doctor_degrees: extra.degrees,
                doctor_reg: extra.reg_number,
                doctor_spec: extra.specialization,
                doctor_dept: extra.department
            };
        });

        res.json({ prescriptions: results });
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
            symptoms, clinical_findings, diagnosis, medicines, lab_tests, advice, note, follow_up_date
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
                    doctor_id INT,
                    doctor_name VARCHAR(255),
                    patient_name VARCHAR(255),
                    pat_num VARCHAR(64),
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
                    note TEXT,
                    follow_up_date DATE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);
            // Check if columns exist
            try {
                await dbPatient.promise().query("SELECT clinical_findings FROM prescriptions LIMIT 1");
            } catch (colErr) {
                console.log("Adding clinical_findings column...");
                await dbPatient.promise().query("ALTER TABLE prescriptions ADD COLUMN clinical_findings TEXT AFTER symptoms");
            }
            try {
                await dbPatient.promise().query("SELECT note FROM prescriptions LIMIT 1");
            } catch (colErr) {
                await dbPatient.promise().query("ALTER TABLE prescriptions ADD COLUMN note TEXT");
            }
            try {
                await dbPatient.promise().query("SELECT updated_at FROM prescriptions LIMIT 1");
            } catch (colErr) {
                await dbPatient.promise().query("ALTER TABLE prescriptions ADD COLUMN updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP");
            }
            try {
                await dbPatient.promise().query("SELECT patient_name FROM prescriptions LIMIT 1");
            } catch (colErr) {
                await dbPatient.promise().query("ALTER TABLE prescriptions ADD COLUMN patient_name VARCHAR(255) AFTER patient_id");
            }
            try {
                await dbPatient.promise().query("SELECT pat_num FROM prescriptions LIMIT 1");
            } catch (colErr) {
                await dbPatient.promise().query("ALTER TABLE prescriptions ADD COLUMN pat_num VARCHAR(64) AFTER patient_name");
            }

            console.log("Table check passed (Public Port)");
        } catch (tableErr) {
            console.error("Table creation warning:", tableErr);
        }

        // 1. Get patient_name and pat_num from appointment
        // 1. Get patient_id and patient_name from appointment
        const [aptRows] = await dbPatient.promise().query('SELECT patient_name, patient_phone, patient_email, pat_num FROM appointments WHERE id=?', [id]);
        let patient_name = aptRows.length ? aptRows[0].patient_name : null;
        const patient_phone = aptRows.length ? aptRows[0].patient_phone : null;
        const patient_email = aptRows.length ? aptRows[0].patient_email : null;
        const pat_num = aptRows.length ? aptRows[0].pat_num : null;


        // 2. Insert into prescriptions table


        // CHECK IF PRESCRIPTION EXISTS FOR THIS PATIENT (Single Record per Patient)
        // Logic: Try by pat_num first. Then appointment_id.
        let existing = [];
        if (pat_num) {
            [existing] = await dbPatient.promise().query('SELECT id FROM prescriptions WHERE pat_num = ? LIMIT 1', [pat_num]);
        }
        // Fallback: If no patient-linked record found, check if one exists for this appointment
        if (existing.length === 0) {
            [existing] = await dbPatient.promise().query('SELECT id FROM prescriptions WHERE appointment_id = ? LIMIT 1', [id]);
        }
        const medJSON = JSON.stringify(medicines || []);

        if (existing.length > 0) {
            // UPDATE EXISTING RECORD (Single Sheet concept)
            console.log(`Updating existing unique prescription for Patient ${pat_num || id} (Public)`);
            const updateSql = `
                UPDATE prescriptions SET 
                appointment_id=?, visit_date=NOW(), 
                vital_bp=?, vital_pulse=?, vital_spo2=?, vital_temp=?, 
                symptoms=?, clinical_findings=?, diagnosis=?, medicines=?, lab_tests=?, advice=?, note=?, follow_up_date=?, patient_name=?, pat_num=?
                WHERE id=?
            `;
            const updateParams = [
                id, // update appointment_id to current one
                vital_bp, vital_pulse, vital_spo2, vital_temp,
                symptoms, clinical_findings, diagnosis, medJSON, lab_tests, advice, note || '', follow_up_date || null, patient_name || '', pat_num || '',
                existing[0].id
            ];
            await dbPatient.promise().query(updateSql, updateParams);

            // Update Status Logic: Completed -> Modified -> Modified(1) -> ...
            try {
                const [sRows] = await dbPatient.promise().query("SELECT status FROM appointments WHERE id=?", [id]);
                if (sRows.length > 0) {
                    let currentStatus = sRows[0].status;
                    let newStatus = 'Modified';

                    if (currentStatus === 'Modified') {
                        newStatus = 'Modified(1)';
                    } else if (currentStatus && currentStatus.startsWith('Modified(')) {
                        const match = currentStatus.match(/Modified\((\d+)\)/);
                        if (match) {
                            newStatus = `Modified(${parseInt(match[1]) + 1})`;
                        }
                    } else if (currentStatus !== 'Completed') {
                        // If it's not Completed (e.g. somehow still Pending), leave/set as Modified? 
                        // Requirement says 1st time Completed. Updates are Modified.
                        newStatus = 'Modified';
                    }

                    // Allow overwriting 'Completed' with 'Modified'
                    await dbPatient.promise().query("UPDATE appointments SET status=? WHERE id=?", [newStatus, id]);
                }
            } catch (errStatus) { console.error("Error updating status:", errStatus); }

            return res.json({ success: true, insertId: existing[0].id, message: 'Updated (Single Record)' });
        } else {
            // INSERT NEW
            const insertSql = `
                INSERT INTO prescriptions 
                (appointment_id, doctor_id, doctor_name, patient_name, pat_num, visit_date, vital_bp, vital_pulse, vital_spo2, vital_temp, symptoms, clinical_findings, diagnosis, medicines, lab_tests, advice, note, follow_up_date)
                VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const params = [
                id, doctor_id, doctor_name, patient_name || '', pat_num || '',
                vital_bp, vital_pulse, vital_spo2, vital_temp,
                symptoms, clinical_findings, diagnosis, medJSON, lab_tests, advice, note || '', follow_up_date || null
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
// 🏥 DOCTOR ROUTES (Migrated to Admin Server Port 4000)
// ============================================================
// Note: Static files are already served by appAdmin in 'public/Doctor_Dashboard'
// API Routes for Doctor App (Attached to appAdmin)

// API Routes for Doctor App
appAdmin.post('/api/doctors/login', handleDoctorLogin);
appAdmin.post('/api/auth/doctor', handleDoctorLogin);

// ===================================
// 🔧 FIX: Expose Data APIs on Port 3001
// ===================================
appAdmin.get('/api/doctor/appointments', async (req, res) => {
    try {
        const { doctor_id, date, startDate, endDate } = req.query;
        if (!doctor_id) return res.status(400).json({ error: 'doctor_id required' });

        let q = `
            SELECT a.id, a.pat_num, a.doctor_id, a.doctor_name, a.patient_name, a.patient_phone, a.patient_email, 
                   a.appointment_date, a.appointment_time, a.payment_amount, a.pat_id, a.patient_age, a.patient_sex,
                   p.symptoms, p.clinical_findings, p.diagnosis, p.medicines, p.lab_tests, p.advice, p.note, p.follow_up_date, p.updated_at,
                   p.vital_bp, p.vital_pulse, p.vital_spo2, p.vital_temp,
                   a.status
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

appAdmin.get('/api/doctor/patient-history', async (req, res) => {
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

appAdmin.post('/api/doctor/prescribe', async (req, res) => {
    console.log("------------------------------------------");
    console.log("Received /api/doctor/prescribe request (Doctor Port)");
    console.log("Request Body:", JSON.stringify(req.body, null, 2)); // DEBUG
    console.log("------------------------------------------");

    try {
        const {
            id, doctor_id, doctor_name,
            vital_bp, vital_pulse, vital_spo2, vital_temp,
            symptoms, clinical_findings, diagnosis, medicines, lab_tests, advice, note, follow_up_date
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
                    patient_name VARCHAR(255),
                    pat_num VARCHAR(64),
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
                    note TEXT,
                    follow_up_date DATE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);
            // Check if columns exist
            try {
                await dbPatient.promise().query("SELECT clinical_findings FROM prescriptions LIMIT 1");
            } catch (colErr) {
                console.log("Adding clinical_findings column...");
                await dbPatient.promise().query("ALTER TABLE prescriptions ADD COLUMN clinical_findings TEXT AFTER symptoms");
            }
            try {
                await dbPatient.promise().query("SELECT note FROM prescriptions LIMIT 1");
            } catch (colErr) {
                await dbPatient.promise().query("ALTER TABLE prescriptions ADD COLUMN note TEXT");
            }
            try {
                await dbPatient.promise().query("SELECT updated_at FROM prescriptions LIMIT 1");
            } catch (colErr) {
                await dbPatient.promise().query("ALTER TABLE prescriptions ADD COLUMN updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP");
            }
            try {
                await dbPatient.promise().query("SELECT patient_name FROM prescriptions LIMIT 1");
            } catch (colErr) {
                await dbPatient.promise().query("ALTER TABLE prescriptions ADD COLUMN patient_name VARCHAR(255) AFTER patient_id");
            }
            try {
                await dbPatient.promise().query("SELECT pat_num FROM prescriptions LIMIT 1");
            } catch (colErr) {
                await dbPatient.promise().query("ALTER TABLE prescriptions ADD COLUMN pat_num VARCHAR(64) AFTER patient_name");
            }
        } catch (tableErr) {
            console.error("Table creation warning:", tableErr);
            // continue, maybe it exists or user lacks permission, but worth trying
        }

        // 1. Get patient_name and pat_num from appointment
        const [aptRows] = await dbPatient.promise().query('SELECT patient_name, patient_phone, patient_email, pat_num FROM appointments WHERE id=?', [id]);
        let patient_name = aptRows.length ? aptRows[0].patient_name : null;
        const patient_phone = aptRows.length ? aptRows[0].patient_phone : null;
        const patient_email = aptRows.length ? aptRows[0].patient_email : null;
        const pat_num = aptRows.length ? aptRows[0].pat_num : null;


        // CHECK IF PRESCRIPTION EXISTS FOR THIS PATIENT (Single Record per Patient)
        // Logic: Try by pat_num first. Then appointment_id.
        let existing = [];
        if (pat_num) {
            [existing] = await dbPatient.promise().query('SELECT id FROM prescriptions WHERE pat_num = ? LIMIT 1', [pat_num]);
        }
        // Fallback
        if (existing.length === 0) {
            [existing] = await dbPatient.promise().query('SELECT id FROM prescriptions WHERE appointment_id = ? LIMIT 1', [id]);
        }
        // Fallback: If no patient-linked record found, check if one exists for this appointment
        if (existing.length === 0) {
            [existing] = await dbPatient.promise().query('SELECT id FROM prescriptions WHERE appointment_id = ? LIMIT 1', [id]);
        }

        const medJSON = JSON.stringify(medicines || []);

        if (existing.length > 0) {
            // UPDATE EXISTING RECORD (Single Sheet concept)
            console.log(`Updating existing unique prescription for Patient ${pat_num || id}`);
            const updateSql = `
                UPDATE prescriptions SET 
                appointment_id=?, visit_date=NOW(),
                vital_bp=?, vital_pulse=?, vital_spo2=?, vital_temp=?, 
                symptoms=?, clinical_findings=?, diagnosis=?, medicines=?, lab_tests=?, advice=?, note=?, follow_up_date=?, patient_name=?, pat_num=?
                WHERE id=?
            `;
            const updateParams = [
                id, // update appointment_id to current one
                vital_bp, vital_pulse, vital_spo2, vital_temp,
                symptoms, clinical_findings, diagnosis, medJSON, lab_tests, advice, note || '', follow_up_date || null, patient_name || '', pat_num || '',
                existing[0].id
            ];
            await dbPatient.promise().query(updateSql, updateParams);

            // Update Status Logic: Completed -> Modified -> Modified(1) -> ...
            try {
                const [sRows] = await dbPatient.promise().query("SELECT status FROM appointments WHERE id=?", [id]);
                if (sRows.length > 0) {
                    let currentStatus = sRows[0].status;
                    let newStatus = 'Modified';

                    if (currentStatus === 'Modified') {
                        newStatus = 'Modified(1)';
                    } else if (currentStatus && currentStatus.startsWith('Modified(')) {
                        const match = currentStatus.match(/Modified\((\d+)\)/);
                        if (match) {
                            newStatus = `Modified(${parseInt(match[1]) + 1})`;
                        }
                    }

                    await dbPatient.promise().query("UPDATE appointments SET status=? WHERE id=?", [newStatus, id]);
                }
            } catch (errStatus) { console.error("Error updating status:", errStatus); }

            // Return the existing ID
            return res.json({ success: true, insertId: existing[0].id, message: 'Updated (Single Record)' });

        } else {
            // INSERT NEW
            const insertSql = `
                INSERT INTO prescriptions 
                (appointment_id, doctor_id, doctor_name, patient_name, pat_num, visit_date, vital_bp, vital_pulse, vital_spo2, vital_temp, symptoms, clinical_findings, diagnosis, medicines, lab_tests, advice, note, follow_up_date)
                VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const params = [
                id, doctor_id, doctor_name, patient_name || '', pat_num || '',
                vital_bp, vital_pulse, vital_spo2, vital_temp,
                symptoms, clinical_findings, diagnosis, medJSON, lab_tests, advice, note || '', follow_up_date || null
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
appAdmin.get('/api/doctor/dashboard-stats', async (req, res) => {
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

// End of Doctor APIs


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
// ===================================
// 💊 PRESCRIPTION PDF GENERATOR
// ===================================
appPublic.get('/api/generate-prescription/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Fetch Appointment + Doctor + Prescription
        //    We join tables to get all data in one go or use sequential queries.
        //    Using sequential for safety and clarity similar to existing logic.

        // A. Appointment Basic Info
        const [aptRows] = await dbPatient.promise().query(
            "SELECT * FROM appointments WHERE id=?", [id]
        );
        console.log(`[PEM Gen] Req ID: ${id}, Apt Found: ${aptRows.length}`);

        if (!aptRows.length) return res.status(404).send('Appointment not found');
        const apt = aptRows[0];

        // B. Prescription Data
        const [rxRows] = await dbPatient.promise().query(
            "SELECT * FROM prescriptions WHERE appointment_id=?", [id]
        );
        console.log(`[PEM Gen] Rx Found: ${rxRows.length}`);

        const rx = rxRows.length ? rxRows[0] : {};
        if (rxRows.length > 0) {
            console.log(`[PEM Gen] Rx ID: ${rxRows[0].id}, Meds Raw Type: ${typeof rxRows[0].medicines}`);
        } else {
            console.warn(`[PEM Gen] No prescription row found for Apt ID ${id}`);
        }

        // C. Doctor Info
        const [docRows] = await dbDoctor.promise().query(
            "SELECT * FROM doctors WHERE DoctorID=?", [apt.doctor_id]
        );
        const doc = docRows.length ? docRows[0] : {};

        // Helpers
        const safe = (val) => val || '';
        const formatDate = (d) => {
            if (!d) return new Date().toLocaleDateString('en-GB');
            return new Date(d).toLocaleDateString('en-GB');
        };

        // Meds Parsing
        let medList = [];
        try {
            medList = rx.medicines ? (typeof rx.medicines === 'string' ? JSON.parse(rx.medicines) : rx.medicines) : [];
        } catch (e) { }

        // Tests
        const tests = rx.lab_tests ? rx.lab_tests : '';

        // Vitals
        const bp = rx.vital_bp || '-';
        const pulse = rx.vital_pulse || '-';
        const spo2 = rx.vital_spo2 || '-';
        const temp = rx.vital_temp || '-';

        // 2. Build HTML (Modern Letterhead Style)
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Prescription #${id}</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
            <style>
                @page { margin: 0; size: A4; }
                body { margin: 0; font-family: 'Inter', sans-serif; background: #fff; color: #1e293b; -webkit-print-color-adjust: exact; }
                
                /* 1. BRAND HEADER (Logo Only) */
                .brand-header {
                    background: #fff;
                    padding: 30px 40px 10px 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 15px;
                    border-bottom: 2px solid #0f172a;
                }
                .logo-icon {
                    width: 40px; height: 40px;
                    background: #0f172a;
                    color: white;
                    border-radius: 8px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 24px; font-weight: bold;
                }
                .brand-text h1 { margin: 0; font-size: 28px; color: #0f172a; letter-spacing: -1px; text-transform: uppercase; }
                .brand-text p { margin: 2px 0 0; font-size: 10px; color: #64748b; letter-spacing: 2px; text-transform: uppercase; text-align: center; }

                /* 2. DOCTOR STRIP */
                .doc-strip {
                    background: #f8fafc;
                    padding: 15px 40px;
                    border-bottom: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .doc-main { display: flex; flex-direction: column; }
                .doc-name { font-size: 18px; font-weight: 700; color: #334155; }
                .doc-meta { font-size: 11px; color: #64748b; margin-top: 2px; font-weight: 500; }
                .doc-reg { border: 1px solid #cbd5e1; padding: 2px 6px; border-radius: 4px; font-size: 10px; color: #475569; }

                /* 3. PATIENT GRID */
                .pat-grid {
                    padding: 15px 40px;
                    display: grid;
                    grid-template-columns: auto 1fr auto 1fr;
                    gap: 10px 30px;
                    align-items: center;
                    font-size: 12px;
                    border-bottom: 4px solid #f1f5f9;
                }
                .pat-kv { display: flex; flex-direction: column; }
                .pat-lbl { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
                .pat-val { font-size: 13px; font-weight: 600; color: #1e293b; }

                /* BODY */
                .container { display: flex; min-height: 700px; padding-top: 20px; }
                
                /* LEFT */
                .sidebar {
                    width: 250px;
                    padding: 0 0 0 40px;
                    border-right: 1px solid #f1f5f9;
                }
                /* RIGHT */
                .main-content {
                    flex: 1;
                    padding: 0 40px 0 30px;
                }

                .block { margin-bottom: 30px; }
                .block-title {
                    font-size: 11px; font-weight: 800; color: #0f172a;
                    text-transform: uppercase; letter-spacing: 1px;
                    margin-bottom: 8px; border-bottom: 2px solid #e2e8f0;
                    padding-bottom: 4px; display: inline-block;
                }
                .block-txt { font-size: 13px; color: #334155; line-height: 1.6; }

                /* Rx SYMBOL */
                .rx-sym { 
                    font-family: 'Times New Roman', serif; font-style: italic; font-size: 32px; 
                    color: #0f172a; margin-bottom: 10px;
                }

                /* TABLE */
                table { width: 100%; border-collapse: collapse; }
                th { text-align: left; font-size: 10px; color: #94a3b8; padding-bottom: 8px; text-transform: uppercase; }
                td { padding: 10px 0; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
                .m-name { font-weight: 600; font-size: 14px; color: #0f172a; }
                .m-instr { font-size: 11px; color: #64748b; font-style: italic; margin-top: 2px; }

                /* FOOTER */
                .footer {
                    padding: 20px 40px;
                    border-top: 4px solid #f1f5f9;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                }
                .sig-line { width: 200px; border-top: 1px solid #0f172a; text-align: right; padding-top: 5px; font-size: 12px; font-weight: 600; }

            </style>
        </head>
        <body onload="print()">

            <!-- 1. HEADER (BRAND) -->
            <div class="brand-header">
                <div class="logo-icon">+</div>
                <div class="brand-text">
                    <h1>RM HealthCare</h1>
                    <p>Excellence in Care</p>
                </div>
            </div>

            <!-- 2. DOCTOR -->
            <div class="doc-strip">
                <div class="doc-main">
                    <div class="doc-name">Dr. ${safe(doc.FirstName)} ${safe(doc.LastName)}</div>
                    <div class="doc-meta">${safe(doc.Degrees)}</div>
                    <div class="doc-meta" style="color:#0f172a;">${safe(doc.Specialization || 'General Physician')}</div>
                </div>
                <div>
                    <span class="doc-reg">Reg: ${safe(doc.RegNumber)}</span>
                </div>
            </div>

            <!-- 3. PATIENT -->
            <div class="pat-grid">
                <div class="pat-kv">
                    <span class="pat-lbl">Patient Name</span>
                    <span class="pat-val">${safe(apt.patient_name)}</span>
                </div>
                <div class="pat-kv">
                    <span class="pat-lbl">Age / Sex</span>
                    <span class="pat-val">${safe(apt.patient_age)} Yrs / ${safe(apt.patient_sex)}</span>
                </div>
                <div class="pat-kv">
                    <span class="pat-lbl">Date</span>
                    <span class="pat-val">${formatDate(apt.appointment_date)}</span>
                </div>
                <div class="pat-kv">
                    <span class="pat-lbl">ID / UHID</span>
                    <span class="pat-val">OP/${id} <span style="color:#cbd5e1">|</span> ${safe(rx.pat_num || apt.pat_num || '-')}</span>
                </div>
            </div>

            <!-- 4. BODY -->
            <div class="container">
                <div class="sidebar">
                    <div class="block">
                        <div class="block-title">Details</div>
                        <div class="block-txt">
                            <div style="margin-bottom:15px;">
                                <div style="font-size:10px; color:#94a3b8; font-weight:700;">BP</div>
                                <div>${bp} mmHg</div>
                            </div>
                            <div style="margin-bottom:15px;">
                                <div style="font-size:10px; color:#94a3b8; font-weight:700;">Pulse</div>
                                <div>${pulse} bpm</div>
                            </div>
                            <div style="margin-bottom:15px;">
                                <div style="font-size:10px; color:#94a3b8; font-weight:700;">Weight</div>
                                <div>${safe(rx.weight) || '-'} kg</div>
                            </div>
                        </div>
                    </div>

                    <div class="block">
                        <div class="block-title">Chief Complaints</div>
                        <div class="block-txt">${safe(rx.symptoms).replace(/\\n/g, '<br>') || '-'}</div>
                    </div>

                    <div class="block">
                        <div class="block-title">Diagnosis</div>
                        <div class="block-txt" style="font-weight:600;">${safe(rx.diagnosis) || '-'}</div>
                    </div>
                </div>

                <div class="main-content">
                    <div class="rx-sym">Rx</div>
                    
                    <div class="block">
                        <table>
                            <thead>
                                <tr>
                                    <th width="40%">Medicine</th>
                                    <th width="20%">Dose</th>
                                    <th width="20%">Frequency</th>
                                    <th width="20%">Duration</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${medList.map(m => `
                                <tr>
                                    <td>
                                        <div class="m-name">${m.name}</div>
                                        <div class="m-instr">${m.instr || ''}</div>
                                    </td>
                                    <td style="font-weight:600; font-size:13px;">${m.dose}</td>
                                    <td style="font-size:13px;">${m.freq}</td>
                                    <td style="font-size:13px;">${m.dur}</td>
                                </tr>
                                `).join('')}
                                ${medList.length === 0 ? '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">- No Medicines -</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>

                    ${tests ? `
                    <div class="block" style="margin-top:40px;">
                        <div class="block-title">Investigations</div>
                        <div class="block-txt">${tests}</div>
                    </div>` : ''}

                    <div class="block" style="margin-top:20px;">
                        <div class="block-title">Advice / Note</div>
                        <div class="block-txt">${safe(rx.advice).replace(/\\n/g, '<br>') || '-'}</div>
                        <div class="block-txt" style="margin-top:5px; color:#64748b;">${safe(rx.note).replace(/\\n/g, '<br>')}</div>
                    </div>
                </div>
            </div>

            <!-- FOOTER -->
            <div class="footer">
                <div style="font-size:12px; color:#64748b;">
                    <strong>Next Follow Up:</strong> ${rx.follow_up_date ? new Date(rx.follow_up_date).toLocaleDateString() : 'When required'}
                </div>
                <div class="sig-line">
                    Dr. ${safe(doc.LastName)}
                </div>
            </div>

        </body>
        </html>
        `;

        res.send(html);

    } catch (e) {
        console.error(e);
        res.status(500).send('Error generating prescription: ' + e.message);
    }
});

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
        // Build HTML (paste-ready, unescaped template)
        const billHTML = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Invoice #${billNo}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; background: #f3f4f6; padding: 40px; margin: 0; color: #1e293b; -webkit-print-color-adjust: exact; }
        .invoice-box { max-width: 850px; margin: 0 auto; background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
        
        /* Header */
        .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
        .logo-section { display: flex; gap: 15px; align-items: center; }
        .logo-box { width: 60px; height: 60px; background: #0056b3; color: white; border-radius: 8px; font-weight: 700; font-size: 24px; display: flex; align-items: center; justify-content: center; }
        .company-info h1 { margin: 0; font-size: 20px; color: #0056b3; }
        .company-info p { margin: 2px 0 0; color: #64748b; font-size: 13px; }
        
        .bill-meta { text-align: right; font-size: 13px; line-height: 1.6; }
        .bill-meta strong { color: #0f172a; }
        .bill-id { color: #0056b3; font-weight: 600; font-size: 14px; margin-bottom: 4px; display:block; }

        /* Two Column Details */
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        .info-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; }
        .card-title { color: #3b82f6; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 15px; }
        
        .info-row { display: flex; margin-bottom: 8px; font-size: 13px; }
        .info-label { width: 100px; color: #64748b; }
        .info-val { font-weight: 500; color: #0f172a; flex: 1; }

        /* Token Badge */
        .token-section { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 30px; }
        .token-left h4 { margin: 0 0 10px; font-size: 13px; color: #64748b; }
        .token-badge { background: #0056b3; color: white; padding: 10px 24px; border-radius: 50px; font-size: 16px; font-weight: 700; display: inline-block; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2); }
        .token-right { font-size: 12px; color: #64748b; text-align: right; }
        .token-right strong { color: #0056b3; display: block; margin-bottom: 4px; font-size: 13px; }

        /* Table */
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th { background: #f8fafc; color: #475569; font-weight: 600; font-size: 12px; text-transform: uppercase; padding: 12px 16px; text-align: left; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; }
        td { padding: 16px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; }
        .text-right { text-align: right; }
        
        .total-box { width: 300px; margin-left: auto; background: #fff; }
        .t-row { display: flex; justify-content: space-between; padding: 8px 16px; font-size: 13px; }
        .t-row.final { background: #eff6ff; color: #1e3a8a; font-weight: 700; font-size: 15px; border-radius: 6px; padding: 12px 16px; margin-top: 5px; }

        /* Footer & Payment */
        .payment-info { margin-top: 40px; border-top: 1px dashed #e2e8f0; padding-top: 20px; display: flex; justify-content: space-between; }
        .mode-block h4 { margin: 0 0 5px; color: #0056b3; font-size: 14px; }
        .mode-block p { margin: 0; font-size: 13px; color: #64748b; }
        .received-block { text-align: right; }
        .received-block h4 { margin: 0 0 5px; font-size: 12px; color: #64748b; text-transform: uppercase; }
        .received-block .amount { font-size: 24px; font-weight: 800; color: #0f172a; }

        .footer { margin-top: 50px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; color: #94a3b8; }
        .print-btn { background: #0f172a; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 500; font-size: 13px; transition: all 0.2s; }
        .print-btn:hover { background: #1e293b; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }

        @media print {
            body { background: white; padding: 0; }
            .invoice-box { box-shadow: none; padding: 20px; border-radius: 0; max-width: 100%; }
            .print-btn { display: none; }
            .token-badge { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .t-row.final { background: #eff6ff !important; -webkit-print-color-adjust: exact; }
        }
    </style>
</head>
<body>
    <div class="invoice-box">
        <!-- Header -->
        <div class="header">
            <div class="logo-section">
                <div class="logo-box">RM</div>
                <div class="company-info">
                    <h1>RM HealthCare</h1>
                    <p>Comprehensive Care • Compassionate Service</p>
                </div>
            </div>
            <div class="bill-meta">
                <span class="bill-id">Bill No. # ${billNo}</span>
                <p><strong>Invoice ID:</strong> ${billId}<br>
                <strong>Bill Date:</strong> ${billDateSimple}</p>
            </div>
        </div>

        <!-- Info Grid -->
        <div class="info-grid">
            <!-- Patient -->
            <div class="info-card">
                <div class="card-title">Patient</div>
                <div class="info-row"><div class="info-label">Name</div><div class="info-val">${apt.patient_name || 'N/A'}</div></div>
                <div class="info-row"><div class="info-label">Phone</div><div class="info-val">${apt.patient_phone || '-'}</div></div>
                <div class="info-row"><div class="info-label">Email</div><div class="info-val">${apt.patient_email || '-'}</div></div>
            </div>
            <!-- Appointment -->
            <div class="info-card">
                <div class="card-title">Appointment</div>
                <div class="info-row"><div class="info-label">Appt ID</div><div class="info-val">#${appointmentId}</div></div>
                <div class="info-row"><div class="info-label">Date</div><div class="info-val">${apptDateSimple}</div></div>
                <div class="info-row"><div class="info-label">Time</div><div class="info-val">${apt.appointment_time || '-'}</div></div>
                <div class="info-row"><div class="info-label">Doctor</div><div class="info-val">Dr. ${apt.doctor_name || ''}</div></div>
                <div class="info-row"><div class="info-label">Department</div><div class="info-val">${department}</div></div>
            </div>
        </div>

        <!-- Token -->
        <div class="token-section">
            <div class="token-left">
                <h4>Your Appointment Token</h4>
                <div class="token-badge">${apptToken}</div>
            </div>
            <div class="token-right">
                <strong>Keep this for your records</strong>
                Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
            </div>
        </div>

        <!-- Table -->
        <table>
            <thead>
                <tr>
                    <th style="width:50px">#</th>
                    <th>Particulars</th>
                    <th class="text-right" style="width:100px">Qty</th>
                    <th class="text-right" style="width:120px">Rate (₹)</th>
                    <th class="text-right" style="width:100px">GST</th>
                    <th class="text-right" style="width:120px">Amount (₹)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>1</td>
                    <td>Doctor Consultation Fee</td>
                    <td class="text-right">1</td>
                    <td class="text-right">${(Number(amount || 0)).toFixed(2)}</td>
                    <td class="text-right">18%</td>
                    <td class="text-right"><strong>${(Number(totalAmount || 0)).toFixed(2)}</strong></td>
                </tr>
            </tbody>
        </table>

        <!-- Totals -->
        <div class="total-box">
            <div class="t-row">
                <span>Sub Total</span>
                <span>₹${(Number(amount || 0)).toFixed(2)}</span>
            </div>
            <div class="t-row">
                <span>GST (18%)</span>
                <span>₹${(Number(gst || 0)).toFixed(2)}</span>
            </div>
            <div class="t-row final">
                <span>Total Payable</span>
                <span>₹${(Number(totalAmount || 0)).toFixed(2)}</span>
            </div>
        </div>

        <!-- Payment & Footer -->
        <div class="payment-info">
            <div class="mode-block">
                <h4>Payment Details</h4>
                <p>Mode: ${apt.payment_amount ? 'Online / Paid' : 'Cash / Due'}</p>
                <p style="margin-top:2px">Particulars: Consultation</p>
                <p style="margin-top:10px; font-size:11px; color:#94a3b8">Note: This is a computer-generated invoice and does not require a physical signature.</p>
            </div>
            <div class="received-block">
                <h4>Received</h4>
                <div class="amount">₹${apt.payment_amount ? (Number(totalAmount || 0)).toFixed(2) : '0.00'}</div>
            </div>
        </div>

        <div class="footer">
            <div>
                <strong>RM HEALTH CARE</strong><br>
                123 Medical Avenue, Kolkata - 700094<br>
                Phone: +91-XXXXXXXXXX
            </div>
            <a href="#" class="print-btn" onclick="window.print(); return false;">Print / Save PDF</a>
        </div>
        
        <div style="text-align:center; font-size:11px; color:#cbd5e1; margin-top:20px">
            System generated invoice • ${new Date().toISOString().split('T')[0]}
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

// ============================================================
// 🚀 START SERVERS
// ============================================================
const PORT_PATIENT = 3000;
const PORT_ADMIN = 4000;

// Migration: Fix users table date_of_birth to allow NULL (since we removed it from frontend)
(async function migrateUsersDOB() {
    try {
        console.log('Running migration: Make users.date_of_birth nullable...');
        // Try MODIFY for MySQL
        await dbPatient.promise().query("ALTER TABLE users MODIFY COLUMN date_of_birth VARCHAR(50) NULL");
        console.log('✅ Migration successful: date_of_birth is now nullable.');
    } catch (e) {
        // Ignore if error (e.g. column doesn't exist or already done)
        console.warn('Migration warning (date_of_birth):', e.message);
    }
})();

// Migration: Ensure Doctors Audit Columns (Retry)
(async function migrateDoctorsAudit() {
    try {
        console.log('Running migration: Ensure Doctors Audit Columns...');
        const cols = [
            "ADD COLUMN created_by VARCHAR(100) NULL",
            "ADD COLUMN updated_by VARCHAR(100) NULL",
            "ADD COLUMN updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP"
        ];
        for (const c of cols) {
            try { await dbDoctor.promise().query(`ALTER TABLE doctors ${c}`); } catch (e) {
                if (e.code !== 'ER_DUP_FIELDNAME') console.error("Audit col error:", e.message);
            }
        }
        console.log('✅ Doctors Audit Columns Verified (created_by, updated_by, updated_at).');
    } catch (e) { console.error("Error audit cols:", e.message); }
})();

appPublic.listen(PORT_PATIENT, () => {
    console.log(`✅ Patient Server running at http://localhost:${PORT_PATIENT}`);
});

appAdmin.listen(PORT_ADMIN, () => {
    console.log(`✅ Admin/Doctor Server running at http://localhost:${PORT_ADMIN}`);
});
