'use strict';
// كلمات المرور تُخزَّن مُجزَّأة بـ scrypt (مدمج في Node). الجلسات رموز عشوائية تُخزَّن مُجزَّأة.
const crypto = require('node:crypto');
const DB = require('./db');

const SESSION_DAYS = 14;
const COOKIE = 'athar_session';
const ROLES = { owner: 3, admin: 2, editor: 1 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  const [alg, saltB64, hashB64] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const got = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, got);
}

function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'كلمة المرور يجب ألا تقل عن 10 أحرف.';
  if (pw.length > 200) return 'كلمة المرور طويلة جدًا.';
  return null;
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + SESSION_DAYS * 864e5;
  DB.get().prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').run(sha256(token), userId, expires);
  return { token, expires };
}

function destroySession(token) {
  if (token) DB.get().prepare('DELETE FROM sessions WHERE token_hash=?').run(sha256(token));
}

function destroyUserSessions(userId) {
  DB.get().prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
}

function userFromToken(token) {
  if (!token) return null;
  const row = DB.get()
    .prepare(
      `SELECT u.id,u.email,u.name,u.role,u.disabled,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`
    )
    .get(sha256(token));
  if (!row) return null;
  if (row.expires_at < Date.now() || row.disabled) {
    destroySession(token);
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

function hasRole(user, role) {
  return !!user && ROLES[user.role] >= ROLES[role];
}

function cookieHeader(token, expires, secure) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
  if (secure) parts.push('Secure');
  parts.push(expires ? `Expires=${new Date(expires).toUTCString()}` : 'Max-Age=0');
  return parts.join('; ');
}

// حدّ بسيط لمحاولات الدخول (في الذاكرة).
const attempts = new Map();
function loginAllowed(key) {
  const now = Date.now();
  const a = attempts.get(key) || { n: 0, t: now };
  if (now - a.t > 15 * 60e3) {
    a.n = 0;
    a.t = now;
  }
  attempts.set(key, a);
  return a.n < 8;
}
function loginFailed(key) {
  const a = attempts.get(key) || { n: 0, t: Date.now() };
  a.n++;
  attempts.set(key, a);
}
function loginOk(key) {
  attempts.delete(key);
}

module.exports = {
  COOKIE,
  ROLES,
  hashPassword,
  verifyPassword,
  validatePassword,
  sha256,
  createSession,
  destroySession,
  destroyUserSessions,
  userFromToken,
  hasRole,
  cookieHeader,
  loginAllowed,
  loginFailed,
  loginOk,
};
