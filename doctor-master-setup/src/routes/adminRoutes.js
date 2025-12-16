// src/routes/adminRoutes.js

const express = require('express');
const router = express.Router();
const path = require('path'); // ⭐ ADDED: path module যুক্ত করা হলো
const multer = require('multer'); // ⭐ ADDED: Multer যুক্ত করা হলো
const adminAuth = require('../middlewares/auth'); 
const doctorsController = require('../controllers/doctorsController');
const masterController = require('../controllers/masterController'); 

// --- MULTER SETUP START ---
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const ABS_UPLOAD = path.join(process.cwd(), UPLOAD_DIR);

// Multer storage কনফিগারেশন: ফাইল কোথায় এবং কী নামে সেভ হবে
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // ফাইলগুলো /uploads ফোল্ডারে সেভ হবে
    cb(null, ABS_UPLOAD); 
  },
  filename: (req, file, cb) => {
    // ইউনিক ফাইলনেম তৈরি: doctor-timestamp.ext
    const ext = path.extname(file.originalname);
    cb(null, 'doctor-' + Date.now() + ext);
  }
});
const upload = multer({ storage: storage });
// --- MULTER SETUP END ---


// Admin Auth Middleware: এর পরের সমস্ত রুট সুরক্ষিত থাকবে
router.use(adminAuth); 

// Master Data Routes
router.get('/departments', masterController.getDepartments);
router.post('/departments', masterController.addDepartment);
router.get('/doctor-types', masterController.getDoctorTypes);
router.post('/doctor-types', masterController.addDoctorType);

// Doctor CRUD Routes (Multer middleware যুক্ত করা হলো)
router.get('/doctors', doctorsController.getDoctors);

// ⭐ FIXED: ডাক্তার যুক্ত করার রুটে 'upload.single('image')' যুক্ত করা হলো
router.post('/doctors', upload.single('image'), doctorsController.createDoctor);

// ⭐ FIXED: আপডেট রুটেও 'upload.single('image')' যুক্ত করা হলো
router.put('/doctors/:id', upload.single('image'), doctorsController.updateDoctor); 

router.patch('/doctors/:id/status', doctorsController.updateDoctorStatus);
router.delete('/doctors/:id', doctorsController.deleteDoctor);

module.exports = router;