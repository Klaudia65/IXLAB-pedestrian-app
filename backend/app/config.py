from functools import lru_cache
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str

    @field_validator("database_url")
    @classmethod
    def _normalize_db_url(cls, v: str) -> str:
        # Managed hosts (Render, Heroku, ...) hand out 'postgres://' or
        # 'postgresql://'; our async stack needs the '+asyncpg' driver. The local
        # compose URL already has '+asyncpg', so it is left untouched.
        if v.startswith("postgres://"):
            return "postgresql+asyncpg://" + v[len("postgres://"):]
        if v.startswith("postgresql://"):
            return "postgresql+asyncpg://" + v[len("postgresql://"):]
        return v
    debug: bool = True
    vector_dim: int = 64
    # Seoul Open Data Plaza API key (data.seoul.go.kr), read from .env.
    # Optional so the app still starts if it isn't set.
    seoul_api_key: str | None = None
    # Shared secret the app must send (X-Study-Key header) to write study data.
    # If unset, the write endpoints are open (fine for local dev; set before
    # deploying the study publicly).
    study_write_key: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # tolerate other keys in .env without crashing
    )

@lru_cache()
def get_settings() -> Settings:
    return Settings()

settings = get_settings()