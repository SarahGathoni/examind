from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import require_roles, get_current_user
from ..models import AiConfig, User
from ..schemas import AiConfigOut, AiConfigCreate

router = APIRouter(prefix="/api/ai-config", tags=["ai-config"])

_require_admin = require_roles("system_admin", "admin")


@router.get("", response_model=AiConfigOut | None)
def get_ai_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    if not current_user.institution_id:
        return None
    cfg = db.query(AiConfig).filter(
        AiConfig.institution_id == current_user.institution_id
    ).first()
    return cfg


@router.get("/status", response_model=AiConfigOut | None)
def get_ai_config_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Read-only check for any authenticated user — never exposes the raw key."""
    if not current_user.institution_id:
        return None
    cfg = db.query(AiConfig).filter(
        AiConfig.institution_id == current_user.institution_id
    ).first()
    return cfg


@router.post("", response_model=AiConfigOut)
def upsert_ai_config(
    body: AiConfigCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    if not current_user.institution_id:
        raise HTTPException(status_code=400, detail="No institution associated with your account.")

    cfg = db.query(AiConfig).filter(
        AiConfig.institution_id == current_user.institution_id
    ).first()

    if cfg:
        cfg.provider = body.provider
        cfg.api_key_encrypted = body.api_key  # plain for MVP; encrypt in production
    else:
        cfg = AiConfig(
            institution_id=current_user.institution_id,
            provider=body.provider,
            api_key_encrypted=body.api_key,
        )
        db.add(cfg)

    db.commit()
    db.refresh(cfg)
    return cfg
