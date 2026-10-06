"""Users and role rules; provider metadata never grants permissions."""

from dataclasses import dataclass

ROLE_RANK = {"learner": 0, "teacher": 1, "admin": 2, "super_admin": 3}
LEGACY_ROLES = {"instructor": "teacher", "reviewer": "admin"}


@dataclass
class User:
    id: str | None
    role: str
    email: str | None = None

    def __post_init__(self):
        # Keep existing Supabase profiles working until the role migration is applied.
        self.role = LEGACY_ROLES.get(self.role, self.role)


ANONYMOUS = User(id=None, role="anonymous")


def has_role(user: User, minimum: str) -> bool:
    return ROLE_RANK.get(user.role, -1) >= ROLE_RANK[minimum]
