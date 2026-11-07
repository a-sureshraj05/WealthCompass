"""Non-secret runtime presentation settings; disabled unless explicitly staged."""
import os


def performance_demo_enabled() -> bool:
    return (
        os.getenv("WC_APP_ENV", "").strip().lower() == "staging"
        and os.getenv("WC_PERFORMANCE_DEMO", "").strip().lower() == "true"
    )
