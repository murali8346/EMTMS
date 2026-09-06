        // ===== Logo fallback handler =====
        const logoImg = document.getElementById('logoImg');
        const logoFallback = document.getElementById('logoFallback');

        logoImg.addEventListener('error', function() {
            this.style.display = 'none';
            logoFallback.style.display = 'flex';
        });

        // ===== Auto-detect API Base URL =====
        function getApiBase() {
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                return 'http://localhost:8000';
            }
            if (window.location.hostname.includes('muralikorikana.com')) {
                return '/api';
            }
            return '';
        }

        const API_BASE = getApiBase();
        console.log('API_BASE:', API_BASE);

        // ===== Professional Modal System =====
        const modalOverlay = document.getElementById('modalOverlay');
        const modalClose = document.getElementById('modalClose');
        const modalIcon = document.getElementById('modalIcon');
        const modalTitle = document.getElementById('modalTitle');
        const modalMessage = document.getElementById('modalMessage');
        const modalActionBtn = document.getElementById('modalActionBtn');

        function showModal(options = {}) {
            const {
                type = 'success',
                title = 'Success!',
                message = 'Action completed successfully.',
                buttonText = 'Got it',
                onAction = null
            } = options;

            const iconMap = {
                success: '✅',
                error: '❌',
                info: 'ℹ️'
            };
            modalIcon.textContent = iconMap[type] || '✅';
            modalIcon.className = 'modal-icon ' + type;

            modalTitle.textContent = title;
            modalMessage.textContent = message;
            modalActionBtn.textContent = buttonText;

            modalActionBtn._onAction = onAction || null;

            modalOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeModal() {
            modalOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }

        modalClose.addEventListener('click', closeModal);
        modalActionBtn.addEventListener('click', () => {
            if (typeof modalActionBtn._onAction === 'function') {
                modalActionBtn._onAction();
            }
            closeModal();
        });

        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeModal();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
                closeModal();
            }
        });

        // ===== Function to validate email domain =====
        function isValidEmailDomain(email) {
            const allowedDomains = ['@drmgrdu.ac.in'];
            return allowedDomains.some(domain => email.endsWith(domain));
        }

        // ===== Register Form Handler =====
        document.getElementById('registerForm').addEventListener('submit', async function(e) {
            e.preventDefault();

            const fullName = document.getElementById('fullName').value.trim();
            const email = document.getElementById('email').value.trim();
            const department = document.getElementById('department').value;
            const mobileNumber = document.getElementById('mobileNumber').value.trim();
            const password = document.getElementById('password').value;

            const errorEl = document.getElementById('errorMessage');
            const successEl = document.getElementById('successMessage');
            const btn = document.getElementById('registerBtn');

            // Reset
            errorEl.textContent = '';
            successEl.textContent = '';
            document.querySelectorAll('.form-group input, .form-group select').forEach(el => el.classList.remove('error'));

            // Validation
            let hasError = false;
            if (!fullName) {
                document.getElementById('fullName').classList.add('error');
                hasError = true;
                errorEl.textContent = 'Please enter your full name.';
            }
            if (!email || !isValidEmailDomain(email)) {
                document.getElementById('email').classList.add('error');
                hasError = true;
                if (!errorEl.textContent) {
                    errorEl.textContent = 'Email must be from @drmgrdu.ac.in domain.';
                }
            }
            if (!department) {
                document.getElementById('department').classList.add('error');
                hasError = true;
                if (!errorEl.textContent) errorEl.textContent = 'Please select your department.';
            }
            if (!mobileNumber || mobileNumber.length < 10 || !/^\d{10}$/.test(mobileNumber)) {
                document.getElementById('mobileNumber').classList.add('error');
                hasError = true;
                if (!errorEl.textContent) errorEl.textContent = 'Please enter a valid 10-digit mobile number.';
            }
            if (!password || password.length < 4) {
                document.getElementById('password').classList.add('error');
                hasError = true;
                if (!errorEl.textContent) errorEl.textContent = 'Password must be at least 4 characters.';
            }

            if (hasError) return;

            // Loading state
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Creating account...';

            try {
                const response = await fetch(`${API_BASE}/register`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        full_name: fullName,
                        email: email,
                        department: department,
                        mobile_number: mobileNumber,
                        password: password,
                    }),
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.detail || 'Registration failed. Please try again.');
                }

                // Show success modal
                showModal({
                    type: 'success',
                    title: 'Account Created! 🎉',
                    message: 'Your account has been successfully created. You will be redirected to login.',
                    buttonText: 'Go to Login',
                    onAction: () => {
                        window.location.href = '/login.html';
                    }
                });

                // Clear form
                this.reset();

                // Auto-redirect after 2.5 seconds if modal action not clicked
                setTimeout(() => {
                    if (modalOverlay.classList.contains('active')) {
                        closeModal();
                        window.location.href = '/login.html';
                    }
                }, 3000);

            } catch (error) {
                errorEl.textContent = error.message || 'An error occurred. Please try again.';
                document.querySelectorAll('.form-group input, .form-group select').forEach(el => el.classList.add('error'));
            } finally {
                btn.disabled = false;
                btn.textContent = 'Create Account';
            }
        });

        // ===== Check if already logged in =====
        const sessionToken = localStorage.getItem('session_token');
        const role = localStorage.getItem('role');

        if (sessionToken && role) {
            if (role === 'ADMIN') {
                window.location.href = '/admin.html';
            } else if (role === 'USER') {
                window.location.href = '/dashboard.html';
            }
        }

        // ===== Service Worker Registration for PWA =====
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then(reg => console.log('SW registered:', reg))
                    .catch(err => console.log('SW registration failed:', err));
            });
        }

        console.log('EMTMS Register - Professional & PWA ready');
    