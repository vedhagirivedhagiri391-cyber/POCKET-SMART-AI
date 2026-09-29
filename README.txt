POCKETSMART AI - COMPLETE PROJECT

Folder structure
----------------
PocketSmart-AI/
  app/
    main.py
    static/
      index.html
    requirements.txt
  run_windows.bat
  README.txt

RUN ON WINDOWS
--------------
1. Install Python 3.
2. Open this folder in VS Code.
3. Double-click run_windows.bat
   OR use VS Code Terminal:
      python -m venv .venv
      .venv\Scripts\python.exe -m pip install -r app\requirements.txt
      .venv\Scripts\python.exe app\main.py
4. Open:
      http://127.0.0.1:8000

The HTML is served by FastAPI, so the /api calls work without opening
the HTML as file://.

Database
--------
SQLite database is automatically created as:
app/pocketsmart.db

API
---
GET    /api/health
GET    /api/income
POST   /api/income
GET    /api/expenses
POST   /api/expenses
DELETE /api/expenses/{id}
GET    /api/budgets
POST   /api/budgets
GET    /api/summary
GET    /api/recommendations
