require('dotenv').config();
const mysql = require('mysql2');

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'Rupam@123',
    database: 'd_doctor_master',
    waitForConnections: true,
    connectionLimit: 10
};

const pool = mysql.createPool(dbConfig);

const roles = [
    {
        role_name: 'Super Admin',
        permissions: [
            'doctors_master',
            'patient_registry',
            'appointments',
            'prescriptions',
            'admin_prescriptions',
            'user_management',
            'role_master',
            'mis_reports',
            'super_admin_emr',
            'reception_dashboard',
            'billing',
            'settings',
            'messages',
            'sales_report',
            'billing_report',
            'appointment_report',
            'doctor_list',
            'patient_list',
            'user_list',
            'emr_system'
        ]
    },
    {
        role_name: 'Admin',
        permissions: [
            'user_management',
            'role_master',
            'doctors_master',
            'mis_reports',
            'appointments',
            'patient_registry',
            'reception_dashboard',
            'billing',
            'sales_report',
            'billing_report',
            'appointment_report'
        ]
    },
    {
        role_name: 'Receptionist',
        permissions: [
            'reception_dashboard',
            'patient_registry',
            'appointments'
        ]
    },
    {
        role_name: 'Doctor',
        permissions: [
            'appointments',
            'prescriptions',
            'patient_registry',
            'super_admin_emr',
            'settings',
            'messages',
            'emr_system'
        ]
    },
    {
        role_name: 'Billing Executive',
        permissions: [
            'billing',
            'billing_report'
        ]
    },
    {
        role_name: 'Pharmacist',
        permissions: [
            'prescriptions'
        ]
    },
    {
        role_name: 'Lab Technician',
        permissions: [
            'prescriptions'
        ]
    },
    {
        role_name: 'Nurse',
        permissions: [
            'patient_registry',
            'appointments'
        ]
    },
    {
        role_name: 'Staff',
        permissions: [
            'reception_dashboard',
            'appointments'
        ]
    }
];

async function initRoles() {
    console.log('Starting Role Initialization...');

    // Ensure table exists
    try {
        await pool.promise().query(`
            CREATE TABLE IF NOT EXISTS roles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                role_name VARCHAR(100) UNIQUE NOT NULL,
                permissions JSON DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('Checked/Created roles table.');
    } catch (e) {
        console.error('Error ensuring roles table:', e.message);
        process.exit(1);
    }

    // Upsert roles
    for (const role of roles) {
        try {
            const permissionsJson = JSON.stringify(role.permissions);

            // Check if role exists
            const [rows] = await pool.promise().query('SELECT id FROM roles WHERE role_name = ?', [role.role_name]);

            if (rows.length > 0) {
                // Update existing
                await pool.promise().query('UPDATE roles SET permissions = ? WHERE role_name = ?', [permissionsJson, role.role_name]);
                console.log(`Updated role: ${role.role_name}`);
            } else {
                // Insert new
                await pool.promise().query('INSERT INTO roles (role_name, permissions) VALUES (?, ?)', [role.role_name, permissionsJson]);
                console.log(`Created role: ${role.role_name}`);
            }
        } catch (e) {
            console.error(`Error processing role ${role.role_name}:`, e.message);
        }
    }

    console.log('Role Initialization Complete!');
    process.exit(0);
}

initRoles();
