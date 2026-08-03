"""
Request/response models for the study write endpoints.

Pydantic validates every incoming body against these shapes before our code
runs, and FastAPI turns them into the auto docs at /docs. Keep them aligned with
the tables in backend/sql/study.sql.
"""
from datetime import datetime
from pydantic import BaseModel


# --- session lifecycle ------------------------------------------------------

class SessionCreate(BaseModel):
    code: str                        # participant code, typed at launch (e.g. 'P07')
    mode: str = "solo"               # 'solo' | 'friends'
    group_code: str | None = None    # join code for the friends condition
    consented: bool = False          # did the participant accept the consent screen
    app_version: str | None = None
    user_agent: str | None = None


class SessionCreated(BaseModel):
    session_id: int
    participant_id: int


# --- onboarding & profile ---------------------------------------------------

class OnboardingChoiceIn(BaseModel):
    axis: str
    left_card_id: str | None = None
    right_card_id: str | None = None
    chosen_side: str | None = None   # 'left' | 'right'
    chosen_card_id: str | None = None


class SliderChangeIn(BaseModel):
    axis: str
    value: float


class ProfileIn(BaseModel):
    source: str                      # 'onboarding' | 'edit' | 'route'
    vector: dict[str, float | None]  # {"quiet_lively": 0.4, ...}


# --- routes -----------------------------------------------------------------

class RouteIn(BaseModel):
    route_type: str | None = None    # 'fastest' | 'enjoyable' | ...
    profile: dict | None = None      # preference vector used to build it
    params: dict | None = None       # start point, duration target, etc.
    geojson: dict                    # a GeoJSON LineString geometry
    length_m: float | None = None
    est_min: float | None = None


class RouteCreated(BaseModel):
    route_id: int


class RouteChoiceIn(BaseModel):
    route_id: int


# --- gps trace --------------------------------------------------------------

class GpsPointIn(BaseModel):
    ts: datetime                     # device fix time (ISO 8601)
    lat: float
    lng: float
    accuracy_m: float | None = None
    speed: float | None = None
    heading: float | None = None


# --- search & social --------------------------------------------------------

class SearchIn(BaseModel):
    query: str
    kind: str | None = None          # 'vibe' | 'function' | 'place'


class FavoriteIn(BaseModel):
    street_name: str | None = None
    edge_id: str | None = None
    note: str | None = None


# --- generic events ---------------------------------------------------------

class AppEventIn(BaseModel):
    event_type: str
    payload: dict | None = None


# --- shared response --------------------------------------------------------

class CountOut(BaseModel):
    inserted: int
