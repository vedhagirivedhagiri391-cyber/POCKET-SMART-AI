/**
 * Pocket Smart AI - Backend
 * Zero dependencies: uses only Node's built-in `http` module.
 * Run with: node server.js
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 5000;
const DB_PATH = path.join(__dirname, "data", "db.json");
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");

// ---------- Storage helpers ----------

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const initial = {
      income: 0,
      budgets: [
        { category: "Food", limit: 6000 },
        { category: "Transport", limit: 2000 },
        { category: "Shopping", limit: 3000 },
        { category: "Bills", limit: 4000 },
        { category: "Entertainment", limit: 1500 },
        { category: "Other", limit: 1500 },
      ],
      expenses: [],
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ---------- Recommendation engine (rule-based) ----------

function buildRecommendations(db) {
  const tips = [];
  const spendByCategory = {};

  for (const e of db.expenses) {
    spendByCategory[e.category] = (spendByCategory[e.category] || 0) + Number(e.amount);
  }

  let totalSpend = 0;
  for (const amt of Object.values(spendByCategory)) totalSpend += amt;

  for (const b of db.budgets) {
    const spent = spendByCategory[b.category] || 0;
    const pct = b.limit > 0 ? (spent / b.limit) * 100 : 0;

    if (pct >= 100) {
      tips.push({
        level: "alert",
        category: b.category,
        message: `You've crossed your ${b.category} budget (₹${spent} of ₹${b.limit}). Try pausing non-essential ${b.category.toLowerCase()} spends for the rest of the month.`,
      });
    } else if (pct >= 80) {
      tips.push({
        level: "warning",
        category: b.category,
        message: `${b.category} spending is at ${Math.round(pct)}% of budget (₹${spent} of ₹${b.limit}). A little more room, spend carefully.`,
      });
    } else if (pct <= 30 && spent > 0) {
      tips.push({
        level: "good",
        category: b.category,
        message: `Nice, ${b.category} spending is well under control (₹${spent} of ₹${b.limit}).`,
      });
    }
  }

  if (db.income > 0) {
    const savingsRate = ((db.income - totalSpend) / db.income) * 100;
    if (savingsRate < 0) {
      tips.push({
        level: "alert",
        category: "Overall",
        message: `You've spent more than your income this period (₹${totalSpend} vs ₹${db.income} income). Review your biggest categories below.`,
      });
    } else if (savingsRate < 10) {
      tips.push({
        level: "warning",
        category: "Overall",
        message: `You're only saving about ${Math.round(savingsRate)}% of your income. Aim for at least 20% if possible.`,
      });
    } else {
      tips.push({
        level: "good",
        category: "Overall",
        message: `You're saving about ${Math.round(savingsRate)}% of your income this period. Keep it up.`,
      });
    }
  }

  const sorted = Object.entries(spendByCategory).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0) {
    const [topCat, topAmt] = sorted[0];
    tips.push({
      level: "info",
      category: topCat,
      message: `Your top spending category is ${topCat} at ₹${topAmt}. Small cuts here have the biggest impact.`,
    });
  }

  if (tips.length === 0) {
    tips.push({
      level: "info",
      category: "Overall",
      message: "Add a few expenses to start getting personalized recommendations.",
    });
  }

  return tips;
}

// ---------- Tiny HTTP helpers (replaces express) ----------

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = "";
    req.on("data", (c) => (chunks += c));
    req.on("end", () => {
      if (!chunks) return resolve({});
      try {
        resolve(JSON.parse(chunks));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

function serveStatic(req, res, pathname) {
  let filePath = pathname === "/" ? "/index.html" : pathname;
  const fullPath = path.join(FRONTEND_DIR, filePath);

  if (!fullPath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  });
}

// ---------- Router ----------

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = parsed;
  const { method } = req;

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  try {
    if (pathname === "/api/health" && method === "GET") {
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === "/api/state" && method === "GET") {
      return sendJson(res, 200, readDb());
    }

    if (pathname === "/api/expenses" && method === "GET") {
      return sendJson(res, 200, readDb().expenses);
    }

    if (pathname === "/api/expenses" && method === "POST") {
      const body = await readBody(req);
      const { category, amount, note, date } = body;
      if (!category || !amount) {
        return sendJson(res, 400, { error: "category and amount are required" });
      }
      const db = readDb();
      const expense = {
        id: Date.now().toString(),
        category,
        amount: Number(amount),
        note: note || "",
        date: date || new Date().toISOString().slice(0, 10),
      };
      db.expenses.unshift(expense);
      writeDb(db);
      return sendJson(res, 201, expense);
    }

    const expenseDeleteMatch = pathname.match(/^\/api\/expenses\/([^/]+)$/);
    if (expenseDeleteMatch && method === "DELETE") {
      const id = expenseDeleteMatch[1];
      const db = readDb();
      db.expenses = db.expenses.filter((e) => e.id !== id);
      writeDb(db);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === "/api/budgets" && method === "GET") {
      return sendJson(res, 200, readDb().budgets);
    }

    if (pathname === "/api/budgets" && method === "POST") {
      const body = await readBody(req);
      const { category, limit } = body;
      if (!category || limit === undefined) {
        return sendJson(res, 400, { error: "category and limit are required" });
      }
      const db = readDb();
      const existing = db.budgets.find((b) => b.category === category);
      if (existing) existing.limit = Number(limit);
      else db.budgets.push({ category, limit: Number(limit) });
      writeDb(db);
      return sendJson(res, 200, db.budgets);
    }

    if (pathname === "/api/income" && method === "POST") {
      const body = await readBody(req);
      if (body.amount === undefined) {
        return sendJson(res, 400, { error: "amount is required" });
      }
      const db = readDb();
      db.income = Number(body.amount);
      writeDb(db);
      return sendJson(res, 200, { income: db.income });
    }

    if (pathname === "/api/summary" && method === "GET") {
      const db = readDb();
      const spendByCategory = {};
      for (const e of db.expenses) {
        spendByCategory[e.category] = (spendByCategory[e.category] || 0) + Number(e.amount);
      }
      const totalSpend = Object.values(spendByCategory).reduce((a, b) => a + b, 0);
      return sendJson(res, 200, {
        income: db.income,
        totalSpend,
        remaining: db.income - totalSpend,
        spendByCategory,
        budgets: db.budgets,
      });
    }

    if (pathname === "/api/recommendations" && method === "GET") {
      return sendJson(res, 200, buildRecommendations(readDb()));
    }

    if (pathname.startsWith("/api/")) {
      return sendJson(res, 404, { error: "Not found" });
    }
    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Pocket Smart AI backend running on http://localhost:${PORT}`);
});