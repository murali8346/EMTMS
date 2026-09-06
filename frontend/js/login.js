        // ===== Logo fallback handler =====
        function handleLogoError() {
            const logoImg = document.getElementById('logoImg');
            const logoFallback = document.getElementById('logoFallback');
            logoImg.style.display = 'none';
            logoFallback.style.display = 'flex';
        }

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

        // ===== Login Form Handler =====
        document.getElementById('loginForm').addEventListener('submit', async function(e) {
            e.preventDefault();

            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const errorEl = document.getElementById('errorMessage');
            const btn = document.getElementById('loginBtn');

            // Reset error
            errorEl.textContent = '';
            document.querySelectorAll('.form-group input').forEach(el => el.classList.remove('error'));

            // Validation
            if (!email || !password) {
                errorEl.textContent = 'Please fill in all fields.';
                if (!email) document.getElementById('email').classList.add('error');
                if (!password) document.getElementById('password').classList.add('error');
                return;
            }

            // Email format validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                errorEl.textContent = 'Please enter a valid email address.';
                document.getElementById('email').classList.add('error');
                return;
            }

            // Loading state
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Logging in...';

            try {
                const response = await fetch(`${API_BASE}/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email, password }),
                });

                // Handle non-JSON responses (like HTML errors)
                const contentType = response.headers.get('content-type');
                let data;
                
                if (contentType && contentType.includes('application/json')) {
                    data = await response.json();
                } else {
                    // If response is HTML or other, try to parse as text
                    const text = await response.text();
                    console.error('Non-JSON response:', text);
                    
                    // Check for 502 Bad Gateway
                    if (response.status === 502) {
                        throw new Error('Server is currently unavailable. Please try again later.');
                    }
                    
                    // Try to extract error message from HTML
                    const errorMatch = text.match(/<h1>(.*?)<\/h1>/);
                    if (errorMatch) {
                        throw new Error(errorMatch[1]);
                    }
                    throw new Error(`Server error (${response.status}). Please try again.`);
                }

                if (!response.ok) {
                    throw new Error(data.detail || data.message || 'Invalid credentials. Please try again.');
                }

                // Store session data
                localStorage.setItem('session_token', data.session_token);
                localStorage.setItem('user_id', data.user_id);
                localStorage.setItem('role', data.role);
                localStorage.setItem('full_name', data.full_name);
                localStorage.setItem('email', data.email);
                localStorage.setItem('department', data.department);
                localStorage.setItem('mobile_number', data.mobile_number);

                // Show success message before redirect
                const redirectUrl = data.role === 'ADMIN' ? '/admin.html' : '/dashboard.html';

                showModal({
                    type: 'success',
                    title: 'Welcome Back!',
                    message: `Redirecting to ${data.role === 'ADMIN' ? 'admin panel' : 'dashboard'}...`,
                    buttonText: 'Continue',
                    onAction: () => {
                        window.location.href = redirectUrl;
                    }
                });

                // Auto-redirect after 2 seconds if modal action not clicked
                setTimeout(() => {
                    if (modalOverlay.classList.contains('active')) {
                        closeModal();
                        window.location.href = redirectUrl;
                    }
                }, 2500);

            } catch (error) {
                console.error('Login error:', error);
                errorEl.textContent = error.message || 'An error occurred. Please try again.';
                document.querySelectorAll('.form-group input').forEach(el => el.classList.add('error'));
            } finally {
                btn.disabled = false;
                btn.textContent = 'Log In';
            }
        });

        // ===== Check if already logged in =====
        const sessionToken = localStorage.getItem('session_token');
        const role = localStorage.getItem('role');

        if (sessionToken && role) {
            // User is already logged in
            const redirectUrl = role === 'ADMIN' ? '/admin.html' : '/dashboard.html';
            window.location.href = redirectUrl;
        }

        // ===== Service Worker Registration for PWA =====
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                // Check if sw.js exists before registering
                fetch('/sw.js')
                    .then(response => {
                        if (response.ok) {
                            return navigator.serviceWorker.register('/sw.js');
                        }
                        console.log('SW file not found, skipping registration');
                        return null;
                    })
                    .then(reg => {
                        if (reg) {
                            console.log('SW registered:', reg);
                        }
                    })
                    .catch(err => {
                        console.log('SW registration skipped:', err.message);
                    });
            });
        }

        // ===== Create a minimal manifest.json if missing =====
        function ensureManifest() {
            // Check if manifest.json exists and is valid
            fetch('/manifest.json')
                .then(response => {
                    if (!response.ok) {
                        console.log('Manifest file not found or invalid');
                        // Could create a minimal manifest here if needed
                    }
                    return response.json();
                })
                .catch(() => {
                    console.log('Manifest not available - PWA features limited');
                });
        }

        ensureManifest();

        console.log('EMTMS Login - Professional & PWA ready');
    