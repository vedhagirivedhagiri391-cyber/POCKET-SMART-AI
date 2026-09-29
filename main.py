from pathlib import Path
import sqlite3

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import uvicorn

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DB_FILE = BASE_DIR / "pocketsmart.db"

app = FastAPI(title="PocketSmart AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = db()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            income REAL NOT NULL DEFAULT 0
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            amount REAL NOT NULL,
            note TEXT DEFAULT '',
            date TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT UNIQUE NOT NULL,
            limit_amount REAL NOT NULL
        )
    """)

    cur.execute("INSERT OR IGNORE INTO settings (id, income) VALUES (1, 0)")

    defaults = [
        ("Food", 6000),
        ("Transport", 3000),
        ("Shopping", 4000),
        ("Bills", 5000),
        ("Entertainment", 2500),
        ("Other", 2500),
    ]

    for category, limit_amount in defaults:
        cur.execute(
            "INSERT OR IGNORE INTO budgets (category, limit_amount) VALUES (?, ?)",
            (category, limit_amount),
        )

    conn.commit()
    conn.close()


init_db()


class IncomeRequest(BaseModel):
    amount: float


class ExpenseRequest(BaseModel):
    category: str
    amount: float
    note: str = ""
    date: str


class BudgetRequest(BaseModel):
    category: str
    limit: float


@app.get("/")
def home():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health():
    return {"status": "ok", "message": "PocketSmart AI backend is running"}


@app.get("/api/income")
def get_income():
    conn = db()
    row = conn.execute("SELECT income FROM settings WHERE id=1").fetchone()
    conn.close()
    return {"income": row["income"] if row else 0}


@app.post("/api/income")
def save_income(data: IncomeRequest):
    if data.amount < 0:
        raise HTTPException(400, "Income cannot be negative")

    conn = db()
    conn.execute("UPDATE settings SET income=? WHERE id=1", (data.amount,))
    conn.commit()
    conn.close()

    return {"message": "Income saved", "income": data.amount}


@app.get("/api/expenses")
def get_expenses():
    conn = db()
    rows = conn.execute("""
        SELECT id, category, amount, note, date
        FROM expenses
        ORDER BY date DESC, id DESC
    """).fetchall()
    conn.close()

    return [dict(row) for row in rows]


@app.post("/api/expenses")
def add_expense(data: ExpenseRequest):
    if data.amount <= 0:
        raise HTTPException(400, "Expense amount must be greater than 0")
    if not data.category.strip():
        raise HTTPException(400, "Category is required")
    if not data.date:
        raise HTTPException(400, "Date is required")

    conn = db()
    cur = conn.execute("""
        INSERT INTO expenses (category, amount, note, date)
        VALUES (?, ?, ?, ?)
    """, (data.category, data.amount, data.note, data.date))
    expense_id = cur.lastrowid
    conn.commit()
    conn.close()

    return {"message": "Expense added", "id": expense_id}


@app.delete("/api/expenses/{expense_id}")
def delete_expense(expense_id: int):
    conn = db()
    cur = conn.execute("DELETE FROM expenses WHERE id=?", (expense_id,))
    conn.commit()
    conn.close()

    if cur.rowcount == 0:
        raise HTTPException(404, "Expense not found")

    return {"message": "Expense deleted"}


@app.get("/api/budgets")
def get_budgets():
    conn = db()
    rows = conn.execute("""
        SELECT category, limit_amount
        FROM budgets
        ORDER BY id
    """).fetchall()
    conn.close()

    return [{"category": r["category"], "limit": r["limit_amount"]} for r in rows]


@app.post("/api/budgets")
def save_budget(data: BudgetRequest):
    if data.limit < 0:
        raise HTTPException(400, "Budget cannot be negative")

    conn = db()
    conn.execute("""
        INSERT INTO budgets (category, limit_amount)
        VALUES (?, ?)
        ON CONFLICT(category)
        DO UPDATE SET limit_amount=excluded.limit_amount
    """, (data.category, data.limit))
    conn.commit()
    conn.close()

    return {"message": "Budget saved"}


@app.get("/api/summary")
def summary():
    conn = db()

    income_row = conn.execute(
        "SELECT income FROM settings WHERE id=1"
    ).fetchone()
    income = income_row["income"] if income_row else 0

    total_row = conn.execute(
        "SELECT COALESCE(SUM(amount),0) AS total FROM expenses"
    ).fetchone()
    total_spend = total_row["total"]

    category_rows = conn.execute("""
        SELECT category, COALESCE(SUM(amount),0) AS total
        FROM expenses
        GROUP BY category
    """).fetchall()

    budget_rows = conn.execute("""
        SELECT category, limit_amount
        FROM budgets
        ORDER BY id
    """).fetchall()

    conn.close()

    spend_by_category = {
        r["category"]: r["total"] for r in category_rows
    }

    budgets = [
        {"category": r["category"], "limit": r["limit_amount"]}
        for r in budget_rows
    ]

    return {
        "income": income,
        "totalSpend": total_spend,
        "remaining": income - total_spend,
        "spendByCategory": spend_by_category,
        "budgets": budgets,
    }


@app.get("/api/recommendations")
def recommendations():
    conn = db()

    income_row = conn.execute(
        "SELECT income FROM settings WHERE id=1"
    ).fetchone()
    income = income_row["income"] if income_row else 0

    rows = conn.execute("""
        SELECT category, SUM(amount) AS total
        FROM expenses
        GROUP BY category
        ORDER BY total DESC
    """).fetchall()

    budget_rows = conn.execute("""
        SELECT category, limit_amount
        FROM budgets
    """).fetchall()

    conn.close()

    spend = {r["category"]: r["total"] for r in rows}
    budget = {r["category"]: r["limit_amount"] for r in budget_rows}

    result = []

    total_spend = sum(spend.values())

    if total_spend == 0:
        result.append({
            "level": "info",
            "category": "Getting started",
            "message": "Add your first expense to receive personalized budget recommendations."
        })
    else:
        if income > 0 and total_spend > income:
            result.append({
                "level": "alert",
                "category": "Budget alert",
                "message": "Your spending is currently higher than your income. Review non-essential expenses."
            })
        elif income > 0 and total_spend >= income * 0.8:
            result.append({
                "level": "warning",
                "category": "Spending",
                "message": "You have used 80% or more of your income. Keep an eye on remaining expenses."
            })
        else:
            result.append({
                "level": "good",
                "category": "Good progress",
                "message": "Your spending is currently within your recorded income."
            })

        if rows:
            top = rows[0]
            result.append({
                "level": "info",
                "category": "Top category",
                "message": f"{top['category']} is currently your highest spending category."
            })

        for category, amount in spend.items():
            limit = budget.get(category)
            if limit and amount >= limit:
                result.append({
                    "level": "alert",
                    "category": category,
                    "message": f"You have reached or exceeded your {category} budget."
                })

    return {"recommendations": result}


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
