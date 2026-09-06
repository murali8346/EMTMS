        // ===== Logo fallback handler =====
        const logoImg = document.getElementById('logoImg');
        const logoFallback = document.getElementById('logoFallback');

        logoImg.addEventListener('error', function() {
            this.style.display = 'none';
            logoFallback.style.display = 'flex';
        });

        // ===== DOM Elements =====
        const mobileToggle = document.getElementById('mobileToggle');
        const navLinks = document.getElementById('navLinks');
        const navbar = document.getElementById('navbar');
        const modalOverlay = document.getElementById('modalOverlay');
        const modalClose = document.getElementById('modalClose');
        const modalIcon = document.getElementById('modalIcon');
        const modalTitle = document.getElementById('modalTitle');
        const modalMessage = document.getElementById('modalMessage');
        const modalActionBtn = document.getElementById('modalActionBtn');

        // ===== Mobile Toggle =====
        mobileToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });

        // Close mobile menu on link click
        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
            });
        });

        // ===== Navbar Scroll Effect =====
        window.addEventListener('scroll', () => {
            if (window.scrollY > 20) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        });

        // ===== Smooth Scroll for Anchor Links =====
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                const href = this.getAttribute('href');
                if (href === '#') return;
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                    navLinks.classList.remove('active');
                }
            });
        });

        // ===== Professional Modal / Popup System =====
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

        // ===== Demo Modal Trigger =====
        document.getElementById('demoModalBtn').addEventListener('click', () => {
            showModal({
                type: 'info',
                title: 'Welcome to EMTMS',
                message: 'This is a demonstration of our professional modal system. Ready to get started?',
                buttonText: 'Explore Features',
                onAction: () => {
                    document.getElementById('features').scrollIntoView({ behavior: 'smooth' });
                }
            });
        });

        // ===== Contact Form =====
        document.getElementById('contactForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const email = document.getElementById('contactEmail').value.trim();
            const message = document.getElementById('contactMessage').value.trim();

            if (!email || !message) {
                showModal({
                    type: 'error',
                    title: 'Incomplete Form',
                    message: 'Please fill in both email and message fields.',
                    buttonText: 'Try Again'
                });
                return;
            }

            showModal({
                type: 'success',
                title: 'Message Sent!',
                message: 'Thank you for your message. We\'ll get back to you within 24 hours.',
                buttonText: 'Awesome',
                onAction: () => {
                    this.reset();
                }
            });
        });

        // ===== Session Check =====
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

        console.log('EMTMS - Fully responsive & PWA ready with professional branding');
    