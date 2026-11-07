"""Server-controlled presentation and per-account performance policy."""
import os

PERFORMANCE_DEMO_EMAIL = "demouser@gmail.com"
# Verified staging service identity, supplied by Render rather than HTTP headers.
# This lets the existing service opt in without a separate Blueprint resync.
STAGING_RENDER_SERVICE_ID = "srv-dbj87tm7bikc73empnng"
PRODUCTION_RENDER_SERVICE_ID = "srv-dbj6lqm7bikc73eim1d0"


def known_production_service() -> bool:
    """Verified service metadata, including the legacy production source."""
    return (
        os.getenv("RENDER", "").strip().lower() == "true"
        and os.getenv("RENDER_SERVICE_ID", "") == PRODUCTION_RENDER_SERVICE_ID
        and os.getenv("RENDER_GIT_BRANCH", "") in {"main", "design/cloud-launch"}
    )


def performance_demo_enabled() -> bool:
    environment = os.getenv("WC_APP_ENV", "").strip().lower()
    known_staging_service = (
        os.getenv("RENDER", "").strip().lower() == "true"
        and os.getenv("RENDER_SERVICE_ID", "") == STAGING_RENDER_SERVICE_ID
        and os.getenv("RENDER_GIT_BRANCH", "") == "staging"
    )
    # An explicitly configured production instance requires opt-in. The verified
    # existing service also works before its dashboard/Blueprint flags are synced.
    known_production = known_production_service()
    if environment == "production":
        return os.getenv("WC_PERFORMANCE_DEMO", "true" if known_production else "false").strip().lower() == "true"
    if not environment and known_production:
        return os.getenv("WC_PERFORMANCE_DEMO", "true").strip().lower() == "true"
    if environment and environment != "staging":
        return False
    if environment != "staging" and not known_staging_service:
        return False
    flag = os.getenv("WC_PERFORMANCE_DEMO")
    if flag is not None:
        return flag.strip().lower() == "true"
    return known_staging_service


def performance_demo_for_user(user) -> bool:
    return (
        performance_demo_enabled()
        and str(getattr(user, "email", "")).strip().casefold() == PERFORMANCE_DEMO_EMAIL
    )


def staging_environment() -> bool:
    """Trust deployment configuration/service identity, never a request hostname."""
    environment = os.getenv('WC_APP_ENV', '').strip().lower()
    if environment:
        return environment == 'staging'
    return (
        os.getenv('RENDER', '').strip().lower() == 'true'
        and os.getenv('RENDER_SERVICE_ID', '') == STAGING_RENDER_SERVICE_ID
        and os.getenv('RENDER_GIT_BRANCH', '') == 'staging'
    )


def refined_ui_enabled() -> bool:
    environment = os.getenv('WC_APP_ENV', '').strip().lower()
    known_production = known_production_service()
    if environment == 'production' or not environment and known_production:
        return os.getenv('WC_REFINED_UI', 'true' if known_production else 'false').strip().lower() == 'true'
    return staging_environment() and os.getenv('WC_REFINED_UI', 'true').strip().lower() == 'true'


def holding_performance_preview_enabled() -> bool:
    # This uses simulated prices and stays a staging design-review feature.
    return staging_environment() and refined_ui_enabled() and os.getenv('WC_HOLDING_PERFORMANCE_PREVIEW', 'true').strip().lower() == 'true'
