from sqlalchemy import (Boolean, Column, Date, DateTime, Float, Integer,
                        String, UniqueConstraint)
from sqlalchemy.ext.declarative import declarative_base

from backend.app.core.crypto import EncryptedFloat, EncryptedJSON, EncryptedString

Base = declarative_base()

# --- Multi-tenancy -----------------------------------------------------------
# Every table holding portfolio data carries `user_id`, and every read filters
# on it.
#
# NOT NULL, and deliberately without a server default: an insert that forgets to
# set user_id raises an IntegrityError instead of quietly landing in whichever
# account the default names. In a multi-tenant system a fail-open default is the
# bug that writes one person's trades into another person's portfolio, so the
# column refuses to guess.
#
# Migrating an existing single-user database is therefore a two-step backfill
# (add nullable, set user_id, rebuild NOT NULL) rather than one ALTER with a
# DEFAULT clause — the leftover default would reintroduce exactly the fail-open
# behaviour this avoids. See backend/scripts/migrate_user_scope.py.
#
# `users` and `stock_splits` are deliberately NOT scoped. `users` is the scope
# itself; split ratios are public reference data, identical for everyone.
#
# USER_SCOPED_MODELS at the bottom is the authoritative list — the scoping
# helper, the migration, and the cross-tenant leak test all read from it rather
# than each keeping a copy that could drift.


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    # Seeded demo/test accounts. Blocks operations that spend the operator's
    # credentials against a third party — brokerage sync today, the AI chat when
    # it lands. Public market data (quotes, analyst targets) stays available, or
    # the demo would show a portfolio with no prices.
    #
    # Deliberately a column rather than config: it travels with the row, so it
    # still holds if a demo database is ever started without WC_DEMO_MODE set.
    # Defaults to False so a real account is never mistaken for a fixture.
    is_test_user = Column(Boolean, default=False, nullable=False, server_default="0")

    # --- Encryption (T2) ------------------------------------------------------
    # All nullable: a user row created before this phase shipped has none of
    # these set, which is exactly how auth.login() detects a legacy account
    # and runs the one-time upgrade (crypto_migrate.enable_encryption_for_user)
    # instead of a normal unwrap. See backend/app/core/crypto.py.
    dek_salt = Column(String, nullable=True)
    wrapped_dek = Column(String, nullable=True)
    kek_params_json = Column(String, nullable=True)
    recovery_salt = Column(String, nullable=True)
    recovery_wrapped_dek = Column(String, nullable=True)
    # Set by POST /auth/confirm-recovery-key once the frontend confirms the
    # user has saved their one-time recovery key. Informational only today —
    # nothing gates on it yet.
    recovery_key_confirmed_at = Column(DateTime, nullable=True)


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    brokerage = Column(String)
    account_id = Column(Integer, nullable=True)
    date = Column(DateTime)
    ticker = Column(String)
    name = Column(String)
    action = Column(String)
    quantity = Column(EncryptedFloat)
    price = Column(EncryptedFloat)
    costPerShare = Column(EncryptedFloat)
    totalCost = Column(EncryptedFloat)
    assetType = Column(String)
    source = Column(String)
    raw_id = Column(Integer, nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False, server_default="0")
    is_override = Column(Boolean, default=False, nullable=False, server_default="0")
    is_duplicate = Column(Boolean, default=False, nullable=False, server_default="0")
    # Manually set only — never written by any loader, sync, or automated process.
    # Set exclusively via PATCH /transactions/{id}/verify when working with Claude.
    is_backend_verified = Column(Boolean, default=False, nullable=False, server_default="0")
    current_brokerage = Column(String, nullable=True)  # set when shares transferred to another brokerage
    original_values = Column(String, nullable=True)
    option_symbol = Column(String, nullable=True)  # OCC option symbol e.g. MSFT250117C00400000


class ManualRawTransaction(Base):
    __tablename__ = "manual_raw_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    brokerage = Column(String)
    date = Column(DateTime)
    ticker = Column(String)
    name = Column(String)
    action = Column(String)
    quantity = Column(EncryptedFloat)
    price = Column(EncryptedFloat)
    costPerShare = Column(EncryptedFloat)
    totalCost = Column(EncryptedFloat)
    assetType = Column(String)


class Holding(Base):
    __tablename__ = "holdings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    brokerage = Column(String, index=True)
    account_id = Column(Integer, nullable=True)
    ticker = Column(String, index=True)
    quantity = Column(EncryptedFloat)
    averageCostPerShare = Column(EncryptedFloat)
    totalCost = Column(EncryptedFloat)
    # Live market data, not cost basis — stays plaintext (see crypto.py docstring
    # and docs/ARCHITECTURE.md §11.3). Encrypting a public quote buys nothing
    # and would block background price refresh, which has no DEK to work with.
    currentPrice = Column(Float)
    previousClose = Column(Float, default=0.0)
    marketValue = Column(EncryptedFloat)
    assetType = Column(String)


class RealizedGain(Base):
    __tablename__ = "realized_gains"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    brokerage = Column(String)
    ticker = Column(String)
    buyDate = Column(DateTime)
    sellDate = Column(DateTime)
    quantity = Column(EncryptedFloat)
    buyPrice = Column(EncryptedFloat)
    sellPrice = Column(EncryptedFloat)
    gain = Column(EncryptedFloat)
    isLongTerm = Column(Boolean)
    assetType = Column(String)
    is_wash_sale = Column(Boolean, default=False, nullable=False, server_default="0")
    # No server_default here deliberately: a DB-level default bypasses the
    # ORM's TypeDecorator and would insert the literal text "0" rather than
    # ciphertext, which would then fail to decrypt. The Python-side `default`
    # below goes through encryption correctly; that is the only default path
    # an encrypted column can safely have.
    wash_sale_disallowed_amount = Column(EncryptedFloat, default=0.0, nullable=False)


class UnrealizedGain(Base):
    __tablename__ = "unrealized_gains"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    brokerage = Column(String)
    account_id = Column(Integer, nullable=True)
    ticker = Column(String)
    buyDate = Column(DateTime)
    quantity = Column(EncryptedFloat)
    buyPrice = Column(EncryptedFloat)
    # Live quotes — public market data, not cost basis. Stay plaintext; see
    # the Holding.currentPrice comment above for why.
    currentPrice = Column(Float)
    prevClose = Column(Float, nullable=True)
    unrealizedGain = Column(EncryptedFloat)
    isLongTerm = Column(Boolean)
    assetType = Column(String)
    # Type 1: this lot absorbed a disallowed wash sale loss
    wash_sale_adjustment = Column(Float, default=0.0, nullable=False, server_default="0")
    wash_sale_clear_date = Column(Date, nullable=True)   # safe-to-sell-at-loss date
    # Type 2: selling this lot at a loss today would be disallowed
    wash_sale_at_risk = Column(Boolean, default=False, nullable=False, server_default="0")
    wash_sale_risk_trigger_date = Column(Date, nullable=True)  # the recent buy causing the risk
    option_symbol = Column(String, nullable=True)


class OptionsRetain(Base):
    __tablename__ = "options_retain"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    brokerage = Column(String, nullable=False)
    ticker = Column(String, nullable=False)
    buy_date = Column(DateTime, nullable=False)
    retain_quantity = Column(Float, nullable=False, default=0)

    # Scoped by user: two users may legitimately hold the same lot key.
    __table_args__ = (UniqueConstraint("user_id", "brokerage", "ticker", "buy_date",
                                       name="uq_options_retain"),)


class PortfolioSummary(Base):
    """Per-user cache of precomputed/fetched portfolio stats.

    Was a single row pinned at id=1. Now one row per user, keyed by user_id.
    """
    __tablename__ = "portfolio_summary"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True, unique=True, nullable=False)
    cash_balance = Column(EncryptedFloat, default=0.0)
    buying_power_json = Column(EncryptedJSON, nullable=True)  # {brokerage: amount}
    analyst_json = Column(String, nullable=True)       # JSON: [AnalystData, ...]
    # JSON: {key: value} — UI preferences that should follow the user between
    # devices rather than living in one browser's localStorage.
    ui_prefs_json = Column(String, nullable=True)
    # JSON: {text, generated_at} — last AI portfolio insights. Cached for the
    # same reason as the two above, and one more: generating it costs money, so
    # the stored copy serves every subsequent view until it is regenerated.
    insights_json = Column(String, nullable=True)


class TickerReference(Base):
    __tablename__ = "ticker_references"

    # Composite key: the same ticker can be held by several users with
    # different first-purchase dates, so ticker alone is no longer unique.
    ticker = Column(String, primary_key=True, index=True)
    user_id = Column(Integer, primary_key=True, index=True, nullable=False)
    first_addition_date = Column(Date)
    price = Column(Float)


class BrokerageAccount(Base):
    """One row per brokerage account — the authoritative name reference."""
    __tablename__ = "brokerage_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    snaptrade_account_id = Column(String, nullable=False)
    brokerage = Column(String, nullable=False)
    # Account nicknames are identifying in a way "Robinhood" as a brokerage
    # name is not — encrypted; see docs/ARCHITECTURE.md §11.3.
    name = Column(EncryptedString, nullable=False)

    # Unique per user rather than globally — the account id is only meaningful
    # within the connection that produced it.
    __table_args__ = (UniqueConstraint("user_id", "snaptrade_account_id",
                                       name="uq_brokerage_account"),)


class SnaptradeConnection(Base):
    __tablename__ = "snaptrade_connections"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    brokerage = Column(String)               # e.g. "Robinhood"
    brokerage_slug = Column(String)          # e.g. "ROBINHOOD"
    authorization_id = Column(String)        # Snaptrade's auth ID
    account_id = Column(String)              # Snaptrade account ID

    __table_args__ = (UniqueConstraint("user_id", "authorization_id",
                                       name="uq_snaptrade_connection"),)


class SnaptradeIgnoredAccount(Base):
    __tablename__ = "snaptrade_ignored_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    account_id = Column(String, nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "account_id",
                                       name="uq_snaptrade_ignored"),)


class StockSplit(Base):
    """Stock split events used to adjust historical buy lot quantities and prices.

    Global reference data — a split ratio is a property of the security, not of
    whoever holds it, so this table is deliberately not user-scoped.
    """
    __tablename__ = "stock_splits"

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String, nullable=False, index=True)
    split_date = Column(DateTime, nullable=False)
    numerator = Column(Float, nullable=False)    # e.g. 20 for a 20:1 split
    denominator = Column(Float, nullable=False)  # e.g.  1 for a 20:1 split

    __table_args__ = (UniqueConstraint("ticker", "split_date", name="uq_stock_split"),)


class TransactionSplitConfig(Base):
    """Persists user-defined splits on a raw transaction so they survive resets."""
    __tablename__ = "transaction_split_configs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    raw_id = Column(Integer, nullable=False, index=True)
    source = Column(String, nullable=False)  # 'manual' | 'snaptrade'
    # JSON list: [{"qty": float, "current_brokerage": str|null}, ...]
    # Sum of qty == original raw quantity. Order preserved on replay.
    pieces = Column(String, nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "raw_id", "source",
                                       name="uq_split_config"),)


class LotAssignment(Base):
    """Explicit mapping of a sell transaction to a specific buy transaction lot."""
    __tablename__ = "lot_assignments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    sell_transaction_id = Column(Integer, nullable=False, index=True)
    buy_transaction_id = Column(Integer, nullable=False, index=True)
    quantity = Column(Float, nullable=False)


class SnaptradeTransaction(Base):
    __tablename__ = "snaptrade_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    authorization_id = Column(String, index=True)
    brokerage = Column(String)
    account_id = Column(Integer, nullable=True)
    date = Column(DateTime)
    ticker = Column(String)
    name = Column(String)
    action = Column(String)
    quantity = Column(EncryptedFloat)
    price = Column(EncryptedFloat)
    amount = Column(EncryptedFloat)
    currency = Column(String)
    assetType = Column(String)
    option_symbol = Column(String, nullable=True)  # OCC option symbol e.g. MSFT250117C00400000
    # Unique per user rather than globally — the dedupe key only has to hold
    # within one user's own sync history.
    snaptrade_transaction_id = Column(String)

    __table_args__ = (UniqueConstraint("user_id", "snaptrade_transaction_id",
                                       name="uq_snaptrade_txn"),)


# Authoritative list of user-scoped models. Anything added here is automatically
# covered by the scoping helper, the migration, and the leak test.
USER_SCOPED_MODELS = (
    Transaction,
    ManualRawTransaction,
    SnaptradeTransaction,
    Holding,
    RealizedGain,
    UnrealizedGain,
    TickerReference,
    LotAssignment,
    TransactionSplitConfig,
    OptionsRetain,
    BrokerageAccount,
    SnaptradeConnection,
    SnaptradeIgnoredAccount,
    PortfolioSummary,
)
