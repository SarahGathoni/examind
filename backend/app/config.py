from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql://examind:examind123@localhost:5432/examind"
    SECRET_KEY: str = "change-this-secret-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    UPLOADS_DIR: str = "./uploads"
    REPORTS_DIR: str = "./reports"

    # Email (SMTP) — leave blank to disable email sending
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@examind.io"
    SMTP_USE_TLS: bool = True

    # Public URL of the frontend (used in invite emails)
    FRONTEND_URL: str = "http://localhost:3000"

    INVITE_EXPIRE_HOURS: int = 72


settings = Settings()
