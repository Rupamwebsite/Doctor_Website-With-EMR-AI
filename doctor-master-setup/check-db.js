// Diagnostic script to check database state
const mysql = require('mysql2');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Rupam@123',
  database: process.env.DB_PATIENT_NAME || 'doctor_appoinment_db',
  waitForConnections: true,
  connectionLimit: 5
};

const db = mysql.createPool(dbConfig);
const connection = db.promise();

(async () => {
  try {
    console.log('🔍 Checking database state...\n');
    
    // Check triggers
    console.log('📋 Checking for triggers:');
    const [triggers] = await connection.query('SHOW TRIGGERS');
    if (triggers.length === 0) {
      console.log('✅ No triggers found (GOOD)');
    } else {
      console.log('❌ Found triggers:');
      triggers.forEach(t => console.log(`  - ${t.Trigger}`));
    }
    
    console.log('\n');
    
    // Check table columns
    console.log('📋 Checking appointments table columns:');
    const [columns] = await connection.query('DESCRIBE appointments');
    columns.forEach(col => console.log(`  - ${col.Field}: ${col.Type}`));
    
    console.log('\n✅ Database diagnostic complete');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await db.end();
    process.exit(0);
  }
})();
