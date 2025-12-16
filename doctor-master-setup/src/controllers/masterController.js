// src/controllers/masterController.js

const db = require('../db'); // আপনার DB কনফিগারেশন ফাইল

// Helper function to fetch list of names from a table
async function fetchMasterList(tableName, columnName = 'name') {
    const [rows] = await db.query(`SELECT DISTINCT ?? FROM ??`, [columnName, tableName]);
    return rows.map(row => row[columnName]);
}

// Helper function to add a new name to a table
async function addMasterItem(tableName, columnName = 'name', itemName) {
    if (!itemName) throw new Error(`${columnName} is required.`);
    
    // Check if item already exists (case-insensitive check for better UX)
    const [existing] = await db.query(`SELECT 1 FROM ?? WHERE LOWER(??) = LOWER(?)`, 
                                      [tableName, columnName, itemName]);
    if (existing.length > 0) {
        return { message: `${columnName} already exists.` };
    }

    // Insert new item
    const [result] = await db.query(`INSERT INTO ?? (??) VALUES (?)`, 
                                    [tableName, columnName, itemName]);
    return { id: result.insertId, message: `${columnName} added successfully.` };
}


// --- Department Functions ---
exports.getDepartments = async (req, res) => {
    try {
        // এখানে Doctors টেবিলের 'Department' কলাম থেকে DISTINCT নাম নেওয়া হচ্ছে
        const list = await fetchMasterList('Doctors', 'Department'); 
        res.json({ list });
    } catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({ error: 'Failed to retrieve departments' });
    }
};

exports.addDepartment = async (req, res) => {
    try {
        // নতুন ডিপার্টমেন্ট নামটি Doctors টেবিলের 'Department' কলামে যোগ করা হবে
        const { name } = req.body;
        const result = await addMasterItem('Doctors', 'Department', name); 
        res.status(201).json(result);
    } catch (error) {
        console.error('Error adding department:', error);
        res.status(400).json({ error: error.message || 'Failed to add department' });
    }
};


// --- Doctor Type Functions ---
exports.getDoctorTypes = async (req, res) => {
    try {
        // এখানে Doctors টেবিলের 'DoctorType' কলাম থেকে DISTINCT নাম নেওয়া হচ্ছে
        const list = await fetchMasterList('Doctors', 'DoctorType'); 
        res.json({ list });
    } catch (error) {
        console.error('Error fetching doctor types:', error);
        res.status(500).json({ error: 'Failed to retrieve doctor types' });
    }
};

exports.addDoctorType = async (req, res) => {
    try {
        // নতুন ডক্টর টাইপ নামটি Doctors টেবিলের 'DoctorType' কলামে যোগ করা হবে
        const { name } = req.body;
        const result = await addMasterItem('Doctors', 'DoctorType', name); 
        res.status(201).json(result);
    } catch (error) {
        console.error('Error adding doctor type:', error);
        res.status(400).json({ error: error.message || 'Failed to add doctor type' });
    }
};