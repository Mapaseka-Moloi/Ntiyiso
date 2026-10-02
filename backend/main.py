"""Compatibility entry point.

This is the `uvicorn main:app` entry point the WhatsApp shield was built around,
kept working so nothing a teammate documented stops running.

**It serves the same application as `python -m backend`.** There is no second
API here: `backend/app.py` holds the routes, and this file only re-exports the
application object. That is the whole reason the two cannot drift.

Both import styles work, because the two ways people run this differ:

python -m backend                       # from the repository root
    from backend.main import app            # imported as part of the package
    cd backend && uvicorn main:app          # run from inside the folder

The original used absolute imports (`from routes.whatsapp import router`), which
only worked in the third of those and broke the other two.
"""

try:  # imported as part of the package
    from .app import app
except ImportError:
    # `cd backend && uvicorn main:app` makes this file a top-level module, and a
    # top-level module has no package to be relative to. Putting the *parent*
    # directory on the path re-forms the package instead of rewriting every
    # relative import in the API to suit one way of launching it.
    import os
    import sys

    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from backend.app import app  # type: ignore[no-redef]

__all__ = ["app"]
