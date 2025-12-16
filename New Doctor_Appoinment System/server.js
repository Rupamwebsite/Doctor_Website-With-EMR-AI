const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = 3000;

// --- মিডলওয়্যার কনফিগারেশন ---
app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));


app.use(express.static(path.join(__dirname, 'Public')));

app.use('/patient', express.static(path.join(__dirname, '../Patient_Dashboard')));


app.use('/admin', express.static(path.join(__dirname, '../doctor-master-setup/public')));

const uploadDir = path.join(__dirname, '../doctor-master-setup/uploads');


if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));


// --- ডাটাবেস কানেকশন ---
const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'Rupam@123', 
    database: 'Doctor_Appoinment_DB'
});


const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });


// ============================================================
// 🚀 API রাউটস (Routes)
// ============================================================

// ১. লগইন (Login)
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        // ক) অ্যাডমিন লগইন চেক
        // ...
if(email === 'admin@hospital.com' && password === 'admin123') {
     return res.status(200).json({ 
         success: true, 
         message: 'Admin Login successful!', 
         token: 'admin_token', // <--- এই লাইনটি অবশ্যই যোগ করুন
         redirect: '/admin/doctors-master.html' 
     });
}
// ...

        // খ) পেশেন্ট লগইন চেক
        const [users] = await db.promise().query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(401).json({ success: false, message: 'User not found' });

        const isMatch = await bcrypt.compare(password, users[0].password);
        if (!isMatch) return res.status(401).json({ success: false, message: 'Wrong password' });

        res.status(200).json({ 
            success: true, 
            message: 'Login successful!', 
            redirect: '/patient/Patient_Dashboard.html' 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ২. রেজিস্ট্রেশন (Registration)
app.post('/register', async (req, res) => {
    const { full_name, email, password, date_of_birth } = req.body;
    try {
        const hashed = await bcrypt.hash(password, 10);
        await db.promise().query('INSERT INTO users (full_name, email, password, date_of_birth) VALUES (?, ?, ?, ?)', [full_name, email, hashed, date_of_birth]);
        res.status(201).json({ success: true, message: 'Registered successfully!' });
    } catch (e) { 
        console.error(e);
        res.status(500).json({ success: false, message: 'Registration failed' }); 
    }
});

// ৩. ডাক্তারদের লিস্ট API (পেশেন্ট ড্যাশবোর্ড ও অ্যাডমিন প্যানেলে দেখানোর জন্য)
app.get('/api/doctors', async (req, res) => {
    const { active, specialization } = req.query;
    let query = 'SELECT * FROM doctors';
    let conditions = [];
    
    // ফিল্টারিং
    if (active) conditions.push(`is_active = ${active === '1'}`);
    if (specialization) conditions.push(`specialization LIKE '%${specialization}%'`);
    
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    
    try {
        const [rows] = await db.promise().query(query);
        res.json({ doctors: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ৪. নির্দিষ্ট ডাক্তার খোঁজা (ID দিয়ে)
app.get('/api/doctors/:id', async (req, res) => {
    try {
        const [rows] = await db.promise().query('SELECT * FROM doctors WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Doctor not found' });
        res.json({ doctor: rows[0] }); // অথবা res.json(rows[0]) যদি ফ্রন্টএন্ডে সরাসরি অবজেক্ট চান
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ৫. অ্যাডমিন API: নতুন ডাক্তার অ্যাড করা (ছবিসহ)
app.post('/api/admin/doctors', upload.single('image'), async (req, res) => {
    try {
        const { first_name, last_name, department, doctor_type, specialization, fees, phone, email, is_active } = req.body;
        const image_url = req.file ? req.file.filename : null;
        
        await db.promise().query(
            `INSERT INTO doctors (first_name, last_name, department, doctor_type, specialization, fees, phone, email, image_url, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [first_name, last_name, department, doctor_type, specialization, fees, phone, email, image_url, is_active === 'true']
        );
        res.status(201).json({ message: 'Doctor added successfully' });
    } catch (e) { 
        console.error(e);
        res.status(500).json({ error: e.message }); 
    }
});

// ৬. অ্যাডমিন API: ডাক্তার আপডেট করা
app.put('/api/admin/doctors/:id', upload.single('image'), async (req, res) => {
    try {
        const { first_name, last_name, department, doctor_type, specialization, fees, dob, email, phone, is_active } = req.body;
        let query = `UPDATE doctors SET first_name=?, last_name=?, department=?, doctor_type=?, specialization=?, fees=?, dob=?, email=?, phone=?, is_active=?`;
        let params = [first_name, last_name, department, doctor_type, specialization, fees, dob, email, phone, is_active === 'true' || is_active === '1'];

        // যদি নতুন ছবি আপলোড করা হয়
        if (req.file) {
            query += `, image_url=?`;
            params.push(req.file.filename);
        }
        query += ` WHERE id=?`;
        params.push(req.params.id);

        await db.promise().query(query, params);
        res.json({ message: 'Doctor updated successfully' });
    } catch (error) { res.status(500).json({ error: 'Failed to update doctor' }); }
});

// ৭. অ্যাডমিন API: ডাক্তার ডিলিট করা
app.delete('/api/admin/doctors/:id', async (req, res) => {
    try {
        await db.promise().query('DELETE FROM doctors WHERE id = ?', [req.params.id]);
        res.json({ message: 'Doctor deleted' });
    } catch (error) { res.status(500).json({ error: 'Delete failed' }); }
});

// ৮. ডিপার্টমেন্ট লিস্ট API
app.get('/api/admin/departments', async (req, res) => {
    try {
        const [rows] = await db.promise().query('SELECT DISTINCT department FROM doctors WHERE department IS NOT NULL');
        const depts = rows.map(r => r.department);
        // ডিফল্ট কিছু ডিপার্টমেন্ট যদি ডাটাবেস খালি থাকে
        if (!depts.includes('Cardiology')) depts.push('Cardiology');
        res.json(depts);
    } catch (error) { res.status(500).json({ error: 'Fetch failed' }); }
});

// সার্ভার স্টার্ট
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Serving Admin Panel from: ../doctor-master-setup/public`);
});