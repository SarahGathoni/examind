import uuid
import secrets
from datetime import datetime, timezone
from sqlalchemy import (
    String, Boolean, DateTime, Text, Integer, Float,
    ForeignKey, Enum as SAEnum
)
from sqlalchemy.orm import mapped_column, Mapped, relationship

from .database import Base

def new_uuid() -> str:
    return str(uuid.uuid4())

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class Institution(Base):
    __tablename__ = "institutions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    country: Mapped[str] = mapped_column(String(100), nullable=False, default="Kenya")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    users: Mapped[list["User"]] = relationship("User", back_populates="institution")
    schools: Mapped[list["School"]] = relationship("School", back_populates="institution")
    ai_config: Mapped["AiConfig"] = relationship("AiConfig", back_populates="institution", uselist=False)
    submissions: Mapped[list["ExamSubmission"]] = relationship("ExamSubmission", back_populates="institution")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(
        SAEnum("system_admin", "admin", "moderator", "hod", "examiner", name="user_role"),
        nullable=False,
        default="examiner",
    )
    institution_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("institutions.id", ondelete="SET NULL"), nullable=True
    )
    school_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("schools.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    institution: Mapped["Institution | None"] = relationship("Institution", back_populates="users")
    school: Mapped["School | None"] = relationship("School", back_populates="users")
    submissions: Mapped[list["ExamSubmission"]] = relationship("ExamSubmission", back_populates="user")


class School(Base):
    __tablename__ = "schools"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    institution_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    institution: Mapped["Institution"] = relationship("Institution", back_populates="schools")
    users: Mapped[list["User"]] = relationship("User", back_populates="school")
    forms: Mapped[list["ModerationForm"]] = relationship("ModerationForm", back_populates="school")
    submissions: Mapped[list["ExamSubmission"]] = relationship("ExamSubmission", back_populates="school")


class ModerationForm(Base):
    __tablename__ = "moderation_forms"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    school_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    institution_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False
    )
    uploaded_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    school: Mapped["School"] = relationship("School", back_populates="forms")


class AiConfig(Base):
    __tablename__ = "ai_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    institution_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("institutions.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    provider: Mapped[str] = mapped_column(String(50), nullable=False, default="anthropic")
    api_key_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    institution: Mapped["Institution"] = relationship("Institution", back_populates="ai_config")


class ExamSubmission(Base):
    __tablename__ = "exam_submissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    reference: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    institution_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("institutions.id", ondelete="SET NULL"), nullable=True
    )
    school_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("schools.id", ondelete="SET NULL"), nullable=True
    )
    course_name: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    level: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    duration: Mapped[str] = mapped_column(String(50), nullable=False, default="3 Hours")
    total_marks: Mapped[str] = mapped_column(String(20), nullable=False, default="100")
    exam_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    form_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("moderation_forms.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(
        SAEnum("pending", "processing", "completed", "failed", name="submission_status"),
        nullable=False,
        default="pending",
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    user: Mapped["User | None"] = relationship("User", back_populates="submissions")
    institution: Mapped["Institution | None"] = relationship("Institution", back_populates="submissions")
    school: Mapped["School | None"] = relationship("School", back_populates="submissions")
    result: Mapped["ModerationResult | None"] = relationship(
        "ModerationResult", back_populates="submission", uselist=False
    )


class InstitutionInvite(Base):
    __tablename__ = "institution_invites"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False,
                                       default=lambda: secrets.token_urlsafe(32))
    institution_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    invited_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    institution: Mapped["Institution"] = relationship("Institution")


class ModerationResult(Base):
    __tablename__ = "moderation_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    submission_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("exam_submissions.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    overall_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    verdict: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    result_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    report_filename: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    submission: Mapped["ExamSubmission"] = relationship("ExamSubmission", back_populates="result")
