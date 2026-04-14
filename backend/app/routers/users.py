from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user, require_roles
from ..models import User
from ..schemas import UserOut, UserCreate, UserUpdate
from ..security import hash_password

router = APIRouter(prefix="/api/users", tags=["users"])

_require_admin = require_roles("system_admin", "admin")


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        institution_id=user.institution_id,
        institution_name=user.institution.name if user.institution else None,
        school_id=user.school_id,
        school_name=user.school.name if user.school else None,
        is_active=user.is_active,
    )


@router.get("", response_model=list[UserOut])
def list_users(
    institution_id: str | None = Query(None),
    school_id: str | None = Query(None),
    role: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    q = db.query(User)

    if current_user.role == "admin":
        # Institution admins only see users in their institution
        q = q.filter(User.institution_id == current_user.institution_id)
    elif institution_id:
        q = q.filter(User.institution_id == institution_id)

    if school_id:
        q = q.filter(User.school_id == school_id)
    if role:
        q = q.filter(User.role == role)

    # Don't expose system_admin accounts to institution admins
    if current_user.role == "admin":
        q = q.filter(User.role != "system_admin")

    return [_user_out(u) for u in q.all()]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    # Validate role restrictions
    if current_user.role == "admin" and body.role in ("system_admin",):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Institution admins cannot create system_admin accounts.",
        )

    existing = db.query(User).filter(User.email == body.email.lower().strip()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    # Institution admins can only create users in their own institution
    institution_id = body.institution_id
    if current_user.role == "admin":
        institution_id = current_user.institution_id

    user = User(
        email=body.email.lower().strip(),
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        institution_id=institution_id,
        school_id=body.school_id or None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: str,
    body: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Institution admins can only update users in their institution
    if current_user.role == "admin" and user.institution_id != current_user.institution_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if body.full_name is not None:
        user.full_name = body.full_name
    if body.role is not None:
        user.role = body.role
    if body.school_id is not None:
        user.school_id = body.school_id or None
    if body.is_active is not None:
        user.is_active = body.is_active

    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if current_user.role == "admin" and user.institution_id != current_user.institution_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if user.role == "system_admin":
        raise HTTPException(status_code=403, detail="Cannot delete system admin accounts.")

    db.delete(user)
    db.commit()
