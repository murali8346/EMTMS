        // ===== Logo fallback =====
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

        function getImageUrl(imagePath) {
            if (!imagePath) return null;
            if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
                return imagePath;
            }
            if (window.location.hostname.includes('muralikorikana.com')) {
                return imagePath;
            }
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                return `http://localhost:8000${imagePath}`;
            }
            return imagePath;
        }

        const API_BASE = getApiBase();
        console.log('API_BASE:', API_BASE);

        // ===== Session Check =====
        const sessionToken = localStorage.getItem('session_token');
        const role = localStorage.getItem('role');
        const userName = localStorage.getItem('full_name') || 'User';

        if (!sessionToken) {
            window.location.href = '/login.html';
        }

        // Display user role
        document.getElementById('userRoleDisplay').textContent = role === 'ADMIN' ? '🔑 Admin' : '👤 ' + userName;

        // ===== Logout =====
        document.getElementById('logoutBtn').addEventListener('click', function(e) {
            e.preventDefault();
            localStorage.clear();
            window.location.href = '/login.html';
        });

        // ===== Get Ticket ID =====
        const urlParams = new URLSearchParams(window.location.search);
        const ticketId = urlParams.get('id');

        if (!ticketId) {
            window.location.href = '/dashboard.html';
        }

        let currentTicket = null;
        let messageInterval = null;

        // ===== Fetch Ticket Details =====
        async function fetchTicketDetails() {
            try {
                const response = await fetch(`${API_BASE}/ticket/${ticketId}`, {
                    headers: {
                        'X-Session-Token': sessionToken,
                    },
                });

                if (!response.ok) {
                    if (response.status === 401) {
                        localStorage.clear();
                        window.location.href = '/login.html';
                        return;
                    }
                    throw new Error('Failed to fetch ticket details');
                }

                currentTicket = await response.json();
                renderTicket(currentTicket);
                await fetchMessages();

            } catch (error) {
                document.getElementById('ticketContent').innerHTML = `
                    <div class="ticket-card">
                        <p style="color:#dc2626;text-align:center;padding:30px 0;font-weight:500;">
                            ❌ Error loading ticket: ${error.message}
                        </p>
                        <div style="text-align:center;margin-top:12px;">
                            <a href="/dashboard.html" class="btn btn-primary btn-sm">Go to Dashboard</a>
                        </div>
                    </div>
                `;
            }
        }

        // ===== Render Ticket =====
        function renderTicket(ticket) {
            const statusClass = ticket.status.toLowerCase().replace(' ', '-');
            const imageUrl = getImageUrl(ticket.image);
            const isAdmin = role === 'ADMIN';

            // Priority labels
            const priorityColors = {
                'Low': '#059669',
                'Medium': '#2563eb',
                'High': '#d97706',
                'Urgent': '#dc2626'
            };
            const priorityBg = {
                'Low': '#d1fae5',
                'Medium': '#dbeafe',
                'High': '#fef3c7',
                'Urgent': '#fee2e2'
            };

            document.getElementById('ticketContent').innerHTML = `
                <div class="ticket-card">
                    <div class="ticket-header">
                        <div>
                            <h1>${ticket.ticket_number}</h1>
                            <div class="subtitle">
                                Created by: <strong>${ticket.user_name || 'Unknown User'}</strong>
                                ${ticket.user_department ? ' • ' + ticket.user_department : ''}
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <span class="ticket-status status-${statusClass}">${ticket.status}</span>
                            <span style="padding:4px 12px;border-radius:12px;font-size:0.7rem;font-weight:600;background:${priorityBg[ticket.priority] || '#e5e7eb'};color:${priorityColors[ticket.priority] || '#4b5563'};">
                                ${ticket.priority}
                            </span>
                        </div>
                    </div>

                    <div class="ticket-meta-grid">
                        <div class="meta-item">
                            <span class="label">Block</span>
                            <span class="value">${ticket.block}</span>
                        </div>
                        <div class="meta-item">
                            <span class="label">Room Number</span>
                            <span class="value">${ticket.room_number}</span>
                        </div>
                        <div class="meta-item">
                            <span class="label">Fault Type</span>
                            <span class="value">${ticket.fault_type}</span>
                        </div>
                        <div class="meta-item">
                            <span class="label">Created</span>
                            <span class="value">${new Date(ticket.created_at).toLocaleString()}</span>
                        </div>
                        <div class="meta-item">
                            <span class="label">Last Updated</span>
                            <span class="value">${new Date(ticket.updated_at).toLocaleString()}</span>
                        </div>
                        ${ticket.assigned_worker_name ? `
                        <div class="meta-item">
                            <span class="label">Assigned To</span>
                            <span class="value">${ticket.assigned_worker_name} ${ticket.assigned_worker_phone ? '📞 ' + ticket.assigned_worker_phone : ''}</span>
                        </div>
                        ` : ''}
                        ${ticket.assigned_at ? `
                        <div class="meta-item">
                            <span class="label">Assigned At</span>
                            <span class="value">${new Date(ticket.assigned_at).toLocaleString()}</span>
                        </div>
                        ` : ''}
                        <div class="meta-item">
                            <span class="label">HOD Approval</span>
                            <span class="value">${ticket.hod_approval ? '✅ Approved' : '—'}</span>
                        </div>
                    </div>

                    ${ticket.description ? `
                        <div class="ticket-description">
                            <strong>📝 Description</strong>
                            ${ticket.description}
                        </div>
                    ` : ''}

                    ${imageUrl ? `
                        <div class="ticket-image">
                            <img src="${imageUrl}" alt="Ticket image" onerror="this.style.display='none'" />
                        </div>
                    ` : ''}

                    ${isAdmin ? `
                        <div class="admin-actions">
                            <button class="btn btn-primary btn-sm" onclick="updateStatus('${ticket.ticket_id}')">
                                🔄 Update Status
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="deleteTicket('${ticket.ticket_id}')">
                                🗑️ Delete Ticket
                            </button>
                            <button class="btn btn-success btn-sm" onclick="assignWorker('${ticket.ticket_id}')">
                                👷 Assign Worker
                            </button>
                        </div>
                    ` : ''}
                </div>

                <!-- Chat Section -->
                <div class="chat-section">
                    <div class="chat-header">
                        <h3>
                            💬 Conversation
                            <span class="badge" id="messageCount">0</span>
                        </h3>
                        <span style="font-size:0.75rem;color:var(--text-light);">
                            ${isAdmin ? '🔵 Replying as Admin' : '🟢 Replying as User'}
                        </span>
                    </div>
                    <div class="chat-messages" id="chatMessages">
                        <div class="empty-chat">
                            <div class="icon">💬</div>
                            <p>No messages yet. Start the conversation!</p>
                        </div>
                    </div>
                    <div class="chat-input-area">
                        <textarea id="messageInput" placeholder="Type your message..." rows="1"></textarea>
                        <button class="btn-send" id="sendBtn" onclick="sendMessage()">Send</button>
                    </div>
                </div>
            `;

            // Auto-resize textarea
            const textarea = document.getElementById('messageInput');
            if (textarea) {
                textarea.addEventListener('input', function() {
                    this.style.height = 'auto';
                    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
                });

                textarea.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                    }
                });
                textarea.focus();
            }
        }

        // ===== Messages =====
        async function fetchMessages() {
            try {
                const response = await fetch(`${API_BASE}/ticket/${ticketId}/messages`, {
                    headers: {
                        'X-Session-Token': sessionToken,
                    },
                });

                if (!response.ok) {
                    throw new Error('Failed to fetch messages');
                }

                const messages = await response.json();
                renderMessages(messages);

                const countEl = document.getElementById('messageCount');
                if (countEl) {
                    countEl.textContent = messages.length;
                }

            } catch (error) {
                console.error('Error fetching messages:', error);
            }
        }

        function renderMessages(messages) {
            const container = document.getElementById('chatMessages');
            if (!container) return;

            if (messages.length === 0) {
                container.innerHTML = `
                    <div class="empty-chat">
                        <div class="icon">💬</div>
                        <p>No messages yet. Start the conversation!</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = messages.map(msg => {
                const isAdmin = msg.is_admin;
                const senderName = msg.user_name || (isAdmin ? 'Admin' : 'User');
                const avatar = senderName.charAt(0).toUpperCase();
                const time = new Date(msg.created_at).toLocaleString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    month: 'short',
                    day: 'numeric'
                });

                return `
                    <div class="message message-${isAdmin ? 'admin' : 'user'}">
                        <div class="message-wrapper">
                            <div class="message-avatar">${avatar}</div>
                            <div class="message-content">
                                <div class="message-bubble">${escapeHtml(msg.message)}</div>
                                <div class="message-meta">
                                    <span>${senderName}</span>
                                    <span>•</span>
                                    <span>${time}</span>
                                    ${isAdmin ? '<span>🔵 Admin</span>' : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            container.scrollTop = container.scrollHeight;
        }

        async function sendMessage() {
            const input = document.getElementById('messageInput');
            const btn = document.getElementById('sendBtn');
            const message = input.value.trim();

            if (!message) return;

            btn.disabled = true;
            btn.textContent = 'Sending...';

            try {
                const response = await fetch(`${API_BASE}/ticket/${ticketId}/messages`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Session-Token': sessionToken,
                    },
                    body: JSON.stringify({ message }),
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.detail || 'Failed to send message');
                }

                input.value = '';
                input.style.height = 'auto';
                await fetchMessages();

            } catch (error) {
                alert('❌ Error sending message: ' + error.message);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Send';
                input.focus();
            }
        }

        // ===== Helper =====
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // ===== Admin Functions =====
        async function updateStatus(ticketId) {
            const statuses = ['Pending', 'Assigned', 'In Progress', 'Completed', 'Cancelled', 'Closed'];
            const status = prompt('Enter new status:\n' + statuses.join(', '));
            if (!status) return;

            if (!statuses.includes(status)) {
                alert('Invalid status. Please choose from: ' + statuses.join(', '));
                return;
            }

            try {
                const response = await fetch(`${API_BASE}/admin/ticket/${ticketId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Session-Token': sessionToken,
                    },
                    body: JSON.stringify({ status }),
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.detail || 'Update failed');
                }

                alert('✅ Ticket status updated to ' + status + '!');
                fetchTicketDetails();

            } catch (error) {
                alert('❌ Error: ' + error.message);
            }
        }

        async function assignWorker(ticketId) {
            const workerEmail = prompt('Enter worker email to assign:');
            if (!workerEmail) return;

            try {
                const response = await fetch(`${API_BASE}/admin/ticket/${ticketId}/assign`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Session-Token': sessionToken,
                    },
                    body: JSON.stringify({ worker_email: workerEmail }),
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.detail || 'Assignment failed');
                }

                alert('✅ Worker assigned successfully!');
                fetchTicketDetails();

            } catch (error) {
                alert('❌ Error: ' + error.message);
            }
        }

        async function deleteTicket(ticketId) {
            if (!confirm('⚠️ Are you sure you want to delete this ticket? This action cannot be undone.')) return;

            try {
                const response = await fetch(`${API_BASE}/admin/ticket/${ticketId}`, {
                    method: 'DELETE',
                    headers: {
                        'X-Session-Token': sessionToken,
                    },
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.detail || 'Delete failed');
                }

                alert('✅ Ticket deleted successfully!');
                window.location.href = '/dashboard.html';

            } catch (error) {
                alert('❌ Error: ' + error.message);
            }
        }

        // ===== Auto-Refresh =====
        function startAutoRefresh() {
            if (messageInterval) clearInterval(messageInterval);
            messageInterval = setInterval(fetchMessages, 10000);
        }

        // ===== Init =====
        fetchTicketDetails();
        startAutoRefresh();

        window.addEventListener('beforeunload', function() {
            if (messageInterval) clearInterval(messageInterval);
        });

        console.log('EMTMS Ticket Details - Professional & PWA ready');
    