'use strict';
// أداة سطر أوامر لإنشاء حساب المالك أو إعادة تعيين كلمة مروره.
// الاستخدام:
//   npm run create-owner      ← ينشئ أول حساب مالك (فقط إن لم يوجد مالك)
//   npm run reset-password    ← يعيّن كلمة مرور جديدة لحساب موجود
// تُكتب كلمة المرور في الطرفية دون أن تظهر، ولا تُحفظ في أي ملف.
const readline = require('node:readline');
const DB = require('../server/db');
const Auth = require('../server/auth');

const mode = process.argv[2];

function ask(q, hidden) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(q)) rl.output.write(s);
        else rl.output.write('*');
      };
    }
    rl.question(q, (a) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(a.trim());
    });
  });
}

async function main() {
  DB.open();
  const d = DB.get();
  if (mode === 'create') {
    const owners = d.prepare("SELECT COUNT(*) c FROM users WHERE role='owner'").get().c;
    if (owners > 0) {
      console.log('يوجد حساب مالك مسبقًا. استخدمي: npm run reset-password');
      process.exit(1);
    }
    const email = (await ask('البريد الإلكتروني للمالك: ')).toLowerCase();
    const name = await ask('الاسم (اختياري): ');
    const pw = await ask('كلمة المرور (10 أحرف على الأقل): ', true);
    const pw2 = await ask('أعيدي كتابة كلمة المرور: ', true);
    if (pw !== pw2) throw new Error('كلمتا المرور غير متطابقتين.');
    const err = Auth.validatePassword(pw);
    if (err) throw new Error(err);
    d.prepare("INSERT INTO users(email,name,password_hash,role) VALUES (?,?,?,'owner')").run(email, name, Auth.hashPassword(pw));
    DB.audit(email, 'إنشاء حساب المالك (سطر الأوامر)');
    console.log('تم إنشاء حساب المالك. سجّلي الدخول من /admin');
  } else if (mode === 'reset') {
    const email = (await ask('البريد الإلكتروني للحساب: ')).toLowerCase();
    const u = d.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!u) throw new Error('لا يوجد حساب بهذا البريد.');
    const pw = await ask('كلمة المرور الجديدة: ', true);
    const pw2 = await ask('أعيدي كتابتها: ', true);
    if (pw !== pw2) throw new Error('كلمتا المرور غير متطابقتين.');
    const err = Auth.validatePassword(pw);
    if (err) throw new Error(err);
    d.prepare('UPDATE users SET password_hash=?, disabled=0 WHERE id=?').run(Auth.hashPassword(pw), u.id);
    Auth.destroyUserSessions(u.id);
    DB.audit(email, 'إعادة تعيين كلمة المرور (سطر الأوامر)');
    console.log('تم تعيين كلمة المرور الجديدة وإنهاء الجلسات السابقة.');
  } else {
    console.log('الاستخدام: node scripts/owner-cli.js create|reset');
    process.exit(1);
  }
  DB.close();
}

main().catch((e) => {
  console.error('خطأ:', e.message);
  process.exit(1);
});
