from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..dependencies import require_roles
from ..models import Institution, User, ExamSubmission, ModerationResult
from ..schemas import InstitutionOut, InstitutionCreate, PlatformStats

router = APIRouter(prefix="/api/institutions", tags=["institutions"])

_require_sysadmin = require_roles("system_admin")


@router.get("/stats", response_model=PlatformStats)
def platform_stats(
    db: Session = Depends(get_db),
    _: User = Depends(_require_sysadmin),
):
    total_institutions = db.query(func.count(Institution.id)).scalar() or 0
    total_users = db.query(func.count(User.id)).scalar() or 0
    total_submissions = db.query(func.count(ExamSubmission.id)).scalar() or 0

    completed = (
        db.query(ModerationResult)
        .join(ExamSubmission, ModerationResult.submission_id == ExamSubmission.id)
        .all()
    )
    approved = sum(
        1 for r in completed
        if "approved" in r.verdict.lower() and "major" not in r.verdict.lower()
    )
    needs_revision = sum(
        1 for r in completed
        if "revision" in r.verdict.lower() or "not approved" in r.verdict.lower()
    )
    avg_score = (
        round(sum(r.overall_score for r in completed) / len(completed), 1)
        if completed else 0.0
    )

    return PlatformStats(
        total_institutions=total_institutions,
        total_users=total_users,
        total_submissions=total_submissions,
        approved_count=approved,
        needs_revision_count=needs_revision,
        avg_score=avg_score,
    )


@router.get("", response_model=list[InstitutionOut])
def list_institutions(
    db: Session = Depends(get_db),
    _: User = Depends(_require_sysadmin),
):
    institutions = db.query(Institution).all()
    result = []
    for inst in institutions:
        user_count = db.query(func.count(User.id)).filter(User.institution_id == inst.id).scalar() or 0
        out = InstitutionOut(
            id=inst.id,
            name=inst.name,
            code=inst.code,
            country=inst.country,
            created_at=inst.created_at,
            user_count=user_count,
        )
        result.append(out)
    return result


@router.post("", response_model=InstitutionOut, status_code=status.HTTP_201_CREATED)
def create_institution(
    body: InstitutionCreate,
    db: Session = Depends(get_db),
    _: User = Depends(_require_sysadmin),
):
    existing = db.query(Institution).filter(
        (Institution.name == body.name) | (Institution.code == body.code.upper())
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Institution with this name or code already exists.",
        )
    inst = Institution(
        name=body.name,
        code=body.code.upper(),
        country=body.country,
    )
    db.add(inst)
    db.commit()
    db.refresh(inst)
    return InstitutionOut(
        id=inst.id, name=inst.name, code=inst.code,
        country=inst.country, created_at=inst.created_at, user_count=0,
    )


@router.delete("/{institution_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_institution(
    institution_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(_require_sysadmin),
):
    inst = db.query(Institution).filter(Institution.id == institution_id).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Institution not found")
    db.delete(inst)
    db.commit()
