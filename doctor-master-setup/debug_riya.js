
require('dotenv').config();
const mysql = require('mysql2');

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'Rupam@123',
    database: 'd_doctor_master'
};

const dbPatientConfig = {
    host: 'localhost',
    user: 'root',
    password: 'Rupam@123',
    database: 'doctor_appoinment_db'
};

const dbDoctor = mysql.createConnection(dbConfig);
const dbPatient = mysql.createConnection(dbPatientConfig);

async function check() {
    try {
        // 1. Get Doctor ID for Riya
        const [users] = await dbDoctor.promise().query("SELECT * FROM users WHERE username LIKE '%riya%'");
        console.log('User(s) found for "riya":', users);

        if (users.length === 0) {
            console.log('❌ No user found for "riya"');
            process.exit();
        }

        const doctorId = users[0].doctor_id; // Using the new column
        console.log(`Checking appointments for Doctor ID: ${doctorId}`);

        if (!doctorId) {
            console.log('❌ This user is not linked to a Doctor ID (doctor_id is null).');
            process.exit();
        }

        // 2. Check Appointments
        const [appts] = await dbPatient.promise().query("SELECT id, doctor_id, patient_name, appointment_date FROM appointments WHERE doctor_id = ?", [doctorId]);

        console.log(`Found ${appts.length} appointments for Doctor ID ${doctorId}`);
        if (appts.length > 0) {
            console.log('Sample:', appts[0]);
        } else {
            console.log('⚠️ No appointments found for this doctor in the DB.');

            // Show all appointments to see if there's a mismatch
            const [all] = await dbPatient.promise().query("SELECT id, doctor_id, doctor_name FROM appointments LIMIT 5");
            console.log('First 5 appointments in DB belong to these IDs:', all);
        }

    } catch (e) {
        console.error(e);
    } finally {
        dbDoctor.end();
        dbPatient.end();
    }
}

check();
