from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import LoginRequest, Token, UserInfo
from app.services.auth import authenticate, create_access_token, get_current_user, hash_password

router = APIRouter(prefix="/api/auth", tags=["认证"])


def _get_token(authorization: str | None = Header(None)):
    if not authorization:
        return None
    parts = authorization.split()
    return parts[1] if len(parts) == 2 and parts[0].lower() == "bearer" else None


def _require_admin(db: Session, token: str):
    user = get_current_user(db, token)
    if not user or user.role != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user


@router.post("/login", response_model=Token)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate(db, req.username, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = create_access_token(user.id, user.username)
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=UserInfo)
def me(token: str = Depends(_get_token), db: Session = Depends(get_db)):
    user = get_current_user(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="无效的登录凭证")
    return user


# ── User Management (admin only) ──

@router.get("/users")
def list_users(token: str = Depends(_get_token), db: Session = Depends(get_db)):
    _require_admin(db, token)
    users = db.query(User).order_by(User.created_at).all()
    return [{"id": u.id, "username": u.username, "display_name": u.display_name, "role": u.role, "is_active": u.is_active, "created_at": str(u.created_at)} for u in users]


@router.post("/users")
def create_user(req: dict, token: str = Depends(_get_token), db: Session = Depends(get_db)):
    _require_admin(db, token)
    if not req.get("username") or not req.get("password"):
        raise HTTPException(status_code=400, detail="用户名和密码不能为空")
    existing = db.query(User).filter(User.username == req["username"]).first()
    if existing:
        raise HTTPException(status_code=400, detail="用户名已存在")
    user = User(
        username=req["username"],
        password_hash=hash_password(req["password"]),
        display_name=req.get("display_name", req["username"]),
        role=req.get("role", "tester"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "username": user.username, "display_name": user.display_name, "role": user.role}


@router.put("/users/{user_id}")
def update_user(user_id: int, req: dict, token: str = Depends(_get_token), db: Session = Depends(get_db)):
    _require_admin(db, token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if "display_name" in req:
        user.display_name = req["display_name"]
    if "role" in req:
        user.role = req["role"]
    if "is_active" in req:
        user.is_active = req["is_active"]
    if "password" in req and req["password"]:
        user.password_hash = hash_password(req["password"])
    db.commit()
    return {"success": True}


@router.put("/me/display-name")
def update_my_name(req: dict, token: str = Depends(_get_token), db: Session = Depends(get_db)):
    """当前用户修改自己的显示名 (body: {display_name})"""
    user = get_current_user(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="无效的登录凭证")
    name = req.get("display_name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="显示名不能为空")
    user.display_name = name
    db.commit()
    return {"success": True, "display_name": name}


@router.post("/change-password")
def change_password(req: dict, token: str = Depends(_get_token), db: Session = Depends(get_db)):
    """任何用户修改自己的密码 (body: {old_password, new_password})"""
    user = get_current_user(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="无效的登录凭证")
    if not authenticate(db, user.username, req.get("old_password", "")):
        raise HTTPException(status_code=400, detail="原密码错误")
    if not req.get("new_password") or len(req.get("new_password", "")) < 3:
        raise HTTPException(status_code=400, detail="新密码至少3位")
    user.password_hash = hash_password(req["new_password"])
    db.commit()
    return {"success": True}
