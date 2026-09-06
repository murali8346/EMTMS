        // ===== Toast =====
        function showToast(message, type = 'info') {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.className = 'toast ' + type;
            setTimeout(() => toast.classList.add('show'), 10);
            setTimeout(() => toast.classList.remove('show'), 4000);
        }

        // ===== Confirm Dialog =====
        let confirmResolve = null;
        const confirmModal = document.getElementById('confirmModal');

        function showConfirm(title, message) {
            return new Promise((resolve) => {
                document.getElementById('confirmTitle').textContent = title;
                document.getElementById('confirmMessage').textContent = message;
                confirmModal.classList.add('active');
                confirmResolve = resolve;
            });
        }

        document.getElementById('confirmOk').addEventListener('click', () => {
            confirmModal.classList.remove('active');
            if (confirmResolve) { confirmResolve(true);
                confirmResolve = null; }
        });
        document.getElementById('confirmCancel').addEventListener('click', () => {
            confirmModal.classList.remove('active');
            if (confirmResolve) { confirmResolve(false);
                confirmResolve = null; }
        });

        // ===== API Base =====
        function getApiBase() {
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
                return 'http://localhost:8000';
            if (window.location.hostname.includes('muralikorikana.com')) return '/api';
            return '';
        }
        const API_BASE = getApiBase();

        // ===== Auth =====
        const sessionToken = localStorage.getItem('session_token');
        const role = localStorage.getItem('role');
        if (!sessionToken) { localStorage.clear();
            window.location.href = '/login.html'; }
        if (role !== 'ADMIN') { window.location.href = '/dashboard.html'; }

        // ===== User Info =====
        const fullName = localStorage.getItem('full_name') || 'Administrator';
        const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        document.getElementById('adminName').textContent = fullName;
        document.getElementById('adminAvatar').textContent = initials;
        document.getElementById('headerName').textContent = fullName;
        document.getElementById('headerAvatar').textContent = initials;

        // ===== Mobile Menu =====
        const menuToggle = document.getElementById('menuToggle');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('overlay');
        menuToggle.addEventListener('click', () => { sidebar.classList.toggle('open');
            overlay.classList.toggle('active'); });
        overlay.addEventListener('click', () => { sidebar.classList.remove('open');
            overlay.classList.remove('active'); });

        // ===== Navigation =====
        let currentSection = 'tickets';
        const sectionTitles = { tickets: 'Tickets', workers: 'Workers', dashboard: 'Dashboard', analytics: 'Analytics',
            settings: 'Settings' };

        function switchSection(section) {
            document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
            document.getElementById('section-' + section).classList.add('active');
            document.querySelectorAll('.sidebar-nav a').forEach(el => el.classList.remove('active'));
            document.querySelector(`.sidebar-nav a[data-section="${section}"]`).classList.add('active');
            document.getElementById('pageTitle').textContent = sectionTitles[section];
            currentSection = section;
            if (section === 'workers') loadWorkersTable();
            if (section === 'dashboard') loadDashboard();
            if (section === 'analytics') loadAnalytics();
            if (section === 'settings') loadProfile();
            if (sidebar.classList.contains('open')) { sidebar.classList.remove('open');
                overlay.classList.remove('active'); }
        }

        async function logout() {
            if (await showConfirm('Sign Out', 'Are you sure you want to sign out?')) {
                localStorage.clear();
                window.location.href = '/login.html';
            }
        }

        function viewTicket(id) { window.location.href = `/ticket-detail.html?id=${id}`; }

        // ===== Ticket Actions =====
        function openAssignModal(ticketId) {
            document.getElementById('assignTicketId').value = ticketId;
            document.getElementById('assignNotes').value = '';
            document.getElementById('assignStatus').value = 'Assigned';
            document.getElementById('assignModal').classList.add('active');
            loadWorkersForAssign();
        }

        function closeAssignModal() { document.getElementById('assignModal').classList.remove('active'); }

        async function loadWorkersForAssign() {
            try {
                const resp = await fetch(`${API_BASE}/workers`, { headers: { 'X-Session-Token': sessionToken } });
                const workers = await resp.json();
                const sel = document.getElementById('assignWorker');
                sel.innerHTML = '<option value="">Select a worker...</option>';
                workers.forEach(w => {
                    sel.innerHTML += `<option value="${w.id}">${w.full_name} (${w.specialization || 'General'}) - ${w.phone}</option>`;
                });
            } catch (e) { console.error(e); }
        }

        document.getElementById('assignForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const ticketId = document.getElementById('assignTicketId').value;
            const workerId = document.getElementById('assignWorker').value;
            if (!workerId) { await showAlert('Error', 'Please select a worker.'); return; }
            try {
                const resp = await fetch(`${API_BASE}/admin/ticket/${ticketId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken },
                    body: JSON.stringify({
                        assigned_worker_id: parseInt(workerId),
                        assignment_notes: document.getElementById('assignNotes').value,
                        status: document.getElementById('assignStatus').value
                    })
                });
                if (!resp.ok) { const d = await resp.json(); throw new Error(d.detail); }
                showToast('Worker assigned successfully!', 'success');
                closeAssignModal();
                applyFilters();
            } catch (err) { showToast(err.message, 'error'); }
        });

        document.getElementById('assignModal').addEventListener('click', function(e) { if (e.target === this) closeAssignModal(); });

        async function markCompleted(ticketId) {
            if (!await showConfirm('Mark Completed', 'Mark this ticket as completed?')) return;
            try {
                const resp = await fetch(`${API_BASE}/admin/ticket/${ticketId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken },
                    body: JSON.stringify({ status: 'Completed' })
                });
                if (!resp.ok) { const d = await resp.json(); throw new Error(d.detail); }
                showToast('Ticket completed!', 'success');
                applyFilters();
            } catch (err) { showToast(err.message, 'error'); }
        }

        async function deleteTicket(ticketId) {
            if (!await showConfirm('Delete Ticket', 'This action cannot be undone. Continue?')) return;
            try {
                const resp = await fetch(`${API_BASE}/admin/ticket/${ticketId}`, {
                    method: 'DELETE',
                    headers: { 'X-Session-Token': sessionToken }
                });
                if (!resp.ok) { const d = await resp.json(); throw new Error(d.detail); }
                showToast('Ticket deleted!', 'success');
                applyFilters();
            } catch (err) { showToast(err.message, 'error'); }
        }

        // ===== Fetch Tickets =====
        async function fetchTickets(filters = {}) {
            try {
                const params = new URLSearchParams();
                if (filters.status) params.append('status_filter', filters.status);
                if (filters.block) params.append('block_filter', filters.block);
                if (filters.fault) params.append('fault_filter', filters.fault);
                const url = `${API_BASE}/admin/tickets${params.toString() ? '?' + params.toString() : ''}`;
                const resp = await fetch(url, { headers: { 'X-Session-Token': sessionToken } });
                if (!resp.ok) { if (resp.status === 401) { localStorage.clear();
                        window.location.href = '/login.html'; } throw new Error('Failed'); }
                const tickets = await resp.json();
                const total = tickets.length;
                document.getElementById('ticketCount').textContent = `${total} tickets`;
                document.getElementById('ticketCountMobile').textContent = `${total} tickets`;
                document.getElementById('ticketBadge').textContent = total;

                // Desktop Table
                const tbody = document.getElementById('ticketsBody');
                if (tickets.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="8"><div style="text-align:center;padding:40px;color:var(--gray-400);"><i class="fas fa-inbox" style="font-size:2rem;margin-bottom:8px;"></i><h3>No tickets found</h3></div></td></tr>';
                } else {
                    tbody.innerHTML = tickets.map(t => {
                        const isClosed = t.status === 'Closed';
                        const isCompleted = t.status === 'Completed';
                        const statusClass = t.status.toLowerCase().replace(/ /g, '-');
                        const assignedTo = t.assigned_worker_name || 'Not Assigned';
                        const dateTime = new Date(t.created_at).toLocaleDateString('en-US', { month: 'short',
                                day: 'numeric', year: 'numeric' }) + ' · ' + new Date(t.created_at)
                            .toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                        return `
                        <tr onclick="viewTicket(${t.id})">
                            <td><span class="ticket-link">#${t.ticket_number}</span><br><span style="font-size:0.65rem;color:var(--gray-400);">ID: ${t.id}</span></td>
                            <td><strong>${t.block}</strong><br><span style="font-size:0.65rem;color:var(--gray-400);">Room ${t.room_number}</span></td>
                            <td>${t.fault_type}</td>
                            <td><span class="priority-badge priority-${t.priority.toLowerCase()}">${t.priority}</span>${t.hod_approval ? '<br><span style="font-size:0.55rem;color:var(--success);">✓ HOD</span>' : ''}</td>
                            <td><span class="status-badge status-${statusClass}">${t.status}</span></td>
                            <td>${assignedTo}${t.assigned_worker_phone ? '<br><span style="font-size:0.6rem;color:var(--gray-400);">📞 '+t.assigned_worker_phone+'</span>' : ''}</td>
                            <td style="font-size:0.75rem;color:var(--gray-500);">${dateTime}</td>
                            <td onclick="event.stopPropagation();"><div class="table-actions">
                                ${!isClosed ? `<button class="btn btn-primary" onclick="event.stopPropagation();viewTicket(${t.id})"><i class="fas fa-comment"></i> Chat</button>` : ''}
                                ${!isClosed && !isCompleted ? `<button class="btn btn-warning" onclick="event.stopPropagation();openAssignModal(${t.id})"><i class="fas fa-user-plus"></i> Assign</button>` : ''}
                                ${!isClosed && t.status !== 'Completed' ? `<button class="btn btn-success" onclick="event.stopPropagation();markCompleted(${t.id})"><i class="fas fa-check"></i> Done</button>` : ''}
                                <button class="btn btn-danger" onclick="event.stopPropagation();deleteTicket(${t.id})"><i class="fas fa-trash"></i></button>
                            </div></td>
                        </tr>`;
                    }).join('');
                }

                // Mobile Cards
                const mobileCards = document.getElementById('mobileCards');
                if (tickets.length === 0) {
                    mobileCards.innerHTML = '<div style="text-align:center;padding:40px;background:var(--white);border:1px solid var(--gray-200);border-radius:0 0 var(--radius-lg) var(--radius-lg);color:var(--gray-400);"><i class="fas fa-inbox" style="font-size:2rem;"></i><h3>No tickets found</h3></div>';
                } else {
                    mobileCards.innerHTML = tickets.map(t => {
                        const isClosed = t.status === 'Closed';
                        const isCompleted = t.status === 'Completed';
                        const statusClass = t.status.toLowerCase().replace(/ /g, '-');
                        const assignedTo = t.assigned_worker_name || 'Not assigned';
                        const dateTime = new Date(t.created_at).toLocaleDateString('en-US', { month: 'short',
                                day: 'numeric', year: 'numeric' }) + ' · ' + new Date(t.created_at)
                            .toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                        return `
                        <div class="ticket-card" onclick="viewTicket(${t.id})">
                            <div class="card-header">
                                <div>
                                    <div class="ticket-number">#${t.ticket_number}</div>
                                    <div class="ticket-date-time">${dateTime}</div>
                                </div>
                                <span class="status-badge status-${statusClass}">${t.status}</span>
                            </div>
                            <div class="card-info-grid">
                                <div class="card-info-item"><span class="info-label">Location</span><span class="info-value">${t.block} · Rm ${t.room_number}</span></div>
                                <div class="card-info-item"><span class="info-label">Fault</span><span class="info-value">${t.fault_type}</span></div>
                                <div class="card-info-item full-width"><span class="info-label">Priority</span><span class="priority-badge priority-${t.priority.toLowerCase()}" style="display:inline-block;">${t.priority}</span>${t.hod_approval ? '<span style="font-size:0.65rem;color:var(--success);margin-left:6px;">✓ HOD</span>' : ''}</div>
                            </div>
                            ${assignedTo !== 'Not assigned' ? `
                            <div class="assigned-bar">
                                <span class="assigned-icon"><i class="fas fa-user-check"></i></span>
                                <span><strong>${assignedTo}</strong>${t.assigned_worker_phone ? ' · ' + t.assigned_worker_phone : ''}</span>
                            </div>` : ''}
                            <div class="card-actions-grid" onclick="event.stopPropagation();">
                                ${!isClosed ? `<button class="btn btn-primary" onclick="event.stopPropagation();viewTicket(${t.id})"><i class="fas fa-comment btn-icon"></i> Chat</button>` : '<div></div>'}
                                ${!isClosed && !isCompleted ? `<button class="btn btn-warning" onclick="event.stopPropagation();openAssignModal(${t.id})"><i class="fas fa-user-plus btn-icon"></i> Assign</button>` : '<div></div>'}
                                ${!isClosed && t.status !== 'Completed' ? `<button class="btn btn-success" onclick="event.stopPropagation();markCompleted(${t.id})"><i class="fas fa-check-circle btn-icon"></i> Done</button>` : '<div></div>'}
                                <button class="btn btn-danger" onclick="event.stopPropagation();deleteTicket(${t.id})"><i class="fas fa-trash btn-icon"></i> Delete</button>
                            </div>
                        </div>`;
                    }).join('');
                }
            } catch (err) {
                console.error(err);
                document.getElementById('ticketsBody').innerHTML = '<tr><td colspan="8"><div style="text-align:center;padding:40px;color:var(--danger);">Error loading tickets</div></td></tr>';
                document.getElementById('mobileCards').innerHTML = '<div style="text-align:center;padding:40px;color:var(--danger);">Error loading tickets</div>';
            }
        }

        function applyFilters() {
            fetchTickets({
                status: document.getElementById('statusFilter').value,
                block: document.getElementById('blockFilter').value,
                fault: document.getElementById('faultFilter').value
            });
        }

        function resetFilters() {
            document.getElementById('statusFilter').value = '';
            document.getElementById('blockFilter').value = '';
            document.getElementById('faultFilter').value = '';
            fetchTickets({});
        }

        // ===== Workers =====
        async function loadWorkersTable() {
            try {
                const resp = await fetch(`${API_BASE}/workers`, { headers: { 'X-Session-Token': sessionToken } });
                const workers = await resp.json();
                document.getElementById('workerCount').textContent = `${workers.length} workers`;
                const tbody = document.getElementById('workersBody');
                if (workers.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7"><div style="text-align:center;padding:40px;color:var(--gray-400);">No workers found</div></td></tr>';
                } else {
                    tbody.innerHTML = workers.map(w => `
                        <tr>
                            <td><strong>${w.full_name}</strong></td>
                            <td>${w.email}</td>
                            <td>${w.phone}</td>
                            <td>${w.specialization || '—'}</td>
                            <td><span class="status-badge ${w.is_active ? 'status-active' : 'status-inactive'}">${w.is_active ? 'Active' : 'Inactive'}</span></td>
                            <td style="font-size:0.75rem;color:var(--gray-500);">${new Date(w.created_at).toLocaleDateString()}</td>
                            <td><div class="table-actions">
                                <button class="btn btn-sm" style="background:var(--gray-100);color:var(--gray-700);" onclick="editWorker(${w.id})"><i class="fas fa-edit"></i> Edit</button>
                                <button class="btn btn-danger btn-sm" onclick="deleteWorker(${w.id})"><i class="fas fa-trash"></i></button>
                            </div></td>
                        </tr>`).join('');
                }
            } catch (err) { console.error(err); }
        }

        let editingWorkerId = null;

        function openWorkerModal(data = null) {
            editingWorkerId = data ? data.id : null;
            document.getElementById('workerModalTitle').innerHTML = data ? '<i class="fas fa-edit" style="color:var(--primary);"></i> Edit Worker' :
                '<i class="fas fa-user-plus" style="color:var(--primary);"></i> Add Worker';
            document.getElementById('workerId').value = data ? data.id : '';
            document.getElementById('workerFullName').value = data ? data.full_name : '';
            document.getElementById('workerEmail').value = data ? data.email : '';
            document.getElementById('workerPhone').value = data ? data.phone : '';
            document.getElementById('workerSpecialization').value = data ? data.specialization || '' : '';
            document.getElementById('workerActive').value = data ? (data.is_active ? 1 : 0) : 1;
            document.getElementById('workerActiveGroup').style.display = data ? 'block' : 'none';
            document.getElementById('workerModal').classList.add('active');
        }

        function closeWorkerModal() { document.getElementById('workerModal').classList.remove('active'); }

        async function editWorker(id) {
            const resp = await fetch(`${API_BASE}/workers`, { headers: { 'X-Session-Token': sessionToken } });
            const workers = await resp.json();
            const w = workers.find(x => x.id === id);
            if (w) openWorkerModal(w);
        }

        async function deleteWorker(id) {
            if (!await showConfirm('Delete Worker', 'This will deactivate the worker. Continue?')) return;
            await fetch(`${API_BASE}/workers/${id}`, { method: 'DELETE', headers: { 'X-Session-Token': sessionToken } });
            showToast('Worker deactivated.', 'success');
            loadWorkersTable();
        }

        document.getElementById('workerForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const id = document.getElementById('workerId').value;
            const payload = {
                full_name: document.getElementById('workerFullName').value.trim(),
                email: document.getElementById('workerEmail').value.trim(),
                phone: document.getElementById('workerPhone').value.trim(),
                specialization: document.getElementById('workerSpecialization').value.trim() || null,
            };
            let method = 'POST',
                url = `${API_BASE}/workers`;
            if (id) { method = 'PUT';
                url = `${API_BASE}/workers/${id}`;
                payload.is_active = parseInt(document.getElementById('workerActive').value) === 1; }
            const resp = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken },
                body: JSON.stringify(payload)
            });
            if (!resp.ok) { const d = await resp.json(); throw new Error(d.detail); }
            showToast(id ? 'Worker updated!' : 'Worker added!', 'success');
            closeWorkerModal();
            loadWorkersTable();
        });

        document.getElementById('workerModal').addEventListener('click', function(e) { if (e.target === this) closeWorkerModal(); });

        // ===== Dashboard (Enhanced) =====
        let dashStatusChart, dashPriorityChart, dashBlockChart, dashFaultChart, dashDeptChart, dashTimelineChart;

        async function loadDashboard(filters = {}) {
            try {
                const params = new URLSearchParams();
                if (filters.status) params.append('status', filters.status);
                if (filters.block) params.append('block', filters.block);
                if (filters.fault) params.append('fault', filters.fault);
                const query = params.toString();

                // Fetch all data in parallel
                const [stats, blocks, faults, depts, timeline, perf] = await Promise.all([
                    fetch(`${API_BASE}/admin/stats${query ? '?' + query : ''}`, { headers: { 'X-Session-Token': sessionToken } })
                    .then(r => r.json()),
                    fetch(`${API_BASE}/admin/analytics/blocks${query ? '?' + query : ''}`, { headers: { 'X-Session-Token': sessionToken } })
                    .then(r => r.json()),
                    fetch(`${API_BASE}/admin/analytics/faults${query ? '?' + query : ''}`, { headers: { 'X-Session-Token': sessionToken } })
                    .then(r => r.json()),
                    fetch(`${API_BASE}/admin/analytics/departments${query ? '?' + query : ''}`, { headers: { 'X-Session-Token': sessionToken } })
                    .then(r => r.json()),
                    fetch(`${API_BASE}/admin/analytics/timeline?days=30${query ? '&' + query : ''}`, { headers: { 'X-Session-Token': sessionToken } })
                    .then(r => r.json()),
                    fetch(`${API_BASE}/admin/analytics/worker-performance${query ? '?' + query : ''}`, { headers: { 'X-Session-Token': sessionToken } })
                    .then(r => r.json())
                ]);

                // Update stats
                const inProg = (stats.assigned || 0) + (stats.in_progress || 0);
                document.getElementById('dashTotal').textContent = stats.total || 0;
                document.getElementById('dashPending').textContent = stats.pending || 0;
                document.getElementById('dashInProgress').textContent = inProg;
                document.getElementById('dashCompleted').textContent = stats.completed || 0;
                document.getElementById('dashClosed').textContent = stats.closed || 0;
                document.getElementById('dashToday').textContent = stats.today || 0;

                // Status Chart
                if (dashStatusChart) dashStatusChart.destroy();
                dashStatusChart = new Chart(document.getElementById('dashStatusChart'), {
                    type: 'doughnut',
                    data: {
                        labels: ['Pending', 'Assigned', 'In Progress', 'Completed', 'Closed', 'Cancelled'],
                        datasets: [{
                            data: [stats.pending || 0, stats.assigned || 0, stats.in_progress || 0, stats.completed || 0,
                                stats.closed || 0,
                                Math.max(0, (stats.total || 0) - (stats.pending || 0) - (stats.assigned || 0) -
                                    (stats.in_progress || 0) - (stats.completed || 0) - (stats.closed || 0))
                            ],
                            backgroundColor: ['#f59e0b', '#8b5cf6', '#2563eb', '#10b981', '#6b7280', '#ef4444']
                        }]
                    },
                    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
                });

                // Priority Chart
                if (dashPriorityChart) dashPriorityChart.destroy();
                const pd = stats.by_priority || {};
                dashPriorityChart = new Chart(document.getElementById('dashPriorityChart'), {
                    type: 'bar',
                    data: {
                        labels: ['Low', 'Medium', 'High', 'Urgent'],
                        datasets: [{
                            data: [pd.Low || 0, pd.Medium || 0, pd.High || 0, pd.Urgent || 0],
                            backgroundColor: ['#10b981', '#2563eb', '#f59e0b', '#ef4444']
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
                    }
                });

                // Block Chart
                if (dashBlockChart) dashBlockChart.destroy();
                dashBlockChart = new Chart(document.getElementById('dashBlockChart'), {
                    type: 'bar',
                    data: {
                        labels: blocks.map(b => b.block),
                        datasets: [{ data: blocks.map(b => b.count), backgroundColor: '#2563eb' }]
                    },
                    options: {
                        responsive: true,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
                    }
                });

                // Fault Chart
                if (dashFaultChart) dashFaultChart.destroy();
                dashFaultChart = new Chart(document.getElementById('dashFaultChart'), {
                    type: 'doughnut',
                    data: {
                        labels: faults.map(f => f.fault_type),
                        datasets: [{
                            data: faults.map(f => f.count),
                            backgroundColor: ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6']
                        }]
                    },
                    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
                });

                // Department Chart
                if (dashDeptChart) dashDeptChart.destroy();
                dashDeptChart = new Chart(document.getElementById('dashDeptChart'), {
                    type: 'bar',
                    data: {
                        labels: depts.map(d => d.department.length > 15 ? d.department.substring(0, 12) + '...' : d.department),
                        datasets: [{ data: depts.map(d => d.count), backgroundColor: '#10b981' }]
                    },
                    options: {
                        responsive: true,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
                    }
                });

                // Timeline Chart
                if (dashTimelineChart) dashTimelineChart.destroy();
                dashTimelineChart = new Chart(document.getElementById('dashTimelineChart'), {
                    type: 'line',
                    data: {
                        labels: timeline.map(d => d.date),
                        datasets: [{
                            data: timeline.map(d => d.count),
                            borderColor: '#2563eb',
                            backgroundColor: 'rgba(37,99,235,0.1)',
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
                    }
                });

                // Worker Performance Table
                const workerTable = document.getElementById('dashWorkerTable');
                if (perf.length === 0) {
                    workerTable.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--gray-400);">No worker data available</td></tr>';
                } else {
                    workerTable.innerHTML = perf.map(p => {
                        const rate = p.assigned > 0 ? Math.round((p.completed / p.assigned) * 100) : 0;
                        return `
                            <tr>
                                <td><strong>${p.worker_name}</strong></td>
                                <td>${p.assigned}</td>
                                <td>${p.completed}</td>
                                <td><span style="color:${rate >= 80 ? 'var(--success)' : rate >= 50 ? 'var(--warning)' : 'var(--danger)'}">${rate}%</span></td>
                                <td>${p.avg_days ? p.avg_days + ' days' : '—'}</td>
                            </tr>
                        `;
                    }).join('');
                }

            } catch (err) {
                console.error('Dashboard Error:', err);
                showToast('Error loading dashboard data', 'error');
            }
        }

        function applyDashboardFilters() {
            loadDashboard({
                status: document.getElementById('dashStatusFilter').value,
                block: document.getElementById('dashBlockFilter').value,
                fault: document.getElementById('dashFaultFilter').value
            });
        }

        function resetDashboardFilters() {
            document.getElementById('dashStatusFilter').value = '';
            document.getElementById('dashBlockFilter').value = '';
            document.getElementById('dashFaultFilter').value = '';
            loadDashboard({});
        }

        // ===== Analytics with Export =====
        let blockChart, faultChart, deptChart, timelineChart, workerChart;
        let currentAnalyticsFilters = {};

        async function loadAnalytics(filters = {}) {
            currentAnalyticsFilters = filters;
            try {
                const headers = { 'X-Session-Token': sessionToken };
                const params = new URLSearchParams();
                if (filters.status) params.append('status', filters.status);
                if (filters.block) params.append('block', filters.block);
                if (filters.fault) params.append('fault', filters.fault);
                const query = params.toString();

                const [blocks, faults, depts, timeline, perf] = await Promise.all([
                    fetch(`${API_BASE}/admin/analytics/blocks${query ? '?' + query : ''}`, { headers }).then(r => r
                        .json()),
                    fetch(`${API_BASE}/admin/analytics/faults${query ? '?' + query : ''}`, { headers }).then(r => r
                        .json()),
                    fetch(`${API_BASE}/admin/analytics/departments${query ? '?' + query : ''}`, { headers }).then(r =>
                        r.json()),
                    fetch(`${API_BASE}/admin/analytics/timeline?days=30${query ? '&' + query : ''}`, { headers }).then(
                        r => r.json()),
                    fetch(`${API_BASE}/admin/analytics/worker-performance${query ? '?' + query : ''}`, { headers })
                    .then(r => r.json())
                ]);

                if (blockChart) blockChart.destroy();
                blockChart = new Chart(document.getElementById('blockChart'), {
                    type: 'bar',
                    data: { labels: blocks.map(b => b.block), datasets: [{ data: blocks.map(b => b.count),
                            backgroundColor: '#2563eb' }] },
                    options: { responsive: true, plugins: { legend: { display: false } } }
                });

                if (faultChart) faultChart.destroy();
                faultChart = new Chart(document.getElementById('faultChart'), {
                    type: 'doughnut',
                    data: { labels: faults.map(f => f.fault_type), datasets: [{ data: faults.map(f => f.count),
                            backgroundColor: ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'] }] },
                    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
                });

                if (deptChart) deptChart.destroy();
                deptChart = new Chart(document.getElementById('deptChart'), {
                    type: 'bar',
                    data: { labels: depts.map(d => d.department), datasets: [{ data: depts.map(d => d.count),
                            backgroundColor: '#10b981' }] },
                    options: { responsive: true, plugins: { legend: { display: false } } }
                });

                if (timelineChart) timelineChart.destroy();
                timelineChart = new Chart(document.getElementById('timelineChart'), {
                    type: 'line',
                    data: { labels: timeline.map(d => d.date), datasets: [{ data: timeline.map(d => d.count),
                            borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', fill: true }] },
                    options: { responsive: true, plugins: { legend: { display: false } } }
                });

                if (workerChart) workerChart.destroy();
                workerChart = new Chart(document.getElementById('workerChart'), {
                    type: 'bar',
                    data: { labels: perf.map(p => p.worker_name), datasets: [{ label: 'Assigned', data: perf.map(p =>
                                p.assigned), backgroundColor: '#2563eb' }, { label: 'Completed', data: perf.map(
                                p => p.completed), backgroundColor: '#10b981' }] },
                    options: { responsive: true, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } }
                });
            } catch (err) { console.error(err); }
        }

        function applyAnalyticsFilters() {
            loadAnalytics({
                status: document.getElementById('analyticsStatusFilter').value,
                block: document.getElementById('analyticsBlockFilter').value,
                fault: document.getElementById('analyticsFaultFilter').value
            });
        }

        function resetAnalyticsFilters() {
            document.getElementById('analyticsStatusFilter').value = '';
            document.getElementById('analyticsBlockFilter').value = '';
            document.getElementById('analyticsFaultFilter').value = '';
            loadAnalytics({});
        }

        // ===== Analytics Export Functions =====
        function getAnalyticsParams() {
            const params = new URLSearchParams();
            const status = document.getElementById('analyticsStatusFilter').value;
            const block = document.getElementById('analyticsBlockFilter').value;
            const fault = document.getElementById('analyticsFaultFilter').value;
            if (status) params.append('status', status);
            if (block) params.append('block', block);
            if (fault) params.append('fault', fault);
            return params;
        }

        async function exportAnalyticsJSON() {
            try {
                const params = getAnalyticsParams();
                const url = `${API_BASE}/admin/analytics/export${params.toString() ? '?' + params.toString() : ''}`;
                const resp = await fetch(url, { headers: { 'X-Session-Token': sessionToken } });
                if (!resp.ok) throw new Error('Export failed');
                const data = await resp.json();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const downloadUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = `analytics_export_${new Date().toISOString().slice(0,10)}.json`;
                a.click();
                URL.revokeObjectURL(downloadUrl);
                showToast('JSON exported successfully!', 'success');
            } catch (err) {
                showToast('Export failed: ' + err.message, 'error');
            }
        }

        async function exportAnalyticsCSV() {
            try {
                const params = getAnalyticsParams();
                const url = `${API_BASE}/admin/analytics/export/csv${params.toString() ? '?' + params.toString() : ''}`;
                const resp = await fetch(url, { headers: { 'X-Session-Token': sessionToken } });
                if (!resp.ok) throw new Error('Export failed');
                const blob = await resp.blob();
                const downloadUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = `analytics_export_${new Date().toISOString().slice(0,10)}.csv`;
                a.click();
                URL.revokeObjectURL(downloadUrl);
                showToast('CSV exported successfully!', 'success');
            } catch (err) {
                showToast('Export failed: ' + err.message, 'error');
            }
        }

        // ===== AI Report with Better Error Handling =====
        async function generateAIReport() {
            try {
                showToast('Generating AI report...', 'info');

                const params = getAnalyticsParams();
                const url = `${API_BASE}/admin/ai-report${params.toString() ? '?' + params.toString() : ''}`;

                const resp = await fetch(url, { headers: { 'X-Session-Token': sessionToken } });

                if (!resp.ok) {
                    const errorData = await resp.json().catch(() => ({}));
                    throw new Error(errorData.detail || 'AI report generation failed');
                }

                const data = await resp.json();

                // Show AI report in a modal
                const modal = document.createElement('div');
                modal.className = 'modal-overlay active';
                modal.style.display = 'flex';
                modal.innerHTML = `
                    <div class="modal-panel" style="max-width: 700px; max-height: 80vh; overflow-y: auto;">
                        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                            <i class="fas fa-times"></i>
                        </button>
                        <h2><i class="fas fa-robot" style="color:var(--primary);"></i> AI Generated Report</h2>
                        <div style="margin: 16px 0; font-size: 0.75rem; color: var(--gray-500);">
                            Generated: ${new Date(data.generated_at).toLocaleString()}
                            ${data.filters ? '<br>Filters: ' + JSON.stringify(data.filters) : ''}
                            ${data.error ? '<br><span style="color:var(--warning);">⚠️ Note: ' + data.error + '</span>' : ''}
                        </div>
                        <div style="background: var(--gray-50); padding: 20px; border-radius: var(--radius); white-space: pre-wrap; font-size: 0.9rem; line-height: 1.8; max-height: 50vh; overflow-y: auto;">
                            ${data.report || 'No report content generated. Please check your Gemini API configuration.'}
                        </div>
                        <div style="margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap;">
                            <button class="btn btn-primary" onclick="copyReportToClipboard(this)">
                                <i class="fas fa-copy"></i> Copy Report
                            </button>
                            <button class="btn btn-success" onclick="downloadReportAsText(this)">
                                <i class="fas fa-file-alt"></i> Download Report
                            </button>
                            <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">
                                Close
                            </button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);

                // Close on overlay click
                modal.addEventListener('click', function(e) {
                    if (e.target === this) this.remove();
                });

                showToast(data.error ? 'AI Report generated with notes' : 'AI Report generated!', data.error ? 'warning' :
                    'success');
            } catch (err) {
                // Fallback: Show error with basic stats
                showToast('AI Report failed. Showing fallback data.', 'error');
                console.error('AI Report Error:', err);

                const modal = document.createElement('div');
                modal.className = 'modal-overlay active';
                modal.style.display = 'flex';
                modal.innerHTML = `
                    <div class="modal-panel" style="max-width: 700px; max-height: 80vh; overflow-y: auto;">
                        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                            <i class="fas fa-times"></i>
                        </button>
                        <h2><i class="fas fa-robot" style="color:var(--danger);"></i> AI Report - Error</h2>
                        <div style="margin: 16px 0; padding: 16px; background: var(--danger-light); border-radius: var(--radius); color: var(--danger-dark);">
                            <strong>Error:</strong> ${err.message}
                            <br><br>
                            <strong>Possible causes:</strong>
                            <ul style="margin-top: 8px; padding-left: 20px;">
                                <li>Gemini API key not configured in .env</li>
                                <li>Invalid API key</li>
                                <li>API quota exceeded</li>
                                <li>Network connectivity issues</li>
                            </ul>
                        </div>
                        <div style="background: var(--gray-50); padding: 20px; border-radius: var(--radius); font-size: 0.9rem; line-height: 1.6;">
                            <h4>💡 Quick Fix:</h4>
                            <p>1. Check your <code>.env</code> file has <code>gemini_api_key=your_key</code></p>
                            <p>2. Restart the backend: <code>sudo systemctl restart emtms</code></p>
                            <p>3. Check logs: <code>sudo journalctl -u emtms -f</code></p>
                        </div>
                        <div style="margin-top: 16px;">
                            <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">
                                Close
                            </button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);

                modal.addEventListener('click', function(e) {
                    if (e.target === this) this.remove();
                });
            }
        }

        function copyReportToClipboard(btn) {
            const reportContent = btn.closest('.modal-panel').querySelector('div[style*="white-space: pre-wrap"]');
            if (reportContent) {
                const text = reportContent.textContent;
                navigator.clipboard.writeText(text).then(() => {
                    showToast('Report copied to clipboard!', 'success');
                }).catch(() => {
                    // Fallback
                    const range = document.createRange();
                    range.selectNode(reportContent);
                    window.getSelection().removeAllRanges();
                    window.getSelection().addRange(range);
                    document.execCommand('copy');
                    showToast('Report copied!', 'success');
                });
            }
        }

        function downloadReportAsText(btn) {
            const reportContent = btn.closest('.modal-panel').querySelector('div[style*="white-space: pre-wrap"]');
            if (reportContent) {
                const text = reportContent.textContent;
                const blob = new Blob([text], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ai_report_${new Date().toISOString().slice(0,10)}.txt`;
                a.click();
                URL.revokeObjectURL(url);
                showToast('Report downloaded!', 'success');
            }
        }

        // ===== Settings =====
        async function loadProfile() {
            const resp = await fetch(`${API_BASE}/admin/profile`, { headers: { 'X-Session-Token': sessionToken } });
            const prof = await resp.json();
            document.getElementById('profileName').value = prof.full_name || '';
            document.getElementById('profileEmail').value = prof.email || '';
        }

        document.getElementById('profileForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const payload = { full_name: document.getElementById('profileName').value.trim(), email: document
                    .getElementById('profileEmail').value.trim() };
            const cp = document.getElementById('profileCurrentPassword').value;
            const np = document.getElementById('profileNewPassword').value;
            if (cp && np) { payload.current_password = cp;
                payload.new_password = np; } else if (cp || np) { showToast('Both passwords required.', 'error'); return; }
            const resp = await fetch(`${API_BASE}/admin/profile`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken },
                body: JSON.stringify(payload)
            });
            if (!resp.ok) { const d = await resp.json(); throw new Error(d.detail); }
            showToast('Profile updated!', 'success');
            document.getElementById('profileCurrentPassword').value = '';
            document.getElementById('profileNewPassword').value = '';
        });

        // ===== Search =====
        document.getElementById('searchInput').addEventListener('input', function() {
            const q = this.value.toLowerCase();
            document.querySelectorAll('#ticketsBody tr').forEach(r => { if (!r.querySelector('td[colspan]')) r.style
                    .display = r.textContent.toLowerCase().includes(q) ? '' : 'none'; });
            document.querySelectorAll('.ticket-card').forEach(c => c.style.display = c.textContent.toLowerCase().includes(
                q) ? '' : 'none');
        });

        // ===== Init =====
        fetchTickets({});
        setInterval(() => { if (currentSection === 'tickets') applyFilters(); }, 30000);
        document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeAssignModal();
                closeWorkerModal();
                confirmModal.classList.remove('active'); } });
        document.querySelectorAll('.sidebar-nav a').forEach(l => l.addEventListener('click', () => { if (window.innerWidth <=
                768) { sidebar.classList.remove('open');
                overlay.classList.remove('active'); } }));
