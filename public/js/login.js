const slider = document.getElementById('slider');
const signinForm = document.getElementById('signin-form');
const signupForm = document.getElementById('signup-form');
const btns = document.querySelectorAll('.toggle-btn');
const container = document.querySelector('.auth-container');

function switchMode(mode) {
    if (mode === 'signin') {
        slider.style.transform = 'translateX(0)';
        btns[0].classList.add('active');
        btns[1].classList.remove('active');
        signinForm.classList.add('active');
        signinForm.classList.remove('left');
        signupForm.classList.remove('active');
        container.style.height = '500px';
        document.title = "QuoteVault - Sign In";
    } else {
        slider.style.transform = 'translateX(100%)';
        btns[0].classList.remove('active');
        btns[1].classList.add('active');
        signinForm.classList.remove('active');
        signinForm.classList.add('left');
        signupForm.classList.add('active');
        container.style.height = '750px';
        document.title = "QuoteVault - Sign Up";
    }
}

function previewImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = document.getElementById('pfp-preview');
            img.src = e.target.result;
            img.style.display = 'block';
        }
        reader.readAsDataURL(input.files[0]);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('signin-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const inputs = e.target.querySelectorAll('input');
        const email = inputs[0].value;
        const password = inputs[1].value;

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (data.success) window.location.href = '/';
            else {
                Swal.fire({
                    icon: 'error',
                    title: 'Login Failed',
                    text: data.error || 'Unknown error',
                    background: '#1a1a1a',
                    color: '#fff'
                });
            }
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Server connection failed' });
        }
    });

    document.getElementById('signup-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const nickname = document.getElementById('signup-nick').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-pass').value;
        const confirm = document.getElementById('signup-confirm').value;
        const fileInput = document.getElementById('pfp-input');

        if (password !== confirm) {
            Swal.fire({
                icon: 'warning',
                title: 'Mismatch',
                text: 'Passwords do not match!',
                background: '#1a1a1a',
                color: '#fff'
            });
            return;
        }

        const formData = new FormData();
        formData.append('nickname', nickname);
        formData.append('email', email);
        formData.append('password', password);
        if (fileInput.files[0]) {
            formData.append('avatar', fileInput.files[0]);
        }

        try {
            const res = await fetch('/api/signup', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                Swal.fire({
                    icon: 'success',
                    title: 'Welcome!',
                    text: 'Account created successfully.',
                    background: '#1a1a1a',
                    color: '#fff',
                    timer: 1500,
                    showConfirmButton: false
                }).then(() => {
                    window.location.href = '/';
                });
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Signup Failed',
                    text: data.error || 'Unknown error',
                    background: '#1a1a1a',
                    color: '#fff'
                });
            }
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Server connection failed' });
        }
    });
    
});