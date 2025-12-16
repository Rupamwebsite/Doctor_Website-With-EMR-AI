const TOKEN_KEY = 'admin_token'; // এই নামটি doctors-master.html এর সাথে মিলতে হবে

// --- HTML এলিমেন্টগুলো ধরে ফেলা ---
const loginForm = document.getElementById('loginForm');
const adminKeyInput = document.getElementById('adminKey');
const loginButton = document.getElementById('loginButton');
const errorMsg = document.getElementById('error-msg');
const buttonText = loginButton.querySelector('.btn-text');

function setLoading(isLoading) {
    if (isLoading) {
        loginButton.classList.add('loading'); // লোডার CSS চালু
        loginButton.disabled = true;          // বাটনটি নিষ্ক্রিয়
        errorMsg.style.display = 'none';      // পুরনো এরর লুকিয়ে ফেলা
    } else {
        loginButton.classList.remove('loading'); // লোডার CSS বন্ধ
        loginButton.disabled = false;           // বাটনটি আবার فعال
    }
}

// --- Helper ফাংশন: এরর দেখানো ---
function showError(message) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
}

// --- লগইন ফর্ম সাবমিট হলে ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.style.display = 'none';

    // Admin flow only
    const key = adminKeyInput.value.trim();
    if (!key) { showError('Please enter a key.'); return; }
    setLoading(true);
    try {
        const response = await fetch('/api/admin/departments', {
            method: 'GET',
            headers: { 'x-admin-key': key }
        });
        if (response.status === 401) throw new Error('Invalid Admin Key. Please try again.');
        if (!response.ok) throw new Error('Server error. Could not verify key.');
        localStorage.setItem(TOKEN_KEY, key);
        buttonText.textContent = 'Success! Redirecting...';
        window.location.href = './doctors-master.html';
    } catch (err) {
        setLoading(false);
        showError(err.message);
    }
});


(function checkLogin() {
    // If admin token exists and valid, go to admin page
    const adminToken = localStorage.getItem(TOKEN_KEY);
    if (adminToken) {
        fetch('/api/admin/departments', {
            method: 'GET', headers: { 'x-admin-key': adminToken }
        }).then(res => { if (res.ok) window.location.href = './doctors-master.html'; else localStorage.removeItem(TOKEN_KEY); });
        return;
    }

    // If doctor info exists, assume logged in and redirect
    const did = localStorage.getItem('doctor_id');
    if (did) {
        window.location.href = '/doctor-dashboard.html';
    }
})();
