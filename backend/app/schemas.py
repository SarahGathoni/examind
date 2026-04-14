from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, EmailStr


# ── Auth ──────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    role: str
    institution_id: str | None
    institution_name: str | None = None
    school_id: str | None
    school_name: str | None = None
    is_active: bool


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Users ─────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: str
    full_name: str
    password: str
    role: str = "examiner"
    institution_id: str | None = None
    school_id: str | None = None


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    school_id: str | None = None
    is_active: bool | None = None


# ── Institutions ──────────────────────────────────────────────────────────────

class InstitutionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    code: str
    country: str
    created_at: datetime
    user_count: int | None = None


class InstitutionCreate(BaseModel):
    name: str
    code: str
    country: str = "Kenya"


# ── Schools ───────────────────────────────────────────────────────────────────

class SchoolOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    institution_id: str
    created_at: datetime


class SchoolCreate(BaseModel):
    name: str
    institution_id: str | None = None


# ── Moderation Forms ──────────────────────────────────────────────────────────

class ModerationFormOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    filename: str
    school_id: str
    institution_id: str
    created_at: datetime


# ── AI Config ─────────────────────────────────────────────────────────────────

class AiConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    institution_id: str
    provider: str
    updated_at: datetime


class AiConfigCreate(BaseModel):
    provider: str
    api_key: str


# ── Submissions ───────────────────────────────────────────────────────────────

class SubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    reference: str
    course_name: str
    department: str
    level: str
    duration: str
    total_marks: str
    status: str
    created_at: datetime
    user_full_name: str | None = None
    school_name: str | None = None
    overall_score: int | None = None
    verdict: str | None = None
    report_filename: str | None = None


class SubmissionCreate(BaseModel):
    course_name: str
    department: str = ""
    level: str = ""
    duration: str = "3 Hours"
    total_marks: str = "100"
    school_id: str | None = None
    form_id: str | None = None


# ── Stats ──────────────────────────────────────────────────────────────────────

class PlatformStats(BaseModel):
    total_institutions: int = 0
    total_users: int = 0
    total_submissions: int = 0
    approved_count: int = 0
    needs_revision_count: int = 0
    avg_score: float = 0.0


class InstitutionStats(BaseModel):
    total_submissions: int = 0
    approved_count: int = 0
    needs_revision_count: int = 0
    avg_score: float = 0.0
