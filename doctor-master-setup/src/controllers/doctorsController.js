// src/controllers/doctorsController.js

const pool = require('../db');
const fs = require('fs');
const path = require('path');

// .env থেকে UPLOAD_DIR নেওয়া হচ্ছে
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const ABS_UPLOAD_DIR = path.join(process.cwd(), UPLOAD_DIR);


// --- (getDoctors) ---
async function getDoctors(req, res) {
  try {
    const activeQuery = req.query.active;
    

    let query = `SELECT 
        DoctorID as id, FirstName as first_name, LastName as last_name, 
        Specialization as specialization, Email as email, ContactNumber as phone, 
        ActiveStatus as is_active, Department as department, DoctorType as doctor_type, 
        DOB as dob, image_url as image_url, Fees as fees 
        FROM Doctors`; 
        
    const params = [];

    if (activeQuery !== 'all' && (activeQuery === '1' || activeQuery === '0')) {
        query += ' WHERE ActiveStatus = ?';
        params.push(parseInt(activeQuery));
    }

    query += ' ORDER BY CreatedOn DESC';

    const [rows] = await pool.query(query, params);
    res.json({ doctors: rows });
  } catch (err) {
    console.error("Error fetching doctors:", err);
    res.status(500).json({ error: 'Server error fetching doctors' });
  }
}

// --- (getDoctorById) ---
async function getDoctorById(req, res) {
    try {
        const id = req.params.id;
        let query = `SELECT 
            DoctorID as id, FirstName as first_name, LastName as last_name, 
            Specialization as specialization, Email as email, ContactNumber as phone, 
            ActiveStatus as is_active, Department as department, DoctorType as doctor_type, 
            DOB as dob, image_url as image_url, Fees as fees 
            FROM Doctors WHERE DoctorID = ?`; 

        const [rows] = await pool.query(query, [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Doctor not found' });
        
        res.json(rows[0]);
    } catch (err) {
        console.error("Error fetching doctor by ID:", err);
        res.status(500).json({ error: 'Server error fetching doctor' });
    }
}


// --- (createDoctor) ---
async function createDoctor(req, res) {
  try {
    const { 
      first_name, last_name, specialization, email, phone, 
      department, doctor_type, dob, fees 
    } = req.body;
    
    // ⭐ FIXED: req.file থেকে ছবির নাম নেওয়া হলো (Multer দ্বারা যুক্ত)
    const image_url = req.file ? req.file.filename : null; 
    
    // Basic validation
    if (!first_name || !specialization || !department) {
        // যদি ডাটা না থাকে এবং ছবি আপলোড হয়ে থাকে, তাহলে সেই ফাইলটি ডিলিট করে দিন
        if (image_url) {
            fs.unlinkSync(path.join(ABS_UPLOAD_DIR, image_url));
        }
        return res.status(400).json({ error: 'First Name, Specialization, and Department are required.' });
    }

    const query = `
      INSERT INTO Doctors 
      (FirstName, LastName, Specialization, Email, ContactNumber, Department, DoctorType, DOB, Fees, image_url, ActiveStatus, CreatedOn) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
    `;

    const params = [
      first_name, last_name, specialization, email, phone, 
      department, doctor_type, dob, fees, image_url 
    ];

    const [result] = await pool.query(query, params);
    res.status(201).json({ id: result.insertId, message: 'Doctor added successfully' });
  } catch (err) {
    // Error হলে ফাইল ডিলিট করার চেষ্টা করুন
    if (req.file && req.file.filename) {
        try {
            fs.unlinkSync(path.join(ABS_UPLOAD_DIR, req.file.filename));
        } catch(e) { /* ignore unlink error */ }
    }
    console.error('Error creating doctor:', err);
    res.status(500).json({ error: 'Server error while creating doctor' });
  }
}

// --- (updateDoctor) ---
async function updateDoctor(req, res) {
  try {
    const id = req.params.id;
    const { 
      first_name, last_name, specialization, email, phone, 
      department, doctor_type, dob, fees, old_image_url
    } = req.body;
    
    // ⭐ FIXED: req.file থেকে নতুন ছবির নাম নেওয়া হলো
    const new_image_url = req.file ? req.file.filename : null;

    let updateQuery = `
      UPDATE Doctors SET 
      FirstName = ?, LastName = ?, Specialization = ?, Email = ?, ContactNumber = ?, 
      Department = ?, DoctorType = ?, DOB = ?, Fees = ?
    `;
    let updateParams = [
      first_name, last_name, specialization, email, phone, 
      department, doctor_type, dob, fees
    ];

    // যদি নতুন ছবি আপলোড হয়, তবে image_url আপডেট করুন
    if (new_image_url) {
      updateQuery += `, image_url = ?`;
      updateParams.push(new_image_url);
    }

    updateQuery += ` WHERE DoctorID = ?`;
    updateParams.push(id);
    
    const [result] = await pool.query(updateQuery, updateParams);

    if (result.affectedRows === 0) {
        // যদি আপডেট না হয় কিন্তু নতুন ফাইল আপলোড হয়ে থাকে, তাহলে ফাইলটি ডিলিট করে দিন
        if (new_image_url) {
            fs.unlinkSync(path.join(ABS_UPLOAD_DIR, new_image_url));
        }
        return res.status(404).json({ error: 'Doctor not found or no changes made' });
    }
    
    // ⭐ FIXED: পুরাতন ছবি ডিলিট করার লজিক ⭐
    // যদি নতুন ছবি আপলোড হয় এবং পুরাতন image_url থাকে
    if (new_image_url && old_image_url && old_image_url !== new_image_url) {
        const file_to_delete = path.join(ABS_UPLOAD_DIR, old_image_url);
        // নিশ্চিত করুন ফাইলটি বিদ্যমান
        if (fs.existsSync(file_to_delete)) {
            fs.unlinkSync(file_to_delete);
        }
    }
    
    res.json({ id: id, message: 'Doctor updated successfully' });
  } catch (err) {
    // Error হলে নতুন আপলোড করা ফাইলটি ডিলিট করার চেষ্টা করুন
    if (req.file && req.file.filename) {
        try {
            fs.unlinkSync(path.join(ABS_UPLOAD_DIR, req.file.filename));
        } catch(e) { /* ignore unlink error */ }
    }
    console.error('Error updating doctor:', err);
    res.status(500).json({ error: 'Server error while updating doctor' });
  }
}

// --- (updateDoctorStatus) ---
async function updateDoctorStatus(req, res) {
  try {
    const id = req.params.id;
    const { is_active } = req.body;
    
    // is_active (boolean) কে MySQL এর জন্য 1 বা 0 এ রূপান্তর করা হলো
    const val = is_active === true || is_active === '1' ? 1 : 0;
    
    await pool.query('UPDATE Doctors SET ActiveStatus = ? WHERE DoctorID = ?', [val, id]);
    
    const [rows] = await pool.query('SELECT DoctorID as id, ActiveStatus as is_active FROM Doctors WHERE DoctorID = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Doctor not found' });
    res.json({ id: rows[0].id, is_active: rows[0].is_active });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

// --- (deleteDoctor) ---
async function deleteDoctor(req, res) {
  try {
    const id = req.params.id;
    
    // image_url fetch করে ফাইলটি ডিলিট করার জন্য
    const [rows] = await pool.query('SELECT image_url FROM Doctors WHERE DoctorID = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Doctor not found' });
    
    const image_to_delete = rows[0].image_url;

    const [result] = await pool.query('DELETE FROM Doctors WHERE DoctorID = ?', [id]);
    
    // ⭐ FIXED: ফাইলটি সার্ভার থেকে ডিলিট করা হলো ⭐
    if (result.affectedRows > 0 && image_to_delete) {
        const full_path = path.join(ABS_UPLOAD_DIR, image_to_delete);
        if (fs.existsSync(full_path)) {
            fs.unlinkSync(full_path);
        }
    }
    
    if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Doctor not found' });
    }
    
    res.json({ message: 'Doctor deleted successfully', id: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  getDoctors,
  getDoctorById,
  createDoctor,
  updateDoctor,
  updateDoctorStatus,
  deleteDoctor
};