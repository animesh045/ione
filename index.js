//
// Single-file Sunshine Workshop app for Vercel (no api/ or views/ folders)
//
const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const serverless = require('serverless-http');

const app = express();

// --- Config ---
const ADMIN_PIN = process.env.ADMIN_PIN || '0000';
const COOKIE_SECRET = process.env.COOKIE_SECRET || ADMIN_PIN + '_secret';
const DB_PATH = process.env.DB_PATH || (process.env.VERCEL ? '/tmp/db.json' : path.join(__dirname, 'db.json'));

// --- Middleware ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser(COOKIE_SECRET));

// --- Data store (in-memory + persisted to /tmp when possible) ---
let registrations = [];
function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      registrations = JSON.parse(raw);
    }
  } catch (e) {
    console.error('DB load failed:', e);
    registrations = [];
  }
}
function saveDB() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(registrations, null, 2), 'utf8');
  } catch (e) {
    // On serverless, writing may fail or be ephemeral; it's ok.
    console.warn('DB save warning:', e.message);
  }
}
loadDB();

// --- Helpers ---
function isAuthed(req) {
  return !!req.signedCookies.admin_ok;
}
function requireAuth(req, res, next) {
  if (!isAuthed(req)) return res.redirect('/admin/login');
  next();
}
function htmlPage(title, body, extraHead='') {
  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root{--bg:#0b0b10;--card:#14141c;--fg:#f1f5f9;--muted:#94a3b8;--accent:#6366f1;--accent2:#22d3ee;--danger:#ef4444;}
      *{box-sizing:border-box} body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;background:linear-gradient(120deg,#0b0b10,#111827,#0b0b10);color:var(--fg)}
      .wrap{max-width:900px;margin:32px auto;padding:0 16px}
      .card{background:linear-gradient(180deg,#14141c,#0f0f16); border:1px solid #1f2937; border-radius:16px; padding:24px; box-shadow:0 10px 40px rgba(0,0,0,.4)}
      h1,h2{margin:0 0 12px} p{color:var(--muted)} a{color:var(--accent2); text-decoration:none}
      input,select,button,textarea{width:100%; padding:12px 14px; margin:8px 0 16px; border-radius:10px; border:1px solid #273042; background:#0b1323; color:var(--fg)}
      button{background:linear-gradient(90deg,var(--accent),var(--accent2)); border:0; cursor:pointer; font-weight:600}
      table{width:100%; border-collapse:collapse; margin-top:12px; font-size:14px}
      th,td{padding:10px; border-bottom:1px solid #273042; text-align:left}
      .row{display:grid; grid-template-columns:1fr 1fr; gap:12px}
      .actions{display:flex; gap:10px; flex-wrap:wrap}
      .pill{padding:8px 12px; background:#0b1323; border:1px solid #273042; border-radius:999px; color:#cbd5e1}
      .danger{background:var(--danger)!important}
      .topnav{display:flex; justify-content:space-between; align-items:center; margin-bottom:16px}
    </style>
    ${extraHead}
  </head>
  <body><div class="wrap">${body}</div></body></html>`;
}

// --- Routes ---

// Home / registration form
app.get('/', (req, res) => {
  const body = `
    <div class="card">
      <div class="topnav">
        <h1>Sunshine Workshop Registration</h1>
        <a class="pill" href="/admin">Admin</a>
      </div>
      <p>Fill the form below to register.</p>
      <form method="POST" action="/register">
        <div class="row">
          <div><label>Name</label><input name="name" required placeholder="Your name"/></div>
          <div><label>Email</label><input name="email" type="email" required placeholder="example@domain.com"/></div>
        </div>
        <div class="row">
          <div><label>Phone</label><input name="phone" required placeholder="10-digit number"/></div>
        <div class="row">
          <div><label>Year</label><select name="year" required>
            <option value="">Select year</option>
            <option>1st</option><option>2nd</option><option>3rd</option><option>4th</option>
          </select></div>
        <textarea name="note" rows="3" placeholder="Optional"></textarea>
        <button type="submit">Submit Registration</button>
      </form>
    </div>`;
  res.send(htmlPage('Register - Sunshine Workshop', body));
});

// Handle registration
app.post('/register', (req, res) => {
  const { name, email, phone, branch, year, college, note } = req.body || {};
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  const row = { id, ts: new Date().toISOString(), name, email, phone, branch, year, college, note };
  registrations.push(row);
  saveDB();
  const body = `
    <div class="card">
      <h1>Thank you 🎉</h1>
      <p>Your registration has been recorded.</p>
      <div class="actions">
        <a class="pill" href="/">Back to form</a>
      </div>
    </div>`;
  res.send(htmlPage('Registered', body));
});

// Admin – redirect based on auth
app.get('/admin', (req, res) => {
  if (isAuthed(req)) return res.redirect('/admin/panel');
  return res.redirect('/admin/login');
});

// Admin login page
app.get('/admin/login', (req, res) => {
  const body = `
    <div class="card">
      <h1>Admin Login</h1>
      <form method="POST" action="/admin/login">
        <label>PIN</label>
        <input name="pin" type="password" required placeholder="Enter admin PIN"/>
        <button type="submit">Login</button>
      </form>
      <p class="muted">Set the PIN via environment variable <code>ADMIN_PIN</code>.</p>
    </div>`;
  res.send(htmlPage('Admin Login', body));
});

// Admin login handler
app.post('/admin/login', (req, res) => {
  const pin = (req.body && req.body.pin) || '';
  if (pin === ADMIN_PIN) {
    res.cookie('admin_ok', '1', { signed: true, httpOnly: true, sameSite: 'lax', maxAge: 12*60*60*1000 });
    return res.redirect('/admin/panel');
  }
  const body = `
    <div class="card">
      <h1>Admin Login</h1>
      <p style="color:#fca5a5">Invalid PIN</p>
      <a class="pill" href="/admin/login">Try again</a>
    </div>`;
  res.send(htmlPage('Admin Login - Error', body));
});

// Admin panel
app.get('/admin/panel', requireAuth, (req, res) => {
  const rows = registrations.map((r,i)=>`
    <tr>
      <td>${i+1}</td><td>${r.name||''}</td><td>${r.email||''}</td>
      <td>${r.phone||''}</td><td>${r.branch||''}</td><td>${r.year||''}</td>
      <td>${r.college||''}</td><td>${new Date(r.ts).toLocaleString('en-IN')}</td>
    </tr>`).join('');
  const body = `
    <div class="card">
      <div class="topnav">
        <h1>Admin Panel</h1>
        <div class="actions">
          <a class="pill" href="/admin/export/json">Export JSON</a>
          <a class="pill" href="/admin/export/csv">Export CSV</a>
          <a class="pill danger" href="/admin/reset" onclick="return confirm('Delete all registrations?')">Reset</a>
          <a class="pill" href="/logout">Logout</a>
        </div>
      </div>
      <p>Total registrations: <b>${registrations.length}</b></p>
      <table>
        <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Phone</th><th>Branch</th><th>Year</th><th>College</th><th>Time</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="8">No entries yet.</td></tr>'}</tbody>
      </table>
    </div>`;
  res.send(htmlPage('Admin Panel', body));
});

// Logout
app.get('/logout', (req, res) => {
  res.clearCookie('admin_ok');
  res.redirect('/');
});

// Export JSON
app.get('/admin/export/json', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="registrations.json"');
  res.end(JSON.stringify(registrations, null, 2));
});

// Export CSV
app.get('/admin/export/csv', requireAuth, (req, res) => {
  const header = ['id','ts','name','email','phone','branch','year','college','note'];
  const csv = [header.join(',')].concat(registrations.map(r => header.map(k => {
    const v = (r[k] ?? '').toString().replace(/"/g,'""');
    return `"${v}"`;
  }).join(','))).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="registrations.csv"');
  res.end(csv);
});

// Reset DB
app.get('/admin/reset', requireAuth, (req, res) => {
  registrations = [];
  saveDB();
  res.redirect('/admin/panel');
});

// --- Exports for Vercel serverless ---
module.exports = (req, res) => {
  const handler = serverless(app);
  return handler(req, res);
};

// --- Local dev ---
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Local server running on http://localhost:${port}`));
}
