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
    code: str                        # stable unique handle, typed at launch (e.g. 'min')
    display_name: str | None = None  # free editable label; defaults to `code` on first creation
    mode: str = "solo"               # 'solo' | 'friends'
    group_code: str | None = None    # join code for the friends condition
    consented: bool = False          # did the participant accept the consent screen
    app_version: str | None = None
    user_agent: str | None = None


class FriendOut(BaseModel):
    participant_id: int
    display_name: str | None = None
    friend_code: str | None = None
    profile: dict[str, float | None] | None = None   # friend's latest vector, for taste merge


class SessionCreated(BaseModel):
    session_id: int
    participant_id: int
    display_name: str | None = None                  # the account's current display label
    friend_code: str | None = None                   # my own shareable code (others enter it to add me)
    is_returning: bool = False                       # True if the handle already existed (recovery)
    profile: dict[str, float | None] | None = None   # latest saved preference vector, for rehydration
    friends: list[FriendOut] = []                    # my current friends (with their vectors)


class RenameIn(BaseModel):
    display_name: str                # new free display label for the session's participant


class AddFriendIn(BaseModel):
    friend_code: str                 # the code shown on the other person's phone


class FriendsOut(BaseModel):
    friends: list[FriendOut] = []


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


class FriendSearchOut(BaseModel):
    """A category a friend has been searching for repeatedly (used to nudge the
    walker: 'your friend keeps looking for cafés')."""
    participant_id: int
    display_name: str | None = None
    query: str                       # the searched term / category label
    kind: str | None = None
    count: int                       # how many times within the recent window
    last_ts: datetime                # most recent occurrence


class FriendActivityOut(BaseModel):
    activity: list[FriendSearchOut] = []


class FavoriteIn(BaseModel):
    street_name: str | None = None
    edge_id: str | None = None
    note: str | None = None


class FriendFavoriteOut(BaseModel):
    """A street a FRIEND has shared as a favourite (surfaced on my map + profile)."""
    participant_id: int               # who shared it
    display_name: str | None = None   # their label, for the "liked by X" tag
    street_name: str | None = None
    edge_id: str | None = None
    note: str | None = None
    ts: datetime


class FriendFavoritesOut(BaseModel):
    favorites: list[FriendFavoriteOut] = []


# --- shared walk (friends mode) ---------------------------------------------

class WalkCreate(BaseModel):
    invite: list[int] = []                            # participant ids to invite (must be friends)
    vector: dict[str, float | None] | None = None     # the HOST's taste snapshot
    levels: dict[str, str] | None = None              # the host's declared per-axis levels


class WalkAnswerIn(BaseModel):
    accept: bool                                      # False = decline the invitation
    vector: dict[str, float | None] | None = None     # my taste snapshot, frozen at this moment
    levels: dict[str, str] | None = None


class WalkStateIn(BaseModel):
    """A patch on the negotiation. `patch` maps axis -> settlement, or axis -> null to
    clear that axis. `base_version` is the version the client last saw: if the walk has
    moved on since, the write is refused so the client re-reads instead of clobbering
    someone else's change."""
    patch: dict[str, dict | None]
    base_version: int | None = None
    action: str | None = None                         # 'propose' | 'accept' | 'counter' | 'undo'
    axis: str | None = None                           # which axis the action was about


class WalkStatusIn(BaseModel):
    status: str                                       # 'active' | 'ended'


class WalkMemberOut(BaseModel):
    participant_id: int
    display_name: str | None = None
    role: str
    status: str
    vector: dict[str, float | None] | None = None
    levels: dict[str, str] | None = None


class WalkOut(BaseModel):
    walk_id: int
    host_id: int
    me: int                                           # the asking participant, so the client
    status: str                                       # knows which member row is itself
    state: dict = {}
    version: int
    members: list[WalkMemberOut] = []


# --- generic events ---------------------------------------------------------

class AppEventIn(BaseModel):
    event_type: str
    payload: dict | None = None


# --- shared response --------------------------------------------------------

class CountOut(BaseModel):
    inserted: int
