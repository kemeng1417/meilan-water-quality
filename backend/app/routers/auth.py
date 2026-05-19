from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import LoginRequest, Token, UserInfo
from app.services.auth import authenticate, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["认证"])


def _get_token(authorization: str | None = Header(None)):
    if not authorization:
        return None
    parts = authorization.split()
    return parts[1] if len(parts) == 2 and parts[0].lower() == "bearer" else None


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
