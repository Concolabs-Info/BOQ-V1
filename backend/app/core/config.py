from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    # Always load the backend environment file, regardless of the directory
    # from which uvicorn was started.
    model_config = SettingsConfigDict(env_file=(PROJECT_ROOT / ".env", BACKEND_DIR / ".env"), extra="ignore")

    database_url: str = "postgresql://quanto:quanto@localhost:5432/quanto"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000"
    storage_root: Path = Path("../storage")
    max_upload_mb: int = 500
    render_thumbnail_dpi: int = 72
    render_working_dpi: int = 150

    pre_ai_provider: str = "local"
    takeoff_ai_provider: str = "local"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-flash-latest"
    openai_api_key: str | None = None
    openai_model: str | None = None
    model_retries: int = 2
    model_concurrency: int = 4

    clerk_jwt_key: str | None = None
    clerk_issuer: str | None = None
    clerk_secret_key: str | None = None
    app_origin: str = "http://localhost:3000"
    resend_api_key: str | None = None
    resend_from_email: str | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        return [v.strip() for v in self.cors_origins.split(",") if v.strip()]


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if not settings.storage_root.is_absolute():
        settings.storage_root = (BACKEND_DIR / settings.storage_root).resolve()
    settings.storage_root.mkdir(parents=True, exist_ok=True)
    return settings
