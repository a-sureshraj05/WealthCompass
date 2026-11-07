"""Add encrypted, user-scoped SPY trade-timing valuations."""
from alembic import op
import sqlalchemy as sa

revision = "c0926f46b738"
down_revision = "7d0a241b51ae"
branch_labels = None
depends_on = None


def upgrade():
    if "portfolio_trade_benchmark" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table("portfolio_trade_benchmark",
                    sa.Column("id", sa.Integer(), primary_key=True),
                    sa.Column("user_id", sa.Integer(), nullable=False),
                    sa.Column("date", sa.Date(), nullable=False),
                    sa.Column("total_value", sa.Text()), sa.Column("cash", sa.Text()),
                    sa.UniqueConstraint("user_id", "date", name="uq_trade_benchmark_user_date"))
    op.create_index("ix_portfolio_trade_benchmark_user_id", "portfolio_trade_benchmark", ["user_id"])


def downgrade():
    op.drop_table("portfolio_trade_benchmark")
