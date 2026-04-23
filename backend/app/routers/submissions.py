import json
import logging
import os
import shutil
import uuid
from datetime import datetime, timezone

from fastapi import (
    APIRouter, BackgroundTasks, Depends, Form, HTTPException,
    UploadFile, File, status
)
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db, SessionLocal
from ..dependencies import get_current_user
from ..models import ExamSubmission, ModerationResult, AiConfig, ModerationForm, User
from ..schemas import SubmissionOut, SubmissionUpdate
from ..config import settings


class _ChatBody(BaseModel):
    message: str
    history: list[dict] = []

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/submissions", tags=["submissions"])


def _sub_out(sub: ExamSubmission) -> SubmissionOut:
    result = sub.result
    return SubmissionOut(
        id=sub.id,
        reference=sub.reference,
        course_name=sub.course_name,
        department=sub.department,
        level=sub.level,
        duration=sub.duration,
        total_marks=sub.total_marks,
        status=sub.status,
        created_at=sub.created_at,
        user_full_name=sub.user.full_name if sub.user else None,
        school_name=sub.school.name if sub.school else None,
        overall_score=result.overall_score if result else None,
        verdict=result.verdict if result else None,
        report_filename=result.report_filename if result else None,
    )


def _make_reference(db: Session) -> str:
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    count = db.query(ExamSubmission).filter(
        ExamSubmission.reference.like(f"MOD-{today}-%")
    ).count()
    return f"MOD-{today}-{count + 1:03d}"


@router.get("", response_model=list[SubmissionOut])
def list_submissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(ExamSubmission)
    if current_user.role == "examiner":
        q = q.filter(ExamSubmission.user_id == current_user.id)
    elif current_user.role in ("moderator", "hod"):
        q = q.filter(ExamSubmission.institution_id == current_user.institution_id)
    elif current_user.role == "admin":
        q = q.filter(ExamSubmission.institution_id == current_user.institution_id)
    # system_admin sees all
    return [_sub_out(s) for s in q.order_by(ExamSubmission.created_at.desc()).all()]


@router.get("/stats")
def submission_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(ExamSubmission)
    if current_user.role != "system_admin":
        q = q.filter(ExamSubmission.institution_id == current_user.institution_id)

    subs = q.all()
    completed = [s for s in subs if s.result]
    approved = sum(
        1 for s in completed
        if s.result and "approved" in s.result.verdict.lower()
        and "major" not in s.result.verdict.lower()
    )
    revision = sum(
        1 for s in completed
        if s.result and ("revision" in s.result.verdict.lower() or "not approved" in s.result.verdict.lower())
    )
    avg = (
        round(sum(s.result.overall_score for s in completed) / len(completed), 1)
        if completed else 0.0
    )
    return {
        "total_submissions": len(subs),
        "approved_count": approved,
        "needs_revision_count": revision,
        "avg_score": avg,
    }


@router.post("", response_model=SubmissionOut, status_code=status.HTTP_201_CREATED)
async def create_submission(
    background_tasks: BackgroundTasks,
    exam_file: UploadFile = File(...),
    course_name: str = Form(...),
    department: str = Form(""),
    level: str = Form(""),
    duration: str = Form("3 Hours"),
    total_marks: str = Form("100"),
    school_id: str | None = Form(None),
    form_id: str | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ext = os.path.splitext(exam_file.filename or "")[1].lower()
    if ext not in (".pdf", ".docx", ".doc", ".txt"):
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, DOC or TXT files allowed.")

    stored_name = f"exam_{uuid.uuid4().hex}{ext}"
    dest = os.path.join(settings.UPLOADS_DIR, stored_name)
    os.makedirs(settings.UPLOADS_DIR, exist_ok=True)
    with open(dest, "wb") as f:
        shutil.copyfileobj(exam_file.file, f)

    sub = ExamSubmission(
        reference=_make_reference(db),
        user_id=current_user.id,
        institution_id=current_user.institution_id,
        school_id=school_id or current_user.school_id or None,
        course_name=course_name,
        department=department,
        level=level,
        duration=duration,
        total_marks=total_marks,
        exam_filename=stored_name,
        form_id=form_id or None,
        status="pending",
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)

    # Kick off AI analysis in the background
    background_tasks.add_task(run_moderation, sub.id)

    return _sub_out(sub)


@router.get("/{submission_id}", response_model=SubmissionOut)
def get_submission(
    submission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub = db.query(ExamSubmission).filter(ExamSubmission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if current_user.role == "examiner" and sub.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return _sub_out(sub)


@router.patch("/{submission_id}", response_model=SubmissionOut)
def update_submission(
    submission_id: str,
    body: SubmissionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub = db.query(ExamSubmission).filter(ExamSubmission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if current_user.role == "examiner" and sub.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if sub.status == "processing":
        raise HTTPException(status_code=409, detail="Cannot edit a submission while it is being processed")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(sub, field, value)

    db.commit()
    db.refresh(sub)
    return _sub_out(sub)


@router.delete("/{submission_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_submission(
    submission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub = db.query(ExamSubmission).filter(ExamSubmission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if current_user.role == "examiner" and sub.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if sub.status == "processing":
        raise HTTPException(status_code=409, detail="Cannot delete a submission while it is being processed")

    exam_path = os.path.join(settings.UPLOADS_DIR, sub.exam_filename)
    if os.path.exists(exam_path):
        os.remove(exam_path)

    if sub.result:
        if sub.result.report_filename:
            report_path = os.path.join(settings.REPORTS_DIR, sub.result.report_filename)
            if os.path.exists(report_path):
                os.remove(report_path)
        result_json_path = os.path.join(settings.REPORTS_DIR, f"{submission_id}_result.json")
        if os.path.exists(result_json_path):
            os.remove(result_json_path)
        db.delete(sub.result)

    db.delete(sub)
    db.commit()


@router.get("/{submission_id}/report")
def get_report(
    submission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub = db.query(ExamSubmission).filter(ExamSubmission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if current_user.role == "examiner" and sub.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if not sub.result or not sub.result.report_filename:
        raise HTTPException(status_code=404, detail="Report not yet available")

    path = os.path.join(settings.REPORTS_DIR, sub.result.report_filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Report file not found on disk")

    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"Moderation_Report_{sub.reference}.pdf",
    )


@router.get("/{submission_id}/result")
def get_result(
    submission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub = db.query(ExamSubmission).filter(ExamSubmission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if current_user.role == "examiner" and sub.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if not sub.result:
        raise HTTPException(status_code=404, detail="Result not yet available")
    return json.loads(sub.result.result_json)


@router.post("/{submission_id}/chat")
def chat_about_submission(
    submission_id: str,
    body: _ChatBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub = db.query(ExamSubmission).filter(ExamSubmission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if current_user.role == "examiner" and sub.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if not sub.result:
        raise HTTPException(status_code=400, detail="No moderation result available yet")

    ai_cfg = db.query(AiConfig).filter(
        AiConfig.institution_id == sub.institution_id
    ).first()
    if not ai_cfg:
        raise HTTPException(status_code=400, detail="No AI configuration found for this institution")

    result_data = json.loads(sub.result.result_json)
    system_prompt = (
        f"You are an expert exam moderation assistant. The AI has completed moderation of "
        f"'{sub.course_name}' with these results:\n"
        f"- Score: {result_data.get('overall_score', 'N/A')}/100\n"
        f"- Verdict: {result_data.get('verdict', 'N/A')}\n"
        f"- Strengths: {', '.join(result_data.get('strengths', []))}\n"
        f"- Weaknesses: {', '.join(result_data.get('weaknesses', []))}\n"
        f"- Critical Issues: {', '.join(result_data.get('critical_issues', [])) or 'None'}\n\n"
        f"Full report:\n{json.dumps(result_data, indent=2)}\n\n"
        f"Answer questions concisely and helpfully, referencing specific data from the report."
    )

    from ..services.moderation_service import _http_post

    if ai_cfg.provider == "gemini":
        contents = []
        for msg in body.history[-10:]:
            role = "model" if msg.get("role") == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": msg.get("content", "")}]})
        contents.append({"role": "user", "parts": [{"text": body.message}]})
        payload = json.dumps({
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": contents,
            "generationConfig": {"maxOutputTokens": 1024, "temperature": 0.3},
        }).encode("utf-8")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent?key={ai_cfg.api_key_encrypted}"
        raw = json.loads(_http_post(url, payload, {"Content-Type": "application/json"}))
        answer = raw["candidates"][0]["content"]["parts"][0]["text"]
    else:
        messages = [
            {"role": msg.get("role", "user"), "content": msg.get("content", "")}
            for msg in body.history[-10:]
        ]
        messages.append({"role": "user", "content": body.message})
        payload = json.dumps({
            "model": "claude-sonnet-4-6",
            "max_tokens": 1024,
            "system": system_prompt,
            "messages": messages,
        }).encode("utf-8")
        raw = json.loads(_http_post(
            "https://api.anthropic.com/v1/messages",
            payload,
            {"Content-Type": "application/json", "x-api-key": ai_cfg.api_key_encrypted,
             "anthropic-version": "2023-06-01"},
        ))
        answer = raw["content"][0]["text"]

    return {"answer": answer}


# ── Background AI analysis ────────────────────────────────────────────────────

def run_moderation(submission_id: str):
    """Background task: extract text → call Claude → generate PDF → save result."""
    from ..services.moderation_service import moderate_exam
    db = SessionLocal()
    try:
        sub = db.query(ExamSubmission).filter(ExamSubmission.id == submission_id).first()
        if not sub:
            logger.error("[moderation] Submission %s not found in DB", submission_id)
            return

        sub.status = "processing"
        db.commit()
        logger.info("[moderation] Starting moderation for submission %s (%s)", submission_id, sub.reference)

        # Get AI config
        ai_cfg = None
        if sub.institution_id:
            ai_cfg = db.query(AiConfig).filter(
                AiConfig.institution_id == sub.institution_id
            ).first()

        if not ai_cfg:
            logger.error(
                "[moderation] No AI config for institution_id=%s (submission %s). "
                "Admin must save an API key under AI Configuration.",
                sub.institution_id, submission_id,
            )
            sub.status = "failed"
            db.commit()
            return

        logger.info("[moderation] AI config found: provider=%s", ai_cfg.provider)

        # Get form text if form_id provided
        form_text = None
        if sub.form_id:
            form_rec = db.query(ModerationForm).filter(ModerationForm.id == sub.form_id).first()
            if form_rec:
                form_path = os.path.join(settings.UPLOADS_DIR, form_rec.filename)
                logger.info("[moderation] Loading moderation form: %s", form_path)
                try:
                    from ..services.moderation_service import extract_text
                    form_text = extract_text(form_path)
                    logger.info("[moderation] Form text extracted (%d chars)", len(form_text))
                except Exception as fe:
                    logger.warning("[moderation] Could not extract form text: %s — using default criteria", fe)
            else:
                logger.warning("[moderation] form_id=%s not found in DB — using default criteria", sub.form_id)
        else:
            logger.info("[moderation] No form_id provided — using default criteria")

        meta = {
            "course": sub.course_name,
            "department": sub.department,
            "level": sub.level,
            "examiner": sub.user.full_name if sub.user else "Not specified",
            "total_marks": sub.total_marks,
            "duration": sub.duration,
            "academic_year": str(sub.created_at.year),
            "date": sub.created_at.strftime("%d %B %Y"),
        }

        exam_path = os.path.join(settings.UPLOADS_DIR, sub.exam_filename)
        logger.info("[moderation] Exam file: %s  exists=%s", exam_path, os.path.exists(exam_path))

        report_filename = moderate_exam(
            exam_path=exam_path,
            form_text=form_text,
            meta=meta,
            api_key=ai_cfg.api_key_encrypted,
            provider=ai_cfg.provider,
            submission_id=submission_id,
        )

        import json
        result_path = os.path.join(settings.REPORTS_DIR, f"{submission_id}_result.json")
        result_data = {}
        if os.path.exists(result_path):
            with open(result_path) as f:
                result_data = json.load(f)

        mod_result = ModerationResult(
            submission_id=submission_id,
            overall_score=result_data.get("overall_score", 0),
            verdict=result_data.get("verdict", ""),
            result_json=json.dumps(result_data),
            report_filename=report_filename,
        )
        db.add(mod_result)
        sub.status = "completed"
        db.commit()
        logger.info("[moderation] Completed submission %s — verdict: %s", submission_id, result_data.get("verdict"))

    except Exception as e:
        logger.exception("[moderation] FAILED for submission %s: %s", submission_id, e)
        try:
            sub = db.query(ExamSubmission).filter(ExamSubmission.id == submission_id).first()
            if sub:
                sub.status = "failed"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()
