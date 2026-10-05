'use strict';
// خادم موقع «أثر» — Node.js بلا اعتماديات خارجية.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const DB = require('./db');
const Auth = require('./auth');
const { validateContent } = require('./validate');

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const ADMIN_DIR = path.join(ROOT, 'admin');
const IP_SALT = process.env.IP_HASH_SALT || crypto.randomBytes(16).toString('hex');

DB.open();

// ---------- أدوات مساعدة ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};
const IMAGE_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };

const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "script-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function baseHeaders(extra) {
  return Object.assign(
    {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'SAMEORIGIN',
      'Content-Security-Policy': CSP,
    },
    extra || {}
  );
}

function send(res, status, body, headers) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, baseHeaders(Object.assign({ 'Content-Length': buf.length }, headers)));
  res.end(buf);
}

function json(res, status, obj, headers) {
  send(res, status, JSON.stringify(obj), Object.assign({ 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' }, headers));
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'حجم الطلب أكبر من المسموح.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req, limit = 1e6) {
  const ct = String(req.headers['content-type'] || '');
  if (!ct.startsWith('application/json')) throw new HttpError(415, 'نوع المحتوى غير مدعوم.');
  const buf = await readBody(req, limit);
  try {
    return JSON.parse(buf.toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'بيانات غير صالحة.');
  }
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '')
    .split(';')
    .forEach((p) => {
      const i = p.indexOf('=');
      if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
    });
  return out;
}

// خلف وكيل عكسي (مثل Railway) يضيف الوكيل عنوان الزائر الحقيقي في آخر X-Forwarded-For.
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
function clientIp(req) {
  if (TRUST_PROXY) {
    const parts = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.socket.remoteAddress || '';
}

function isSecure(req) {
  return IS_PROD || req.headers['x-forwarded-proto'] === 'https';
}

function currentUser(req) {
  return Auth.userFromToken(parseCookies(req)[Auth.COOKIE]);
}

function requireRole(req, role) {
  const u = currentUser(req);
  if (!u) throw new HttpError(401, 'يلزم تسجيل الدخول.');
  if (!Auth.hasRole(u, role)) throw new HttpError(403, 'ليست لديك صلاحية لهذا الإجراء.');
  return u;
}

// حماية من الطلبات عبر المواقع لكل عمليات التعديل.
function checkCsrf(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  if (req.headers['x-requested-with'] !== 'athar') throw new HttpError(403, 'طلب مرفوض.');
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    try {
      if (new URL(origin).host !== host) throw new Error();
    } catch {
      throw new HttpError(403, 'مصدر الطلب غير مسموح.');
    }
  }
}

function safeEq(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---------- المحتوى ----------
function getContent(key) {
  const row = DB.get().prepare('SELECT json, updated_at, updated_by FROM content WHERE key=?').get(key);
  return { content: JSON.parse(row.json), updatedAt: row.updated_at, updatedBy: row.updated_by };
}

function setContent(key, obj, by) {
  DB.get()
    .prepare("UPDATE content SET json=?, updated_at=datetime('now'), updated_by=? WHERE key=?")
    .run(JSON.stringify(obj), by || null, key);
}

function writeSection(content) {
  const home = content.pages.find((p) => p.slug === '') || content.pages[0];
  return home && home.sections.find((s) => s.type === 'write' && !s.deletedAt);
}

// ---------- القالب ----------
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function themeCss(theme) {
  const c = (theme && theme.colors) || {};
  const vars = Object.entries(c)
    .filter(([k, v]) => /^[a-zA-Z0-9]+$/.test(k) && /^#[0-9a-fA-F]{3,8}$/.test(v))
    .map(([k, v]) => `--c-${k}:${v};`)
    .join('');
  const font = String((theme && theme.fontFamily) || 'Tajawal').replace(/[^\p{L}\p{N} \-]/gu, '');
  return `:root{${vars}--font:'${font}';}`;
}

function renderSite(req, res, content, isPreview) {
  const tpl = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  const fontUrl = String(content.theme.fontCssUrl || '');
  const fontLink = /^https:\/\/fonts\.googleapis\.com\//.test(fontUrl)
    ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${esc(fontUrl)}">`
    : '';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const siteJson = JSON.stringify({ content, preview: !!isPreview }).replace(/</g, '\\u003c');
  const html = tpl
    .replaceAll('{{TITLE}}', esc(content.meta.title))
    .replaceAll('{{DESCRIPTION}}', esc(content.meta.description))
    .replaceAll('{{AUTHOR}}', esc(content.meta.author))
    .replaceAll('{{OG_IMAGE}}', content.meta.ogImage ? esc(new URL(content.meta.ogImage, `https://${host}`).href) : '')
    .replace('{{FONT_LINK}}', fontLink)
    .replace('{{THEME_CSS}}', themeCss(content.theme))
    .replace('{{SITE_JSON}}', siteJson);
  send(res, 200, html, { 'Content-Type': MIME['.html'], 'Cache-Control': isPreview ? 'no-store' : 'no-cache' });
}

// ---------- الملفات الثابتة ----------
function serveStatic(res, baseDir, rel, cache) {
  const target = path.normalize(path.join(baseDir, rel));
  if (!target.startsWith(baseDir + path.sep)) return false;
  let st;
  try {
    st = fs.statSync(target);
  } catch {
    return false;
  }
  if (!st.isFile()) return false;
  const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Cache-Control': cache || 'public, max-age=300' };
  if (type === 'image/svg+xml') headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'";
  send(res, 200, fs.readFileSync(target), headers);
  return true;
}

// ---------- الإهداءات ----------
const publicRate = new Map();
function rateLimit(key, max, windowMs, dryRun) {
  const now = Date.now();
  const list = (publicRate.get(key) || []).filter((t) => now - t < windowMs);
  publicRate.set(key, list);
  if (list.length >= max) return false;
  if (!dryRun) list.push(now);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of publicRate) if (!v.some((t) => now - t < 3600e3)) publicRate.delete(k);
}, 600e3).unref();

function cleanStr(v, max) {
  if (v == null) return '';
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

function publicDedication(r) {
  return {
    id: r.id,
    recipientType: r.recipient_type,
    gender: r.gender,
    teacherName: r.teacher_name,
    school: r.school || '',
    country: r.country || '',
    senderName: r.anonymous ? '' : r.sender_name || '',
    anonymous: !!r.anonymous,
    senderRole: r.sender_role || '',
    body: r.body,
    cardStyle: r.card_style,
    createdAt: r.created_at,
  };
}

function buildDedicationQuery(params, admin) {
  const where = [];
  const args = [];
  if (!admin) {
    where.push("status='approved'", 'deleted_at IS NULL');
  } else {
    if (params.get('deleted') === '1') where.push('deleted_at IS NOT NULL');
    else where.push('deleted_at IS NULL');
    const st = params.get('status');
    if (['approved', 'pending', 'hidden'].includes(st)) {
      where.push('status=?');
      args.push(st);
    }
  }
  const q = cleanStr(params.get('q'), 80);
  if (q) {
    where.push('(teacher_name LIKE ? OR school LIKE ? OR body LIKE ?)');
    const like = `%${q.replace(/[%_]/g, '')}%`;
    args.push(like, like, like);
  }
  const f = params.get('filter');
  if (f === 'group') where.push("recipient_type='group'");
  else if (f === 'male' || f === 'female') {
    where.push("recipient_type='single' AND gender=?");
    args.push(f);
  }
  const country = cleanStr(params.get('country'), 60);
  if (country) {
    where.push('country=?');
    args.push(country);
  }
  const before = Number(params.get('before'));
  if (before > 0) {
    where.push('id<?');
    args.push(before);
  }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
}

// ---------- النسخ الاحتياطي ----------
const BACKUP_TABLES = ['users', 'content', 'content_history', 'dedications', 'audit_log'];

function makeBackup() {
  const d = DB.get();
  const tables = {};
  for (const t of BACKUP_TABLES) tables[t] = d.prepare(`SELECT * FROM ${t}`).all().map((r) => Object.assign({}, r));
  const uploads = {};
  for (const f of fs.readdirSync(DB.UPLOADS_DIR)) {
    const p = path.join(DB.UPLOADS_DIR, f);
    if (fs.statSync(p).isFile()) uploads[f] = fs.readFileSync(p).toString('base64');
  }
  return { format: 'athar-backup', version: 1, createdAt: new Date().toISOString(), tables, uploads };
}

const SAFE_FILE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/;

function restoreBackup(b) {
  if (!b || b.format !== 'athar-backup' || b.version !== 1 || typeof b.tables !== 'object') {
    throw new HttpError(400, 'ملف النسخة الاحتياطية غير صالح.');
  }
  const users = b.tables.users || [];
  if (!users.some((u) => u.role === 'owner' && !u.disabled)) throw new HttpError(400, 'النسخة لا تحتوي حساب مالك فعّالًا.');
  const contentRows = b.tables.content || [];
  for (const k of ['draft', 'published']) {
    const r = contentRows.find((x) => x.key === k);
    if (!r) throw new HttpError(400, 'النسخة لا تحتوي المحتوى كاملًا.');
    const err = validateContent(JSON.parse(r.json));
    if (err) throw new HttpError(400, 'محتوى النسخة غير صالح: ' + err);
  }
  for (const name of Object.keys(b.uploads || {})) if (!SAFE_FILE.test(name)) throw new HttpError(400, 'اسم ملف غير صالح في النسخة.');

  const d = DB.get();
  d.exec('BEGIN');
  try {
    d.exec('DELETE FROM sessions');
    for (const t of BACKUP_TABLES) d.exec(`DELETE FROM ${t}`);
    for (const t of BACKUP_TABLES) {
      const cols = d.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
      for (const row of b.tables[t] || []) {
        const keys = cols.filter((c) => c in row);
        d.prepare(`INSERT INTO ${t}(${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(
          ...keys.map((k) => row[k])
        );
      }
    }
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw new HttpError(400, 'تعذّرت الاستعادة: ' + e.message);
  }
  for (const f of fs.readdirSync(DB.UPLOADS_DIR)) fs.rmSync(path.join(DB.UPLOADS_DIR, f), { force: true });
  for (const [name, data] of Object.entries(b.uploads || {})) fs.writeFileSync(path.join(DB.UPLOADS_DIR, name), Buffer.from(data, 'base64'));
}

// ---------- التوجيه ----------
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  const m = req.method;

  if (p.startsWith('/api/')) {
    checkCsrf(req);
    return api(req, res, url, p, m);
  }

  if (m !== 'GET' && m !== 'HEAD') throw new HttpError(405, 'Method Not Allowed');

  if (p === '/admin' || p === '/admin/') {
    return serveStatic(res, ADMIN_DIR, 'index.html', 'no-cache');
  }
  if (p.startsWith('/admin/')) {
    if (serveStatic(res, ADMIN_DIR, p.slice(7), 'no-cache')) return;
    throw new HttpError(404, 'غير موجود');
  }
  if (p.startsWith('/uploads/')) {
    const name = p.slice(9);
    if (SAFE_FILE.test(name) && serveStatic(res, DB.UPLOADS_DIR, name, 'public, max-age=86400')) return;
    throw new HttpError(404, 'غير موجود');
  }
  if (p === '/healthz') return json(res, 200, { ok: true });

  // الصفحات العامة
  let slug = null;
  if (p === '/') slug = '';
  else if (p.startsWith('/p/')) slug = p.slice(3).replace(/\/$/, '');
  if (slug !== null) {
    const wantPreview = url.searchParams.get('preview') === '1';
    const user = wantPreview ? currentUser(req) : null;
    const isPreview = !!(wantPreview && user);
    const { content } = getContent(isPreview ? 'draft' : 'published');
    const page = content.pages.find((pg) => pg.slug === slug && !pg.deletedAt && (isPreview || !pg.hidden));
    if (!page) throw new HttpError(404, 'الصفحة غير موجودة');
    return renderSite(req, res, content, isPreview);
  }

  if (serveStatic(res, PUBLIC_DIR, p.slice(1), 'public, max-age=300')) return;
  throw new HttpError(404, 'غير موجود');
}

async function api(req, res, url, p, m) {
  const d = DB.get();
  const ip = clientIp(req);
  const ipHash = crypto.createHash('sha256').update(IP_SALT + ip).digest('hex').slice(0, 32);

  // ----- عامة -----
  if (p === '/api/dedications' && m === 'GET') {
    const { sql, args } = buildDedicationQuery(url.searchParams, false);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 24, 1), 60);
    const rows = d.prepare(`SELECT * FROM dedications ${sql} ORDER BY id DESC LIMIT ?`).all(...args, limit + 1);
    return json(res, 200, { items: rows.slice(0, limit).map(publicDedication), hasMore: rows.length > limit });
  }
  if (p === '/api/countries' && m === 'GET') {
    const rows = d
      .prepare(
        "SELECT country, COUNT(*) n FROM dedications WHERE status='approved' AND deleted_at IS NULL AND country IS NOT NULL AND country<>'' GROUP BY country ORDER BY n DESC, country"
      )
      .all();
    return json(res, 200, { countries: rows.map((r) => r.country) });
  }
  if (p === '/api/dedications' && m === 'POST') {
    if (!rateLimit('ded:' + ipHash, 6, 10 * 60e3, true)) throw new HttpError(429, 'أرسلت عدة إهداءات خلال وقت قصير، حاول بعد قليل.');
    const b = await readJson(req, 20e3);
    if (b.website) throw new HttpError(400, 'طلب غير صالح.'); // حقل خفي ضد البرامج الآلية
    const { content } = getContent('published');
    const w = writeSection(content);
    if (!w) throw new HttpError(404, 'نموذج الإهداء غير متاح.');
    const max = Number(w.data.maxLength) || 500;
    const rec = b.recipientType === 'group' ? 'group' : b.recipientType === 'single' ? 'single' : null;
    const teacher = cleanStr(b.teacherName, 120);
    const body = cleanStr(b.body, max + 1);
    if (!rec) throw new HttpError(400, 'اختر نوع المُهدى إليه.');
    if (!teacher) throw new HttpError(400, 'اكتب اسم المعلم أو المعلمة.');
    if (!body) throw new HttpError(400, 'اكتب نص الإهداء.');
    if (body.length > max) throw new HttpError(400, `نص الإهداء أطول من ${max} حرف.`);
    const styles = (w.data.cardStyles || []).filter((s) => !s.hidden).map((s) => s.id);
    const style = styles.includes(b.cardStyle) ? b.cardStyle : styles[0] || null;
    const roles = w.data.whoOptions || [];
    const role = roles.includes(b.senderRole) ? b.senderRole : null;
    const status = content.settings && content.settings.moderation ? 'pending' : 'approved';
    rateLimit('ded:' + ipHash, 6, 10 * 60e3);
    const r = d
      .prepare(
        `INSERT INTO dedications(recipient_type,teacher_name,school,country,sender_name,anonymous,sender_role,body,card_style,status,ip_hash)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        rec,
        teacher,
        cleanStr(b.school, 120) || null,
        cleanStr(b.country, 60) || null,
        cleanStr(b.senderName, 80) || null,
        b.anonymous ? 1 : 0,
        role,
        body,
        style,
        status,
        ipHash
      );
    const row = d.prepare('SELECT * FROM dedications WHERE id=?').get(Number(r.lastInsertRowid));
    return json(res, 201, { ok: true, status, item: status === 'approved' ? publicDedication(row) : null });
  }

  // ----- المصادقة -----
  if (p === '/api/auth/state' && m === 'GET') {
    const users = d.prepare('SELECT COUNT(*) c FROM users').get().c;
    return json(res, 200, {
      setupNeeded: users === 0,
      setupEnabled: users === 0 && !!process.env.SETUP_TOKEN,
      recoveryEnabled: !!process.env.RECOVERY_TOKEN,
      user: currentUser(req),
    });
  }
  if (p === '/api/auth/setup' && m === 'POST') {
    if (!rateLimit('setup:' + ipHash, 10, 15 * 60e3)) throw new HttpError(429, 'محاولات كثيرة، حاول لاحقًا.');
    const b = await readJson(req);
    if (d.prepare('SELECT COUNT(*) c FROM users').get().c > 0) throw new HttpError(409, 'تم إنشاء حساب المالك مسبقًا.');
    if (!process.env.SETUP_TOKEN) throw new HttpError(403, 'الإعداد غير مفعّل. اضبطي SETUP_TOKEN في متغيرات البيئة.');
    if (!safeEq(b.token || '', process.env.SETUP_TOKEN)) throw new HttpError(403, 'رمز الإعداد غير صحيح.');
    const email = cleanStr(b.email, 160).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'البريد الإلكتروني غير صالح.');
    const perr = Auth.validatePassword(b.password);
    if (perr) throw new HttpError(400, perr);
    const r = d
      .prepare("INSERT INTO users(email,name,password_hash,role) VALUES (?,?,?,'owner')")
      .run(email, cleanStr(b.name, 80), Auth.hashPassword(b.password));
    DB.audit(email, 'إنشاء حساب المالك');
    const s = Auth.createSession(Number(r.lastInsertRowid));
    return json(res, 201, { ok: true }, { 'Set-Cookie': Auth.cookieHeader(s.token, s.expires, isSecure(req)) });
  }
  if (p === '/api/auth/recover' && m === 'POST') {
    if (!rateLimit('rec:' + ipHash, 10, 15 * 60e3)) throw new HttpError(429, 'محاولات كثيرة، حاول لاحقًا.');
    const b = await readJson(req);
    if (!process.env.RECOVERY_TOKEN) throw new HttpError(403, 'الاستعادة غير مفعّلة.');
    if (!safeEq(b.token || '', process.env.RECOVERY_TOKEN)) throw new HttpError(403, 'رمز الاستعادة غير صحيح.');
    const u = d.prepare("SELECT * FROM users WHERE email=? AND role='owner'").get(cleanStr(b.email, 160));
    if (!u) throw new HttpError(404, 'لا يوجد حساب مالك بهذا البريد.');
    const perr = Auth.validatePassword(b.password);
    if (perr) throw new HttpError(400, perr);
    d.prepare('UPDATE users SET password_hash=?, disabled=0 WHERE id=?').run(Auth.hashPassword(b.password), u.id);
    Auth.destroyUserSessions(u.id);
    DB.audit(u.email, 'استعادة وصول المالك');
    return json(res, 200, { ok: true });
  }
  if (p === '/api/auth/login' && m === 'POST') {
    const b = await readJson(req);
    const email = cleanStr(b.email, 160).toLowerCase();
    const key = ipHash + ':' + email;
    if (!Auth.loginAllowed(key)) throw new HttpError(429, 'محاولات كثيرة. انتظري 15 دقيقة ثم حاولي مجددًا.');
    const u = d.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!u || u.disabled || !Auth.verifyPassword(String(b.password || ''), u.password_hash)) {
      Auth.loginFailed(key);
      throw new HttpError(401, 'البريد أو كلمة المرور غير صحيحة.');
    }
    Auth.loginOk(key);
    const s = Auth.createSession(u.id);
    DB.audit(u.email, 'تسجيل دخول');
    return json(res, 200, { ok: true }, { 'Set-Cookie': Auth.cookieHeader(s.token, s.expires, isSecure(req)) });
  }
  if (p === '/api/auth/logout' && m === 'POST') {
    Auth.destroySession(parseCookies(req)[Auth.COOKIE]);
    return json(res, 200, { ok: true }, { 'Set-Cookie': Auth.cookieHeader('', 0, isSecure(req)) });
  }
  if (p === '/api/auth/password' && m === 'POST') {
    const u = requireRole(req, 'editor');
    const b = await readJson(req);
    const row = d.prepare('SELECT * FROM users WHERE id=?').get(u.id);
    if (!Auth.verifyPassword(String(b.current || ''), row.password_hash)) throw new HttpError(400, 'كلمة المرور الحالية غير صحيحة.');
    const perr = Auth.validatePassword(b.password);
    if (perr) throw new HttpError(400, perr);
    d.prepare('UPDATE users SET password_hash=? WHERE id=?').run(Auth.hashPassword(b.password), u.id);
    Auth.destroyUserSessions(u.id);
    const s = Auth.createSession(u.id);
    DB.audit(u.email, 'تغيير كلمة المرور');
    return json(res, 200, { ok: true }, { 'Set-Cookie': Auth.cookieHeader(s.token, s.expires, isSecure(req)) });
  }

  // ----- الإدارة -----
  if (!p.startsWith('/api/admin/')) throw new HttpError(404, 'غير موجود');

  // المحتوى
  if (p === '/api/admin/content' && m === 'GET') {
    requireRole(req, 'editor');
    const draft = getContent('draft');
    const pub = getContent('published');
    return json(res, 200, {
      draft: draft.content,
      draftUpdatedAt: draft.updatedAt,
      draftUpdatedBy: draft.updatedBy,
      publishedUpdatedAt: pub.updatedAt,
      hasUnpublished: JSON.stringify(draft.content) !== JSON.stringify(pub.content),
    });
  }
  if (p === '/api/admin/content' && m === 'PUT') {
    const u = requireRole(req, 'editor');
    const b = await readJson(req, 3e6);
    const cur = getContent('draft');
    if (b.baseUpdatedAt && b.baseUpdatedAt !== cur.updatedAt) {
      throw new HttpError(409, 'عدّل شخص آخر المسودة بعد فتحك لها. أعيدي تحميل الصفحة.');
    }
    const err = validateContent(b.content);
    if (err) throw new HttpError(400, err);
    setContent('draft', b.content, u.email);
    return json(res, 200, { ok: true, draftUpdatedAt: getContent('draft').updatedAt });
  }
  if (p === '/api/admin/content/publish' && m === 'POST') {
    const u = requireRole(req, 'admin');
    const b = await readJson(req);
    const draft = getContent('draft').content;
    const err = validateContent(draft);
    if (err) throw new HttpError(400, err);
    d.exec('BEGIN');
    try {
      setContent('published', draft, u.email);
      d.prepare('INSERT INTO content_history(json,note,created_by) VALUES (?,?,?)').run(
        JSON.stringify(draft),
        cleanStr(b.note, 200) || 'نشر',
        u.email
      );
      d.exec('COMMIT');
    } catch (e) {
      d.exec('ROLLBACK');
      throw e;
    }
    DB.audit(u.email, 'نشر المحتوى', b.note);
    return json(res, 200, { ok: true });
  }
  if (p === '/api/admin/content/discard' && m === 'POST') {
    const u = requireRole(req, 'admin');
    setContent('draft', getContent('published').content, u.email);
    DB.audit(u.email, 'تجاهل تعديلات المسودة');
    return json(res, 200, { ok: true });
  }
  if (p === '/api/admin/history' && m === 'GET') {
    requireRole(req, 'admin');
    const rows = d.prepare('SELECT id, note, created_at, created_by FROM content_history ORDER BY id DESC LIMIT 100').all();
    return json(res, 200, { items: rows });
  }
  let mm;
  if ((mm = p.match(/^\/api\/admin\/history\/(\d+)\/restore$/)) && m === 'POST') {
    const u = requireRole(req, 'admin');
    const row = d.prepare('SELECT json FROM content_history WHERE id=?').get(Number(mm[1]));
    if (!row) throw new HttpError(404, 'النسخة غير موجودة.');
    setContent('draft', JSON.parse(row.json), u.email);
    DB.audit(u.email, 'استعادة نسخة سابقة إلى المسودة', mm[1]);
    return json(res, 200, { ok: true });
  }

  // الصور
  if (p === '/api/admin/uploads' && m === 'GET') {
    requireRole(req, 'editor');
    const items = fs
      .readdirSync(DB.UPLOADS_DIR)
      .filter((f) => SAFE_FILE.test(f))
      .map((f) => ({ name: f, url: '/uploads/' + f, size: fs.statSync(path.join(DB.UPLOADS_DIR, f)).size }));
    return json(res, 200, { items });
  }
  if (p === '/api/admin/uploads' && m === 'POST') {
    const u = requireRole(req, 'editor');
    const type = String(req.headers['content-type'] || '').split(';')[0];
    const ext = IMAGE_TYPES[type];
    if (!ext) throw new HttpError(415, 'الصيغ المسموحة: PNG وJPG وWEBP وGIF.');
    const buf = await readBody(req, 5 * 1024 * 1024);
    if (!buf.length) throw new HttpError(400, 'الملف فارغ.');
    const name = Date.now().toString(36) + '-' + crypto.randomBytes(5).toString('hex') + ext;
    fs.writeFileSync(path.join(DB.UPLOADS_DIR, name), buf);
    DB.audit(u.email, 'رفع صورة', name);
    return json(res, 201, { ok: true, url: '/uploads/' + name, name });
  }
  if ((mm = p.match(/^\/api\/admin\/uploads\/([^/]+)$/)) && m === 'DELETE') {
    const u = requireRole(req, 'admin');
    if (!SAFE_FILE.test(mm[1])) throw new HttpError(400, 'اسم غير صالح.');
    fs.rmSync(path.join(DB.UPLOADS_DIR, mm[1]), { force: true });
    DB.audit(u.email, 'حذف صورة', mm[1]);
    return json(res, 200, { ok: true });
  }

  // الإهداءات
  if (p === '/api/admin/dedications' && m === 'GET') {
    requireRole(req, 'editor');
    const { sql, args } = buildDedicationQuery(url.searchParams, true);
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
    const rows = d.prepare(`SELECT * FROM dedications ${sql} ORDER BY id DESC LIMIT ?`).all(...args, limit + 1);
    const counts = d
      .prepare("SELECT status, COUNT(*) n FROM dedications WHERE deleted_at IS NULL GROUP BY status")
      .all()
      .reduce((a, r) => ((a[r.status] = r.n), a), {});
    counts.deleted = d.prepare('SELECT COUNT(*) n FROM dedications WHERE deleted_at IS NOT NULL').get().n;
    return json(res, 200, {
      items: rows.slice(0, limit).map((r) => Object.assign(publicDedication(r), { senderName: r.sender_name || '', status: r.status, deletedAt: r.deleted_at })),
      hasMore: rows.length > limit,
      counts,
    });
  }
  if ((mm = p.match(/^\/api\/admin\/dedications\/(\d+)$/)) && m === 'PATCH') {
    const u = requireRole(req, 'editor');
    const id = Number(mm[1]);
    const b = await readJson(req);
    const sets = [];
    const args = [];
    if ('status' in b) {
      if (!['approved', 'pending', 'hidden'].includes(b.status)) throw new HttpError(400, 'حالة غير صالحة.');
      sets.push('status=?');
      args.push(b.status);
    }
    if ('gender' in b) {
      if (![null, 'male', 'female'].includes(b.gender)) throw new HttpError(400, 'قيمة غير صالحة.');
      sets.push('gender=?');
      args.push(b.gender);
    }
    const textFields = { teacherName: ['teacher_name', 120], school: ['school', 120], country: ['country', 60], senderName: ['sender_name', 80], body: ['body', 2000] };
    for (const [k, [col, max]] of Object.entries(textFields)) {
      if (k in b) {
        const v = cleanStr(b[k], max);
        if ((k === 'teacherName' || k === 'body') && !v) throw new HttpError(400, 'لا يمكن ترك الحقل فارغًا.');
        sets.push(`${col}=?`);
        args.push(v || null);
      }
    }
    if ('anonymous' in b) {
      sets.push('anonymous=?');
      args.push(b.anonymous ? 1 : 0);
    }
    if (!sets.length) throw new HttpError(400, 'لا توجد تعديلات.');
    const r = d.prepare(`UPDATE dedications SET ${sets.join(',')} WHERE id=?`).run(...args, id);
    if (!r.changes) throw new HttpError(404, 'الإهداء غير موجود.');
    DB.audit(u.email, 'تعديل إهداء', id);
    return json(res, 200, { ok: true });
  }
  if ((mm = p.match(/^\/api\/admin\/dedications\/(\d+)$/)) && m === 'DELETE') {
    const id = Number(mm[1]);
    if (url.searchParams.get('permanent') === '1') {
      const u = requireRole(req, 'admin');
      d.prepare('DELETE FROM dedications WHERE id=? AND deleted_at IS NOT NULL').run(id);
      DB.audit(u.email, 'حذف إهداء نهائيًا', id);
    } else {
      const u = requireRole(req, 'editor');
      d.prepare("UPDATE dedications SET deleted_at=datetime('now') WHERE id=?").run(id);
      DB.audit(u.email, 'نقل إهداء إلى المحذوفات', id);
    }
    return json(res, 200, { ok: true });
  }
  if ((mm = p.match(/^\/api\/admin\/dedications\/(\d+)\/restore$/)) && m === 'POST') {
    const u = requireRole(req, 'editor');
    d.prepare('UPDATE dedications SET deleted_at=NULL WHERE id=?').run(Number(mm[1]));
    DB.audit(u.email, 'استعادة إهداء', mm[1]);
    return json(res, 200, { ok: true });
  }
  if (p === '/api/admin/dedications.csv' && m === 'GET') {
    requireRole(req, 'admin');
    const rows = d.prepare('SELECT * FROM dedications ORDER BY id').all();
    const cols = ['id', 'recipient_type', 'gender', 'teacher_name', 'school', 'country', 'sender_name', 'anonymous', 'sender_role', 'body', 'card_style', 'status', 'created_at', 'deleted_at'];
    const cell = (v) => {
      let s = v == null ? '' : String(v);
      if (/^[=+\-@]/.test(s)) s = "'" + s; // منع حقن الصيغ في Excel
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const csv = '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
    return send(res, 200, csv, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="athar-dedications-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    });
  }

  // المستخدمون (للمالك فقط)
  if (p === '/api/admin/users' && m === 'GET') {
    requireRole(req, 'owner');
    return json(res, 200, { items: d.prepare('SELECT id,email,name,role,disabled,created_at FROM users ORDER BY id').all() });
  }
  if (p === '/api/admin/users' && m === 'POST') {
    const u = requireRole(req, 'owner');
    const b = await readJson(req);
    const email = cleanStr(b.email, 160).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'البريد الإلكتروني غير صالح.');
    if (!Auth.ROLES[b.role]) throw new HttpError(400, 'دور غير صالح.');
    const perr = Auth.validatePassword(b.password);
    if (perr) throw new HttpError(400, perr);
    try {
      d.prepare('INSERT INTO users(email,name,password_hash,role) VALUES (?,?,?,?)').run(email, cleanStr(b.name, 80), Auth.hashPassword(b.password), b.role);
    } catch {
      throw new HttpError(409, 'يوجد مستخدم بهذا البريد.');
    }
    DB.audit(u.email, 'إضافة مستخدم', `${email} (${b.role})`);
    return json(res, 201, { ok: true });
  }
  if ((mm = p.match(/^\/api\/admin\/users\/(\d+)$/)) && (m === 'PATCH' || m === 'DELETE')) {
    const u = requireRole(req, 'owner');
    const id = Number(mm[1]);
    const target = d.prepare('SELECT * FROM users WHERE id=?').get(id);
    if (!target) throw new HttpError(404, 'المستخدم غير موجود.');
    const activeOwners = () => d.prepare("SELECT COUNT(*) c FROM users WHERE role='owner' AND disabled=0").get().c;
    if (m === 'DELETE') {
      if (id === u.id) throw new HttpError(400, 'لا يمكنك حذف حسابك.');
      if (target.role === 'owner' && activeOwners() <= 1) throw new HttpError(400, 'لا يمكن حذف آخر مالك.');
      d.prepare('DELETE FROM users WHERE id=?').run(id);
      DB.audit(u.email, 'حذف مستخدم', target.email);
      return json(res, 200, { ok: true });
    }
    const b = await readJson(req);
    if ('role' in b) {
      if (!Auth.ROLES[b.role]) throw new HttpError(400, 'دور غير صالح.');
      if (target.role === 'owner' && b.role !== 'owner' && activeOwners() <= 1) throw new HttpError(400, 'لا يمكن تغيير دور آخر مالك.');
      d.prepare('UPDATE users SET role=? WHERE id=?').run(b.role, id);
    }
    if ('disabled' in b) {
      if (id === u.id && b.disabled) throw new HttpError(400, 'لا يمكنك تعطيل حسابك.');
      if (target.role === 'owner' && b.disabled && activeOwners() <= 1) throw new HttpError(400, 'لا يمكن تعطيل آخر مالك.');
      d.prepare('UPDATE users SET disabled=? WHERE id=?').run(b.disabled ? 1 : 0, id);
      if (b.disabled) Auth.destroyUserSessions(id);
    }
    if ('name' in b) d.prepare('UPDATE users SET name=? WHERE id=?').run(cleanStr(b.name, 80), id);
    if ('password' in b) {
      const perr = Auth.validatePassword(b.password);
      if (perr) throw new HttpError(400, perr);
      d.prepare('UPDATE users SET password_hash=? WHERE id=?').run(Auth.hashPassword(b.password), id);
      Auth.destroyUserSessions(id);
    }
    DB.audit(u.email, 'تعديل مستخدم', target.email);
    return json(res, 200, { ok: true });
  }

  // النسخ الاحتياطي والاستعادة (للمالك فقط)
  if (p === '/api/admin/backup' && m === 'GET') {
    const u = requireRole(req, 'owner');
    DB.audit(u.email, 'تنزيل نسخة احتياطية');
    const body = JSON.stringify(makeBackup());
    return send(res, 200, body, {
      'Content-Type': MIME['.json'],
      'Content-Disposition': `attachment; filename="athar-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json"`,
      'Cache-Control': 'no-store',
    });
  }
  if (p === '/api/admin/restore' && m === 'POST') {
    const u = requireRole(req, 'owner');
    const b = await readJson(req, 300e6);
    restoreBackup(b);
    DB.audit(u.email, 'استعادة نسخة احتياطية', b.createdAt);
    return json(res, 200, { ok: true }, { 'Set-Cookie': Auth.cookieHeader('', 0, isSecure(req)) });
  }
  if (p === '/api/admin/audit' && m === 'GET') {
    requireRole(req, 'owner');
    return json(res, 200, { items: d.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200').all() });
  }

  throw new HttpError(404, 'غير موجود');
}

const server = http.createServer(async (req, res) => {
  try {
    await handle(req, res);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    if (res.headersSent) return res.end();
    if (String(req.url).startsWith('/api/')) json(res, status, { error: status >= 500 ? 'حدث خطأ في الخادم.' : e.message });
    else send(res, status, `<!doctype html><meta charset="utf-8"><title>${status}</title><p dir="rtl" style="font-family:sans-serif;padding:2rem">${esc(e.message || 'خطأ')}</p>`, { 'Content-Type': MIME['.html'] });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`أثر يعمل على المنفذ ${PORT} — البيانات في ${DB.DATA_DIR}`);
    if (DB.get().prepare('SELECT COUNT(*) c FROM users').get().c === 0) {
      console.log(process.env.SETUP_TOKEN ? 'لا يوجد حساب مالك بعد: افتحي /admin لإنشائه برمز الإعداد.' : 'لا يوجد حساب مالك بعد: اضبطي SETUP_TOKEN أو شغّلي npm run create-owner.');
    }
  });
  const stop = () => server.close(() => (DB.close(), process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

module.exports = { server };
