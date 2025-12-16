// Patient Dashboard script (Updated for robust image URL fixing, professional look, and added filtering logic)
const API_BASE_URL = 'http://localhost:3000/api/doctors';
const BOOKINGS_API_URL = 'http://localhost:3000/api/my-appointments';
const BILL_API_URL = 'http://localhost:3000/api/generate-bill';
const doctorListContainer = document.getElementById('doctor-list');

// Current active tab
let currentTab = 'home';

// Mobile menu toggle
function setupMobileMenu() {
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const mobileMenu = document.getElementById('mobileMenu');

    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', () => {
            mobileMenu.classList.toggle('active');
        });

        // Close menu when a link is clicked
        const menuLinks = mobileMenu.querySelectorAll('a');
        menuLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.remove('active');
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('header')) {
                mobileMenu.classList.remove('active');
            }
        });
    }
}

// -----------------------------------------------------------------------------
// HELPER FUNCTIONS
// -----------------------------------------------------------------------------

// Function to generate the HTML for a single doctor card
function createDoctorCard(doctor) {
    // 1. IMAGE URL FIX: Ensure a robust and correct local URL is generated.
    let imageUrl = doctor.image_url
        ? doctor.image_url
        : 'https://via.placeholder.com/300x300?text=RM+HealthCare';

    // Image সার্ভারের Base URL
    const IMAGE_BASE_HOST = 'http://localhost:3000/';

    // যদি এটি ফুল URL না হয়, তবে এটিকে ঠিক করা হচ্ছে
    if (doctor.image_url && !doctor.image_url.startsWith('http')) {
        let cleanedPath = doctor.image_url;

        // Path-টিকে স্বাভাবিক করা হচ্ছে (আগের '/' বা 'uploads/' সরিয়ে)
        cleanedPath = cleanedPath.replace(/^\/+/, ''); // Remove leading slash
        cleanedPath = cleanedPath.replace(/^uploads\//i, ''); // Remove 'uploads/' prefix

        // নতুন, সম্পূর্ণ URL তৈরি
        imageUrl = `${IMAGE_BASE_HOST}uploads/${cleanedPath}`;
    }
    // Note: If doctor.image_url was empty, imageUrl defaults to the placeholder.

    // 2. Updated Card Structure for Professional Aesthetics
    return `
        <div class="doctor-card">
            <div class="doctor-image"> <img src="${imageUrl}" alt="${doctor.first_name || ''} ${doctor.last_name || ''}" onerror="this.onerror=null;this.src='https://via.placeholder.com/300x300?text=RM+HealthCare';">
            </div>
            <div class="doc-info">
                <h3 class="doctor-name">${doctor.first_name || ''} ${doctor.last_name || ''}</h3>
                <span class="doctor-specialty">${doctor.specialization || 'General Practitioner'}</span> <hr class="card-divider"> <div class="data-points">
                    <div class="data-item">
                        <i class="fas fa-hospital-alt text-muted"></i> 
                        <span class="data-label">Department:</span> 
                        <span class="data-value">${doctor.department || 'N/A'}</span>
                    </div>
                    <div class="data-item">
                        <i class="fas fa-stethoscope text-success"></i> 
                        <span class="data-label">Type:</span> 
                        <span class="data-value">${doctor.doctor_type || 'N/A'}</span>
                    </div>
                    <div class="data-item" >
                        <i class="far fa-calendar-alt"  ></i> 
                        <span class="data-label">Schedule:</span> 
                        <span class="data-value">${doctor.opd_days || 'N/A'} || ${doctor.opd_time || 'N/A'}</span>
                    </div>
                    <div class="data-item">
                        <i class="fas fa-phone-alt text-info"></i> 
                        <span class="data-label">Phone:</span> 
                        <span class="data-value">${doctor.phone || 'N/A'}</span>
                    </div>
                    <div class="data-item">
                        <i class="fas fa-envelope text-info"></i> 
                        <span class="data-label">Email:</span> 
                        <span class="data-value">${doctor.email || 'N/A'}</span>
                    </div>
                </div>

                <div class="card-footer-action"> <p class="fees-display"><strong>Fees:</strong> <span class="fee-amount">₹${doctor.fees ? parseFloat(doctor.fees).toFixed(0) : 'N/A'}</span></p>
                    
            <button 
                class="btn-book" 
                onclick="window.location.href='Booking/booking.html?docId=${doctor.id}'">
                Book Appointment
            </button>
                </div>
            </div>
        </div>
    `;
}

// Function to fetch and render doctors
async function fetchDoctors(specialization = '', doctorName = '') {
    const url = new URL(API_BASE_URL);

    // Add query parameters for filtering
    // Note: 'specialization' is used for both department (select) and specialty (buttons)
    if (specialization) {
        url.searchParams.append('specialization', specialization);
    }
    if (doctorName) {
        url.searchParams.append('name', doctorName); // Assuming your API supports 'name' filter
    }

    try {
        // Remove existing error/loading messages
        doctorListContainer.innerHTML = '<p style="text-align: center; padding: 50px; font-size: 1.2rem; color: #6c757d;">Loading Doctors...</p>';

        const res = await fetch(url.toString());
        if (!res.ok) {
            // Log the raw response status for better debugging
            throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
        }

        const payload = await res.json();
        // Assuming the API returns { doctors: [...] } or directly [...]
        const data = Array.isArray(payload) ? payload : (payload.doctors || []);

        doctorListContainer.innerHTML = '';
        if (data.length === 0) {
            doctorListContainer.innerHTML = '<p style="text-align: center; padding: 50px; font-size: 1.2rem; color: #6c757d;">No doctors found matching your criteria.</p>';
            return;
        }

        data.forEach(d => {
            // Only show active doctors for public dashboard, assuming ActiveStatus=1
            // Check if is_active is present, otherwise assume it's public data
            if (d.is_active === 1 || d.is_active === true || d.is_active === undefined) {
                doctorListContainer.innerHTML += createDoctorCard(d);
            }
        });

    } catch (error) {
        console.error('Error fetching doctors:', error);
        doctorListContainer.innerHTML = `<p class="error" style="text-align: center; padding: 50px; font-size: 1.2rem; color: #dc3545;">Failed to retrieve doctor list. Please ensure the API Server is running on port 3000. Error: ${error.message}</p>`;
    }
}

// -----------------------------------------------------------------------------
// EVENT HANDLERS
// -----------------------------------------------------------------------------

// 1. Handle Doctor Search Form Submission (By Department or Name)
function handleDoctorSearch(e) {
    e.preventDefault(); // Stop the default form submission (page reload)

    const specialization = document.getElementById('department').value.trim();
    const doctorName = document.getElementById('doctor').value.trim();

    // Clear specialty button active state if the main search form is used
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    // Set 'All' button active if both fields are empty or the 'Department' is 'All'
    if (!specialization && !doctorName) {
        document.querySelector('.filter-options .filter-btn:first-child').classList.add('active');
    }

    fetchDoctors(specialization, doctorName);
}

// 2. Handle Specialty Button Clicks (Filter by Specialization)
function handleSpecialtyFilter(e) {
    if (e.target.classList.contains('filter-btn')) {
        // Remove active class from all buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Add active class to the clicked button
        e.target.classList.add('active');

        // Get the specialty value from the button text, or an empty string for "All"
        const specialty = e.target.textContent.trim() === 'All' ? '' : e.target.textContent.trim();

        // Clear the main search form inputs
        document.getElementById('department').value = '';
        document.getElementById('doctor').value = '';

        fetchDoctors(specialty);
    }
}

// 3. Handle Appointment Booking Button
function handleBookAppointment(e) {
    if (e.target.classList.contains('btn-book')) {
        const doctorId = e.target.getAttribute('data-doctor-id');
        const doctorName = e.target.closest('.doctor-card').querySelector('.doctor-name').textContent.trim();

        console.log(`Booking appointment with Doctor ID: ${doctorId}`);

        const bookingMessage = `Booking requested for Doctor ID: ${doctorId}.\nDoctor Name: ${doctorName}.\nPlease implement your booking modal here.`;
        console.log(bookingMessage);
        // alert(bookingMessage); // Optional: keep this line commented out until a modal is implemented
    }
}

// 4. Tab Navigation
function switchTab(tab) {
    currentTab = tab;

    // Hide all sections
    document.getElementById('bookingsSection').style.display = 'none';
    document.getElementById('aiSection').style.display = 'none';
    document.querySelectorAll('.breadcrumb').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.hero').forEach(el => el.style.display = 'none');
    document.getElementById('doctorsSection').style.display = 'none';
    document.querySelectorAll('.cta-app').forEach(el => el.style.display = 'none');

    // Update navigation active state
    document.getElementById('homeTab').parentElement.classList.remove('active');
    document.getElementById('bookingsTab').parentElement.classList.remove('active');
    document.getElementById('doctorsTab').parentElement.classList.remove('active');
    if (document.getElementById('aiTab')) {
        document.getElementById('aiTab').parentElement.classList.remove('active');
    }

    if (tab === 'home' || tab === 'doctors') {
        document.querySelectorAll('.breadcrumb').forEach(el => el.style.display = 'block');
        document.querySelectorAll('.hero').forEach(el => el.style.display = 'block');
        document.getElementById('doctorsSection').style.display = 'block';
        document.querySelectorAll('.cta-app').forEach(el => el.style.display = 'block');
        if (tab === 'doctors') {
            document.getElementById('doctorsTab').parentElement.classList.add('active');
        } else {
            document.getElementById('homeTab').parentElement.classList.add('active');
        }
    } else if (tab === 'bookings') {
        document.getElementById('bookingsSection').style.display = 'block';
        document.getElementById('bookingsTab').parentElement.classList.add('active');
        fetchMyBookings();
    } else if (tab === 'ai') {
        document.getElementById('aiSection').style.display = 'block';
        if (document.getElementById('aiTab')) {
            document.getElementById('aiTab').parentElement.classList.add('active');
        }
        loadAIBookingsData();
    }
}

// 5. Fetch and display user's bookings
async function fetchMyBookings() {
    const bookingsList = document.getElementById('bookings-list');
    const patientEmail = localStorage.getItem('patient_email');
    const patientPhone = localStorage.getItem('patient_phone');

    if (!patientEmail && !patientPhone) {
        bookingsList.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 50px; color: #dc3545;"><i class="fas fa-exclamation-circle"></i> Please log in to view your bookings.</td></tr>';
        return;
    }

    try {
        // bookingsList.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 50px; font-size: 1.2rem; color: #6c757d;">Loading your bookings...</td></tr>';
        // Loading message is handled by HTML now, but we can clear it if needed or just append rows.
        // Better to clear and show loading state if we want to be dynamic.

        const url = new URL(BOOKINGS_API_URL);
        if (patientEmail) url.searchParams.append('email', patientEmail);
        if (patientPhone) url.searchParams.append('phone', patientPhone);

        const res = await fetch(url.toString());
        if (!res.ok) {
            throw new Error(`HTTP Error: ${res.status}`);
        }

        const data = await res.json();
        const appointments = Array.isArray(data) ? data : (data.appointments || []);

        bookingsList.innerHTML = '';

        if (appointments.length === 0) {
            bookingsList.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 50px; font-size: 1.2rem; color: #6c757d;"><i class="fas fa-calendar-times"></i> No bookings found.</td></tr>';
            // Hide loading message
            const loadingMsg = document.getElementById('loading-msg');
            if (loadingMsg) loadingMsg.style.display = 'none';
            return;
        }

        appointments.forEach(apt => {
            bookingsList.innerHTML += createBookingRow(apt);
        });

        // Hide loading message
        const loadingMsg = document.getElementById('loading-msg');
        if (loadingMsg) loadingMsg.style.display = 'none';

    } catch (error) {
        console.error('Error fetching bookings:', error);
        bookingsList.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 50px; color: #dc3545;"><i class="fas fa-exclamation-circle"></i> Failed to load bookings. ${error.message}</td></tr>`;
        const loadingMsg = document.getElementById('loading-msg');
        if (loadingMsg) loadingMsg.style.display = 'none';
    }
}

// 6. Create booking row HTML
function createBookingRow(apt) {
    const aptDate = new Date(apt.appointment_date);
    const formattedDate = aptDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
    const statusClass = getStatusClass(apt.appointment_date);
    const statusText = getStatusText(apt.appointment_date);

    return `
        <tr>
            <td>${formattedDate}</td>
            <td>${apt.appointment_time || 'N/A'}</td>
            <td>Dr. ${apt.doctor_name}</td>
            <td>${apt.patient_name}</td>
            <td>${apt.patient_phone}</td>
            <td>₹ ${apt.payment_amount || '0.00'}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>
                <button class="action-btn btn-view-token" onclick="showToken(${apt.id}, '${apt.id}')" title="View Token">
                    <i class="fas fa-ticket-alt"></i> Token
                </button>
                <button class="action-btn btn-view-bill" onclick="viewBill(${apt.id})" title="View Bill">
                    <i class="fas fa-file-invoice-dollar"></i> Bill
                </button>
            </td>
        </tr>
    `;
}

// 7. Get booking status
function getStatusText(appointmentDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const aptDate = new Date(appointmentDate);
    aptDate.setHours(0, 0, 0, 0);

    if (aptDate < today) return 'Completed';
    if (aptDate.getTime() === today.getTime()) return 'Today';
    return 'Upcoming';
}

function getStatusClass(appointmentDate) {
    const status = getStatusText(appointmentDate);
    if (status === 'Completed') return 'completed';
    if (status === 'Today') return 'today';
    return 'upcoming';
}

// 8. Show token number
function showToken(aptId, token) {
    const currentYear = new Date().getFullYear();
    const serialNumber = String(aptId).padStart(6, '0');
    const tokenNumber = `OB/${currentYear}/${serialNumber}`;

    alert(`Token Number: ${tokenNumber}\n\nPlease keep this for your appointment.`);
}

// 9. View bill
function viewBill(aptId) {
    window.open(`${BILL_API_URL}/${aptId}`, '_blank');
}

// 10. Load AI Bookings Data
async function loadAIBookingsData() {
    const aiBookingsList = document.getElementById('ai-bookings-list');
    const patientEmail = localStorage.getItem('patient_email');
    const patientPhone = localStorage.getItem('patient_phone');

    if (!patientEmail && !patientPhone) {
        aiBookingsList.innerHTML = '<p style="text-align: center; padding: 30px; color: #dc3545;"><i class="fas fa-exclamation-circle"></i> Please log in to view your data.</p>';
        return;
    }

    try {
        aiBookingsList.innerHTML = '<p style="text-align: center; padding: 30px; color: #6c757d;">Loading...</p>';

        const url = new URL(BOOKINGS_API_URL);
        if (patientEmail) url.searchParams.append('email', patientEmail);
        if (patientPhone) url.searchParams.append('phone', patientPhone);

        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

        const data = await res.json();
        const appointments = Array.isArray(data) ? data : (data.appointments || []);

        aiBookingsList.innerHTML = '';

        if (appointments.length === 0) {
            aiBookingsList.innerHTML = '<p style="text-align: center; padding: 30px; color: #6c757d;"><i class="fas fa-calendar-times"></i> No bookings found.</p>';
            return;
        }

        // Create a summary
        let summaryHTML = `
            <div style="background: #f0f7ff; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h3 style="color: #1e3a8a; margin-bottom: 15px;">📊 Your Booking Summary</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #007bff;">
                        <div style="font-size: 24px; font-weight: bold; color: #007bff;">${appointments.length}</div>
                        <div style="color: #666; font-size: 14px;">Total Bookings</div>
                    </div>
                    <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #28a745;">
                        <div style="font-size: 24px; font-weight: bold; color: #28a745;">${appointments.filter(a => new Date(a.appointment_date) > new Date()).length}</div>
                        <div style="color: #666; font-size: 14px;">Upcoming</div>
                    </div>
                </div>
            </div>
        `;

        // Add individual bookings
        summaryHTML += '<div style="margin-top: 20px;"><h3 style="margin-bottom: 15px; color: #1e3a8a;">📋 Your Appointments</h3>';

        appointments.forEach(apt => {
            const aptDate = new Date(apt.appointment_date);
            const formattedDate = aptDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
            const status = getStatusText(apt.appointment_date);

            summaryHTML += `
                <div style="background: white; padding: 15px; border-radius: 6px; margin-bottom: 10px; border-left: 4px solid #667eea; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                        <div>
                            <div style="font-size: 16px; font-weight: bold; color: #333;">Dr. ${apt.doctor_name}</div>
                            <div style="color: #666; font-size: 12px;">ID: #${apt.id}</div>
                        </div>
                        <span style="background: ${status === 'Upcoming' ? '#e7f3ff' : status === 'Today' ? '#fff3cd' : '#e8f5e9'}; color: ${status === 'Upcoming' ? '#007bff' : status === 'Today' ? '#ff9800' : '#28a745'}; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                            ${status}
                        </span>
                    </div>
                    <div style="color: #555; font-size: 13px; line-height: 1.6;">
                        📅 ${formattedDate} | ⏰ ${apt.appointment_time} | 💰 ₹${apt.payment_amount || '0.00'}
                    </div>
                    <div style="color: #666; font-size: 12px; margin-top: 8px;">
                        👤 ${apt.patient_name} | 📞 ${apt.patient_phone}
                    </div>
                </div>
            `;
        });

        summaryHTML += '</div>';
        aiBookingsList.innerHTML = summaryHTML;

    } catch (error) {
        console.error('Error loading AI bookings:', error);
        aiBookingsList.innerHTML = `<p style="text-align: center; padding: 30px; color: #dc3545;"><i class="fas fa-exclamation-circle"></i> Error loading data: ${error.message}</p>`;
    }
}

// 11. Send AI Message (stub for future integration with Groq API)
function sendAIMessage() {
    const input = document.getElementById('ai-input');
    const message = input.value.trim();

    if (!message) return;

    const chatMessages = document.getElementById('ai-chat-messages');

    // Add user message
    const userMsg = document.createElement('div');
    userMsg.style.cssText = 'background: #007bff; color: white; padding: 10px 15px; border-radius: 8px; margin: 10px 0; max-width: 80%; margin-left: auto; word-wrap: break-word;';
    userMsg.textContent = message;
    chatMessages.appendChild(userMsg);

    input.value = '';
    input.focus();

    // Simulate AI response (you can connect to Groq API later)
    setTimeout(() => {
        const botMsg = document.createElement('div');
        botMsg.style.cssText = 'background: #f0f0f0; color: #333; padding: 10px 15px; border-radius: 8px; margin: 10px 0; max-width: 80%; word-wrap: break-word;';

        // Simple AI responses based on keywords
        if (message.toLowerCase().includes('booking')) {
            botMsg.textContent = '📅 You have ' + (document.querySelectorAll('[class*="booking-card"]').length) + ' bookings. You can view them in the "My Bookings" section.';
        } else if (message.toLowerCase().includes('doctor')) {
            botMsg.textContent = '👨‍⚕️ I can help you find information about your doctors. Which doctor would you like to know more about?';
        } else if (message.toLowerCase().includes('bill') || message.toLowerCase().includes('payment')) {
            botMsg.textContent = '💰 You can view your bills by clicking on "View Bill" in the My Bookings section.';
        } else if (message.toLowerCase().includes('cancel') || message.toLowerCase().includes('reschedule')) {
            botMsg.textContent = '⚠️ To cancel or reschedule an appointment, please contact our support team.';
        } else {
            botMsg.textContent = '👋 I\'m here to help! You can ask me about your bookings, doctors, bills, or appointments.';
        }

        chatMessages.appendChild(botMsg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 500);
}


// -----------------------------------------------------------------------------
// INITIALIZATION
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // Setup mobile menu
    setupMobileMenu();

    // Initial fetch of all doctors
    if (document.getElementById('doctor-list')) fetchDoctors();
    if (window.location.pathname.includes('my_bookings.html')) fetchMyBookings();

    // Attach listener for the main search form submission
    const searchForm = document.querySelector('.search-form');
    if (searchForm) {
        searchForm.addEventListener('submit', handleDoctorSearch);
    }

    // Attach listener for the specialty filter buttons
    const filterOptions = document.querySelector('.filter-options');
    if (filterOptions) {
        filterOptions.addEventListener('click', handleSpecialtyFilter);
    }

    // Simple event delegation for booking buttons (kept from previous version)
    document.addEventListener('click', handleBookAppointment);

    // --- Patient Auth: Logout ---
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (!confirm('Are you sure you want to logout?')) return;
            try {
                localStorage.removeItem('patient_email');
                localStorage.removeItem('patient_phone');
                localStorage.removeItem('patient_name');
                console.log('Logged out successfully');
            } catch (e) {
                console.error('Logout error:', e);
            }
            // Redirect to login page
            window.location.href = 'http://localhost:3000/Login%20Page/Login.html';
        });
    }
});