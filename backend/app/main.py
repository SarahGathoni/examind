import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

from .database import Base, engine, create_dirs
from .config import settings
from .models import User
from .routers import auth, users, institutions, schools, submissions, ai_config

app = FastAPI(
    title="ExamMind API",
    description="AI-powered exam moderation platform backend",
    version="1.0.0",
)

# ── CORS ───────────────────────────────────────────────────────────────────────
_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
_frontend = os.getenv("FRONTEND_URL", "")
if _frontend:
    _origins.append(_frontend)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── STARTUP ────────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup():
    create_dirs()
    Base.metadata.create_all(bind=engine)
    _auto_seed()


def _auto_seed():
    """Create seed data if the database is empty (first deploy)."""
    from .database import SessionLocal
    from .models import Institution, School
    from .security import hash_password
    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            return  # already seeded

        inst = Institution(name="Kabarak University", code="KABARAK", country="Kenya")
        db.add(inst)
        db.flush()

        school_names = ["School of Nursing", "School of Medicine", "School of Engineering"]
        schools = {}
        for name in school_names:
            s = School(name=name, institution_id=inst.id)
            db.add(s)
            db.flush()
            schools[name] = s

        seed_users = [
            ("admin@examind.io",        "Admin@1234",  "ExamMind Admin",    "system_admin", None,                          None),
            ("admin@kabarak.ac.ke",      "Admin@1234",  "Kabarak Admin",     "admin",        inst.id,                       None),
            ("examiner@kabarak.ac.ke",   "Exam@1234",   "Dr. Mary Wanjiru",  "examiner",     inst.id, schools["School of Nursing"].id),
            ("moderator@kabarak.ac.ke",  "Mod@1234",    "Dr. Bryant Sang",   "moderator",    inst.id, schools["School of Medicine"].id),
            ("hod@kabarak.ac.ke",        "Hod@1234",    "Prof. Valerie Suge","hod",          inst.id, schools["School of Nursing"].id),
        ]
        for email, pwd, name, role, inst_id, school_id in seed_users:
            db.add(User(
                email=email,
                password_hash=hash_password(pwd),
                full_name=name,
                role=role,
                institution_id=inst_id,
                school_id=school_id,
                is_active=True,
            ))
        db.commit()
        logging.getLogger(__name__).info("Auto-seed complete — default users created.")
    except Exception:
        db.rollback()
        logging.getLogger(__name__).exception("Auto-seed failed")
    finally:
        db.close()


# ── ROUTERS ────────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(institutions.router)
app.include_router(schools.router)
app.include_router(submissions.router)
app.include_router(ai_config.router)


# ── STATIC FILES (PDF reports) ────────────────────────────────────────────────

@app.on_event("startup")
def mount_static():
    os.makedirs(settings.REPORTS_DIR, exist_ok=True)


@app.get("/")
def root():
    return {"message": "ExamMind API is running", "docs": "/docs"}
