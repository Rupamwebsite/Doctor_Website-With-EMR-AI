const mysql = require('mysql2');

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'Rupam@123',
    database: 'doctor_appoinment_db'
};

const pool = mysql.createPool(dbConfig);

(async () => {
    try {
        console.log("Connecting to Database...");
        const [rows] = await pool.promise().query("SELECT 1 as val");
        console.log("Connected Successfully! Test Query Result:", rows[0].val);

        console.log("Checking if 'prescriptions' table exists...");
        const [tables] = await pool.promise().query("SHOW TABLES LIKE 'prescriptions'");
        if (tables.length === 0) {
            console.log("Table 'prescriptions' DOES NOT EXIST. Attempting creation...");
            await pool.promise().query(`
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
                    diagnosis TEXT,
                    medicines LONGTEXT,
                    lab_tests TEXT,
                    advice TEXT,
                    follow_up_date DATE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);
            console.log("Table 'prescriptions' created successfully.");
        } else {
            console.log("Table 'prescriptions' ALREADY EXISTS.");
            // Optional: Describe table to check columns
            const [cols] = await pool.promise().query("DESCRIBE prescriptions");
            console.log("Columns:", cols.map(c => c.Field).join(", "));
        }

        console.log("Debug check passed.");
        process.exit(0);
    } catch (e) {
        console.error("Debug check FAILED:", e);
        process.exit(1);
    }
})();
