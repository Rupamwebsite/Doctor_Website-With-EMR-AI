document.addEventListener('DOMContentLoaded', () => {

    // Select all the elements needed to interact with the forms
    const loginToggle = document.getElementById('login-toggle');
    const registerToggle = document.getElementById('register-toggle');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const registerLink = document.getElementById('register-link');
    const loginLink = document.getElementById('login-link');
    const formContainer = document.querySelector('.form-container');

    // Function to show the login form and adjust the container height
    function showLoginForm() {
        loginToggle.classList.add('active');
        registerToggle.classList.remove('active');
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
        formContainer.style.height = `${loginForm.scrollHeight + 30}px`;
    }

    // Function to show the register form and adjust the container height
    function showRegisterForm() {
        registerToggle.classList.add('active');
        loginToggle.classList.remove('active');
        registerForm.classList.add('active');
        loginForm.classList.remove('active');
        formContainer.style.height = `${registerForm.scrollHeight + 30}px`;
    }

    // Set the initial state of the form when the page loads
    showLoginForm();

    // Event listeners for switching between forms
    loginToggle.addEventListener('click', showLoginForm);
    registerToggle.addEventListener('click', showRegisterForm);
    registerLink.addEventListener('click', function(e) {
        e.preventDefault();
        showRegisterForm();
    });
    loginLink.addEventListener('click', function(e) {
        e.preventDefault();
        showLoginForm();
    });

    // --- Login Form Submission ---
    document.getElementById('login-form').addEventListener('submit', async function(e) {
        e.preventDefault();

        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        // Basic validation
        if (!email || !password) {
            alert('Please fill in all fields.');
            return;
        }

        try {
            // Send login data to the backend
            const response = await fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            // Parse the JSON response from the server
            const data = await response.json();

            // Display the message from the backend (if any)
            if (data.message) alert(data.message);

            if (data.success) {
                // Save logged-in patient identity locally for dashboard features
                try {
                    // Save email so patient dashboard can show bookings and logout
                    localStorage.setItem('patient_email', email);
                    if (data.user && data.user.full_name) localStorage.setItem('patient_name', data.user.full_name);
                } catch (e) { console.warn('Could not store patient email locally', e); }

                window.location.href = data.redirect;
            }

        } catch (error) {
            console.error('Login Error:', error);
            alert('An error occurred. Please try again later.');
        }
    });

    // --- Registration Form Submission ---
    document.getElementById('register-form').addEventListener('submit', async function(e) {
        e.preventDefault();

        const name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const confirm = document.getElementById('register-confirm').value;
        const dob = document.getElementById('register-dob').value;
        const terms = document.getElementById('terms').checked;

        // Validation for all fields
        if (!name || !email || !password || !confirm || !dob) {
            alert('Please fill in all fields.');
            return;
        }

        // Password matching validation
        if (password !== confirm) {
            alert('Passwords do not match.');
            return;
        }

        // Terms and conditions validation
        if (!terms) {
            alert('You must agree to the terms and conditions.');
            return;
        }

        // Advanced password validation
        const passwordRegex = /^(?=.*[0-9])(?=.*[!@#$%^&*])(?=.{8,})/;
        if (!passwordRegex.test(password)) {
            alert('Password must be at least 8 characters with a number and a symbol.');
            return;
        }

        try {
            // Send registration data to the backend
            const response = await fetch('/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    full_name: name,
                    email: email,
                    password: password,
                    date_of_birth: dob
                })
            });

            // Parse the JSON response from the server
            const data = await response.json();

            // Display the message from the backend
            alert(data.message);

            if (data.success) {
                // If registration is successful, switch to the login form
                showLoginForm();
            }

        } catch (error) {
            console.error('Registration Error:', error);
            alert('An error occurred. Please try again later.');
        }
    });
});