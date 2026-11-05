"""initial schema

Revision ID: d02b82516fcb
Revises:
Create Date: 2026-11-02 05:50:01.945512
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd02b82516fcb'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Initial migration for an empty demo/production database.
    from app.core.database import Base
    from app import models  # noqa: F401

    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    from app.core.database import Base
    from app import models  # noqa: F401

    Base.metadata.drop_all(bind=op.get_bind())
