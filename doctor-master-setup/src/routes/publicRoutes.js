const express = require('express');
const router = express.Router();
const controller = require('../controllers/doctorsController');

// Doctor list routes
router.get('/doctors', controller.getDoctors);
router.get('/doctors/:id', controller.getDoctorById);

// Dummy test route (optional)
router.get('/test', (req, res) => {
  res.send('Public route working!');
});

module.exports = router;