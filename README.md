# EMTMS — Electrical Maintenance Ticket Management System

EMTMS is a web-based maintenance ticket management system designed for institutional environments such as colleges, universities, and organizations.

It replaces informal maintenance reporting through phone calls, messages, and word-of-mouth with a centralized digital workflow for reporting, assigning, tracking, resolving, and reviewing maintenance issues.

## Overview

EMTMS helps maintenance departments maintain structured records of:

- Reported electrical and facility issues
- Block and room locations
- Assigned maintenance personnel
- Ticket priority and status
- Resolution details
- Ticket conversations and updates
- Historical maintenance activity
- Maintenance statistics and analytics

The system provides separate workflows for regular users and administrators.

## Features

### Ticket Management

- Create maintenance tickets through a structured form
- Record block, room, fault type, and issue description
- Select ticket priority
- Upload optional images of the issue
- Track tickets through different status stages
- View ticket details and resolution history
- Add messages and updates to tickets
- Close completed tickets

### User Features

- Register and log in
- Report maintenance issues
- View personally created tickets
- Track ticket progress
- View ticket conversations
- Close completed tickets after verification

### Admin Features

- View and manage all maintenance tickets
- Filter tickets by status, block, and fault type
- Assign workers to tickets
- Update ticket status and priority
- Add assignment notes
- Manage the maintenance worker roster
- View ticket statistics and analytics
- Export maintenance data in JSON and CSV formats
- Generate structured or AI-assisted reports
- Manage the administrator profile

### Worker Records

Administrators can maintain worker information, including:

- Name
- Contact information
- Specialization
- Active or inactive status

### Analytics

The admin dashboard includes maintenance analytics such as:

- Ticket status distribution
- Priority distribution
- Block-wise ticket breakdown
- Department-wise ticket breakdown
- Fault-type distribution
- Worker assignment and completion statistics
- Average resolution time
- Ticket trends over selected date ranges

### Optional AI Reports

EMTMS can optionally use Google Gemini to generate administrative maintenance reports.

If the Gemini API is not configured, the system falls back to a structured data-based report.

## Ticket Workflow

```text
User reports an issue
        ↓
Ticket created
        ↓
Admin reviews the ticket
        ↓
Worker assigned
        ↓
Work in progress
        ↓
Work completed
        ↓
User verifies and closes the ticket
        ↓
Historical record retained
```

System messages are recorded during important ticket transitions to maintain a useful activity history.

## Technology Stack

| Layer | Technology |
|---|---|
| Backend | Python, FastAPI |
| ASGI Server | Uvicorn |
| ORM | SQLAlchemy |
| Database | MySQL |
| Database Driver | PyMySQL |
| Authentication | Session tokens |
| Password Security | PBKDF2-HMAC-SHA256 |
| Frontend | HTML, CSS, Vanilla JavaScript |
| Charts | Chart.js |
| Validation | Pydantic |
| Configuration | python-dotenv |
| File Uploads | python-multipart |
| Optional AI | Google Gemini |
| Deployment | Docker and Docker Compose |

## Project Structure

```text
EMTMS/
├── backend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── main.py
│   ├── requirements.txt
│   └── uploads/
│       └── .gitkeep
│
├── frontend/
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── dashboard.html
│   ├── admin.html
│   └── ticket-detail.html
│
├── .env.example
├── .gitignore
├── docker-compose.yml
├── LICENSE
├── README.md
└── logo.jpg
```

## Requirements

### Recommended

- Docker
- Docker Compose
- Git

### Optional Bare-Metal Setup

- Python 3.12 or later
- MySQL
- pip

## Installation

Clone the repository:

```bash
git clone <your-repository-url>
cd EMTMS
```

## Configuration

Create a local environment file from the example:

```bash
cp .env.example .env
```

Open `.env` and configure the required values.

Example configuration:

```env
DB_HOST=mysql
DB_PORT=3306
DB_NAME=emtms_db
DB_USER=emtms_user
DB_PASSWORD=your_database_password

MYSQL_ROOT_PASSWORD=your_mysql_root_password

GEMINI_API_KEY=
```

Do not commit `.env` or any file containing real credentials, API keys, or passwords.

For local non-Docker development, the backend can use a separate `backend/.env` file.

## Running with Docker Compose

Build and start the application:

```bash
docker compose up -d --build
```

This starts:

- MySQL database container
- FastAPI backend container
- Persistent database storage
- Persistent uploaded-file storage

The backend is available at:

```text
http://localhost:8000
```

Check the backend health endpoint:

```text
http://localhost:8000/health
```

View backend logs:

```bash
docker compose logs -f backend
```

View database logs:

```bash
docker compose logs -f mysql
```

Stop the application:

```bash
docker compose down
```

## Accessing the Frontend

The frontend pages are located in the `frontend/` directory.

| Page | File |
|---|---|
| Home | `frontend/index.html` |
| Login | `frontend/login.html` |
| Registration | `frontend/register.html` |
| User Dashboard | `frontend/dashboard.html` |
| Admin Dashboard | `frontend/admin.html` |
| Ticket Details | `frontend/ticket-detail.html` |

The frontend automatically determines the API base URL based on the environment in which it is served.

For production deployment, serve the frontend through a static file server such as Nginx or Caddy and proxy the backend routes to the FastAPI application.

## Database Initialization

The application creates the required database tables automatically during startup.

Initial application data may include:

- An administrator account configured for the deployment
- Sample maintenance workers

For production deployments, configure secure credentials and change any initial account password immediately after the first login.

Database dumps and production database files should not be committed to this repository.

## API Overview

The backend provides endpoints for:

- User registration
- User login and logout
- Session verification
- Ticket creation
- Ticket listing
- Ticket details
- Ticket closure
- Ticket messages
- Administrative ticket management
- Worker management
- Dashboard statistics
- Analytics and exports
- AI-assisted reports
- Administrator profile management
- Health checks

Protected requests use a server-issued session token.

## File Uploads

Uploaded ticket images are stored in the backend upload directory.

The upload directory is intended to be persistent when running with Docker Compose.

Actual uploaded files are excluded from Git using `.gitignore`. Only the `.gitkeep` file is included to preserve the directory structure.

## Security Notes

- Never commit `.env` files.
- Never commit database credentials.
- Never commit API keys or private keys.
- Never commit production database dumps.
- Never commit real uploaded user files.
- Use strong database and administrator passwords.
- Change initial administrator credentials before production use.
- Review access permissions before deploying the system publicly.

## Future Improvements

Possible future enhancements include:

- Email and WhatsApp notifications
- Worker-specific mobile interface
- SLA tracking
- Automated escalation of urgent tickets
- Advanced analytics and forecasting
- OAuth2 or JWT authentication
- External object storage for uploaded images
- Dedicated audit-log tables
- Preventive maintenance scheduling
- Full-text search
- Role-based permissions with more granular access control

## License

This project is licensed under the MIT License.

See the [LICENSE](LICENSE) file for details.