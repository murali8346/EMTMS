"""
Electrical Maintenance Ticket Management System (EMTMS) - Complete
WhatsApp-style ticketing with assignment, closing, worker management, analytics, and AI reports
FIXED: Login issues, session management, error handling
"""

import os
import uuid
import hashlib
from datetime import datetime, timedelta
from typing import Optional, List
from urllib.parse import quote_plus

from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field, field_validator, ConfigDict
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Enum, Text, ForeignKey, Boolean, text, desc, func
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship
import shutil
from fastapi.responses import Response, JSONResponse
import csv
from io import StringIO
import logging
import json

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import the new Gemini package
try:
    from google import genai
    from google.genai import types
    GENAI_AVAILABLE = True
    logger.info("✅ google.genai imported successfully")
except ImportError:
    GENAI_AVAILABLE = False
    logger.warning("⚠️ google.genai not installed. Install with: pip install google-genai")
    genai = None

load_dotenv()

# ================================
# Database Configuration
# ================================
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_NAME = os.getenv("DB_NAME", "emtms_db")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")

DATABASE_URL = f"mysql+pymysql://{DB_USER}:{quote_plus(DB_PASSWORD)}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ================================
# Security
# ================================
def get_password_hash(password: str) -> str:
    salt = os.urandom(32)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return salt.hex() + ':' + key.hex()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        salt_hex, key_hex = hashed_password.split(':')
        salt = bytes.fromhex(salt_hex)
        key = bytes.fromhex(key_hex)
        new_key = hashlib.pbkdf2_hmac('sha256', plain_password.encode('utf-8'), salt, 100000)
        return key == new_key
    except:
        return False

# Session storage with expiration
active_sessions = {}
session_expiry = {}

def cleanup_expired_sessions():
    """Remove expired sessions"""
    current_time = datetime.utcnow()
    expired = [uid for uid, expiry in session_expiry.items() if expiry < current_time]
    for uid in expired:
        if uid in active_sessions:
            del active_sessions[uid]
        if uid in session_expiry:
            del session_expiry[uid]

def generate_session_token() -> str:
    return str(uuid.uuid4())

def validate_session_token(session_token: str) -> Optional[int]:
    """Validate session token and return user_id if valid"""
    cleanup_expired_sessions()
    for uid, token in active_sessions.items():
        if token == session_token:
            return uid
    return None

# ================================
# Models
# ================================

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    department = Column(String(100), nullable=False)
    mobile_number = Column(String(15), nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(Enum("USER", "ADMIN"), default="USER", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Worker(Base):
    __tablename__ = "workers"
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    phone = Column(String(15), nullable=False)
    specialization = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Ticket(Base):
    __tablename__ = "tickets"
    id = Column(Integer, primary_key=True, index=True)
    ticket_number = Column(String(50), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    block = Column(String(50), nullable=False)
    room_number = Column(String(50), nullable=False)
    fault_type = Column(String(50), nullable=False)
    description = Column(Text, nullable=True)
    image = Column(String(255), nullable=True)
    hod_approval = Column(Boolean, default=False, nullable=False)
    
    # Assignment fields
    assigned_worker_id = Column(Integer, ForeignKey("workers.id"), nullable=True)
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_at = Column(DateTime, nullable=True)
    assignment_notes = Column(Text, nullable=True)
    
    status = Column(Enum("Pending", "Assigned", "In Progress", "Completed", "Cancelled", "Closed"), 
                    default="Pending", nullable=False)
    priority = Column(Enum("Low", "Medium", "High", "Urgent"), default="Medium", nullable=False)
    
    # Completion & Closing
    completed_at = Column(DateTime, nullable=True)
    closed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    closed_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class TicketMessage(Base):
    __tablename__ = "ticket_messages"
    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message = Column(Text, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    is_system = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


# ================================
# Pydantic Schemas
# ================================

class UserCreate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    department: str = Field(..., min_length=1, max_length=100)
    mobile_number: str = Field(..., min_length=10, max_length=15)
    password: str = Field(..., min_length=4)
    
    @field_validator('email')
    def validate_email_domain(cls, v):
        if not v.endswith('@drmgrdu.ac.in') and not v.endswith('@drmgr.ac.in'):
            raise ValueError('Email must be from @drmgrdu.ac.in or @drmgr.ac.in')
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    email: str
    department: str
    mobile_number: str
    role: str
    created_at: datetime


class WorkerCreate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    phone: str = Field(..., min_length=10, max_length=15)
    specialization: Optional[str] = None


class WorkerUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, min_length=10, max_length=15)
    specialization: Optional[str] = None
    is_active: Optional[bool] = None


class WorkerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    email: str
    phone: str
    specialization: Optional[str]
    is_active: bool
    created_at: datetime


class TicketCreate(BaseModel):
    block: str = Field(..., pattern="^(ANNA|RA|VOC|MT|AK|Other)$")
    room_number: str = Field(..., min_length=1, max_length=50)
    fault_type: str = Field(..., pattern="^(LIGHT|FAN|AC|UPS|Other)$")
    description: Optional[str] = None
    hod_approval: bool = False
    priority: str = Field("Medium", pattern="^(Low|Medium|High|Urgent)$")


class TicketResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ticket_number: str
    user_id: int
    block: str
    room_number: str
    fault_type: str
    description: Optional[str]
    image: Optional[str]
    hod_approval: bool
    status: str
    priority: str
    created_at: datetime
    updated_at: datetime
    user_name: Optional[str] = None
    user_department: Optional[str] = None
    user_email: Optional[str] = None
    user_mobile: Optional[str] = None
    assigned_worker_id: Optional[int] = None
    assigned_worker_name: Optional[str] = None
    assigned_worker_phone: Optional[str] = None
    assignment_notes: Optional[str] = None
    assigned_by_name: Optional[str] = None
    assigned_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    message_count: Optional[int] = 0


class TicketUpdate(BaseModel):
    status: Optional[str] = Field(None, pattern="^(Pending|Assigned|In Progress|Completed|Cancelled|Closed)$")
    priority: Optional[str] = Field(None, pattern="^(Low|Medium|High|Urgent)$")
    hod_approval: Optional[bool] = None
    assigned_worker_id: Optional[int] = None
    assignment_notes: Optional[str] = None


class MessageCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ticket_id: int
    user_id: int
    message: str
    is_admin: bool
    is_system: bool
    created_at: datetime
    user_name: Optional[str] = None


class LoginResponse(BaseModel):
    user_id: int
    full_name: str
    email: str
    role: str
    department: str
    mobile_number: str
    session_token: str
    message: str = "Login successful"


class LogoutResponse(BaseModel):
    message: str = "Logged out successfully"


class AdminProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = Field(None, min_length=4)


class AdminProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    email: str
    department: str
    mobile_number: str
    role: str
    created_at: datetime


# ================================
# FastAPI App
# ================================
app = FastAPI(
    title="EMTMS - WhatsApp Style Ticketing",
    description="Complete ticket management system with worker assignment, analytics, and AI reporting",
    version="2.1.0"
)

# Enhanced CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Create uploads directory
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ================================
# Helper Functions
# ================================
def generate_ticket_number() -> str:
    date_part = datetime.utcnow().strftime("%Y%m%d")
    random_part = str(uuid.uuid4())[:6].upper()
    return f"TKT-{date_part}-{random_part}"

def get_current_user(
    session_token: Optional[str] = Header(None, alias="X-Session-Token"),
    db: Session = Depends(get_db)
) -> User:
    """Get current user from session token with better error handling"""
    if not session_token:
        raise HTTPException(status_code=401, detail="Session token required")
    
    cleanup_expired_sessions()
    
    # Find user_id from session token
    user_id = None
    for uid, token in active_sessions.items():
        if token == session_token:
            user_id = uid
            break
    
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    
    # Refresh session expiry
    session_expiry[user_id] = datetime.utcnow() + timedelta(hours=24)
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return user


def get_ticket_dict(ticket):
    """Helper to convert SQLAlchemy Ticket to dict safely"""
    return {
        column.name: getattr(ticket, column.name)
        for column in Ticket.__table__.columns
    }


# ================================
# Gemini AI Configuration
# ================================
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
gemini_client = None
gemini_model_name = None

if GEMINI_API_KEY and GENAI_AVAILABLE:
    try:
        gemini_client = genai.Client(api_key=GEMINI_API_KEY)
        
        model_names = [
            'gemini-1.5-flash',
            'gemini-1.5-pro',
            'gemini-2.0-flash-exp',
        ]
        
        for model_name in model_names:
            try:
                response = gemini_client.models.generate_content(
                    model=model_name,
                    contents="Test connection"
                )
                if response and response.text:
                    gemini_model_name = model_name
                    logger.info(f"✅ Gemini AI configured with model: {model_name}")
                    break
            except Exception as e:
                logger.warning(f"⚠️ Model {model_name} failed: {str(e)}")
                continue
        
        if not gemini_model_name:
            logger.error("❌ Failed to initialize any Gemini model")
            
    except Exception as e:
        logger.error(f"❌ Gemini AI configuration error: {str(e)}")
        gemini_client = None
        gemini_model_name = None


@app.on_event("startup")
async def startup_event():
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Database tables created/verified")
        
        db = SessionLocal()
        try:
            # Create default admin
            admin = db.query(User).filter(User.email == "admin@drmgrdu.ac.in").first()
            if not admin:
                admin_user = User(
                    full_name="System Admin",
                    email="admin@drmgrdu.ac.in",
                    department="Administration",
                    mobile_number="9999999999",
                    password=get_password_hash("admin123"),
                    role="ADMIN"
                )
                db.add(admin_user)
                db.commit()
                logger.info("✅ Default admin created: admin@drmgrdu.ac.in / admin123")
            
            # Create sample workers
            if db.query(Worker).count() == 0:
                workers = [
                    Worker(full_name="Rajesh Kumar", email="rajesh@drmgrdu.ac.in", phone="9876543210", specialization="Electrical"),
                    Worker(full_name="Priya Sharma", email="priya@drmgrdu.ac.in", phone="9876543211", specialization="AC & Refrigeration"),
                    Worker(full_name="Suresh Babu", email="suresh@drmgrdu.ac.in", phone="9876543212", specialization="Plumbing"),
                    Worker(full_name="Lakshmi Narayanan", email="lakshmi@drmgrdu.ac.in", phone="9876543213", specialization="General Maintenance"),
                ]
                db.add_all(workers)
                db.commit()
                logger.info("✅ Sample workers created")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"❌ Startup error: {str(e)}")


# ================================
# FIXED: User APIs with Better Error Handling
# ================================
@app.post("/register", response_model=UserResponse, status_code=201)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    try:
        existing = db.query(User).filter(User.email == user_data.email).first()
        if existing:
            raise HTTPException(400, "Email already registered")
        
        hashed = get_password_hash(user_data.password)
        new_user = User(
            full_name=user_data.full_name,
            email=user_data.email,
            department=user_data.department,
            mobile_number=user_data.mobile_number,
            password=hashed,
            role="USER"
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return new_user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(500, f"Registration failed: {str(e)}")


@app.post("/login", response_model=LoginResponse)
async def login(login_data: UserLogin, db: Session = Depends(get_db)):
    """
    FIXED: Login endpoint with proper error handling and session management
    """
    try:
        logger.info(f"Login attempt for email: {login_data.email}")
        
        # Find user by email
        user = db.query(User).filter(User.email == login_data.email).first()
        if not user:
            logger.warning(f"User not found: {login_data.email}")
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        # Verify password
        if not verify_password(login_data.password, user.password):
            logger.warning(f"Invalid password for user: {login_data.email}")
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        # Generate session token
        session_token = generate_session_token()
        
        # Store session with expiry
        active_sessions[user.id] = session_token
        session_expiry[user.id] = datetime.utcnow() + timedelta(hours=24)
        
        logger.info(f"✅ Login successful for user: {user.email} (ID: {user.id})")
        
        # Return successful response
        return LoginResponse(
            user_id=user.id,
            full_name=user.full_name,
            email=user.email,
            role=user.role,
            department=user.department,
            mobile_number=user.mobile_number,
            session_token=session_token,
            message="Login successful"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error for {login_data.email}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")


@app.post("/logout", response_model=LogoutResponse)
async def logout(current_user: User = Depends(get_current_user)):
    try:
        if current_user.id in active_sessions:
            del active_sessions[current_user.id]
        if current_user.id in session_expiry:
            del session_expiry[current_user.id]
        logger.info(f"✅ User logged out: {current_user.email}")
        return LogoutResponse(message="Logged out successfully")
    except Exception as e:
        logger.error(f"Logout error: {str(e)}")
        raise HTTPException(500, f"Logout failed: {str(e)}")


@app.get("/verify-session")
async def verify_session(current_user: User = Depends(get_current_user)):
    """
    FIXED: Endpoint to verify if session is still valid
    """
    try:
        return {
            "valid": True,
            "user_id": current_user.id,
            "full_name": current_user.full_name,
            "email": current_user.email,
            "role": current_user.role
        }
    except HTTPException:
        return {"valid": False, "message": "Session expired or invalid"}
    except Exception as e:
        logger.error(f"Session verification error: {str(e)}")
        return {"valid": False, "message": "Error verifying session"}


# ================================
# Worker APIs (CRUD)
# ================================
@app.get("/workers", response_model=List[WorkerResponse])
async def get_workers(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "ADMIN":
        raise HTTPException(403, "Admin access required")
    workers = db.query(Worker).filter(Worker.is_active == True).all()
    return workers


@app.post("/workers", response_model=WorkerResponse, status_code=201)
async def create_worker(
    worker_data: WorkerCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "ADMIN":
        raise HTTPException(403, "Admin access required")
    existing = db.query(Worker).filter(Worker.email == worker_data.email).first()
    if existing:
        raise HTTPException(400, "Worker with this email already exists")
    worker = Worker(
        full_name=worker_data.full_name,
        email=worker_data.email,
        phone=worker_data.phone,
        specialization=worker_data.specialization
    )
    db.add(worker)
    db.commit()
    db.refresh(worker)
    return worker


@app.put("/workers/{worker_id}", response_model=WorkerResponse)
async def update_worker(
    worker_id: int,
    worker_data: WorkerUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "ADMIN":
        raise HTTPException(403, "Admin access required")
    
    worker = db.query(Worker).filter(Worker.id == worker_id).first()
    if not worker:
        raise HTTPException(404, "Worker not found")
    
    if worker_data.full_name is not None:
        worker.full_name = worker_data.full_name
    if worker_data.email is not None:
        existing = db.query(Worker).filter(Worker.email == worker_data.email, Worker.id != worker_id).first()
        if existing:
            raise HTTPException(400, "Email already in use by another worker")
        worker.email = worker_data.email
    if worker_data.phone is not None:
        worker.phone = worker_data.phone
    if worker_data.specialization is not None:
        worker.specialization = worker_data.specialization
    if worker_data.is_active is not None:
        worker.is_active = worker_data.is_active
    
    db.commit()
    db.refresh(worker)
    return worker


@app.delete("/workers/{worker_id}", status_code=204)
async def delete_worker(
    worker_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "ADMIN":
        raise HTTPException(403, "Admin access required")
    
    worker = db.query(Worker).filter(Worker.id == worker_id).first()
    if not worker:
        raise HTTPException(404, "Worker not found")
    
    active_tickets = db.query(Ticket).filter(
        Ticket.assigned_worker_id == worker_id,
        Ticket.status.in_(["Pending", "Assigned", "In Progress"])
    ).count()
    if active_tickets > 0:
        raise HTTPException(400, f"Cannot deactivate worker: assigned to {active_tickets} active ticket(s)")
    
    worker.is_active = False
    db.commit()
    return None


# ================================
# Ticket APIs
# ================================
@app.post("/ticket", response_model=TicketResponse, status_code=201)
async def create_ticket(
    block: str = Form(...),
    room_number: str = Form(...),
    fault_type: str = Form(...),
    hod_approval: bool = Form(False),
    description: Optional[str] = Form(None),
    priority: str = Form("Medium"),
    image: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    image_path = None
    if image and image.filename:
        ext = os.path.splitext(image.filename)[1]
        filename = f"ticket_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}{ext}"
        file_path = os.path.join("uploads", filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        image_path = f"/uploads/{filename}"
    
    ticket = Ticket(
        ticket_number=generate_ticket_number(),
        user_id=current_user.id,
        block=block,
        room_number=room_number,
        fault_type=fault_type,
        description=description,
        image=image_path,
        hod_approval=hod_approval,
        priority=priority,
        status="Pending"
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    
    system_msg = f"🆕 Ticket {ticket.ticket_number} created successfully! Admin will review shortly."
    auto_msg = TicketMessage(
        ticket_id=ticket.id,
        user_id=current_user.id,
        message=system_msg,
        is_admin=False,
        is_system=True
    )
    db.add(auto_msg)
    db.commit()
    
    ticket_dict = get_ticket_dict(ticket)
    ticket_dict["user_name"] = current_user.full_name
    ticket_dict["user_department"] = current_user.department
    ticket_dict["user_email"] = current_user.email
    ticket_dict["user_mobile"] = current_user.mobile_number
    ticket_dict["message_count"] = 1
    
    return TicketResponse(**ticket_dict)


@app.get("/tickets", response_model=List[TicketResponse])
async def get_user_tickets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tickets = db.query(Ticket).filter(Ticket.user_id == current_user.id).order_by(desc(Ticket.created_at)).all()
    result = []
    for ticket in tickets:
        ticket_dict = get_ticket_dict(ticket)
        ticket_dict["user_name"] = current_user.full_name
        ticket_dict["user_department"] = current_user.department
        ticket_dict["user_email"] = current_user.email
        ticket_dict["user_mobile"] = current_user.mobile_number
        ticket_dict['message_count'] = db.query(TicketMessage).filter(TicketMessage.ticket_id == ticket.id).count()
        if ticket.assigned_worker_id:
            worker = db.query(Worker).filter(Worker.id == ticket.assigned_worker_id).first()
            if worker:
                ticket_dict['assigned_worker_name'] = worker.full_name
                ticket_dict['assigned_worker_phone'] = worker.phone
        result.append(TicketResponse(**ticket_dict))
    return result


@app.get("/ticket/{ticket_id}", response_model=TicketResponse)
async def get_ticket_details(
    ticket_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.user_id != current_user.id and current_user.role != "ADMIN":
        raise HTTPException(403, "Access denied")
    
    ticket_dict = get_ticket_dict(ticket)
    user = db.query(User).filter(User.id == ticket.user_id).first()
    if user:
        ticket_dict["user_name"] = user.full_name
        ticket_dict["user_department"] = user.department
        ticket_dict["user_email"] = user.email
        ticket_dict["user_mobile"] = user.mobile_number
    ticket_dict['message_count'] = db.query(TicketMessage).filter(TicketMessage.ticket_id == ticket.id).count()
    if ticket.assigned_worker_id:
        worker = db.query(Worker).filter(Worker.id == ticket.assigned_worker_id).first()
        if worker:
            ticket_dict['assigned_worker_name'] = worker.full_name
            ticket_dict['assigned_worker_phone'] = worker.phone
    if ticket.assigned_by:
        assigned_by_user = db.query(User).filter(User.id == ticket.assigned_by).first()
        if assigned_by_user:
            ticket_dict['assigned_by_name'] = assigned_by_user.full_name
    return TicketResponse(**ticket_dict)


@app.put("/ticket/{ticket_id}/close")
async def close_ticket(
    ticket_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.user_id != current_user.id:
        raise HTTPException(403, "Only the ticket owner can close this ticket")
    if ticket.status != "Completed":
        raise HTTPException(400, "Only completed tickets can be closed")
    
    ticket.status = "Closed"
    ticket.closed_by = current_user.id
    ticket.closed_at = datetime.utcnow()
    ticket.updated_at = datetime.utcnow()
    db.commit()
    
    msg = TicketMessage(
        ticket_id=ticket.id,
        user_id=current_user.id,
        message=f"🔒 Ticket #{ticket.ticket_number} has been closed by the user. Thank you for using EMTMS!",
        is_system=True
    )
    db.add(msg)
    db.commit()
    
    return {
        "message": "Ticket closed successfully",
        "ticket_id": ticket.id,
        "ticket_number": ticket.ticket_number,
        "status": "Closed"
    }


# ================================
# Message APIs
# ================================
@app.get("/ticket/{ticket_id}/messages", response_model=List[MessageResponse])
async def get_ticket_messages(
    ticket_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.user_id != current_user.id and current_user.role != "ADMIN":
        raise HTTPException(403, "Access denied")
    
    messages = db.query(TicketMessage).filter(TicketMessage.ticket_id == ticket_id).order_by(TicketMessage.created_at).all()
    result = []
    for msg in messages:
        user = db.query(User).filter(User.id == msg.user_id).first()
        result.append(MessageResponse(
            id=msg.id,
            ticket_id=msg.ticket_id,
            user_id=msg.user_id,
            message=msg.message,
            is_admin=msg.is_admin,
            is_system=msg.is_system,
            created_at=msg.created_at,
            user_name=user.full_name if user else "System"
        ))
    return result


@app.post("/ticket/{ticket_id}/messages", response_model=MessageResponse, status_code=201)
async def add_ticket_message(
    ticket_id: int,
    message_data: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.user_id != current_user.id and current_user.role != "ADMIN":
        raise HTTPException(403, "Access denied")
    
    is_admin = current_user.role == "ADMIN"
    message = TicketMessage(
        ticket_id=ticket_id,
        user_id=current_user.id,
        message=message_data.message,
        is_admin=is_admin,
        is_system=False
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    
    return MessageResponse(
        id=message.id,
        ticket_id=message.ticket_id,
        user_id=message.user_id,
        message=message.message,
        is_admin=message.is_admin,
        is_system=message.is_system,
        created_at=message.created_at,
        user_name=current_user.full_name
    )


# ================================
# Admin APIs
# ================================

@app.get("/admin/tickets", response_model=List[TicketResponse])
async def get_all_tickets(
    status_filter: Optional[str] = None,
    block_filter: Optional[str] = None,
    fault_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "ADMIN":
        raise HTTPException(403, "Admin access required")
    
    query = db.query(Ticket)
    if status_filter:
        query = query.filter(Ticket.status == status_filter)
    if block_filter:
        query = query.filter(Ticket.block == block_filter)
    if fault_filter:
        query = query.filter(Ticket.fault_type == fault_filter)
    
    tickets = query.order_by(desc(Ticket.created_at)).all()
    result = []
    for ticket in tickets:
        ticket_dict = get_ticket_dict(ticket)
        user = db.query(User).filter(User.id == ticket.user_id).first()
        if user:
            ticket_dict["user_name"] = user.full_name
            ticket_dict["user_department"] = user.department
            ticket_dict["user_email"] = user.email
            ticket_dict["user_mobile"] = user.mobile_number
        ticket_dict['message_count'] = db.query(TicketMessage).filter(TicketMessage.ticket_id == ticket.id).count()
        if ticket.assigned_worker_id:
            worker = db.query(Worker).filter(Worker.id == ticket.assigned_worker_id).first()
            if worker:
                ticket_dict['assigned_worker_name'] = worker.full_name
                ticket_dict['assigned_worker_phone'] = worker.phone
        result.append(TicketResponse(**ticket_dict))
    return result


@app.put("/admin/ticket/{ticket_id}", response_model=TicketResponse)
async def update_ticket(
    ticket_id: int,
    update_data: TicketUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "ADMIN":
        raise HTTPException(403, "Admin access required")
    
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    
    old_status = ticket.status
    old_worker_id = ticket.assigned_worker_id
    
    if update_data.assigned_worker_id is not None and update_data.assigned_worker_id != old_worker_id:
        worker = db.query(Worker).filter(Worker.id == update_data.assigned_worker_id).first()
        if not worker:
            raise HTTPException(404, "Worker not found")
        ticket.assigned_worker_id = worker.id
        ticket.assigned_by = current_user.id
        ticket.assigned_at = datetime.utcnow()
        
        if update_data.assignment_notes:
            ticket.assignment_notes = update_data.assignment_notes
        
        assign_msg = f"👨‍🔧 Assigned to: {worker.full_name}\n📞 Contact: {worker.phone}\n🔧 Specialization: {worker.specialization or 'General'}"
        if update_data.assignment_notes:
            assign_msg += f"\n📝 Notes: {update_data.assignment_notes}"
        system_msg = TicketMessage(
            ticket_id=ticket.id,
            user_id=current_user.id,
            message=assign_msg,
            is_admin=True,
            is_system=True
        )
        db.add(system_msg)
        db.commit()
    
    if update_data.status is not None:
        if update_data.status == "Completed" and not ticket.assigned_worker_id:
            raise HTTPException(400, "Cannot mark as completed. Please assign a worker first.")
        
        ticket.status = update_data.status
        status_messages = {
            "Assigned": "📋 Ticket has been assigned to a worker.",
            "In Progress": "🔧 Work has started on your ticket.",
            "Completed": "✅ Work completed! Please verify and close the ticket.",
            "Closed": "🔒 Ticket closed. Thank you for using EMTMS!",
            "Cancelled": "❌ Ticket has been cancelled."
        }
        if update_data.status in status_messages and update_data.status != old_status:
            system_msg = TicketMessage(
                ticket_id=ticket.id,
                user_id=current_user.id,
                message=status_messages[update_data.status],
                is_admin=True,
                is_system=True
            )
            db.add(system_msg)
            db.commit()
        
        if update_data.status == "Completed" and old_status != "Completed":
            ticket.completed_at = datetime.utcnow()
        if update_data.status == "Closed" and old_status != "Closed":
            ticket.closed_by = current_user.id
            ticket.closed_at = datetime.utcnow()
    
    if update_data.priority is not None:
        ticket.priority = update_data.priority
    if update_data.hod_approval is not None:
        ticket.hod_approval = update_data.hod_approval
    
    ticket.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(ticket)
    
    ticket_dict = get_ticket_dict(ticket)
    user = db.query(User).filter(User.id == ticket.user_id).first()
    if user:
        ticket_dict["user_name"] = user.full_name
        ticket_dict["user_department"] = user.department
        ticket_dict["user_email"] = user.email
        ticket_dict["user_mobile"] = user.mobile_number
    if ticket.assigned_worker_id:
        worker = db.query(Worker).filter(Worker.id == ticket.assigned_worker_id).first()
        if worker:
            ticket_dict['assigned_worker_name'] = worker.full_name
            ticket_dict['assigned_worker_phone'] = worker.phone
    ticket_dict['message_count'] = db.query(TicketMessage).filter(TicketMessage.ticket_id == ticket.id).count()
    return TicketResponse(**ticket_dict)


@app.delete("/admin/ticket/{ticket_id}", status_code=204)
async def delete_ticket(
    ticket_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "ADMIN":
        raise HTTPException(403, "Admin access required")
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.image:
        image_path = ticket.image.lstrip('/')
        if os.path.exists(image_path):
            os.remove(image_path)
    db.delete(ticket)
    db.commit()


# ================================
# Admin Profile
# ================================
@app.get("/admin/profile", response_model=AdminProfileResponse)
async def get_admin_profile(
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "ADMIN":
        raise HTTPException(403, "Admin access required")
    return current_user


@app.put("/admin/profile", response_model=AdminProfileResponse)
async def update_admin_profile(
    profile_data: AdminProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "ADMIN":
        raise HTTPException(403, "Admin access required")
    
    if profile_data.new_password:
        if not profile_data.current_password:
            raise HTTPException(400, "Current password is required to change password")
        if not verify_password(profile_data.current_password, current_user.password):
            raise HTTPException(400, "Current password is incorrect")
        current_user.password = get_password_hash(profile_data.new_password)
    
    if profile_data.full_name is not None:
        current_user.full_name = profile_data.full_name
    if profile_data.email is not None:
        existing = db.query(User).filter(User.email == profile_data.email, User.id != current_user.id).first()
        if existing:
            raise HTTPException(400, "Email already in use by another user")
        current_user.email = profile_data.email
    
    db.commit()
    db.refresh(current_user)
    return current_user


# ================================
# Filtered Stats & Analytics
# ================================

def apply_ticket_filters(query, status: Optional[str] = None, block: Optional[str] = None, fault: Optional[str] = None):
    if status:
        query = query.filter(Ticket.status == status)
    if block:
        query = query.filter(Ticket.block == block)
    if fault:
        query = query.filter(Ticket.fault_type == fault)
    return query


@app.get("/admin/stats")
async def get_admin_stats(
    status: Optional[str] = Query(None),
    block: Optional[str] = Query(None),
    fault: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "ADMIN":
        raise HTTPException(403, "Admin access required")
    
    base_query = db.query(Ticket)
    base_query = apply_ticket_filters(base_query, status, block, fault)
    
    total = base_query.count()
    pending = base_query.filter(Ticket.status == "Pending").count()
    assigned = base_query.filter(Ticket.status == "Assigned").count()
    in_progress = base_query.filter(Ticket.status == "In Progress").count()
    completed = base_query.filter(Ticket.status == "Completed").count()
    closed = base_query.filter(Ticket.status == "Closed").count()
    
    priority_counts = {}
    for p in ["Low", "Medium", "High", "Urgent"]:
        priority_counts[p] = base_query.filter(Ticket.priority == p).count()
    
    today = datetime.utcnow().date()
    today_start = datetime(today.year, today.month, today.day)
    today_count = base_query.filter(Ticket.created_at >= today_start).count()
    
    return {
        "total": total,
        "pending": pending,
        "assigned": assigned,
        "in_progress": in_progress,
        "completed": completed,
        "closed": closed,
        "by_priority": priority_counts,
        "today": today_count
    }


@app.get("/admin/analytics/blocks")
async def get_analytics_blocks(
    status: Optional[str] = Query(None),
    block: Optional[str] = Query(None),
    fault: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "ADMIN":
        raise HTTPException(403, "Admin access required")
    base_query = db.query(Ticket)
    base_query = apply_ticket_filters(base_query, status, block, fault)
    results = base_query.with_entities(Ticket.block, func.count(Ticket.id)).group_by(Ticket.block).all()
    return [{"block": r[0], "count": r[1]} for r in results]


@app.get("/admin/analytics/faults")
async def get_analytics_faults(
    status: Optional[str] = Query(None),
    block: Optional[str] = Query(None),
    fault: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "ADMIN":
        raise HTTPException(403, "Admin access required")
    base_query = db.query(Ticket)
    base_query = apply_ticket_filters(base_query, status, block, fault)
    results = base_query.with_entities(Ticket.fault_type, func.count(Ticket.id)).group_by(Ticket.fault_type).all()
    return [{"fault_type": r[0], "count": r[1]} for r in results]


@app.get("/admin/analytics/departments")
async def get_analytics_departments(
    status: Optional[str] = Query(None),
    block: Optional[str] = Query(None),
    fault: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "ADMIN":
        raise HTTPException(403, "Admin access required")
    base_query = db.query(Ticket).join(User, Ticket.user_id == User.id)
    base_query = apply_ticket_filters(base_query, status, block, fault)
    results = base_query.with_entities(User.department, func.count(Ticket.id)).group_by(User.department).all()
    return [{"department": r[0] or "Unknown", "count": r[1]} for r in results]


@app.get("/admin/analytics/worker-performance")
async def get_worker_performance(
    status: Optional[str] = Query(None),
    block: Optional[str] = Query(None),
    fault: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "ADMIN":
        raise HTTPException(403, "Admin access required")
    base_query = db.query(Ticket)
    base_query = apply_ticket_filters(base_query, status, block, fault)
    
    workers = db.query(Worker).filter(Worker.is_active == True).all()
    result = []
    for worker in workers:
        worker_tickets = base_query.filter(Ticket.assigned_worker_id == worker.id)
        assigned = worker_tickets.count()
        completed = worker_tickets.filter(Ticket.status.in_(["Completed", "Closed"])).count()
        avg_days = None
        completed_tickets = worker_tickets.filter(
            Ticket.status.in_(["Completed", "Closed"]),
            Ticket.completed_at.isnot(None)
        ).all()
        if completed_tickets:
            total_days = sum((t.completed_at - t.created_at).total_seconds() / 86400 for t in completed_tickets)
            avg_days = round(total_days / len(completed_tickets), 1)
        result.append({
            "worker_id": worker.id,
            "worker_name": worker.full_name,
            "assigned": assigned,
            "completed": completed,
            "avg_days": avg_days
        })
    return result


@app.get("/admin/analytics/timeline")
async def get_timeline(
    days: int = 30,
    status: Optional[str] = Query(None),
    block: Optional[str] = Query(None),
    fault: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "ADMIN":
        raise HTTPException(403, "Admin access required")
    base_query = db.query(Ticket)
    base_query = apply_ticket_filters(base_query, status, block, fault)
    
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days-1)
    results = []
    for i in range(days):
        date = start_date + timedelta(days=i)
        date_start = datetime(date.year, date.month, date.day)
        date_end = date_start + timedelta(days=1)
        count = base_query.filter(Ticket.created_at >= date_start, Ticket.created_at < date_end).count()
        results.append({"date": date.isoformat(), "count": count})
    return results


# ================================
# Analytics Export
# ================================

@app.get("/admin/analytics/export")
async def export_analytics_data(
    status: Optional[str] = Query(None),
    block: Optional[str] = Query(None),
    fault: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "ADMIN":
        raise HTTPException(403, "Admin access required")
    
    query = db.query(Ticket)
    query = apply_ticket_filters(query, status, block, fault)
    
    if date_from:
        try:
            from_date = datetime.fromisoformat(date_from)
            query = query.filter(Ticket.created_at >= from_date)
        except:
            pass
    if date_to:
        try:
            to_date = datetime.fromisoformat(date_to)
            query = query.filter(Ticket.created_at <= to_date)
        except:
            pass
    
    tickets = query.order_by(desc(Ticket.created_at)).all()
    
    export_data = []
    for ticket in tickets:
        user = db.query(User).filter(User.id == ticket.user_id).first()
        worker = None
        if ticket.assigned_worker_id:
            worker = db.query(Worker).filter(Worker.id == ticket.assigned_worker_id).first()
        assigned_by_user = None
        if ticket.assigned_by:
            assigned_by_user = db.query(User).filter(User.id == ticket.assigned_by).first()
        
        export_data.append({
            "ticket_id": ticket.id,
            "ticket_number": ticket.ticket_number,
            "status": ticket.status,
            "priority": ticket.priority,
            "user_name": user.full_name if user else "Unknown",
            "user_email": user.email if user else "Unknown",
            "user_department": user.department if user else "Unknown",
            "user_mobile": user.mobile_number if user else "Unknown",
            "block": ticket.block,
            "room_number": ticket.room_number,
            "fault_type": ticket.fault_type,
            "description": ticket.description or "",
            "hod_approval": "Yes" if ticket.hod_approval else "No",
            "assigned_worker": worker.full_name if worker else "Not Assigned",
            "assigned_worker_phone": worker.phone if worker else "",
            "assigned_worker_specialization": worker.specialization if worker else "",
            "assigned_by": assigned_by_user.full_name if assigned_by_user else "",
            "assigned_at": ticket.assigned_at.isoformat() if ticket.assigned_at else "",
            "assignment_notes": ticket.assignment_notes or "",
            "created_at": ticket.created_at.isoformat(),
            "updated_at": ticket.updated_at.isoformat(),
            "completed_at": ticket.completed_at.isoformat() if ticket.completed_at else "",
            "closed_at": ticket.closed_at.isoformat() if ticket.closed_at else "",
            "has_image": "Yes" if ticket.image else "No",
            "image_path": ticket.image or "",
            "days_to_complete": round((ticket.completed_at - ticket.created_at).total_seconds() / 86400, 1) 
                                if ticket.completed_at else "",
            "days_to_close": round((ticket.closed_at - ticket.created_at).total_seconds() / 86400, 1) 
                             if ticket.closed_at else "",
        })
    
    total = len(export_data)
    status_counts = {}
    priority_counts = {}
    block_counts = {}
    fault_counts = {}
    department_counts = {}
    worker_counts = {}
    
    for item in export_data:
        status_counts[item['status']] = status_counts.get(item['status'], 0) + 1
        priority_counts[item['priority']] = priority_counts.get(item['priority'], 0) + 1
        block_counts[item['block']] = block_counts.get(item['block'], 0) + 1
        fault_counts[item['fault_type']] = fault_counts.get(item['fault_type'], 0) + 1
        dept = item['user_department']
        department_counts[dept] = department_counts.get(dept, 0) + 1
        if item['assigned_worker'] != "Not Assigned":
            worker_counts[item['assigned_worker']] = worker_counts.get(item['assigned_worker'], 0) + 1
    
    return {
        "export_metadata": {
            "exported_at": datetime.utcnow().isoformat(),
            "exported_by": current_user.full_name,
            "filters_applied": {
                "status": status,
                "block": block,
                "fault": fault,
                "date_from": date_from,
                "date_to": date_to
            },
            "total_records": total
        },
        "summary": {
            "status_distribution": status_counts,
            "priority_distribution": priority_counts,
            "block_distribution": block_counts,
            "fault_distribution": fault_counts,
            "department_distribution": department_counts,
            "worker_distribution": worker_counts
        },
        "tickets": export_data
    }


@app.get("/admin/analytics/export/csv")
async def export_analytics_csv(
    status: Optional[str] = Query(None),
    block: Optional[str] = Query(None),
    fault: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "ADMIN":
        raise HTTPException(403, "Admin access required")
    
    query = db.query(Ticket)
    query = apply_ticket_filters(query, status, block, fault)
    
    if date_from:
        try:
            from_date = datetime.fromisoformat(date_from)
            query = query.filter(Ticket.created_at >= from_date)
        except:
            pass
    if date_to:
        try:
            to_date = datetime.fromisoformat(date_to)
            query = query.filter(Ticket.created_at <= to_date)
        except:
            pass
    
    tickets = query.order_by(desc(Ticket.created_at)).all()
    
    output = StringIO()
    writer = csv.writer(output)
    
    headers = [
        "Ticket Number", "Status", "Priority", "User Name", "Department", 
        "Block", "Room", "Fault Type", "Description", "HOD Approval",
        "Assigned Worker", "Worker Phone", "Created At", "Completed At",
        "Days to Complete", "Closed At"
    ]
    writer.writerow(headers)
    
    for ticket in tickets:
        user = db.query(User).filter(User.id == ticket.user_id).first()
        worker = None
        if ticket.assigned_worker_id:
            worker = db.query(Worker).filter(Worker.id == ticket.assigned_worker_id).first()
        
        row = [
            ticket.ticket_number,
            ticket.status,
            ticket.priority,
            user.full_name if user else "",
            user.department if user else "",
            ticket.block,
            ticket.room_number,
            ticket.fault_type,
            ticket.description or "",
            "Yes" if ticket.hod_approval else "No",
            worker.full_name if worker else "",
            worker.phone if worker else "",
            ticket.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            ticket.completed_at.strftime("%Y-%m-%d %H:%M:%S") if ticket.completed_at else "",
            round((ticket.completed_at - ticket.created_at).total_seconds() / 86400, 1) if ticket.completed_at else "",
            ticket.closed_at.strftime("%Y-%m-%d %H:%M:%S") if ticket.closed_at else ""
        ]
        writer.writerow(row)
    
    csv_content = output.getvalue()
    output.close()
    
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"emtms_analytics_export_{timestamp}.csv"
    
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ================================
# AI Report Generation
# ================================
@app.get("/admin/ai-report")
async def generate_ai_report(
    status: Optional[str] = Query(None),
    block: Optional[str] = Query(None),
    fault: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "ADMIN":
        raise HTTPException(403, "Admin access required")
    
    try:
        # Collect all relevant data
        base_query = apply_ticket_filters(db.query(Ticket), status, block, fault)
        tickets = base_query.all()
        total = len(tickets)
        
        # Get statistics
        pending = base_query.filter(Ticket.status == "Pending").count()
        assigned = base_query.filter(Ticket.status == "Assigned").count()
        in_progress = base_query.filter(Ticket.status == "In Progress").count()
        completed = base_query.filter(Ticket.status == "Completed").count()
        closed = base_query.filter(Ticket.status == "Closed").count()
        
        # Block distribution
        blocks = base_query.with_entities(Ticket.block, func.count(Ticket.id)).group_by(Ticket.block).all()
        block_data = {b[0]: b[1] for b in blocks}
        
        # Fault distribution
        faults = base_query.with_entities(Ticket.fault_type, func.count(Ticket.id)).group_by(Ticket.fault_type).all()
        fault_data = {f[0]: f[1] for f in faults}
        
        # Priority distribution
        priority_data = {}
        for p in ["Low", "Medium", "High", "Urgent"]:
            priority_data[p] = base_query.filter(Ticket.priority == p).count()
        
        # Worker performance
        workers = db.query(Worker).filter(Worker.is_active == True).all()
        worker_data = []
        for w in workers:
            wt = base_query.filter(Ticket.assigned_worker_id == w.id)
            assigned_count = wt.count()
            completed_count = wt.filter(Ticket.status.in_(["Completed", "Closed"])).count()
            worker_data.append({
                "name": w.full_name,
                "assigned": assigned_count,
                "completed": completed_count
            })
        
        filters_str = f"Status={status}, Block={block}, Fault={fault}" if any([status, block, fault]) else 'None (All data)'
        
        # Build prompt
        prompt = f"""
You are an expert analyst for an Electrical Maintenance Ticket Management System (EMTMS). 
Generate a comprehensive report based on the following filtered data.

Filters applied: {filters_str}

**Overall Statistics:**
- Total Tickets: {total}
- Pending: {pending}
- Assigned: {assigned}
- In Progress: {in_progress}
- Completed: {completed}
- Closed: {closed}

**Tickets by Block:**
{block_data}

**Tickets by Fault Type:**
{fault_data}

**Tickets by Priority:**
{priority_data}

**Worker Performance:**
{worker_data}

Please provide a structured report with:
1. Executive Summary (2-3 sentences)
2. Key Insights (bullet points, at least 5)
3. Performance Overview (by worker, by block, by fault)
4. Recommendations for Improvement (at least 3 actionable suggestions)
5. Trends and Patterns you notice
Format the report with clear headings and bullet points. Keep it professional and data-driven.
"""
        
        # Check if Gemini is configured
        if not gemini_client or not gemini_model_name:
            # Return structured fallback report
            fallback_report = f"""# 📊 Executive Summary
This report analyzes **{total}** tickets in the Electrical Maintenance Ticket Management System.

Filters applied: {filters_str}

---

## 📈 Key Insights
- **Total Tickets:** {total}
- **Pending:** {pending} ({round(pending/total*100,1) if total>0 else 0}%)
- **Assigned:** {assigned} ({round(assigned/total*100,1) if total>0 else 0}%)
- **In Progress:** {in_progress} ({round(in_progress/total*100,1) if total>0 else 0}%)
- **Completed:** {completed} ({round(completed/total*100,1) if total>0 else 0}%)
- **Closed:** {closed} ({round(closed/total*100,1) if total>0 else 0}%)
- **Most Common Fault:** {max(fault_data, key=fault_data.get) if fault_data else 'N/A'}
- **Busiest Block:** {max(block_data, key=block_data.get) if block_data else 'N/A'}

---

## 👨‍🔧 Performance Overview

### Status Distribution
- ✅ Completed/Closed: {completed + closed} tickets
- ⏳ Active (Pending/Assigned/In Progress): {pending + assigned + in_progress} tickets

### Block Distribution
{chr(10).join([f"- **{k}:** {v} tickets" for k, v in block_data.items()]) if block_data else '- No data'}

### Fault Type Distribution
{chr(10).join([f"- **{k}:** {v} tickets" for k, v in fault_data.items()]) if fault_data else '- No data'}

### Priority Distribution
{chr(10).join([f"- **{k}:** {v} tickets" for k, v in priority_data.items() if v > 0])}

### Worker Performance
{chr(10).join([f"- **{w['name']}:** {w['assigned']} assigned, {w['completed']} completed" for w in worker_data if w['assigned'] > 0]) if worker_data else '- No workers assigned'}

---

## 💡 Recommendations
1. **Pending Tickets:** Focus on clearing {pending} pending tickets
2. **Priority Management:** Review {priority_data.get('Urgent', 0)} urgent tickets
3. **Worker Allocation:** Balance workload among {len(worker_data)} workers
4. **Fault Pattern Analysis:** Investigate recurring {max(fault_data, key=fault_data.get) if fault_data else 'fault'} issues
5. **Block-wise Strategy:** Address high volume at {max(block_data, key=block_data.get) if block_data else 'blocks'}

---

## 📝 Note
This is a data-driven fallback report. Gemini AI is not configured. 
To enable AI-generated reports:
1. Add GEMINI_API_KEY to .env file
2. Install: pip install google-genai
"""
            
            return {
                "report": fallback_report,
                "filters": {"status": status, "block": block, "fault": fault},
                "generated_at": datetime.utcnow().isoformat(),
                "ai_enabled": False,
                "message": "Using fallback report (Gemini AI not configured)"
            }
        
        # Generate AI report
        try:
            response = gemini_client.models.generate_content(
                model=gemini_model_name,
                contents=prompt
            )
            
            report_text = response.text
            
            if not report_text or len(report_text.strip()) < 50:
                raise ValueError("AI response was too short or empty")
            
            return {
                "report": report_text,
                "filters": {"status": status, "block": block, "fault": fault},
                "generated_at": datetime.utcnow().isoformat(),
                "ai_enabled": True,
                "model": gemini_model_name
            }
            
        except Exception as ai_error:
            logger.error(f"AI generation error: {str(ai_error)}")
            fallback_report = f"""# 📊 Executive Summary
This report analyzes **{total}** tickets in the Electrical Maintenance Ticket Management System.

Filters applied: {filters_str}

---

## 📈 Key Insights
- **Total Tickets:** {total}
- **Pending:** {pending} ({round(pending/total*100,1) if total>0 else 0}%)
- **In Progress:** {in_progress} ({round(in_progress/total*100,1) if total>0 else 0}%)
- **Completed:** {completed} ({round(completed/total*100,1) if total>0 else 0}%)
- **Closed:** {closed} ({round(closed/total*100,1) if total>0 else 0}%)
- **Most Common Fault:** {max(fault_data, key=fault_data.get) if fault_data else 'N/A'}
- **Busiest Block:** {max(block_data, key=block_data.get) if block_data else 'N/A'}

---

## 👨‍🔧 Performance Overview
Status distribution shows **{pending}** tickets pending action and **{completed}** tickets completed.

### Block Distribution
{chr(10).join([f"- **{k}:** {v} tickets" for k, v in block_data.items()]) if block_data else '- No data'}

### Fault Type Distribution
{chr(10).join([f"- **{k}:** {v} tickets" for k, v in fault_data.items()]) if fault_data else '- No data'}

### Priority Distribution
{chr(10).join([f"- **{k}:** {v} tickets" for k, v in priority_data.items() if v > 0])}

### Worker Performance
{chr(10).join([f"- **{w['name']}:** {w['assigned']} assigned, {w['completed']} completed" for w in worker_data if w['assigned'] > 0]) if worker_data else '- No workers assigned'}

---

## 💡 Recommendations
1. **Pending Tickets:** Focus on clearing {pending} pending tickets
2. **Priority Management:** Review {priority_data.get('Urgent', 0)} urgent tickets
3. **Worker Allocation:** Balance workload among {len(worker_data)} workers
4. **Fault Pattern Analysis:** Investigate recurring {max(fault_data, key=fault_data.get) if fault_data else 'fault'} issues
5. **Block-wise Strategy:** Address high volume at {max(block_data, key=block_data.get) if block_data else 'blocks'}

---

## ⚠️ AI Note
AI report generation encountered an error: {str(ai_error)}
Using fallback report with available data.
"""
            
            return {
                "report": fallback_report,
                "filters": {"status": status, "block": block, "fault": fault},
                "generated_at": datetime.utcnow().isoformat(),
                "ai_enabled": True,
                "error": str(ai_error),
                "message": "AI generation failed - using fallback report"
            }
            
    except Exception as e:
        logger.error(f"Report generation error: {str(e)}")
        raise HTTPException(500, f"Failed to generate report: {str(e)}")


# ================================
# Health Check
# ================================
@app.get("/health")
async def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "database": "connected",
            "version": "2.1.0",
            "gemini": bool(gemini_client and gemini_model_name),
            "gemini_model": gemini_model_name or "None"
        }
    except Exception as e:
        logger.error(f"Health check error: {str(e)}")
        raise HTTPException(503, f"Database error: {str(e)}")


# ================================
# Error Handlers
# ================================
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)