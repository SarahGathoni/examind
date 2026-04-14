from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from .database import Base, engine, create_dirs
from .config import settings
from .routers import auth, users, institutions, schools, submissions, ai_config

app = FastAPI(
    title="ExamMind API",
    description="AI-powered exam moderation platform backend",
    version="1.0.0",
)

# ── CORS ───────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        os.getenv("FRONTEND_URL", ""),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── STARTUP ────────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup():
    create_dirs()
    Base.metadata.create_all(bind=engine)


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
