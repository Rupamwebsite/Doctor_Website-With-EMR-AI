const http = require('http');

const options = {
    hostname: 'localhost',
    port: 4000,
    path: '/api/admin/appointments',
    method: 'GET',
    headers: {
        'x-admin-key': 'my-secret-key'
    }
};

console.log('Testing Admin API...');

const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.appointments && json.appointments.length > 0) {
                const first = json.appointments[0];
                console.log('latest appointment:', {
                    id: first.id,
                    sex: first.patient_sex,
                    address: first.patient_address,
                    age: first.patient_age
                });

                if (first.patient_sex !== undefined) {
                    console.log('✅ PASS: patient_sex is present');
                } else {
                    console.log('❌ FAIL: patient_sex is missing');
                }
            } else {
                console.log('No appointments found to test.');
            }
        } catch (e) {
            console.error('Error parsing response:', e.message);
        }
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
    console.log('⚠️  Note: Make sure server is running!');
});

req.end();
