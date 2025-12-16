// db.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || process.env.DB_PASS,
  database: process.env.DB_NAME || process.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONN_LIMIT || 10),
  queueLimit: 0,
  multipleStatements: false, // security
  dateStrings: true,         // return DATETIME/TIMESTAMP as strings
  decimalNumbers: true,      // convert DECIMAL to numbers
  // charset: 'utf8mb4_unicode_ci', // uncomment if you need full Unicode
});

module.exports = pool;

/** ---------- Optional: connectivity self-check (dev friendly) ---------- **/
(async () => {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    console.log('✅ MySQL connected');
    conn.release();
  } catch (err) {
    console.error('❌ MySQL connection error:', err.message);
  }
})();

/** ---------- Graceful shutdown ---------- **/
process.on('SIGINT', async () => {
  try {
    await pool.end();
    console.log('MySQL pool closed. Bye!');
  } catch (e) {}
  process.exit(0);
});