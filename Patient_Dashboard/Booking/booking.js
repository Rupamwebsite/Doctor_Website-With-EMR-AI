const API_BASE = 'http://localhost:3000';
let currentDocId = null;
let doctorData = {};
let selectedDateStr = null;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();

// Month Names
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Get Params
    const params = new URLSearchParams(window.location.search);
    // Accept multiple param names for robustness
    currentDocId = params.get('docId') || params.get('doctor_id') || params.get('id') || null;

    if (!currentDocId) {
        console.warn('Booking page opened without docId in URL.');
        alert('Doctor specify korun. Doctors list theke booking open korun ba URL e ?docId=DOCTOR_ID add korun.');
        const form = document.getElementById('bookingForm');
        if (form) form.querySelectorAll('input,button,select,textarea').forEach(el => el.disabled = true);
        return;
    }

    // 2. Fetch Data
    await fetchDoctorDetails();

    // 3. Init Calendar
    initCalendarDropdowns();
    renderCalendar(currentMonth, currentYear);

    // 4. Age Calculator Listener
    const dobInput = document.getElementById('pDob');
    if (dobInput) {
        dobInput.addEventListener('change', function () {
            const dob = new Date(this.value);
            const age = new Date(Date.now() - dob.getTime()).getUTCFullYear() - 1970;
            document.getElementById('pAge').value = age >= 0 ? age : 0;
        });
    }

    // Do not prefill email automatically on this page (user requested no autofill)
    // Ensure email input remains empty unless user types it.
});

async function fetchDoctorDetails() {
    try {
        const res = await fetch(`${API_BASE}/api/doctors/${currentDocId}`);
        doctorData = await res.json();

        // Update UI
        document.getElementById('docNameDisplay').textContent = `DR. ${doctorData.first_name} ${doctorData.last_name}`.toUpperCase();
        document.getElementById('docInput').value = `Dr. ${doctorData.first_name} ${doctorData.last_name}`;
        document.getElementById('deptInput').value = doctorData.department;
        document.getElementById('feeDisplay').innerText = `₹${doctorData.fees}`;

        // Schedule Text
        let schedText = "Not available";
        if (doctorData.opd_days) {
            const time = doctorData.opd_time ? doctorData.opd_time : "Time not set";
            schedText = `${doctorData.opd_days} : ${time}`;
        }
        document.getElementById('scheduleText').innerText = schedText;

    } catch (e) { console.error(e); }
}

// --- Calendar Logic ---
function initCalendarDropdowns() {
    const mSel = document.getElementById('calMonth');
    const ySel = document.getElementById('calYear');

    months.forEach((m, i) => {
        const opt = document.createElement('option');
        opt.value = i; opt.text = m;
        if (i === currentMonth) opt.selected = true;
        mSel.appendChild(opt);
    });

    for (let i = currentYear; i <= currentYear + 1; i++) {
        const opt = document.createElement('option');
        opt.value = i; opt.text = i;
        ySel.appendChild(opt);
    }

    mSel.addEventListener('change', () => { currentMonth = parseInt(mSel.value); renderCalendar(currentMonth, currentYear); });
    ySel.addEventListener('change', () => { currentYear = parseInt(ySel.value); renderCalendar(currentMonth, currentYear); });
}

function renderCalendar(month, year) {
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = "";

    const firstDay = new Date(year, month).getDay();
    const daysInMonth = 32 - new Date(year, month, 32).getDate();

    // Empty cells
    for (let i = 0; i < firstDay; i++) {
        const cell = document.createElement('div');
        cell.className = 'cal-cell empty';
        grid.appendChild(cell);
    }

    // Doctor's Days (e.g., "Mon,Wed")
    const opdDays = doctorData.opd_days ? doctorData.opd_days.split(',') : [];
    const dayMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (let date = 1; date <= daysInMonth; date++) {
        const dateObj = new Date(year, month, date);
        const dayName = dayMap[dateObj.getDay()];

        const cell = document.createElement('div');
        cell.className = 'cal-cell';
        cell.innerText = date;

        // Check availability
        let isAvailable = false;
        opdDays.forEach(d => { if (d.trim() === dayName) isAvailable = true; });

        if (isAvailable) {
            cell.classList.add('available');
            cell.onclick = () => selectDate(date, month, year, cell);
        } else {
            cell.classList.add('disabled');
        }
        grid.appendChild(cell);
    }
}

function selectDate(date, month, year, cell) {
    document.querySelectorAll('.cal-cell').forEach(c => c.classList.remove('selected'));
    cell.classList.add('selected');

    const m = month + 1;
    const formattedDate = `${year}-${m < 10 ? '0' + m : m}-${date < 10 ? '0' + date : date}`;
    selectedDateStr = formattedDate;

    document.getElementById('selectedDateDisplay').value = formattedDate;

    // Check Seat Availability
    checkAvailability(formattedDate);
}

async function checkAvailability(date) {
    const msg = document.getElementById('availabilityMsg');
    const btn = document.getElementById('btnNext1');

    msg.innerHTML = "Checking availability...";
    msg.style.color = "blue";
    btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/api/check-availability`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ doctor_id: currentDocId, date: date })
        });
        const data = await res.json();

        if (data.available) {
            msg.innerHTML = `✅ Available (${data.remaining} slots left)`;
            msg.style.color = "green";
            btn.disabled = false;
        } else {
            msg.innerHTML = `❌ ${data.message}`;
            msg.style.color = "red";
        }
    } catch (e) { msg.innerText = "Server Error"; console.error('checkAvailability error', e); }
}

// --- Step Wizard ---

// --- URL helper: preserve docId and step in URL without reloading ---
const _urlParams = new URLSearchParams(window.location.search);
const _preservedDocId = _urlParams.get('docId') || _urlParams.get('doctor_id') || _urlParams.get('id') || null;

function updateUrlKeepDocId(step) {
    const base = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    if (_preservedDocId) params.set('docId', _preservedDocId);
    params.set('step', step);
    const newUrl = base + '?' + params.toString();
    window.history.pushState({ step }, '', newUrl);
}

function goToStep(step) {
    document.querySelectorAll('.step-content').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(`step${step}`);
    if (el) el.classList.add('active');

    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    for (let i = 1; i <= step; i++) {
        const id = `step${i}-indicator`;
        const node = document.getElementById(id);
        if (node) node.classList.add('active');
    }

    // update url to include docId and step
    updateUrlKeepDocId(step);
}

// handle browser back/forward navigation
window.addEventListener('popstate', (ev) => {
    const stepFromState = ev.state?.step;
    const params = new URLSearchParams(window.location.search);
    const stepFromQuery = parseInt(params.get('step'));
    const stepTo = stepFromState || stepFromQuery || 1;
    // avoid infinite loop: call goToStep without pushing new history (we can temporarily disable push)
    // we'll call goToStep which will push state again; acceptable for this small flow.
    document.querySelectorAll('.step-content').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(`step${stepTo}`);
    if (el) el.classList.add('active');
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    for (let i = 1; i <= stepTo; i++) { const node = document.getElementById(`step${i}-indicator`); if (node) node.classList.add('active'); }
});

// --- ⭐ Final Submit (Fixed) ⭐ ---
const _patientForm = document.getElementById('patientForm');
if (_patientForm) _patientForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('confirmBtn');
    btn.innerText = "Booking...";
    btn.disabled = true;

    // --- Validation: ensure date selected and required patient info ---
    if (!selectedDateStr) {
        alert('Please select a date from the calendar before confirming booking.');
        btn.innerText = "Confirm Booking";
        btn.disabled = false;
        return;
    }
    const pName = document.getElementById('pName') ? document.getElementById('pName').value.trim() : '';
    const pPhone = document.getElementById('pPhone') ? document.getElementById('pPhone').value.trim() : '';
    if (!pName || !pPhone) {
        alert('Please enter patient name and phone number.');
        btn.innerText = "Confirm Booking";
        btn.disabled = false;
        return;
    }


    // সব ডাটা কালেক্ট করা হচ্ছে
    // Normalize age: send integer or null (not empty string) to avoid DB integer errors
    const rawAge = (document.getElementById('pAge') ? document.getElementById('pAge').value : '').toString().trim();
    let patientAge = rawAge === '' ? null : (Number.isNaN(parseInt(rawAge, 10)) ? null : parseInt(rawAge, 10));

    // If age not provided but DOB is present, compute age from DOB as a fallback
    const dobVal = (document.getElementById('pDob') ? document.getElementById('pDob').value : '').toString().trim();
    if ((patientAge === null || patientAge === undefined) && dobVal) {
        const dobDate = new Date(dobVal);
        if (!Number.isNaN(dobDate.getTime())) {
            const calc = new Date(Date.now() - dobDate.getTime()).getUTCFullYear() - 1970;
            patientAge = calc >= 0 ? calc : null;
            // Update UI field so user sees calculated value
            const ageField = document.getElementById('pAge');
            if (ageField) ageField.value = patientAge !== null ? patientAge : '';
        }
    }

    const payload = {
        doctor_id: currentDocId,
        doctor_name: doctorData.first_name + ' ' + doctorData.last_name,

        // Patient Info
        patient_name: document.getElementById('pName').value,
        patient_phone: document.getElementById('pPhone').value,
        patient_email: (document.getElementById('pEmail') ? document.getElementById('pEmail').value : ''),    // Added (safe)
        patient_dob: document.getElementById('pDob').value,        // Added
        patient_age: patientAge,
        patient_sex: (document.getElementById('pSex') ? document.getElementById('pSex').value : ''),        // Added (safe)
        patient_address: document.getElementById('pAddress').value, // Added

        // Appointment Info
        date: selectedDateStr,
        time: doctorData.opd_time || '10:00 AM'
    };

    try {
        // Try to create a Razorpay order on the server. If Razorpay not configured, fallback to direct booking.
        let createRes = await fetch(`${API_BASE}/api/create-order`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: Math.round((doctorData.fees || 0) * 1.18 * 100), currency: 'INR' })
        });

        if (createRes.ok) {
            const createData = await createRes.json();
            if (createData && createData.success && createData.order) {
                // open Razorpay checkout
                const order = createData.order;
                const options = {
                    key: createData.key_id,
                    amount: order.amount,
                    currency: order.currency || 'INR',
                    name: 'RM HealthCare',
                    description: `Appointment with ${payload.doctor_name}`,
                    order_id: order.id,
                    handler: async function (resp) {
                        // append payment info to payload and submit booking
                        payload.razorpay_payment_id = resp.razorpay_payment_id;
                        payload.razorpay_order_id = resp.razorpay_order_id;
                        payload.razorpay_signature = resp.razorpay_signature;
                        // send booking to server
                        try {
                            const r = await fetch(`${API_BASE}/api/book-appointment`, {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                            const result = await r.json();
                            if (result && result.success) {
                                document.getElementById('confDoc').innerText = payload.doctor_name;
                                document.getElementById('confDate').innerText = payload.date;
                                document.getElementById('confTime').innerText = payload.time;
                                document.getElementById('confToken').innerText = result.token || '#BK-' + Math.floor(Math.random() * 10000);
                                document.getElementById('confAppointmentId').value = result.id;
                                goToStep(3);
                                try { const pb = document.querySelector('#step3 .btn-next'); if (pb) pb.style.display = 'inline-block'; } catch (e) { }
                                try { if (payload.patient_phone) localStorage.setItem('patient_phone', payload.patient_phone); } catch (e) { }
                            } else {
                                alert('Booking failed: ' + (result.error || 'Unknown error'));
                                btn.innerText = 'Confirm Booking'; btn.disabled = false;
                            }
                        } catch (err) { alert('Network error during booking: ' + err.message); btn.innerText = 'Confirm Booking'; btn.disabled = false; }
                    },
                    modal: { ondismiss: function () { btn.innerText = 'Confirm Booking'; btn.disabled = false; } }
                };
                const rzp = new Razorpay(options);
                rzp.open();
                return;
            }
        }

        // If create-order failed (Razorpay not configured), fallback to previous flow: direct booking
        const res = await fetch(`${API_BASE}/api/book-appointment`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            document.getElementById('confDoc').innerText = payload.doctor_name;
            document.getElementById('confDate').innerText = payload.date;
            document.getElementById('confTime').innerText = payload.time;
            document.getElementById('confToken').innerText = result.token || '#BK-' + Math.floor(Math.random() * 10000);
            document.getElementById('confAppointmentId').value = result.id;
            goToStep(3);
            try { const pb = document.querySelector('#step3 .btn-next'); if (pb) pb.style.display = 'inline-block'; } catch (e) { }
            try { if (payload.patient_phone) localStorage.setItem('patient_phone', payload.patient_phone); } catch (e) { }
        } else {
            alert("Booking Failed: " + (result.error || "Unknown error"));
            btn.innerText = "Confirm Booking";
            btn.disabled = false;
        }
    } catch (e) {
        alert("Network Error: " + e.message);
        btn.innerText = "Confirm Booking";
        btn.disabled = false;
    }
});

// Print confirmation: open a focused window with only the confirmation area and trigger print
function printConfirmation() {
    const area = document.getElementById('printArea');
    if (!area) { alert('Nothing to print'); return; }
    const logoHtml = document.querySelector('.print-logo') ? document.querySelector('.print-logo').outerHTML : '<div style="font-weight:700">RM HealthCare</div>';
    const html = `
            <!doctype html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Appointment Confirmation</title>
                <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;700&display=swap" rel="stylesheet">
                <link rel="stylesheet" href="booking.css">
                <style>
                    body{font-family:Roboto, Arial, sans-serif; padding:20px; color:#222}
                    .print-logo{display:flex; align-items:center; gap:12px; margin-bottom:12px}
                    .print-logo img{height:48px}
                    .conf-box{border:1px dashed #ccc; padding:18px; display:inline-block;}
                </style>
            </head>
            <body>
                ${logoHtml}
                <div class="conf-box">${area.innerHTML}</div>
            </body>
            </html>
        `;

    const w = window.open('', '_blank', 'toolbar=0,location=0,menubar=0');
    if (!w) { alert('Please allow popups to print'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 500);
}

// Download Bill as HTML/PDF
function downloadBill() {
    const appointmentId = document.getElementById('confAppointmentId') ? document.getElementById('confAppointmentId').value : null;
    if (!appointmentId) {
        alert('Appointment ID not found');
        return;
    }

    // Open bill in new window/tab
    const billUrl = `${API_BASE}/api/generate-bill/${appointmentId}`;
    window.open(billUrl, '_blank');
}