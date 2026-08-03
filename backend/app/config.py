from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str
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