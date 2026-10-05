'use strict';
// تحقق من بنية المحتوى قبل حفظه أو نشره.

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const SLUG = /^[a-z0-9؀-ۿ-]{1,60}$/;
const ID = /^[A-Za-z0-9_-]{1,60}$/;
const SECTION_TYPES = ['hero', 'write', 'garden', 'text', 'image'];

function safeUrl(u) {
  if (u === '' || u == null) return true;
  const s = String(u);
  if (s.startsWith('#') || (s.startsWith('/') && !s.startsWith('//'))) return true;
  return /^https?:\/\//i.test(s) || /^mailto:/i.test(s);
}

function walkStrings(obj, fn, pathArr = []) {
  if (typeof obj === 'string') return fn(obj, pathArr);
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const r = walkStrings(obj[i], fn, pathArr.concat(i));
      if (r) return r;
    }
  } else if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      const r = walkStrings(obj[k], fn, pathArr.concat(k));
      if (r) return r;
    }
  }
  return null;
}

function validateContent(c) {
  if (!c || typeof c !== 'object' || c.schema !== 1) return 'بنية المحتوى غير معروفة.';
  if (JSON.stringify(c).length > 2.5e6) return 'المحتوى أكبر من المسموح.';
  if (!c.meta || typeof c.meta.title !== 'string') return 'عنوان الموقع مفقود.';
  if (!c.theme || typeof c.theme.colors !== 'object') return 'إعدادات الألوان مفقودة.';
  for (const [k, v] of Object.entries(c.theme.colors)) if (!HEX.test(v)) return `قيمة اللون «${k}» غير صالحة.`;
  if (c.theme.fontCssUrl && !/^https:\/\/fonts\.googleapis\.com\//.test(c.theme.fontCssUrl)) return 'رابط الخط يجب أن يكون من Google Fonts.';
  if (!Array.isArray(c.nav)) return 'القائمة غير صالحة.';
  for (const n of c.nav) {
    if (!n || !ID.test(n.id || '') || typeof n.label !== 'string') return 'عنصر قائمة غير صالح.';
    if (!safeUrl(n.target)) return `رابط عنصر القائمة «${n.label}» غير مسموح.`;
  }
  if (!c.gift || typeof c.gift !== 'object') return 'بيانات نافذة الهدية مفقودة.';
  if (!Array.isArray(c.pages) || !c.pages.length) return 'يجب أن تحتوي الموقع على صفحة واحدة على الأقل.';
  const slugs = new Set();
  const ids = new Set();
  let hasHome = false;
  for (const p of c.pages) {
    if (!p || !ID.test(p.id || '')) return 'صفحة غير صالحة.';
    if (p.slug === '') {
      if (!p.deletedAt) hasHome = true;
    } else if (!SLUG.test(p.slug || '')) return `رابط الصفحة «${p.title}» غير صالح (حروف وأرقام وشرطات فقط).`;
    if (!p.deletedAt) {
      if (slugs.has(p.slug)) return `رابط الصفحة «${p.title}» مكرر.`;
      slugs.add(p.slug);
    }
    if (!Array.isArray(p.sections)) return 'أقسام الصفحة غير صالحة.';
    for (const s of p.sections) {
      if (!s || !ID.test(s.id || '') || !SECTION_TYPES.includes(s.type) || typeof s.data !== 'object') return 'قسم غير صالح.';
      if (ids.has(s.id)) return `معرّف القسم «${s.id}» مكرر.`;
      ids.add(s.id);
    }
  }
  if (!hasHome) return 'لا يمكن حذف الصفحة الرئيسية.';
  const urlKeys = /(target|image|src|url|href|ogImage)$/i;
  const bad = walkStrings(c, (s, pth) => {
    if (s.length > 20000) return 'نص طويل جدًا.';
    const key = String(pth[pth.length - 1]);
    if (urlKeys.test(key) && key !== 'fontCssUrl' && !safeUrl(s)) return `رابط غير مسموح في «${pth.join('.')}».`;
    if (/(^|\.)(bg|bg2|fg)$/.test(key) && s && !HEX.test(s)) return `لون غير صالح في «${pth.join('.')}».`;
    return null;
  });
  return bad;
}

module.exports = { validateContent, safeUrl };
