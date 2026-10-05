'use strict';
// اختبارات تكامل: تشغّل الخادم فعليًا على قاعدة بيانات مؤقتة وتختبر الواجهة البرمجية.
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'athar-test-'));
const SETUP = 'setup-' + Math.random().toString(36).slice(2);
const SIG = 'أ.البندري السلمي ث٣٥ بمكة';
let proc;

function start() {
  return new Promise((resolve, reject) => {
    proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server', 'index.js')], {
      env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA, SETUP_TOKEN: SETUP }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout.on('data', (d) => String(d).includes('يعمل') && resolve());
    proc.stderr.on('data', (d) => process.stderr.write(d));
    proc.on('error', reject);
  });
}
function stop() {
  return new Promise((r) => {
    proc.on('exit', r);
    proc.kill('SIGTERM');
  });
}

function client() {
  let cookie = '';
  return async function req(method, p, body, extra) {
    const headers = Object.assign({ 'X-Requested-With': 'athar' }, extra || {});
    if (cookie) headers.Cookie = cookie;
    let payload;
    if (body !== undefined) {
      if (Buffer.isBuffer(body)) payload = body;
      else {
        payload = typeof body === 'string' ? body : JSON.stringify(body);
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      }
    }
    const r = await fetch(BASE + p, { method, headers, body: payload });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    const text = await r.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: r.status, json, text, headers: r.headers };
  };
}

const owner = client();
const anon = client();
const editor = client();

test.before(start);
test.after(async () => {
  await stop();
  fs.rmSync(DATA, { recursive: true, force: true });
});

test('الصفحة العامة تعمل والتوقيع الجديد في المحتوى والبيانات الوصفية', async () => {
  const r = await anon('GET', '/');
  assert.equal(r.status, 200);
  assert.ok(r.text.includes(SIG), 'التوقيع الجديد موجود');
  assert.ok(!r.text.includes('دغريري'), 'لا أثر للتوقيع القديم');
  assert.ok(!r.text.includes('خبيرة التدريب'));
  assert.ok(!r.text.includes('أختكم'));
  assert.ok(r.text.includes('بكل محبة وتقدير'));
  assert.match(r.text, /<meta name="description" content="[^"]*أ\.البندري السلمي/);
});

test('الإدارة محمية: الزائر لا يصل لأي وظيفة إدارية', async () => {
  for (const [m, p] of [['GET', '/api/admin/content'], ['PUT', '/api/admin/content'], ['POST', '/api/admin/content/publish'], ['GET', '/api/admin/users'], ['GET', '/api/admin/backup'], ['POST', '/api/admin/restore'], ['GET', '/api/admin/dedications']]) {
    const r = await anon(m, p, m === 'GET' ? undefined : {});
    assert.equal(r.status, 401, `${m} ${p}`);
  }
  const prev = await anon('GET', '/?preview=1');
  assert.ok(!prev.text.includes('"preview":true'), 'لا معاينة للمسودة بلا دخول');
});

test('رفض طلبات التعديل بلا ترويسة الحماية أو من مصدر آخر', async () => {
  const r1 = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r1.status, 403);
  const r2 = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'athar', Origin: 'https://evil.example' }, body: '{}' });
  assert.equal(r2.status, 403);
});

test('إنشاء المالك برمز الإعداد مرة واحدة فقط', async () => {
  const bad = await anon('POST', '/api/auth/setup', { token: 'wrong', email: 'x@y.co', password: 'longpassword1' });
  assert.equal(bad.status, 403);
  const ok = await owner('POST', '/api/auth/setup', { token: SETUP, email: 'owner@example.com', name: 'المالكة', password: 'Owner-pass-123' });
  assert.equal(ok.status, 201);
  const again = await anon('POST', '/api/auth/setup', { token: SETUP, email: 'z@y.co', password: 'longpassword1' });
  assert.equal(again.status, 409);
  const st = await owner('GET', '/api/auth/state');
  assert.equal(st.json.user.role, 'owner');
});

test('كلمة مرور خاطئة تُرفض', async () => {
  const c = client();
  const r = await c('POST', '/api/auth/login', { email: 'owner@example.com', password: 'nope-nope-nope' });
  assert.equal(r.status, 401);
});

test('تعديل المسودة لا يظهر للزوار إلا بعد النشر، والمعاينة تعرضه للمالك', async () => {
  const c = await owner('GET', '/api/admin/content');
  const draft = c.json.draft;
  draft.pages[0].sections[0].data.quote = 'اقتباس اختبار جديد';
  draft.theme.colors.primary = '#123456';
  const put = await owner('PUT', '/api/admin/content', { content: draft, baseUpdatedAt: c.json.draftUpdatedAt });
  assert.equal(put.status, 200);
  assert.ok(!(await anon('GET', '/')).text.includes('اقتباس اختبار جديد'));
  assert.ok((await owner('GET', '/?preview=1')).text.includes('اقتباس اختبار جديد'));
  const pub = await owner('POST', '/api/admin/content/publish', { note: 'اختبار' });
  assert.equal(pub.status, 200);
  const pubPage = (await anon('GET', '/')).text;
  assert.ok(pubPage.includes('اقتباس اختبار جديد'));
  assert.ok(pubPage.includes('--c-primary:#123456'));
});

test('رفض محتوى غير صالح (روابط javascript وألوان خاطئة وحذف الرئيسية)', async () => {
  const c = await owner('GET', '/api/admin/content');
  const d1 = JSON.parse(JSON.stringify(c.json.draft));
  d1.nav[0].target = 'javascript:alert(1)';
  assert.equal((await owner('PUT', '/api/admin/content', { content: d1 })).status, 400);
  const d2 = JSON.parse(JSON.stringify(c.json.draft));
  d2.theme.colors.bg = 'red;}body{display:none';
  assert.equal((await owner('PUT', '/api/admin/content', { content: d2 })).status, 400);
  const d3 = JSON.parse(JSON.stringify(c.json.draft));
  d3.pages[0].deletedAt = '2026-01-01';
  assert.equal((await owner('PUT', '/api/admin/content', { content: d3 })).status, 400);
});

test('تعارض التعديل المتزامن يُكتشف', async () => {
  const c = await owner('GET', '/api/admin/content');
  const r = await owner('PUT', '/api/admin/content', { content: c.json.draft, baseUpdatedAt: '1999-01-01 00:00:00' });
  assert.equal(r.status, 409);
});

test('صفحة جديدة تُضاف وتُخفى وتُحذف', async () => {
  const c = await owner('GET', '/api/admin/content');
  const d = c.json.draft;
  d.pages.push({ id: 'p-about', slug: 'about', title: 'عن المبادرة', hidden: false, sections: [{ id: 'text-1', type: 'text', hidden: false, data: { title: 'عن المبادرة', body: 'نص' } }] });
  await owner('PUT', '/api/admin/content', { content: d });
  await owner('POST', '/api/admin/content/publish', {});
  assert.equal((await anon('GET', '/p/about')).status, 200);
  d.pages[1].hidden = true;
  await owner('PUT', '/api/admin/content', { content: d });
  await owner('POST', '/api/admin/content/publish', {});
  assert.equal((await anon('GET', '/p/about')).status, 404);
  assert.equal((await owner('GET', '/p/about?preview=1')).status, 200);
});

test('الإهداءات: إرسال وعرض وبحث وتصفية وتحقق', async () => {
  const bad = await anon('POST', '/api/dedications', { recipientType: 'single', teacherName: '', body: 'x' });
  assert.equal(bad.status, 400);
  const bot = await anon('POST', '/api/dedications', { recipientType: 'single', teacherName: 'a', body: 'b', website: 'spam' });
  assert.equal(bot.status, 400);
  const r = await anon('POST', '/api/dedications', { recipientType: 'single', teacherName: 'أ. فاطمة', school: 'ثانوية النور', country: 'المملكة العربية السعودية', senderName: 'سارة', body: 'شكرًا لك', cardStyle: 'royal-green' });
  assert.equal(r.status, 201);
  assert.equal(r.json.status, 'approved');
  await anon('POST', '/api/dedications', { recipientType: 'group', teacherName: 'معلمات الصف الثالث', body: 'شكرًا جزيلًا', anonymous: true, senderName: 'مخفي' });
  const list = await anon('GET', '/api/dedications');
  assert.equal(list.json.items.length, 2);
  const anonItem = list.json.items.find((x) => x.anonymous);
  assert.equal(anonItem.senderName, '', 'اسم المرسل لا يُكشف عند اختيار دون اسم');
  assert.equal((await anon('GET', '/api/dedications?filter=group')).json.items.length, 1);
  assert.equal((await anon('GET', '/api/dedications?q=' + encodeURIComponent('النور'))).json.items.length, 1);
  assert.equal((await anon('GET', '/api/dedications?country=' + encodeURIComponent('المملكة العربية السعودية'))).json.items.length, 1);
  assert.deepEqual((await anon('GET', '/api/countries')).json.countries, ['المملكة العربية السعودية']);
  const long = await anon('POST', '/api/dedications', { recipientType: 'single', teacherName: 'x', body: 'ب'.repeat(501) });
  assert.equal(long.status, 400);
});

test('إدارة الإهداءات: إخفاء وتصنيف وحذف واستعادة', async () => {
  const all = await owner('GET', '/api/admin/dedications');
  const id = all.json.items.find((x) => x.recipientType === 'single').id;
  await owner('PATCH', '/api/admin/dedications/' + id, { gender: 'female' });
  assert.equal((await anon('GET', '/api/dedications?filter=female')).json.items.length, 1);
  await owner('PATCH', '/api/admin/dedications/' + id, { status: 'hidden' });
  assert.equal((await anon('GET', '/api/dedications')).json.items.length, 1);
  await owner('PATCH', '/api/admin/dedications/' + id, { status: 'approved' });
  await owner('DELETE', '/api/admin/dedications/' + id);
  assert.equal((await anon('GET', '/api/dedications')).json.items.length, 1);
  await owner('POST', `/api/admin/dedications/${id}/restore`);
  assert.equal((await anon('GET', '/api/dedications')).json.items.length, 2);
  const csv = await owner('GET', '/api/admin/dedications.csv');
  assert.equal(csv.status, 200);
  assert.ok(csv.text.includes('أ. فاطمة'));
});

test('وضع المراجعة: الإهداء الجديد لا يظهر قبل الاعتماد', async () => {
  const c = await owner('GET', '/api/admin/content');
  c.json.draft.settings.moderation = true;
  await owner('PUT', '/api/admin/content', { content: c.json.draft });
  await owner('POST', '/api/admin/content/publish', {});
  const r = await client()('POST', '/api/dedications', { recipientType: 'single', teacherName: 'معلم المراجعة', body: 'نص' });
  assert.equal(r.json.status, 'pending');
  assert.ok(!(await anon('GET', '/api/dedications')).json.items.some((x) => x.teacherName === 'معلم المراجعة'));
});

test('الأدوار: المحرر لا ينشر ولا يدير المستخدمين ولا ينزّل نسخًا', async () => {
  assert.equal((await owner('POST', '/api/admin/users', { email: 'ed@example.com', name: 'محرر', role: 'editor', password: 'Editor-pass-1' })).status, 201);
  assert.equal((await editor('POST', '/api/auth/login', { email: 'ed@example.com', password: 'Editor-pass-1' })).status, 200);
  assert.equal((await editor('GET', '/api/admin/content')).status, 200);
  assert.equal((await editor('POST', '/api/admin/content/publish', {})).status, 403);
  assert.equal((await editor('GET', '/api/admin/users')).status, 403);
  assert.equal((await editor('GET', '/api/admin/backup')).status, 403);
  const users = await owner('GET', '/api/admin/users');
  const me = users.json.items.find((u) => u.role === 'owner');
  assert.equal((await owner('DELETE', '/api/admin/users/' + me.id)).status, 400, 'لا يحذف المالك نفسه');
  assert.equal((await owner('PATCH', '/api/admin/users/' + me.id, { role: 'editor' })).status, 400, 'لا يُخفَّض آخر مالك');
});

test('رفع صورة وعرضها، ورفض الملفات غير الصور', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5e20000000049454e44ae426082', 'hex');
  const up = await owner('POST', '/api/admin/uploads', png, { 'Content-Type': 'image/png' });
  assert.equal(up.status, 201);
  assert.equal((await anon('GET', up.json.url)).status, 200);
  const bad = await owner('POST', '/api/admin/uploads', Buffer.from('<svg onload=alert(1)>'), { 'Content-Type': 'image/svg+xml' });
  assert.equal(bad.status, 415);
  assert.equal((await anon('GET', '/uploads/..%2Fathar.db')).status, 404);
});

let backup;
test('النسخ الاحتياطي والاستعادة', async () => {
  const b = await owner('GET', '/api/admin/backup');
  assert.equal(b.status, 200);
  backup = b.json;
  assert.equal(backup.format, 'athar-backup');
  assert.ok(Object.keys(backup.uploads).length >= 1);
  // تغيير ثم استعادة
  await anon('POST', '/api/dedications', { recipientType: 'single', teacherName: 'سيُمحى بالاستعادة', body: 'x' });
  const before = (await owner('GET', '/api/admin/dedications?limit=200')).json.items.length;
  const rs = await owner('POST', '/api/admin/restore', backup);
  assert.equal(rs.status, 200);
  // الجلسات أُنهيت؛ نعيد الدخول
  assert.equal((await owner('GET', '/api/admin/content')).status, 401);
  assert.equal((await owner('POST', '/api/auth/login', { email: 'owner@example.com', password: 'Owner-pass-123' })).status, 200);
  const after = (await owner('GET', '/api/admin/dedications?limit=200')).json.items.length;
  assert.equal(after, before - 1);
  assert.equal((await owner('POST', '/api/admin/restore', { format: 'x' })).status, 400);
});

test('البيانات تبقى بعد إعادة تشغيل الخادم', async () => {
  await stop();
  await start();
  const r = await anon('GET', '/');
  assert.ok(r.text.includes('اقتباس اختبار جديد'));
  assert.ok(r.text.includes(SIG));
  assert.equal((await owner('POST', '/api/auth/login', { email: 'owner@example.com', password: 'Owner-pass-123' })).status, 200);
  assert.ok((await anon('GET', '/api/dedications')).json.items.length >= 1);
});
