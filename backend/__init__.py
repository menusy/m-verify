"""
Package marker for the m-verify backend.

Having an explicit package allows relative imports when the app is run via
`uvicorn backend.main:app` as well as when executing `python backend/main.py`.
"""


