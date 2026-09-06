        // ─── Logo fallback ──────────────────────────────────
        const logoImg = document.getElementById('logoImg');
        const logoFallback = document.getElementById('logoFallback');
        logoImg.addEventListener('error', function() {
            this.style.display = 'none';
            logoFallback.style.display = 'flex';
        });

        // ─── helpers ──────────────────────────────────────────
        const API_BASE = (() => {
            const host = window.location.hostname;
            if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:8000';
            if (host.includes('muralikorikana.com')) return '/api';
            return '';
        })();

        const sessionToken = localStorage.getItem('session_token');
        const role = localStorage.getItem('role');
        if (!sessionToken) { window.location.href = '/login.html'; }
        if (role === 'ADMIN') { window.location.href = '/admin.html'; }

        const fullName = localStorage.getItem('full_name') || 'User';
        const email = localStorage.getItem('email') || 'user@drmgr.ac.in';
        const department = localStorage.getItem('department') || '—';
        const mobile = localStorage.getItem('mobile_number') || '—';
        const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

        document.getElementById('userName').textContent = fullName;
        document.getElementById('userEmail').textContent = email;
        document.getElementById('userAvatar').textContent = initials;
        document.getElementById('headerName').textContent = fullName;
        document.getElementById('headerAvatar').textContent = initials;

        // ─── toast ──────────────────────────────────────────
        function showToast(message, type = 'info', duration = 3500) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.className = 'toast';
            if (type === 'success') toast.classList.add('success');
            if (type === 'error') toast.classList.add('error');
            toast.classList.add('show');
            clearTimeout(toast._hide);
            toast._hide = setTimeout(() => toast.classList.remove('show'), duration);
        }

        // ─── logout ──────────────────────────────────────────
        function logout() {
            localStorage.clear();
            window.location.href = '/login.html';
        }

        // ─── mobile toggle ──────────────────────────────────
        const menuToggle = document.getElementById('menuToggle');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('overlay');

        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('open');
        });

        // Close sidebar on outside click
        document.addEventListener('click', (e) => {
            if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== menuToggle) {
                sidebar.classList.remove('open');
            }
        });

        // ─── navigation ─────────────────────────────────────
        const sections = {
            tickets: document.getElementById('section-tickets'),
            analytics: document.getElementById('section-analytics'),
            settings: document.getElementById('section-settings'),
        };

        function navigateTo(section) {
            Object.keys(sections).forEach(key => {
                sections[key].classList.toggle('active', key === section);
            });
            document.querySelectorAll('.sidebar-nav a[data-section]').forEach(el => {
                el.classList.toggle('active', el.dataset.section === section);
            });
            const titles = { tickets: 'Dashboard', analytics: 'Analytics', settings: 'Settings' };
            document.getElementById('pageTitle').textContent = titles[section] || 'Dashboard';
            const search = document.querySelector('.search');
            if (search) search.style.display = section === 'tickets' ? 'flex' : 'none';
            if (sidebar.classList.contains('open')) sidebar.classList.remove('open');
            if (section === 'analytics') updateAnalytics();
            if (section === 'settings') updateSettingsDisplay();
        }

        document.querySelectorAll('.sidebar-nav a[data-section]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                navigateTo(el.dataset.section);
            });
        });

        // ─── modal control ──────────────────────────────────
        function openModal(id) {
            overlay.classList.add('active');
            document.querySelectorAll('.modal').forEach(m => {
                m.style.display = m.id === id ? 'block' : 'none';
            });
            document.body.style.overflow = 'hidden';
        }

        function closeAllModals() {
            overlay.classList.remove('active');
            document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
            document.getElementById('ticketForm').reset();
            document.body.style.overflow = '';
        }

        document.getElementById('closeModal').addEventListener('click', closeAllModals);
        document.getElementById('closePopupClose').addEventListener('click', closeAllModals);
        document.getElementById('closePopupCancel').addEventListener('click', closeAllModals);
        document.getElementById('settingsModalClose').addEventListener('click', closeAllModals);

        // Close modal on overlay click
        overlay.addEventListener('click', function(e) {
            if (e.target === this) closeAllModals();
        });

        // Close modal on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeAllModals();
        });

        document.getElementById('newTicketBtn').addEventListener('click', () => {
            openModal('ticketModal');
            if (sidebar.classList.contains('open')) sidebar.classList.remove('open');
        });
        document.getElementById('navNewTicket').addEventListener('click', (e) => {
            e.preventDefault();
            openModal('ticketModal');
            if (sidebar.classList.contains('open')) sidebar.classList.remove('open');
        });

        // ─── close ticket ───────────────────────────────────
        let pendingCloseTicketId = null;
        let pendingCloseTicketNumber = null;

        window.closeTicket = function(ticketId, ticketNumber) {
            pendingCloseTicketId = ticketId;
            pendingCloseTicketNumber = ticketNumber;
            document.getElementById('closePopupText').textContent =
                `Are you sure you want to close #${ticketNumber}? This confirms the work is complete.`;
            openModal('closePopup');
        };

        document.getElementById('closePopupConfirm').addEventListener('click', async () => {
            if (!pendingCloseTicketId) return;
            try {
                const resp = await fetch(`${API_BASE}/ticket/${pendingCloseTicketId}/close`, {
                    method: 'PUT',
                    headers: { 'X-Session-Token': sessionToken, 'Content-Type': 'application/json' },
                });
                if (!resp.ok) {
                    const err = await resp.json();
                    throw new Error(err.detail || 'Failed to close');
                }
                showToast(`✅ Ticket #${pendingCloseTicketNumber} closed!`, 'success');
                closeAllModals();
                fetchTickets();
            } catch (e) {
                showToast('❌ ' + e.message, 'error');
            }
            pendingCloseTicketId = null;
            pendingCloseTicketNumber = null;
        });

        // ─── view ticket ────────────────────────────────────
        window.viewTicket = function(id) {
            window.location.href = `/ticket-detail.html?id=${id}`;
        };

        // ─── fetch tickets ──────────────────────────────────
        let allTickets = [];

        async function fetchTickets() {
            try {
                const resp = await fetch(`${API_BASE}/tickets`, {
                    headers: { 'X-Session-Token': sessionToken },
                });
                if (!resp.ok) {
                    if (resp.status === 401) { logout(); return; }
                    throw new Error('Failed to load');
                }
                allTickets = await resp.json();

                const total = allTickets.length;
                document.getElementById('ticketCount').textContent = `${total} tickets`;
                document.getElementById('ticketCountHeader').textContent = `${total} tickets`;
                document.getElementById('ticketBadge').textContent = total;

                const container = document.getElementById('ticketsList');
                if (!allTickets.length) {
                    container.innerHTML =
                        `<div class="empty-state"><div class="icon">📭</div><h3>No tickets</h3><p>Create your first request.</p></div>`;
                    return;
                }

                container.innerHTML = allTickets.map(t => {
                    const canClose = t.status === 'Completed';
                    const isClosed = t.status === 'Closed';
                    const assignedInfo = t.assigned_worker_name ?
                        `👤 ${t.assigned_worker_name}${t.assigned_worker_phone ? ' · 📞 ' + t.assigned_worker_phone : ''}` :
                        '';

                    return `
                        <div class="ticket-item" onclick="viewTicket(${t.id})">
                            <div class="info">
                                <div class="title">
                                    <span class="id">#${t.ticket_number}</span>
                                    <span class="status ${t.status.toLowerCase().replace(' ', '-')}">${t.status}</span>
                                </div>
                                <div class="details">
                                    <span>${t.fault_type}</span>
                                    <span>${t.block} · Room ${t.room_number}</span>
                                    ${assignedInfo ? `<span class="assigned-badge">${assignedInfo}</span>` : ''}
                                    <span>${new Date(t.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric' })}</span>
                                </div>
                            </div>
                            <div class="actions">
                                <span class="priority priority-${t.priority.toLowerCase()}">${t.priority}</span>
                                ${canClose ? `<button class="btn btn-success btn-sm" onclick="event.stopPropagation(); closeTicket(${t.id}, '${t.ticket_number}')">Close</button>` : ''}
                                ${isClosed ? `<span style="font-size:0.6rem;background:var(--gray-200);padding:2px 10px;border-radius:20px;font-weight:500;">Closed</span>` : ''}
                                <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); viewTicket(${t.id})">View</button>
                            </div>
                        </div>
                    `;
                }).join('');

                if (document.getElementById('section-analytics').classList.contains('active')) {
                    updateAnalytics();
                }

            } catch (e) {
                showToast('⚠️ Error loading tickets', 'error');
                console.error(e);
            }
        }

        // ─── create ticket ──────────────────────────────────
        document.getElementById('ticketForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const btn = document.getElementById('submitTicketBtn');
            const formData = new FormData();
            formData.append('block', document.getElementById('ticketBlock').value);
            formData.append('room_number', document.getElementById('ticketRoom').value);
            formData.append('fault_type', document.getElementById('ticketFault').value);
            formData.append('description', document.getElementById('ticketDescription').value);
            formData.append('priority', document.getElementById('ticketPriority').value);
            formData.append('hod_approval', document.getElementById('ticketHodApproval').checked);

            const img = document.getElementById('ticketImage');
            if (img.files.length) formData.append('image', img.files[0]);

            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Creating…';

            try {
                const resp = await fetch(`${API_BASE}/ticket`, {
                    method: 'POST',
                    headers: { 'X-Session-Token': sessionToken },
                    body: formData,
                });
                if (!resp.ok) {
                    const err = await resp.json();
                    throw new Error(err.detail || 'Creation failed');
                }
                const ticket = await resp.json();
                showToast(`✅ Ticket #${ticket.ticket_number} created!`, 'success');
                closeAllModals();
                fetchTickets();
            } catch (e) {
                showToast('❌ ' + e.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Create Ticket';
            }
        });

        // ─── search ──────────────────────────────────────────
        document.getElementById('searchInput').addEventListener('input', function() {
            const q = this.value.toLowerCase().trim();
            document.querySelectorAll('.ticket-item').forEach(el => {
                const text = el.textContent.toLowerCase();
                el.style.display = text.includes(q) ? '' : 'none';
            });
        });

        // ─── analytics ──────────────────────────────────────
        function renderBarChart(containerId, data, colorMap, labelMap) {
            const container = document.getElementById(containerId);
            const maxVal = Math.max(...data.map(d => d.value), 1);
            container.innerHTML = data.map(d => {
                const pct = Math.round((d.value / maxVal) * 100);
                const label = labelMap ? labelMap[d.key] || d.key : d.key;
                const color = colorMap[d.key] || 'var(--primary)';
                return `
                    <div class="bar-row">
                        <span class="label">${label}</span>
                        <div class="bar-track">
                            <div class="bar-fill" style="width:${pct}%; background:${color};"></div>
                        </div>
                        <span class="count">${d.value}</span>
                    </div>
                `;
            }).join('');
        }

        function updateAnalytics() {
            const total = allTickets.length;
            const pending = allTickets.filter(t => t.status === 'Pending').length;
            const inProgress = allTickets.filter(t => t.status === 'In Progress' || t.status === 'Assigned').length;
            const completed = allTickets.filter(t => t.status === 'Completed' || t.status === 'Closed').length;

            document.getElementById('anaTotal').textContent = total;
            document.getElementById('anaPending').textContent = pending;
            document.getElementById('anaInProgress').textContent = inProgress;
            document.getElementById('anaCompleted').textContent = completed;

            // Fault type breakdown
            const faultMap = {};
            allTickets.forEach(t => { faultMap[t.fault_type] = (faultMap[t.fault_type] || 0) + 1; });
            const faultData = Object.entries(faultMap).map(([k, v]) => ({ key: k, value: v }));
            const faultColors = { LIGHT: 'var(--warning)', FAN: 'var(--primary)', AC: 'var(--success)', UPS: '#8b5cf6',
                Other: 'var(--gray-400)' };
            renderBarChart('faultChart', faultData, faultColors);

            // Priority breakdown
            const priorityMap = {};
            allTickets.forEach(t => { priorityMap[t.priority] = (priorityMap[t.priority] || 0) + 1; });
            const priorityData = Object.entries(priorityMap).map(([k, v]) => ({ key: k, value: v }));
            const priorityColors = { Low: 'var(--success)', Medium: 'var(--primary)', High: 'var(--warning)',
                Urgent: 'var(--danger)' };
            renderBarChart('priorityChart', priorityData, priorityColors);

            // Block breakdown
            const blockMap = {};
            allTickets.forEach(t => { blockMap[t.block] = (blockMap[t.block] || 0) + 1; });
            const blockData = Object.entries(blockMap).map(([k, v]) => ({ key: k, value: v }));
            const blockColors = { ANNA: 'var(--primary)', RA: 'var(--success)', VOC: 'var(--warning)', MT: '#8b5cf6',
                AK: 'var(--danger)', Other: 'var(--gray-400)' };
            renderBarChart('blockChart', blockData, blockColors);

            // Status inline
            const statuses = ['Pending', 'Assigned', 'In Progress', 'Completed', 'Closed', 'Cancelled'];
            const statusCounts = statuses.map(s => ({ label: s, count: allTickets.filter(t => t.status === s).length }));
            document.getElementById('statusInline').innerHTML = statusCounts
                .filter(d => d.count > 0)
                .map(d => `<span><strong>${d.count}</strong> ${d.label}</span>`).join('') ||
                '<span style="color:var(--gray-400);">No tickets yet</span>';
        }

        // ─── settings ───────────────────────────────────────
        function updateSettingsDisplay() {
            document.getElementById('settingsDisplayName').textContent = fullName;
            document.getElementById('settingsDisplayEmail').textContent = email;
            document.getElementById('settingsDisplayDept').textContent = department;
            document.getElementById('settingsDisplayMobile').textContent = mobile;
            document.getElementById('settingsFullName').value = fullName;
            document.getElementById('settingsEmail').value = email;
        }

        document.getElementById('settingsEditBtn').addEventListener('click', () => {
            openModal('settingsModal');
        });

        document.getElementById('settingsForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const btn = document.getElementById('settingsSubmitBtn');
            const payload = {};
            const name = document.getElementById('settingsFullName').value.trim();
            const newEmail = document.getElementById('settingsEmail').value.trim();
            const currentPass = document.getElementById('settingsCurrentPassword').value;
            const newPass = document.getElementById('settingsNewPassword').value;

            if (name) payload.full_name = name;
            if (newEmail) payload.email = newEmail;
            if (newPass) {
                if (!currentPass) { showToast('❌ Current password required', 'error'); return; }
                payload.current_password = currentPass;
                payload.new_password = newPass;
            }
            if (Object.keys(payload).length === 0) { showToast('❌ No changes', 'error'); return; }

            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Saving…';

            try {
                const resp = await fetch(`${API_BASE}/profile`, {
                    method: 'PUT',
                    headers: { 'X-Session-Token': sessionToken, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!resp.ok) {
                    const err = await resp.json();
                    throw new Error(err.detail || 'Update failed');
                }
                const data = await resp.json();
                localStorage.setItem('full_name', data.full_name);
                localStorage.setItem('email', data.email);
                document.getElementById('userName').textContent = data.full_name;
                document.getElementById('userEmail').textContent = data.email;
                document.getElementById('headerName').textContent = data.full_name;
                const newInit = data.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                document.getElementById('userAvatar').textContent = newInit;
                document.getElementById('headerAvatar').textContent = newInit;
                updateSettingsDisplay();
                showToast('✅ Profile updated!', 'success');
                closeAllModals();
            } catch (e) {
                showToast('❌ ' + e.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Update Profile';
            }
        });

        // ─── init ────────────────────────────────────────────
        fetchTickets().then(() => {
            updateAnalytics();
            updateSettingsDisplay();
        });
        setInterval(fetchTickets, 30000);
        navigateTo('tickets');
    