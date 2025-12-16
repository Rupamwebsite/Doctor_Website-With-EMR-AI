
require('dotenv').config();
const mysql = require('mysql2');

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'Rupam@123',
    database: 'doctor_appoinment_db'
};

const db = mysql.createConnection(dbConfig);

const createPrescriptionsTable = `
CREATE TABLE IF NOT EXISTS prescriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    appointment_id INT NOT NULL,
    doctor_id INT NOT NULL,
    doctor_name VARCHAR(255),
    patient_id INT,
    visit_date DATE,
    vital_bp VARCHAR(50),
    vital_pulse VARCHAR(50),
    vital_spo2 VARCHAR(50),
    vital_temp VARCHAR(50),
    symptoms TEXT,
    diagnosis TEXT,
    medicines JSON,
    lab_tests TEXT,
    advice TEXT,
    follow_up_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

const dropColumns = [
    'symptoms', 'diagnosis', 'medicines', 'lab_tests', 'advice', 'follow_up_date',
    'vital_bp', 'vital_pulse', 'vital_spo2', 'vital_temp'
];

db.connect(async err => {
    if (err) { console.error(err); return; }
    console.log('Connected to DB');

    try {
        // 1. Create Table
        await db.promise().query(createPrescriptionsTable);
        console.log('✅ Created prescriptions table');

        // 2. Drop Columns from appointments (One by one to avoid errors if some don't exist)
        for (const col of dropColumns) {
            try {
                await db.promise().query(`ALTER TABLE appointments DROP COLUMN ${col}`);
                console.log(`Dropped column: ${col}`);
            } catch (e) {
                console.log(`Skipped dropping ${col}: ${e.message}`);
            }
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        db.end();
    }
});
