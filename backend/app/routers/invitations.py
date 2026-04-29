from datetime import timedelta, timezone, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user, require_roles
from ..models import Institution, InstitutionInvite, User
from ..schemas import InviteCreate, InviteOut, InviteInfo, InviteAccept
from ..security import hash_password
from ..config import settings
from ..services.email_service import send_invite_email

router = APIRouter(prefix="/api/invitations", tags=["invitations"])

_require_sysadmin = require_roles("system_admin")


@router.post("", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
def create_invite(
    body: InviteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_sysadmin),
):
    # Validate institution uniqueness
    existing = db.query(Institution).filter(
        (Institution.name == body.institution_name)
        | (Institution.code == body.institution_code.upper())
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An institution with this name or code already exists.",
        )

    # Check admin email isn't already taken
    if db.query(User).filter(User.email == body.email.lower().strip()).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    # Create the institution eagerly so the invite is tied to it
    inst = Institution(
        name=body.institution_name.strip(),
        code=body.institution_code.upper().strip(),
        country=body.institution_country.strip() or "Kenya",
    )
    db.add(inst)
    db.flush()

    invite = InstitutionInvite(
        institution_id=inst.id,
        email=body.email.lower().strip(),
        invited_by=current_user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=settings.INVITE_EXPIRE_HOURS),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)

    invite_url = f"{settings.FRONTEND_URL}/accept-invite/{invite.token}"
    email_sent = send_invite_email(invite.email, inst.name, invite_url)

    return InviteOut(
        token=invite.token,
        institution_id=inst.id,
        institution_name=inst.name,
        email=invite.email,
        invite_url=invite_url,
        email_sent=email_sent,
    )


@router.get("/{token}", response_model=InviteInfo)
def get_invite(token: str, db: Session = Depends(get_db)):
    """Public endpoint — validate token and return institution info for the accept form."""
    invite = db.query(InstitutionInvite).filter(InstitutionInvite.token == token).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invitation not found.")
    if invite.used_at is not None:
        raise HTTPException(status_code=410, detail="This invitation has already been used.")
    if invite.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="This invitation has expired.")
    return InviteInfo(institution_name=invite.institution.name, email=invite.email)


@router.post("/{token}/accept", response_model=dict)
def accept_invite(token: str, body: InviteAccept, db: Session = Depends(get_db)):
    """Public endpoint — create the institution admin account and mark invite used."""
    invite = db.query(InstitutionInvite).filter(InstitutionInvite.token == token).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invitation not found.")
    if invite.used_at is not None:
        raise HTTPException(status_code=410, detail="This invitation has already been used.")
    if invite.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="This invitation has expired.")

    if db.query(User).filter(User.email == invite.email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    if len(body.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 8 characters.",
        )

    user = User(
        email=invite.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name.strip(),
        role="admin",
        institution_id=invite.institution_id,
        is_active=True,
    )
    db.add(user)

    invite.used_at = datetime.now(timezone.utc)
    db.commit()

    return {"message": "Account created. You can now sign in."}
