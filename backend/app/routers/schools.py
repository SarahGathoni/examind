from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
import os, shutil, uuid

from ..database import get_db
from ..dependencies import get_current_user, require_roles
from ..models import School, ModerationForm, User
from ..schemas import SchoolOut, ModerationFormOut
from ..config import settings

router = APIRouter(tags=["schools"])

_require_admin = require_roles("system_admin", "admin")


# ── Schools ────────────────────────────────────────────────────────────────────

@router.get("/api/schools", response_model=list[SchoolOut])
def list_schools(
    institution_id: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(School)
    if current_user.role == "system_admin":
        if institution_id:
            q = q.filter(School.institution_id == institution_id)
    else:
        q = q.filter(School.institution_id == current_user.institution_id)
    return q.all()


@router.post("/api/schools", response_model=SchoolOut, status_code=status.HTTP_201_CREATED)
def create_school(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="School name is required.")

    institution_id = (
        current_user.institution_id
        if current_user.role == "admin"
        else body.get("institution_id")
    )
    if not institution_id:
        raise HTTPException(status_code=400, detail="institution_id is required for system admins.")

    school = School(name=name, institution_id=institution_id)
    db.add(school)
    db.commit()
    db.refresh(school)
    return school


@router.delete("/api/schools/{school_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_school(
    school_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    school = db.query(School).filter(School.id == school_id).first()
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    if current_user.role == "admin" and school.institution_id != current_user.institution_id:
        raise HTTPException(status_code=403, detail="Access denied")
    db.delete(school)
    db.commit()


# ── Moderation Forms ───────────────────────────────────────────────────────────

@router.get("/api/forms", response_model=list[ModerationFormOut])
def list_forms(
    school_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(ModerationForm).filter(ModerationForm.school_id == school_id)
    if current_user.role not in ("system_admin",):
        q = q.filter(ModerationForm.institution_id == current_user.institution_id)
    return q.all()


@router.post("/api/forms", response_model=ModerationFormOut, status_code=status.HTTP_201_CREATED)
async def upload_form(
    school_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    school = db.query(School).filter(School.id == school_id).first()
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    if current_user.role == "admin" and school.institution_id != current_user.institution_id:
        raise HTTPException(status_code=403, detail="Access denied")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".pdf", ".docx", ".txt"):
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, or TXT files allowed. Legacy .doc format is not supported — please convert to .docx.")

    stored_name = f"form_{uuid.uuid4().hex}{ext}"
    dest = os.path.join(settings.UPLOADS_DIR, stored_name)
    os.makedirs(settings.UPLOADS_DIR, exist_ok=True)
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    form = ModerationForm(
        name=file.filename or stored_name,
        filename=stored_name,
        school_id=school_id,
        institution_id=school.institution_id,
        uploaded_by=current_user.id,
    )
    db.add(form)
    db.commit()
    db.refresh(form)
    return form


@router.delete("/api/forms/{form_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_form(
    form_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    form = db.query(ModerationForm).filter(ModerationForm.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    if current_user.role == "admin" and form.institution_id != current_user.institution_id:
        raise HTTPException(status_code=403, detail="Access denied")

    filepath = os.path.join(settings.UPLOADS_DIR, form.filename)
    if os.path.exists(filepath):
        os.remove(filepath)
    db.delete(form)
    db.commit()
