const mysql = require('mysql2');
require('dotenv').config();

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'Rupam@123',
    database: 'doctor_appoinment_db',
    waitForConnections: true,
    connectionLimit: 1
};

const db = mysql.createPool(dbConfig);
const connection = db.promise();

(async () => {
    try {
        console.log('Fetching all appointments...\n');
        const [rows] = await connection.query('SELECT * FROM appointments ORDER BY id DESC');

        if (rows.length === 0) {
            console.log('No appointments found.');
        } else {
            console.table(rows.map(r => ({
                ID: r.id,
                Patient: r.patient_name,
                Sex: r.patient_sex,     // The new field
                Age: r.patient_age,     // The new field
                Phone: r.patient_phone,
                Date: r.appointment_date, // might be a date object
                Address: r.patient_address ? r.patient_address.substring(0, 30) + '...' : 'N/A' // Truncate for display
            })));

            console.log('\nFull Raw Data of last record (for verification):');
            console.log(rows[0]);
        }
    } catch (err) {
        console.error('Error fetching data:', err.message);
    } finally {
        await db.end();
    }
})();
