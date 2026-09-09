"""Make `backend.*` importable regardless of how pytest is invoked.

Without this, tests import `backend.app...` only when something else has already
put the project root on `sys.path`. Two of the existing test modules do that as a
module-level side effect, which means the suite passes when run in full — the
alphabetically-first module fixes the path for everyone after it — and a single
module run on its own fails with `ModuleNotFoundError: No module named 'backend'`.

Depending on collection order is a trap: it works until someone renames a file or
runs one test, and the failure looks like a broken import rather than a missing
path entry. conftest.py is imported before any test module, so putting it here
makes every invocation behave the same.
"""

import os
import sys

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
