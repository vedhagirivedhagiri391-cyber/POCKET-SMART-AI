@echo off
title PocketSmart AI
cd /d "%~dp0"

echo ==========================================
echo       PocketSmart AI - Backend
echo ==========================================
echo.

if not exist ".venv\Scripts\python.exe" (
    echo Creating virtual environment...
    python -m venv .venv
)

echo Installing required packages...
.venv\Scripts\python.exe -m pip install -r requirements.txt

echo.
echo Starting PocketSmart AI...
echo Open: http://127.0.0.1:8000
echo Press CTRL+C to stop the server.
echo.

.venv\Scripts\python.exe app\main.py
pause
<!DOCTYPE html>
<html>
<head>...fonts + <style> theme...</head>
<body>
  <div class="app">
    <header>...</header>
    <div class="balance-card">...</div>
    <div class="grid">
      <div><!-- income form, expense form, budget bars --></div>
      <div><!-- recommendations, expense ledger --></div>
    </div>
  </div>
  <script>
    const API = "/api";
    async function api(path, opts){ /* fetch wrapper */ }
    async function loadAll(){ /* calls /summary, /expenses, /recommendations */ }
    // renderSummary(), renderBudgets(), renderExpenses(), renderRecos()
    // button click handlers for saveIncomeBtn / addExpenseBtn
  </script>
</body>
</html>