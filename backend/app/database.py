import logging
import os
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, AsyncEngine, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from app.config import settings

logger = logging.getLogger(__name__)

# The study schema (13 telemetry tables). Applied on startup so a fresh cloud
# database (e.g. Render) is set up with no manual step; all statements are
# CREATE ... IF NOT EXISTS, so running it every boot is a harmless no-op.
STUDY_SQL_PATH = os.path.join(os.path.dirname(__file__), "..", "sql", "study.sql")

engine: AsyncEngine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

class Base(DeclarativeBase):
    pass

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

async def apply_study_schema() -> None:
    """Create the study tables if they don't exist yet (idempotent).

    study.sql starts with `CREATE EXTENSION IF NOT EXISTS postgis`, so this also
    provisions PostGIS on a fresh managed database. We run the whole script over
    the raw asyncpg connection because asyncpg's simple query protocol allows
    multiple `;`-separated statements in one call (the SQLAlchemy prepared-
    statement path does not)."""
    try:
        with open(STUDY_SQL_PATH, "r", encoding="utf-8") as f:
            script = f.read()
    except FileNotFoundError:
        logger.warning("study.sql not found at %s; skipping study schema", STUDY_SQL_PATH)
        return
    async with engine.connect() as conn:
        raw = await conn.get_raw_connection()
        asyncpg_conn = raw.driver_connection      # the underlying asyncpg.Connection
        await asyncpg_conn.execute(script)
    logger.info("Study schema applied (idempotent).")


async def init_db() -> None:
    # provision PostGIS + study tables first (so a fresh DB has them), then
    # confirm PostGIS is live.
    await apply_study_schema()
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT PostGIS_Version();"))
            version = result.scalar()
            logger.info(f"PostgreSQL/PostGIS connecté — version {version}")
    except Exception as e:
        logger.critical(f"Connexion impossible : {e}")
        raise

async def close_db() -> None:
    await engine.dispose()
    logger.info("Connexion fermée.")