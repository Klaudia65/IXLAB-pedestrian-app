import logging
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, AsyncEngine, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from app.config import settings

logger = logging.getLogger(__name__)

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

async def init_db() -> None:
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