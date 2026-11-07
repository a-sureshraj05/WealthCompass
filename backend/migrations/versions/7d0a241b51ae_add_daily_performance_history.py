"""Add historical market prices and user-scoped encrypted daily performance."""
from alembic import op
import sqlalchemy as sa

revision = "7d0a241b51ae"
down_revision = "ae63ff99f2cb"
branch_labels = None
depends_on = None


def upgrade():
    # Existing installations may already have additive tables from create_all.
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if "historical_prices" not in existing:
        op.create_table("historical_prices", sa.Column("symbol", sa.String(), primary_key=True), sa.Column("date", sa.Date(), primary_key=True), sa.Column("close", sa.Float()), sa.Column("adjusted_close", sa.Float()), sa.Column("split_ratio", sa.Float(), nullable=False), sa.Column("currency", sa.String(), nullable=False), sa.Column("fetched_at", sa.DateTime(), nullable=False))
    if "portfolio_daily_values" not in existing:
        op.create_table("portfolio_daily_values", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), nullable=False), sa.Column("date", sa.Date(), nullable=False),
                        sa.Column("holdings_value", sa.Text()), sa.Column("cash", sa.Text(), nullable=False), sa.Column("total_value", sa.Text()), sa.Column("deposits", sa.Text(), nullable=False), sa.Column("withdrawals", sa.Text(), nullable=False), sa.Column("spy_index", sa.Float()), sa.Column("complete", sa.Boolean(), nullable=False), sa.UniqueConstraint("user_id", "date", name="uq_portfolio_daily_user_date"))
        op.create_index("ix_portfolio_daily_values_user_id", "portfolio_daily_values", ["user_id"])
    if "portfolio_performance_state" not in existing:
        op.create_table("portfolio_performance_state", sa.Column("user_id", sa.Integer(), primary_key=True), sa.Column("opening_cash", sa.Text()), sa.Column("fingerprint", sa.String()), sa.Column("result", sa.Text()), sa.Column("generated_at", sa.DateTime()))


def downgrade():
    op.drop_table("portfolio_performance_state")
    op.drop_table("portfolio_daily_values")
    op.drop_table("historical_prices")
