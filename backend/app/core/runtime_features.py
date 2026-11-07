"""Presentation policy for the single staging performance-demo account."""
import os

PERFORMANCE_DEMO_EMAIL = "demouser@gmail.com"
# Verified staging service identity, supplied by Render rather than HTTP headers.
# This lets the existing service opt in without a separate Blueprint resync.
STAGING_RENDER_SERVICE_ID = "srv-dbj87tm7bikc73empnng"


def performance_demo_enabled() -> bool:
    environment = os.getenv("WC_APP_ENV", "").strip().lower()
    known_staging_service = (
        os.getenv("RENDER", "").strip().lower() == "true"
        and os.getenv("RENDER_SERVICE_ID", "") == STAGING_RENDER_SERVICE_ID
        and os.getenv("RENDER_GIT_BRANCH", "") == "staging"
    )
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
