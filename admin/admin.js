'use strict';
(function () {
  // ======================= أدوات =======================
  const icon = (n, c) => (window.icon && window.icon(n, c)) || document.createTextNode('');
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props)
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = !!v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
    return el;
  }
  function fill(el, ...kids) {
    el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false).map((k) => (k.nodeType ? k : document.createTextNode(String(k)))));
    return el;
  }
  async function api(path, opts) {
    opts = Object.assign({ credentials: 'same-origin' }, opts || {});
    opts.headers = Object.assign({ 'X-Requested-With': 'athar' }, opts.headers || {});
    if (opts.body && !(opts.body instanceof Blob) && typeof opts.body !== 'string') {
      opts.body = JSON.stringify(opts.body);
      opts.headers['Content-Type'] = 'application/json';
    }
    const r = await fetch(path, opts);
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && !path.startsWith('/api/auth/')) {
      S.me = null;
      render();
    }
    if (!r.ok) throw new Error(j.error || 'تعذّر تنفيذ الطلب.');
    return j;
  }
  let toastT;
  function toast(msg, bad) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast' + (bad ? ' bad' : '');
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => (t.hidden = true), bad ? 6000 : 3000);
  }
  const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 8);
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const RANK = { editor: 1, admin: 2, owner: 3 };
  const can = (role) => S.me && RANK[S.me.role] >= RANK[role];
  const ROLE_AR = { owner: 'مالك', admin: 'مدير', editor: 'محرر' };
  const fmtDate = (s) => (s ? new Date(s.replace(' ', 'T') + (s.includes('Z') || s.includes('T') ? '' : 'Z')).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '');

  // ======================= الحالة =======================
  const S = { me: null, auth: null, view: 'content', sub: 'pages', draft: null, base: null, dirty: false, hasUnpublished: false, open: {} };
  const app = document.getElementById('app');

  window.addEventListener('beforeunload', (e) => {
    if (S.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  async function boot() {
    try {
      S.auth = await api('/api/auth/state');
      S.me = S.auth.user;
    } catch (e) {
      fill(app, h('p', { class: 'boot' }, e.message));
      return;
    }
    render();
  }

  function render() {
    if (!S.me) return renderAuth();
    renderShell();
  }

  // ======================= الدخول والإعداد =======================
  function renderAuth(mode) {
    mode = mode || (S.auth && S.auth.setupNeeded ? 'setup' : 'login');
    const err = h('p', { class: 'err', role: 'alert', hidden: true });
    const fail = (e) => {
      err.textContent = e.message;
      err.hidden = false;
    };
    let card;
    if (mode === 'setup') {
      if (!S.auth.setupEnabled) {
        card = h(
          'div',
          { class: 'auth-card' },
          h('h1', null, 'إنشاء حساب المالك'),
          h('p', { class: 'sub' }, 'لا يوجد حساب مالك بعد. لحماية الموقع، يتطلب الإنشاء أحد الطريقين:'),
          h('ol', null,
            h('li', null, 'اضبطي متغير البيئة SETUP_TOKEN في الاستضافة بقيمة سرية طويلة، ثم أعيدي تحميل هذه الصفحة.'),
            h('li', null, 'أو شغّلي الأمر npm run create-owner من طرفية الخادم.')
          )
        );
      } else {
        const f = {
          token: h('input', { class: 'in', type: 'password', autocomplete: 'off', required: true }),
          name: h('input', { class: 'in', autocomplete: 'name' }),
          email: h('input', { class: 'in', type: 'email', dir: 'ltr', autocomplete: 'username', required: true }),
          password: h('input', { class: 'in', type: 'password', autocomplete: 'new-password', minlength: 10, required: true }),
          password2: h('input', { class: 'in', type: 'password', autocomplete: 'new-password', required: true }),
        };
        card = h(
          'form',
          {
            class: 'auth-card',
            onsubmit: async (e) => {
              e.preventDefault();
              if (f.password.value !== f.password2.value) return fail(new Error('كلمتا المرور غير متطابقتين.'));
              try {
                await api('/api/auth/setup', { method: 'POST', body: { token: f.token.value, name: f.name.value, email: f.email.value, password: f.password.value } });
                toast('تم إنشاء حساب المالك. احذفي SETUP_TOKEN من متغيرات البيئة الآن.');
                boot();
              } catch (e2) {
                fail(e2);
              }
            },
          },
          h('h1', null, 'إنشاء حساب المالك'),
          h('p', { class: 'sub' }, 'خطوة لمرة واحدة. أدخلي رمز الإعداد الذي ضبطتِه في متغير البيئة SETUP_TOKEN.'),
          h('label', { class: 'f' }, h('span', null, 'رمز الإعداد'), f.token),
          h('label', { class: 'f' }, h('span', null, 'الاسم'), f.name),
          h('label', { class: 'f' }, h('span', null, 'البريد الإلكتروني'), f.email),
          h('label', { class: 'f' }, h('span', null, 'كلمة المرور'), f.password, h('small', null, '10 أحرف على الأقل.')),
          h('label', { class: 'f' }, h('span', null, 'تأكيد كلمة المرور'), f.password2),
          err,
          h('button', { class: 'btn pri', type: 'submit' }, 'إنشاء الحساب والدخول')
        );
      }
    } else if (mode === 'recover') {
      const f = {
        token: h('input', { class: 'in', type: 'password', autocomplete: 'off' }),
        email: h('input', { class: 'in', type: 'email', dir: 'ltr' }),
        password: h('input', { class: 'in', type: 'password', autocomplete: 'new-password' }),
      };
      card = h(
        'form',
        {
          class: 'auth-card',
          onsubmit: async (e) => {
            e.preventDefault();
            try {
              await api('/api/auth/recover', { method: 'POST', body: { token: f.token.value, email: f.email.value, password: f.password.value } });
              toast('تم تعيين كلمة المرور. احذفي RECOVERY_TOKEN من متغيرات البيئة.');
              renderAuth('login');
            } catch (e2) {
              fail(e2);
            }
          },
        },
        h('h1', null, 'استعادة وصول المالك'),
        h('p', { class: 'sub' }, 'تعمل فقط عند ضبط RECOVERY_TOKEN في متغيرات البيئة.'),
        h('label', { class: 'f' }, h('span', null, 'رمز الاستعادة'), f.token),
        h('label', { class: 'f' }, h('span', null, 'بريد المالك'), f.email),
        h('label', { class: 'f' }, h('span', null, 'كلمة المرور الجديدة'), f.password),
        err,
        h('button', { class: 'btn pri', type: 'submit' }, 'تعيين كلمة المرور'),
        h('button', { class: 'link-btn', type: 'button', onclick: () => renderAuth('login') }, 'رجوع لتسجيل الدخول')
      );
    } else {
      const email = h('input', { class: 'in', type: 'email', dir: 'ltr', autocomplete: 'username', required: true });
      const pw = h('input', { class: 'in', type: 'password', autocomplete: 'current-password', required: true });
      card = h(
        'form',
        {
          class: 'auth-card',
          onsubmit: async (e) => {
            e.preventDefault();
            try {
              await api('/api/auth/login', { method: 'POST', body: { email: email.value, password: pw.value } });
              boot();
            } catch (e2) {
              fail(e2);
            }
          },
        },
        h('h1', null, 'لوحة إدارة أثر'),
        h('p', { class: 'sub' }, 'سجّلي الدخول للمتابعة.'),
        h('label', { class: 'f' }, h('span', null, 'البريد الإلكتروني'), email),
        h('label', { class: 'f' }, h('span', null, 'كلمة المرور'), pw),
        err,
        h('button', { class: 'btn pri', type: 'submit' }, 'دخول'),
        S.auth && S.auth.recoveryEnabled ? h('button', { class: 'link-btn', type: 'button', onclick: () => renderAuth('recover') }, 'نسيت كلمة المرور؟') : null
      );
    }
    fill(app, h('div', { class: 'auth' }, card));
    const first = app.querySelector('input');
    if (first) first.focus();
  }

  // ======================= الهيكل =======================
  const VIEWS = [
    { id: 'content', label: 'المحتوى والتصميم', icon: 'feather', role: 'editor' },
    { id: 'dedications', label: 'الإهداءات', icon: 'heart', role: 'editor' },
    { id: 'media', label: 'الصور', icon: 'star', role: 'editor' },
    { id: 'trash', label: 'المحذوفات', icon: 'x', role: 'editor' },
    { id: 'history', label: 'السجل والنشر', icon: 'book', role: 'admin' },
    { id: 'users', label: 'المستخدمون', icon: 'users', role: 'owner' },
    { id: 'backup', label: 'النسخ الاحتياطي', icon: 'link', role: 'owner' },
    { id: 'account', label: 'حسابي', icon: 'user', role: 'editor' },
  ];

  async function renderShell() {
    if (!S.draft) {
      try {
        await loadContent();
      } catch (e) {
        return toast(e.message, true);
      }
    }
    const side = h(
      'aside',
      { class: 'side' },
      h('div', { class: 'logo' }, 'أثر', h('small', null, 'لوحة الإدارة')),
      VIEWS.filter((v) => can(v.role)).map((v) =>
        h('button', { class: 'nav' + (S.view === v.id ? ' on' : ''), type: 'button', onclick: () => go(v.id) }, icon(v.icon), v.label)
      ),
      h('a', { class: 'nav-link', href: '/', target: '_blank', rel: 'noopener', style: 'color:#9FB0C6;font-size:13px;padding:8px 12px' }, 'فتح الموقع ↗'),
      h(
        'div',
        { class: 'me' },
        h('b', null, S.me.name || S.me.email),
        h('span', null, ROLE_AR[S.me.role]),
        h('button', { class: 'btn sm', type: 'button', onclick: logout }, 'تسجيل الخروج')
      )
    );
    const main = h('main', { class: 'main' });
    fill(app, h('div', { class: 'shell' }, side, main));
    const views = { content: viewContent, dedications: viewDedications, media: viewMedia, trash: viewTrash, history: viewHistory, users: viewUsers, backup: viewBackup, account: viewAccount };
    try {
      await views[S.view](main);
    } catch (e) {
      main.append(h('p', { class: 'err' }, e.message));
    }
  }
  function go(v) {
    S.view = v;
    renderShell();
    window.scrollTo(0, 0);
  }
  async function logout() {
    if (S.dirty && !confirm('لديك تعديلات غير محفوظة ستضيع. هل تريد الخروج؟')) return;
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    S.me = null;
    S.draft = null;
    S.dirty = false;
    boot();
  }

  // ======================= المحتوى: تحميل وحفظ ونشر =======================
  async function loadContent() {
    const r = await api('/api/admin/content');
    S.draft = r.draft;
    S.base = r.draftUpdatedAt;
    S.hasUnpublished = r.hasUnpublished;
    S.dirty = false;
  }
  let statusEl;
  function markDirty() {
    S.dirty = true;
    updateStatus();
  }
  function updateStatus() {
    if (!statusEl) return;
    if (S.dirty) {
      statusEl.className = 'status dirty';
      statusEl.textContent = 'تعديلات غير محفوظة';
    } else if (S.hasUnpublished) {
      statusEl.className = 'status dirty';
      statusEl.textContent = 'المسودة محفوظة ولم تُنشر';
    } else {
      statusEl.className = 'status';
      statusEl.textContent = 'كل شيء منشور';
    }
  }
  async function saveDraft(quiet) {
    const r = await api('/api/admin/content', { method: 'PUT', body: { content: S.draft, baseUpdatedAt: S.base } });
    S.base = r.draftUpdatedAt;
    S.dirty = false;
    S.hasUnpublished = true;
    updateStatus();
    if (!quiet) toast('حُفظت المسودة. لن تظهر للزوار قبل النشر.');
  }
  function contentBar(title) {
    statusEl = h('span', { class: 'status' });
    updateStatus();
    const bar = h(
      'div',
      { class: 'topbar' },
      h('h1', null, title),
      statusEl,
      h('button', { class: 'btn', type: 'button', onclick: () => saveDraft().catch((e) => toast(e.message, true)) }, 'حفظ المسودة'),
      h('button', { class: 'btn', type: 'button', onclick: openPreview }, icon('eye'), 'معاينة'),
      can('admin')
        ? h('button', {
            class: 'btn pri',
            type: 'button',
            onclick: async () => {
              const note = prompt('وصف مختصر لهذا النشر (اختياري):', '');
              if (note === null) return;
              try {
                if (S.dirty) await saveDraft(true);
                await api('/api/admin/content/publish', { method: 'POST', body: { note } });
                S.hasUnpublished = false;
                updateStatus();
                toast('تم النشر. التعديلات ظاهرة الآن للزوار.');
              } catch (e) {
                toast(e.message, true);
              }
            },
          }, 'نشر')
        : null,
      can('admin')
        ? h('button', {
            class: 'btn ghost',
            type: 'button',
            onclick: async () => {
              if (!confirm('ستُلغى كل التعديلات غير المنشورة وتعود المسودة إلى النسخة المنشورة. هل أنت متأكدة؟')) return;
              try {
                await api('/api/admin/content/discard', { method: 'POST' });
                await loadContent();
                renderShell();
                toast('أُعيدت المسودة إلى النسخة المنشورة.');
              } catch (e) {
                toast(e.message, true);
              }
            },
          }, 'تجاهل التعديلات')
        : null
    );
    return bar;
  }

  async function openPreview() {
    try {
      if (S.dirty) await saveDraft(true);
    } catch (e) {
      return toast(e.message, true);
    }
    const frame = h('iframe', { class: 'preview-frame', src: '/?preview=1', title: 'معاينة', style: 'width:430px' });
    const setW = (w) => (frame.style.width = w);
    const dlg = h(
      'div',
      { class: 'dlg', onclick: (e) => e.target === dlg && dlg.remove() },
      h(
        'div',
        { class: 'dlg-box wide' },
        h(
          'div',
          { class: 'dlg-head' },
          h('h2', null, 'معاينة المسودة (غير منشورة)'),
          h('button', { class: 'btn sm', type: 'button', onclick: () => setW('430px') }, 'جوال'),
          h('button', { class: 'btn sm', type: 'button', onclick: () => setW('820px') }, 'تابلت'),
          h('button', { class: 'btn sm', type: 'button', onclick: () => setW('100%') }, 'كمبيوتر'),
          h('a', { class: 'btn sm', href: '/?preview=1', target: '_blank', rel: 'noopener' }, 'فتح في نافذة'),
          h('button', { class: 'btn sm icon-btn', type: 'button', 'aria-label': 'إغلاق', onclick: () => dlg.remove() }, icon('x'))
        ),
        h('div', { class: 'preview-frame-wrap' }, frame)
      )
    );
    document.body.append(dlg);
  }

  // ======================= مولّد النماذج =======================
  const ICON_OPTS = [['none', 'بدون'], ['sparkles', 'نجوم'], ['feather', 'ريشة'], ['heart', 'قلب'], ['gift', 'هدية'], ['star', 'نجمة'], ['book', 'كتاب'], ['home', 'منزل'], ['link', 'رابط'], ['user', 'شخص'], ['users', 'أشخاص'], ['globe', 'كرة أرضية'], ['mapPin', 'موقع'], ['eye', 'عين'], ['send', 'إرسال']];

  function field(obj, def) {
    const k = def.k;
    const lab = h('span', null, def.label);
    const hint = def.hint ? h('small', null, def.hint) : null;
    const set = (v) => {
      obj[k] = v;
      markDirty();
      if (def.onchange) def.onchange(v);
    };
    switch (def.type) {
      case 'textarea':
        return h('label', { class: 'f' }, lab, h('textarea', { class: 'ta', value: obj[k] || '', rows: def.rows || 3, oninput: (e) => set(e.target.value) }), hint);
      case 'number':
        return h('label', { class: 'f' }, lab, h('input', { class: 'in', type: 'number', min: def.min, max: def.max, value: obj[k], oninput: (e) => set(Number(e.target.value)) }), hint);
      case 'bool':
        return h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: obj[k], onchange: (e) => set(e.target.checked) }), def.label);
      case 'url':
        return h('label', { class: 'f' }, lab, h('input', { class: 'in', dir: 'ltr', value: obj[k] || '', placeholder: '#write أو /p/about أو https://…', oninput: (e) => set(e.target.value.trim()) }), hint || h('small', null, 'قسم في الصفحة الرئيسية: #معرّف_القسم — صفحة: /p/الرابط — موقع خارجي: https://…'));
      case 'icon':
        return h('label', { class: 'f' }, lab, h('select', { class: 'sel', onchange: (e) => set(e.target.value) }, ICON_OPTS.map(([v, l]) => h('option', { value: v, selected: obj[k] === v || null }, l))));
      case 'color': {
        const txt = h('input', { class: 'in', dir: 'ltr', value: obj[k] || '', maxlength: 9 });
        const pick = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(obj[k] || '') ? obj[k] : '#000000' });
        pick.addEventListener('input', () => {
          txt.value = pick.value.toUpperCase();
          set(txt.value);
        });
        txt.addEventListener('input', () => {
          const v = txt.value.trim();
          if (/^#[0-9a-f]{6}$/i.test(v)) pick.value = v;
          if (v === '' && def.optional) return set('');
          if (/^#[0-9a-f]{3,8}$/i.test(v)) set(v.toUpperCase());
        });
        return h('label', { class: 'f' }, lab, h('div', { class: 'color-in' }, pick, txt), hint);
      }
      case 'image':
        return h('div', { class: 'f' }, lab, imageInput(obj[k] || '', set), hint);
      case 'strings':
        return stringList(obj, def);
      case 'list':
        return objList(obj, def);
      default:
        return h('label', { class: 'f' }, lab, h('input', { class: 'in', value: obj[k] == null ? '' : obj[k], maxlength: def.max || 400, oninput: (e) => set(e.target.value) }), hint);
    }
  }
  function fields(obj, defs) {
    return defs.map((d) => field(obj, d));
  }

  function imageInput(val, set) {
    const img = h('img', { src: val || '', alt: '' });
    const inp = h('input', { class: 'in', dir: 'ltr', value: val, placeholder: '/uploads/…' });
    const update = (v) => {
      inp.value = v;
      img.src = v;
      set(v);
    };
    inp.addEventListener('change', () => update(inp.value.trim()));
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true });
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      try {
        const r = await uploadFile(f);
        update(r.url);
        toast('رُفعت الصورة.');
      } catch (e) {
        toast(e.message, true);
      }
    });
    return h(
      'div',
      { class: 'img-field' },
      img,
      inp,
      h('button', { class: 'btn sm', type: 'button', onclick: () => file.click() }, 'رفع'),
      h('button', { class: 'btn sm', type: 'button', onclick: () => pickImage(update) }, 'المكتبة'),
      file
    );
  }
  async function uploadFile(f) {
    if (f.size > 5 * 1024 * 1024) throw new Error('حجم الصورة أكبر من 5 ميغابايت.');
    return api('/api/admin/uploads', { method: 'POST', body: f, headers: { 'Content-Type': f.type } });
  }
  async function pickImage(cb) {
    const r = await api('/api/admin/uploads');
    const dlg = h('div', { class: 'dlg', onclick: (e) => e.target === dlg && dlg.remove() });
    dlg.append(
      h(
        'div',
        { class: 'dlg-box' },
        h('div', { class: 'dlg-head' }, h('h2', null, 'اختيار صورة'), h('button', { class: 'btn sm icon-btn', type: 'button', onclick: () => dlg.remove(), 'aria-label': 'إغلاق' }, icon('x'))),
        r.items.length ? null : h('p', { class: 'muted' }, 'لا توجد صور مرفوعة بعد.'),
        h('div', { class: 'thumbs' }, r.items.concat([{ url: '/assets/poster.png', name: 'poster.png (الأصلية)' }]).map((it) =>
          h('button', { class: 'thumb', type: 'button', onclick: () => (cb(it.url), dlg.remove()) }, h('img', { src: it.url, alt: '' }), h('div', null, it.name))
        ))
      )
    );
    document.body.append(dlg);
  }

  function moveBtns(arr, i, rerender) {
    return [
      h('button', { class: 'btn sm ghost icon-btn', type: 'button', title: 'تحريك لأعلى', 'aria-label': 'تحريك لأعلى', disabled: i === 0 || null, onclick: () => { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; markDirty(); rerender(); } }, '▲'),
      h('button', { class: 'btn sm ghost icon-btn', type: 'button', title: 'تحريك لأسفل', 'aria-label': 'تحريك لأسفل', disabled: i === arr.length - 1 || null, onclick: () => { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; markDirty(); rerender(); } }, '▼'),
    ];
  }

  function stringList(obj, def) {
    const wrap = h('div', { class: 'sublist' });
    const arr = obj[def.k] || (obj[def.k] = []);
    const draw = () => {
      fill(wrap, 
        h('span', null, def.label),
        def.hint ? h('small', { class: 'muted', style: 'display:block' }, def.hint) : null,
        arr.map((v, i) =>
          h(
            'div',
            { class: 'row', style: 'margin-top:8px' },
            h('textarea', { class: 'ta grow', rows: def.rows || 2, value: v, oninput: (e) => { arr[i] = e.target.value; markDirty(); } }),
            moveBtns(arr, i, draw),
            h('button', { class: 'btn sm danger', type: 'button', onclick: () => { if (confirm('حذف هذا العنصر؟')) { arr.splice(i, 1); markDirty(); draw(); } } }, 'حذف')
          )
        ),
        h('button', { class: 'btn sm', type: 'button', style: 'margin-top:8px', onclick: () => { arr.push(''); markDirty(); draw(); } }, '+ إضافة')
      );
    };
    draw();
    return wrap;
  }

  function objList(obj, def) {
    const wrap = h('div', { class: 'sublist' });
    const arr = obj[def.k] || (obj[def.k] = []);
    const draw = () => {
      fill(wrap, 
        h('span', null, def.label),
        arr.map((it, i) => {
          const key = def.k + ':' + (it.id || i);
          const body = h('div', { class: 'item-body', hidden: !S.open[key] }, fields(it, def.fields));
          return h(
            'div',
            { class: 'item' + (it.hidden ? ' off' : '') },
            h(
              'div',
              { class: 'item-head' },
              h('span', { class: 't' }, it[def.titleKey] || '(بلا عنوان)'),
              it.hidden ? h('span', { class: 'badge' }, 'مخفي') : null,
              moveBtns(arr, i, draw),
              'hidden' in it ? h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { it.hidden = !it.hidden; markDirty(); draw(); } }, it.hidden ? 'إظهار' : 'إخفاء') : null,
              h('button', { class: 'btn sm', type: 'button', onclick: () => { S.open[key] = !S.open[key]; body.hidden = !S.open[key]; } }, 'تعديل'),
              h('button', { class: 'btn sm danger', type: 'button', onclick: () => { if (confirm(`حذف «${it[def.titleKey] || ''}»؟ يمكنك التراجع بـ«تجاهل التعديلات» قبل النشر أو من السجل.`)) { arr.splice(i, 1); markDirty(); draw(); } } }, 'حذف')
            ),
            body
          );
        }),
        h('button', { class: 'btn sm', type: 'button', style: 'margin-top:8px', onclick: () => { const n = def.make(); arr.push(n); S.open[def.k + ':' + (n.id || arr.length - 1)] = true; markDirty(); draw(); } }, '+ إضافة')
      );
    };
    draw();
    return wrap;
  }

  // ======================= تعريفات الحقول =======================
  const linkItem = [
    { k: 'label', label: 'النص' },
    { k: 'icon', label: 'الأيقونة', type: 'icon' },
    { k: 'target', label: 'الرابط', type: 'url' },
  ];
  const SECTION_DEFS = {
    hero: {
      name: 'الواجهة الرئيسية',
      fields: [
        { k: 'datePillImage', label: 'صورة شارة التاريخ', type: 'image' },
        { k: 'datePillText', label: 'نص شارة التاريخ' },
        { k: 'ringText', label: 'النص داخل الدائرة الذهبية' },
        { k: 'quote', label: 'الاقتباس', type: 'textarea', rows: 2 },
        { k: 'cardText', label: 'نص البطاقة', type: 'textarea', rows: 3, hint: 'لتمييز كلمة باللون والخط السفلي ضعيها بين قوسين مزدوجين: [[أثركم]]. السطر الجديد يبقى كما هو.' },
        { k: 'ctaLabel', label: 'نص زر فتح الهدية' },
        { k: 'buttons', label: 'الأزرار الصغيرة', type: 'list', titleKey: 'label', fields: linkItem, make: () => ({ id: uid('b'), label: 'زر جديد', icon: 'none', target: '#', hidden: false }) },
      ],
    },
    write: {
      name: 'نموذج كتابة الإهداء',
      fields: [
        { k: 'pill', label: 'الشارة' },
        { k: 'title', label: 'العنوان' },
        { k: 'subtitle', label: 'الوصف' },
        { k: 'step1Title', label: 'عنوان الخطوة 1' },
        { k: 'singleLabel', label: 'خيار: معلم واحد' },
        { k: 'groupLabel', label: 'خيار: مجموعة' },
        { k: 'teacherLabel', label: 'عنوان حقل اسم المعلم' },
        { k: 'teacherPlaceholder', label: 'نص تلميحي لاسم المعلم' },
        { k: 'schoolLabel', label: 'عنوان حقل المدرسة' },
        { k: 'schoolPlaceholder', label: 'نص تلميحي للمدرسة' },
        { k: 'countryLabel', label: 'عنوان حقل الدولة' },
        { k: 'countryPlaceholder', label: 'نص تلميحي للدولة' },
        { k: 'senderLabel', label: 'عنوان حقل صاحب الإهداء' },
        { k: 'senderPlaceholder', label: 'نص تلميحي لصاحب الإهداء' },
        { k: 'anonymousLabel', label: 'نص خيار الإهداء دون اسم' },
        { k: 'step2Title', label: 'عنوان الخطوة 2' },
        { k: 'helpLabel', label: 'نص زر المساعدة في الكتابة' },
        { k: 'suggestions', label: 'نصوص زر المساعدة في الكتابة', type: 'strings', rows: 3, hint: 'يُدرج الزر هذه النصوص بالتناوب في خانة الإهداء.' },
        { k: 'textLabel', label: 'عنوان خانة الإهداء' },
        { k: 'textPlaceholder', label: 'نص تلميحي لخانة الإهداء', type: 'textarea', rows: 2 },
        { k: 'maxLength', label: 'الحد الأقصى لعدد الأحرف', type: 'number', min: 50, max: 2000 },
        { k: 'styleLabel', label: 'عنوان اختيار شكل الهدية' },
        { k: 'swatchText', label: 'النص داخل عينات الأشكال' },
        { k: 'cardStyles', label: 'أشكال البطاقات', type: 'list', titleKey: 'name', make: () => ({ id: uid('s'), name: 'شكل جديد', bg: '#FFFFFF', bg2: '', fg: '#1B3150', hidden: false }), fields: [
          { k: 'name', label: 'الاسم' },
          { k: 'bg', label: 'لون الخلفية', type: 'color' },
          { k: 'bg2', label: 'لون ثانٍ للتدرج (اختياري)', type: 'color', optional: true },
          { k: 'fg', label: 'لون النص', type: 'color' },
        ] },
        { k: 'previewLabel', label: 'نص زر معاينة البطاقة' },
        { k: 'whoLabel', label: 'عنوان «من أنت؟»' },
        { k: 'whoOptions', label: 'خيارات «من أنت؟»', type: 'strings', rows: 1 },
        { k: 'submitLabel', label: 'نص زر الإرسال' },
        { k: 'successMessage', label: 'رسالة نجاح الإرسال', type: 'textarea', rows: 2 },
        { k: 'pendingMessage', label: 'رسالة الإرسال عند تفعيل المراجعة', type: 'textarea', rows: 2 },
      ],
    },
    garden: {
      name: 'حديقة الامتنان',
      fields: [
        { k: 'showFilters', label: 'إظهار مربع البحث والتصفية', type: 'bool' },
        { k: 'pill', label: 'الشارة' },
        { k: 'emoji', label: 'الرمز التعبيري قبل العنوان' },
        { k: 'title', label: 'العنوان' },
        { k: 'subtitle', label: 'الوصف' },
        { k: 'searchPlaceholder', label: 'نص تلميحي للبحث' },
        { k: 'filterAll', label: 'تصنيف: الكل' },
        { k: 'filterMale', label: 'تصنيف: معلم' },
        { k: 'filterFemale', label: 'تصنيف: معلمة' },
        { k: 'filterGroup', label: 'تصنيف: مجموعة' },
        { k: 'allCountries', label: 'خيار: جميع الدول' },
        { k: 'emptyText', label: 'نص عند عدم وجود إهداءات' },
        { k: 'anonymousName', label: 'الاسم الظاهر للإهداء دون اسم' },
        { k: 'loadMore', label: 'نص زر عرض المزيد' },
      ],
    },
    text: {
      name: 'قسم نصي',
      make: () => ({ pill: '', title: 'عنوان جديد', subtitle: '', body: '', buttonLabel: '', buttonIcon: 'none', buttonTarget: '' }),
      fields: [
        { k: 'pill', label: 'الشارة (اختياري)' },
        { k: 'title', label: 'العنوان' },
        { k: 'subtitle', label: 'الوصف (اختياري)' },
        { k: 'body', label: 'النص', type: 'textarea', rows: 5, hint: 'يمكن تمييز كلمة بوضعها بين [[ ]].' },
        { k: 'buttonLabel', label: 'نص الزر (اختياري)' },
        { k: 'buttonIcon', label: 'أيقونة الزر', type: 'icon' },
        { k: 'buttonTarget', label: 'رابط الزر', type: 'url' },
      ],
    },
    image: {
      name: 'صورة',
      make: () => ({ src: '', alt: '', caption: '' }),
      fields: [
        { k: 'src', label: 'الصورة', type: 'image' },
        { k: 'alt', label: 'وصف الصورة (لقارئات الشاشة)' },
        { k: 'caption', label: 'تعليق تحت الصورة (اختياري)' },
      ],
    },
  };
  const COLOR_LABELS = {
    bg: 'خلفية الموقع',
    surface: 'خلفية البطاقات والحقول',
    surfaceAlt: 'خلفية ثانوية فاتحة',
    border: 'الحدود',
    primary: 'اللون الأساسي (الأزرار والعنصر النشط)',
    primary2: 'درجة ثانية للأساسي (التدرج والتمرير)',
    accent: 'لون التمييز (الأيقونات والإطارات والدائرة)',
    accentDeep: 'تمييز داكن',
    heading: 'العناوين والنصوص البارزة',
    text: 'النص العادي',
    muted: 'النص الثانوي',
    placeholder: 'النص التلميحي داخل الحقول',
    pillBg: 'خلفية الشارات',
    onPrimary: 'النص فوق اللون الأساسي',
    signature: 'لون التوقيع',
    success: 'رسائل النجاح',
    danger: 'الأخطاء والحقول الإلزامية',
  };
  const DEFAULT_COLORS = { bg: '#F7F5F1', surface: '#FFFFFF', surfaceAlt: '#F1EEE8', border: '#E2DACE', primary: '#1F3A5F', primary2: '#2B4F7B', accent: '#B5784A', accentDeep: '#8F5A33', heading: '#1B3150', text: '#33465D', muted: '#5D6C82', placeholder: '#9EA8B6', pillBg: '#E9EDF3', onPrimary: '#FFFFFF', signature: '#8F5A33', success: '#2E7D5B', danger: '#C0392B' };

  function lum(hex) {
    const m = hex.replace('#', '');
    const f = m.length === 3 ? m.split('').map((c) => c + c).join('') : m.slice(0, 6);
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function ratio(a, b) {
    try {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    } catch {
      return 0;
    }
  }

  // ======================= عرض: المحتوى =======================
  function homePage() {
    return S.draft.pages.find((p) => p.slug === '');
  }
  function sectionTitle(s) {
    const d = s.data || {};
    return (SECTION_DEFS[s.type] ? SECTION_DEFS[s.type].name : s.type) + (d.title && s.type !== 'write' && s.type !== 'garden' ? ` — ${d.title}` : '');
  }

  async function viewContent(main) {
    const subs = [
      ['pages', 'الصفحات والأقسام'],
      ['nav', 'القائمة'],
      ['gift', 'نافذة الهدية والتوقيع'],
      ['header', 'الترويسة وبيانات الموقع'],
      ['theme', 'الألوان والخط'],
      ['settings', 'الإعدادات'],
    ];
    const body = h('div');
    const tabs = h('div', { class: 'tabs' }, subs.map(([id, l]) => h('button', { type: 'button', class: S.sub === id ? 'on' : '', onclick: () => { S.sub = id; viewContent(main); } }, l)));
    fill(main, contentBar('المحتوى والتصميم'), tabs, body);
    const D = S.draft;
    if (S.sub === 'pages') body.append(pagesEditor());
    if (S.sub === 'nav')
      body.append(
        h('div', { class: 'card' }, h('h2', null, 'عناصر القائمة العلوية'), h('p', { class: 'desc' }, 'رتّبي العناصر أو أخفيها أو أضيفي روابط لصفحات جديدة.'),
          objList(D, { k: 'nav', label: 'العناصر', titleKey: 'label', fields: linkItem, make: () => ({ id: uid('n'), label: 'رابط جديد', icon: 'none', target: '#', hidden: false }) }))
      );
    if (S.sub === 'gift')
      body.append(
        h('div', { class: 'card' }, h('h2', null, 'نافذة «كلمة إكبار وامتنان»'), h('p', { class: 'desc' }, 'تظهر عند الضغط على زر فتح الهدية في الصفحة الرئيسية.'),
          fields(D.gift, [
            { k: 'enabled', label: 'تفعيل النافذة وزر فتح الهدية', type: 'bool' },
            { k: 'badge', label: 'الشارة' },
            { k: 'title', label: 'العنوان' },
            { k: 'lead', label: 'الفقرة الافتتاحية', type: 'textarea', rows: 2 },
            { k: 'paragraphs', label: 'الفقرات', type: 'strings', rows: 3 },
            { k: 'quote', label: 'الاقتباس', type: 'textarea', rows: 2 },
            { k: 'closingLead', label: 'العبارة قبل التوقيع' },
            { k: 'signature', label: 'التوقيع' },
          ]),
          h('p', { class: 'desc', style: 'margin-top:10px' }, 'لتغيير لون التوقيع: تبويب «الألوان والخط» ← لون التوقيع.'))
      );
    if (S.sub === 'header')
      body.append(
        h('div', { class: 'card' }, h('h2', null, 'الترويسة'), fields(D.header, [
          { k: 'badgeText', label: 'النص داخل الدائرة الصغيرة' },
          { k: 'wordmark', label: 'اسم الموقع بجانبها' },
          { k: 'showLangButton', label: 'إظهار زر الكرة الأرضية', type: 'bool' },
        ])),
        h('div', { class: 'card' }, h('h2', null, 'بيانات الموقع لمحركات البحث والمشاركة'), fields(D.meta, [
          { k: 'title', label: 'عنوان الصفحة' },
          { k: 'description', label: 'الوصف', type: 'textarea', rows: 2 },
          { k: 'author', label: 'المؤلف' },
          { k: 'ogImage', label: 'صورة المشاركة على وسائل التواصل (اختياري)', type: 'image' },
        ]))
      );
    if (S.sub === 'theme') body.append(themeEditor());
    if (S.sub === 'settings')
      body.append(
        h('div', { class: 'card' }, h('h2', null, 'الإهداءات'), fields(D.settings, [
          { k: 'moderation', label: 'مراجعة الإهداءات قبل ظهورها في الحديقة', type: 'bool' },
        ]), h('p', { class: 'desc', style: 'margin-top:8px' }, 'عند التفعيل تصل الإهداءات الجديدة بحالة «بانتظار المراجعة» ولا تظهر حتى تعتمديها من صفحة الإهداءات. يسري الإعداد بعد النشر.'))
      );
  }

  function pagesEditor() {
    const wrap = h('div');
    const D = S.draft;
    const draw = () => {
      const pages = D.pages.filter((p) => !p.deletedAt);
      fill(wrap, 
        ...pages.map((pg) => {
          const isHome = pg.slug === '';
          const secs = pg.sections;
          const secList = h('div');
          const drawSecs = () => {
            const live = secs.map((s, i) => [s, i]).filter(([s]) => !s.deletedAt);
            fill(secList, 
              ...live.map(([s], j) => {
                const key = 'sec:' + s.id;
                const def = SECTION_DEFS[s.type];
                const body = h('div', { class: 'item-body', hidden: !S.open[key] }, def ? fields(s.data, def.fields) : null, h('p', { class: 'muted', style: 'font-size:12.5px;margin:10px 0 0' }, 'معرّف القسم للروابط: #' + s.id));
                const liveArr = live.map(([x]) => x);
                const swap = (dir) => {
                  const a = liveArr[j], b = liveArr[j + dir];
                  const ia = secs.indexOf(a), ib = secs.indexOf(b);
                  [secs[ia], secs[ib]] = [secs[ib], secs[ia]];
                  markDirty();
                  drawSecs();
                };
                return h(
                  'div',
                  { class: 'item' + (s.hidden ? ' off' : '') },
                  h(
                    'div',
                    { class: 'item-head' },
                    h('span', { class: 't' }, sectionTitle(s)),
                    s.hidden ? h('span', { class: 'badge' }, 'مخفي') : null,
                    h('button', { class: 'btn sm ghost icon-btn', type: 'button', 'aria-label': 'لأعلى', disabled: j === 0 || null, onclick: () => swap(-1) }, '▲'),
                    h('button', { class: 'btn sm ghost icon-btn', type: 'button', 'aria-label': 'لأسفل', disabled: j === live.length - 1 || null, onclick: () => swap(1) }, '▼'),
                    h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { s.hidden = !s.hidden; markDirty(); drawSecs(); } }, s.hidden ? 'إظهار' : 'إخفاء'),
                    h('button', { class: 'btn sm', type: 'button', onclick: () => { S.open[key] = !S.open[key]; body.hidden = !S.open[key]; } }, 'تعديل'),
                    h('button', { class: 'btn sm danger', type: 'button', onclick: () => { if (confirm(`نقل «${sectionTitle(s)}» إلى المحذوفات؟ يمكن استعادته لاحقًا.`)) { s.deletedAt = new Date().toISOString(); markDirty(); drawSecs(); } } }, 'حذف')
                  ),
                  body
                );
              })
            );
          };
          drawSecs();
          const usedTypes = new Set(D.pages.flatMap((p) => p.sections.filter((s) => !s.deletedAt).map((s) => s.type)));
          const addSel = h('select', { class: 'sel', style: 'width:auto' },
            h('option', { value: '' }, 'إضافة قسم…'),
            ['text', 'image', 'hero', 'write', 'garden'].filter((t) => SECTION_DEFS[t].make || !usedTypes.has(t)).map((t) => h('option', { value: t }, SECTION_DEFS[t].name))
          );
          addSel.addEventListener('change', () => {
            const t = addSel.value;
            if (!t) return;
            const tpl = SECTION_DEFS[t].make ? SECTION_DEFS[t].make() : null;
            if (!tpl) return toast('هذا القسم موجود في المحذوفات؛ استعيديه من هناك.', true);
            const s = { id: uid(t), type: t, hidden: false, data: tpl };
            secs.push(s);
            S.open['sec:' + s.id] = true;
            markDirty();
            draw();
          });
          const pageProps = h('div', { class: 'grid2' },
            field(pg, { k: 'title', label: 'اسم الصفحة' }),
            isHome ? h('div', { class: 'f' }, h('span', null, 'الرابط'), h('div', { class: 'in', dir: 'ltr', style: 'display:flex;align-items:center;background:#F4F5F8' }, '/')) : field(pg, { k: 'slug', label: 'الرابط (بعد /p/)', hint: 'حروف إنجليزية صغيرة أو عربية وأرقام وشرطات.' })
          );
          return h(
            'div',
            { class: 'card' + (pg.hidden ? ' off' : '') },
            h(
              'div',
              { class: 'row' },
              h('h2', { class: 'grow' }, pg.title || '(بلا اسم)', ' ', h('span', { class: 'badge muted', style: 'font-size:13px;font-weight:500' }, isHome ? '/' : '/p/' + pg.slug)),
              pg.hidden ? h('span', { class: 'tag hidden' }, 'مخفية') : null,
              !isHome ? h('a', { class: 'btn sm', href: '/p/' + encodeURIComponent(pg.slug) + '?preview=1', target: '_blank', rel: 'noopener' }, 'معاينة') : null,
              !isHome ? h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { pg.hidden = !pg.hidden; markDirty(); draw(); } }, pg.hidden ? 'إظهار الصفحة' : 'إخفاء الصفحة') : null,
              !isHome ? h('button', { class: 'btn sm danger', type: 'button', onclick: () => { if (confirm(`نقل صفحة «${pg.title}» إلى المحذوفات؟`)) { pg.deletedAt = new Date().toISOString(); markDirty(); draw(); } } }, 'حذف الصفحة') : null
            ),
            pageProps,
            secList,
            h('div', { class: 'row', style: 'margin-top:12px' }, addSel)
          );
        }),
        h('div', { class: 'card' },
          h('h2', null, 'إضافة صفحة جديدة'),
          (() => {
            const t = h('input', { class: 'in', placeholder: 'اسم الصفحة' });
            const sl = h('input', { class: 'in', dir: 'ltr', placeholder: 'about' });
            const nav = h('input', { type: 'checkbox', checked: true });
            return h('div', null,
              h('div', { class: 'grid2' }, h('label', { class: 'f' }, h('span', null, 'الاسم'), t), h('label', { class: 'f' }, h('span', null, 'الرابط'), sl)),
              h('label', { class: 'chk' }, nav, 'إضافة رابط لها في القائمة'),
              h('div', null, h('button', { class: 'btn pri', type: 'button', style: 'margin-top:12px', onclick: () => {
                const slug = sl.value.trim().toLowerCase();
                if (!t.value.trim() || !/^[a-z0-9؀-ۿ-]{1,60}$/.test(slug)) return toast('اكتبي اسمًا ورابطًا صالحًا (حروف وأرقام وشرطات).', true);
                if (D.pages.some((p) => !p.deletedAt && p.slug === slug)) return toast('الرابط مستخدم في صفحة أخرى.', true);
                const p = { id: uid('p'), slug, title: t.value.trim(), hidden: false, sections: [{ id: uid('text'), type: 'text', hidden: false, data: Object.assign(SECTION_DEFS.text.make(), { title: t.value.trim() }) }] };
                D.pages.push(p);
                if (nav.checked) D.nav.push({ id: uid('n'), label: p.title, icon: 'none', target: '/p/' + slug, hidden: false });
                markDirty();
                draw();
                toast('أُضيفت الصفحة إلى المسودة. احفظي ثم انشري.');
              } }, 'إضافة الصفحة'))
            );
          })()
        )
      );
    };
    draw();
    return wrap;
  }

  function themeEditor() {
    const T = S.draft.theme;
    const wrap = h('div');
    const draw = () => {
      const C = T.colors;
      const checks = [
        ['العناوين على الخلفية', C.heading, C.bg],
        ['النص على الخلفية', C.text, C.bg],
        ['النص الثانوي على البطاقات', C.muted, C.surface],
        ['نص الأزرار على الأساسي', C.onPrimary, C.primary],
        ['التوقيع على البطاقة', C.signature, C.surfaceAlt],
        ['لون التمييز على البطاقات', C.accent, C.surface],
      ];
      const report = h('div', { class: 'card' }, h('h2', null, 'فحص التباين'), h('p', { class: 'desc' }, 'الحد الأدنى المقترح 4.5 للنص العادي و3 للنص الكبير والأيقونات.'),
        h('table', { class: 'table' }, h('tbody', null, checks.map(([l, a, b]) => {
          const r = ratio(a, b);
          return h('tr', null, h('td', null, l), h('td', { dir: 'ltr' }, r.toFixed(2) + ':1'), h('td', null, r >= 4.5 ? '✓ ممتاز' : r >= 3 ? '• مقبول للنص الكبير' : '✗ ضعيف'));
        }))));
      fill(wrap, 
        h('div', { class: 'card' },
          h('h2', null, 'ألوان الموقع'),
          h('p', { class: 'desc' }, 'تُطبَّق على كل الصفحات وحالات العناصر. شاهدي النتيجة من زر «معاينة» قبل النشر.'),
          h('div', { class: 'grid2' }, Object.keys(COLOR_LABELS).map((k) => field(C, { k, label: COLOR_LABELS[k], type: 'color', onchange: () => drawReportSoon() }))),
          h('button', { class: 'btn', type: 'button', style: 'margin-top:14px', onclick: () => { if (confirm('استعادة لوحة الألوان الافتراضية للنسخة الجديدة؟')) { T.colors = Object.assign({}, DEFAULT_COLORS); markDirty(); draw(); } } }, 'استعادة الألوان الافتراضية')
        ),
        report,
        h('div', { class: 'card' },
          h('h2', null, 'الخط'),
          h('p', { class: 'desc' }, 'الخط الافتراضي هو خط الموقع الأصلي (Tajawal). غيّريه فقط إذا أردتِ ذلك.'),
          fields(T, [
            { k: 'fontFamily', label: 'اسم الخط' },
            { k: 'fontCssUrl', label: 'رابط الخط من Google Fonts', hint: 'يجب أن يبدأ بـ https://fonts.googleapis.com/' },
          ])
        )
      );
    };
    let t;
    const drawReportSoon = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const y = window.scrollY;
        draw();
        window.scrollTo(0, y);
      }, 500);
    };
    draw();
    return wrap;
  }

  // ======================= عرض: المحذوفات =======================
  async function viewTrash(main) {
    const D = S.draft;
    const pages = D.pages.filter((p) => p.deletedAt);
    const secs = D.pages.filter((p) => !p.deletedAt).flatMap((p) => p.sections.filter((s) => s.deletedAt).map((s) => [p, s]));
    const rerender = () => viewTrash(main);
    fill(main, 
      contentBar('المحذوفات'),
      h('div', { class: 'card' },
        h('h2', null, 'صفحات محذوفة'),
        pages.length ? null : h('p', { class: 'muted' }, 'لا توجد.'),
        pages.map((p) => h('div', { class: 'item' }, h('div', { class: 'item-head' },
          h('span', { class: 't' }, p.title + ' — /p/' + p.slug),
          h('span', { class: 'badge' }, fmtDate(p.deletedAt)),
          h('button', { class: 'btn sm', type: 'button', onclick: () => {
            if (D.pages.some((x) => !x.deletedAt && x.slug === p.slug)) return toast('يوجد صفحة أخرى بالرابط نفسه؛ غيّري رابطها أولًا.', true);
            delete p.deletedAt; markDirty(); rerender();
          } }, 'استعادة'),
          h('button', { class: 'btn sm danger', type: 'button', onclick: () => { if (confirm('حذف نهائي للصفحة من المسودة؟ تبقى نسخها السابقة في سجل النشر.')) { D.pages.splice(D.pages.indexOf(p), 1); markDirty(); rerender(); } } }, 'حذف نهائي')
        )))
      ),
      h('div', { class: 'card' },
        h('h2', null, 'أقسام محذوفة'),
        secs.length ? null : h('p', { class: 'muted' }, 'لا توجد.'),
        secs.map(([p, s]) => h('div', { class: 'item' }, h('div', { class: 'item-head' },
          h('span', { class: 't' }, sectionTitle(s) + ' — في صفحة ' + p.title),
          h('span', { class: 'badge' }, fmtDate(s.deletedAt)),
          h('button', { class: 'btn sm', type: 'button', onclick: () => { delete s.deletedAt; markDirty(); rerender(); } }, 'استعادة'),
          h('button', { class: 'btn sm danger', type: 'button', onclick: () => { if (confirm('حذف نهائي لهذا القسم من المسودة؟')) { p.sections.splice(p.sections.indexOf(s), 1); markDirty(); rerender(); } } }, 'حذف نهائي')
        )))
      ),
      h('div', { class: 'card' }, h('h2', null, 'إهداءات محذوفة'), h('p', { class: 'desc' }, 'تجدينها في صفحة الإهداءات ← تبويب «المحذوفات».'),
        h('button', { class: 'btn', type: 'button', onclick: () => { dedState.status = 'deleted'; go('dedications'); } }, 'فتح الإهداءات المحذوفة'))
    );
  }

  // ======================= عرض: الإهداءات =======================
  const dedState = { status: 'all', q: '' };
  const STATUS_AR = { approved: 'ظاهر', pending: 'بانتظار المراجعة', hidden: 'مخفي' };
  async function viewDedications(main) {
    const qs = new URLSearchParams({ limit: '200' });
    if (dedState.status === 'deleted') qs.set('deleted', '1');
    else if (dedState.status !== 'all') qs.set('status', dedState.status);
    if (dedState.q) qs.set('q', dedState.q);
    const r = await api('/api/admin/dedications?' + qs);
    const c = r.counts;
    const total = (c.approved || 0) + (c.pending || 0) + (c.hidden || 0);
    const tabs = [['all', `الكل (${total})`], ['approved', `ظاهرة (${c.approved || 0})`], ['pending', `بانتظار المراجعة (${c.pending || 0})`], ['hidden', `مخفية (${c.hidden || 0})`], ['deleted', `المحذوفات (${c.deleted || 0})`]];
    const search = h('input', { class: 'in', type: 'search', placeholder: 'بحث بالاسم أو المدرسة أو النص', value: dedState.q, style: 'max-width:320px' });
    search.addEventListener('change', () => { dedState.q = search.value.trim(); viewDedications(main); });
    const act = async (fn, msg) => {
      try { await fn(); if (msg) toast(msg); viewDedications(main); } catch (e) { toast(e.message, true); }
    };
    fill(main, 
      h('div', { class: 'topbar' }, h('h1', null, 'الإهداءات'),
        can('admin') ? h('a', { class: 'btn', href: '/api/admin/dedications.csv' }, 'تصدير CSV') : null),
      h('div', { class: 'tabs' }, tabs.map(([id, l]) => h('button', { type: 'button', class: dedState.status === id ? 'on' : '', onclick: () => { dedState.status = id; viewDedications(main); } }, l))),
      h('div', { class: 'row' }, search, h('button', { class: 'btn', type: 'button', onclick: () => { dedState.q = search.value.trim(); viewDedications(main); } }, 'بحث')),
      h('p', { class: 'muted', style: 'font-size:13px' }, 'تصنيف «معلم/معلمة» في الحديقة يعتمد على حقل النوع هنا؛ نموذج الإهداء لا يطلبه من الزائر.'),
      r.items.length ? null : h('p', { class: 'muted' }, 'لا توجد إهداءات هنا.'),
      r.items.map((d) => {
        const deleted = !!d.deletedAt;
        const gender = h('select', { class: 'sel', style: 'width:auto;height:30px', 'aria-label': 'النوع', disabled: d.recipientType === 'group' || deleted || null },
          h('option', { value: '' }, d.recipientType === 'group' ? 'مجموعة' : 'النوع: غير محدد'),
          h('option', { value: 'male', selected: d.gender === 'male' || null }, 'معلم'),
          h('option', { value: 'female', selected: d.gender === 'female' || null }, 'معلمة'));
        gender.addEventListener('change', () => act(() => api('/api/admin/dedications/' + d.id, { method: 'PATCH', body: { gender: gender.value || null } }), 'حُفظ التصنيف.'));
        return h('div', { class: 'ded' },
          h('div', { class: 'row' },
            h('b', { class: 'grow' }, d.teacherName, d.recipientType === 'group' ? ' (مجموعة)' : ''),
            deleted ? h('span', { class: 'tag deleted' }, 'محذوف') : h('span', { class: 'tag ' + d.status }, STATUS_AR[d.status])),
          h('div', { class: 'meta' }, [d.school, d.country].filter(Boolean).join(' — '), ' · من: ', d.anonymous ? 'دون اسم' : d.senderName || '—', d.senderRole ? ` (${d.senderRole})` : '', ' · ', fmtDate(d.createdAt), ' · #', d.id),
          h('div', { class: 'body' }, d.body),
          h('div', { class: 'acts' },
            deleted
              ? [
                  h('button', { class: 'btn sm', type: 'button', onclick: () => act(() => api(`/api/admin/dedications/${d.id}/restore`, { method: 'POST' }), 'استُعيد الإهداء.') }, 'استعادة'),
                  can('admin') ? h('button', { class: 'btn sm danger', type: 'button', onclick: () => confirm('حذف نهائي؟ لا يمكن التراجع إلا من نسخة احتياطية.') && act(() => api(`/api/admin/dedications/${d.id}?permanent=1`, { method: 'DELETE' }), 'حُذف نهائيًا.') }, 'حذف نهائي') : null,
                ]
              : [
                  d.status !== 'approved' ? h('button', { class: 'btn sm pri', type: 'button', onclick: () => act(() => api('/api/admin/dedications/' + d.id, { method: 'PATCH', body: { status: 'approved' } }), 'أصبح الإهداء ظاهرًا.') }, 'اعتماد وإظهار') : null,
                  d.status !== 'hidden' ? h('button', { class: 'btn sm', type: 'button', onclick: () => act(() => api('/api/admin/dedications/' + d.id, { method: 'PATCH', body: { status: 'hidden' } }), 'أُخفي الإهداء.') }, 'إخفاء') : null,
                  gender,
                  h('button', { class: 'btn sm', type: 'button', onclick: () => editDedication(d, () => viewDedications(main)) }, 'تعديل'),
                  h('button', { class: 'btn sm danger', type: 'button', onclick: () => confirm('نقل الإهداء إلى المحذوفات؟') && act(() => api('/api/admin/dedications/' + d.id, { method: 'DELETE' }), 'نُقل إلى المحذوفات.') }, 'حذف'),
                ]
          ));
      })
    );
  }
  function editDedication(d, done) {
    const m = { teacherName: d.teacherName, school: d.school, country: d.country, senderName: d.senderName, anonymous: d.anonymous, body: d.body };
    const dlg = h('div', { class: 'dlg' });
    const box = h('form', { class: 'dlg-box', onsubmit: async (e) => {
      e.preventDefault();
      try { await api('/api/admin/dedications/' + d.id, { method: 'PATCH', body: m }); dlg.remove(); toast('حُفظ الإهداء.'); done(); } catch (e2) { toast(e2.message, true); }
    } },
      h('div', { class: 'dlg-head' }, h('h2', null, 'تعديل الإهداء #' + d.id)),
      fieldsNoDirty(m, [
        { k: 'teacherName', label: 'اسم المعلم/المعلمة' },
        { k: 'school', label: 'المدرسة' },
        { k: 'country', label: 'الدولة' },
        { k: 'senderName', label: 'اسم صاحب الإهداء' },
        { k: 'anonymous', label: 'إظهار دون اسم', type: 'bool' },
        { k: 'body', label: 'النص', type: 'textarea', rows: 6 },
      ]),
      h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn pri', type: 'submit' }, 'حفظ'), h('button', { class: 'btn', type: 'button', onclick: () => dlg.remove() }, 'إلغاء'))
    );
    dlg.append(box);
    document.body.append(dlg);
  }
  function fieldsNoDirty(obj, defs) {
    const saved = S.dirty;
    const out = fields(obj, defs);
    // الحقول هنا لا تخص المسودة؛ نعيد مؤشر التعديل كما كان عند الكتابة
    out.forEach((el) => el.addEventListener('input', () => { S.dirty = saved; }));
    out.forEach((el) => el.addEventListener('change', () => { S.dirty = saved; }));
    return out;
  }

  // ======================= عرض: الصور =======================
  async function viewMedia(main) {
    const r = await api('/api/admin/uploads');
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', multiple: true, hidden: true });
    file.addEventListener('change', async () => {
      for (const f of file.files) {
        try { await uploadFile(f); } catch (e) { toast(e.message, true); }
      }
      viewMedia(main);
    });
    fill(main, 
      h('div', { class: 'topbar' }, h('h1', null, 'الصور'), h('button', { class: 'btn pri', type: 'button', onclick: () => file.click() }, 'رفع صور'), file),
      h('p', { class: 'muted' }, 'الصيغ: PNG وJPG وWEBP وGIF، حتى 5 ميغابايت للصورة. انسخي الرابط واستخدميه في أي حقل صورة، أو اختاري من «المكتبة» داخل الحقل.'),
      r.items.length ? null : h('p', { class: 'muted' }, 'لا توجد صور مرفوعة بعد.'),
      h('div', { class: 'thumbs' }, r.items.map((it) => h('div', { class: 'thumb' },
        h('img', { src: it.url, alt: '' }),
        h('div', null,
          h('button', { class: 'btn sm', type: 'button', onclick: () => navigator.clipboard.writeText(it.url).then(() => toast('نُسخ الرابط: ' + it.url)) }, 'نسخ الرابط'),
          can('admin') ? h('button', { class: 'btn sm danger', type: 'button', onclick: async () => {
            const used = JSON.stringify(S.draft).includes(it.url);
            if (!confirm(used ? 'هذه الصورة مستخدمة في المحتوى. حذفها سيترك مكانها فارغًا. متابعة؟' : 'حذف الصورة نهائيًا؟')) return;
            try { await api('/api/admin/uploads/' + encodeURIComponent(it.name), { method: 'DELETE' }); viewMedia(main); } catch (e) { toast(e.message, true); }
          } }, 'حذف') : null)
      )))
    );
  }

  // ======================= عرض: السجل =======================
  async function viewHistory(main) {
    const r = await api('/api/admin/history');
    fill(main, 
      h('div', { class: 'topbar' }, h('h1', null, 'سجل النشر')),
      h('div', { class: 'card' },
        h('p', { class: 'desc' }, 'كل عملية نشر تُحفظ هنا. الاستعادة تنسخ النسخة المختارة إلى المسودة فقط؛ راجعيها ثم انشريها.'),
        h('table', { class: 'table' },
          h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'الوصف'), h('th', null, 'التاريخ'), h('th', null, 'بواسطة'), h('th', null, ''))),
          h('tbody', null, r.items.map((it) => h('tr', null,
            h('td', null, it.id), h('td', null, it.note || ''), h('td', null, fmtDate(it.created_at)), h('td', { dir: 'ltr' }, it.created_by || ''),
            h('td', null, h('button', { class: 'btn sm', type: 'button', onclick: async () => {
              if (S.dirty && !confirm('لديك تعديلات غير محفوظة ستُستبدل. متابعة؟')) return;
              if (!confirm('استبدال المسودة الحالية بهذه النسخة؟')) return;
              try { await api(`/api/admin/history/${it.id}/restore`, { method: 'POST' }); await loadContent(); S.hasUnpublished = true; toast('استُعيدت النسخة إلى المسودة. راجعيها ثم انشريها.'); go('content'); } catch (e) { toast(e.message, true); }
            } }, 'استعادة إلى المسودة'))
          ))))
      ),
      can('owner') ? await auditCard() : null
    );
  }
  async function auditCard() {
    const r = await api('/api/admin/audit');
    return h('div', { class: 'card' }, h('h2', null, 'سجل العمليات'), h('p', { class: 'desc' }, 'آخر 200 عملية إدارية.'),
      h('table', { class: 'table' }, h('tbody', null, r.items.map((a) => h('tr', null, h('td', null, fmtDate(a.created_at)), h('td', { dir: 'ltr' }, a.user_email || ''), h('td', null, a.action), h('td', null, a.detail || ''))))));
  }

  // ======================= عرض: المستخدمون =======================
  async function viewUsers(main) {
    const r = await api('/api/admin/users');
    const act = async (fn, msg) => { try { await fn(); toast(msg); viewUsers(main); } catch (e) { toast(e.message, true); } };
    const nf = { email: h('input', { class: 'in', type: 'email', dir: 'ltr' }), name: h('input', { class: 'in' }), role: h('select', { class: 'sel' }, h('option', { value: 'editor' }, 'محرر: تعديل المسودة والإهداءات'), h('option', { value: 'admin' }, 'مدير: + النشر والسجل والتصدير'), h('option', { value: 'owner' }, 'مالك: صلاحيات كاملة')), password: h('input', { class: 'in', type: 'password', autocomplete: 'new-password' }) };
    fill(main, 
      h('div', { class: 'topbar' }, h('h1', null, 'المستخدمون والصلاحيات')),
      h('div', { class: 'card' },
        h('table', { class: 'table' },
          h('thead', null, h('tr', null, h('th', null, 'المستخدم'), h('th', null, 'الدور'), h('th', null, 'الحالة'), h('th', null, ''))),
          h('tbody', null, r.items.map((u) => {
            const role = h('select', { class: 'sel', style: 'height:30px;width:auto' }, ['editor', 'admin', 'owner'].map((x) => h('option', { value: x, selected: u.role === x || null }, ROLE_AR[x])));
            role.addEventListener('change', () => act(() => api('/api/admin/users/' + u.id, { method: 'PATCH', body: { role: role.value } }), 'تغيّر الدور.'));
            const self = u.id === S.me.id;
            return h('tr', null,
              h('td', null, h('b', null, u.name || '—'), h('div', { class: 'muted', dir: 'ltr', style: 'text-align:right' }, u.email)),
              h('td', null, self ? ROLE_AR[u.role] : role),
              h('td', null, u.disabled ? h('span', { class: 'tag hidden' }, 'معطّل') : h('span', { class: 'tag approved' }, 'فعّال')),
              h('td', null, self ? h('span', { class: 'muted' }, 'حسابك') : h('div', { class: 'row' },
                h('button', { class: 'btn sm', type: 'button', onclick: () => act(() => api('/api/admin/users/' + u.id, { method: 'PATCH', body: { disabled: !u.disabled } }), u.disabled ? 'فُعّل الحساب.' : 'عُطّل الحساب وأُنهيت جلساته.') }, u.disabled ? 'تفعيل' : 'تعطيل'),
                h('button', { class: 'btn sm', type: 'button', onclick: () => { const p = prompt('كلمة مرور مؤقتة جديدة (10 أحرف على الأقل). سلّميها للمستخدم بطريقة آمنة:'); if (p) act(() => api('/api/admin/users/' + u.id, { method: 'PATCH', body: { password: p } }), 'عُيّنت كلمة المرور.'); } }, 'كلمة مرور جديدة'),
                h('button', { class: 'btn sm danger', type: 'button', onclick: () => confirm(`حذف ${u.email} نهائيًا؟`) && act(() => api('/api/admin/users/' + u.id, { method: 'DELETE' }), 'حُذف المستخدم.') }, 'حذف')
              ))
            );
          }))
        )
      ),
      h('form', { class: 'card', onsubmit: (e) => { e.preventDefault(); act(() => api('/api/admin/users', { method: 'POST', body: { email: nf.email.value, name: nf.name.value, role: nf.role.value, password: nf.password.value } }), 'أُضيف المستخدم.'); } },
        h('h2', null, 'إضافة مستخدم'),
        h('div', { class: 'grid2' },
          h('label', { class: 'f' }, h('span', null, 'البريد الإلكتروني'), nf.email),
          h('label', { class: 'f' }, h('span', null, 'الاسم'), nf.name),
          h('label', { class: 'f' }, h('span', null, 'الدور'), nf.role),
          h('label', { class: 'f' }, h('span', null, 'كلمة مرور مؤقتة'), nf.password, h('small', null, 'اطلبي من المستخدم تغييرها من «حسابي» بعد أول دخول.'))),
        h('button', { class: 'btn pri', type: 'submit', style: 'margin-top:12px' }, 'إضافة'))
    );
  }

  // ======================= عرض: النسخ الاحتياطي =======================
  async function viewBackup(main) {
    const file = h('input', { type: 'file', accept: 'application/json,.json' });
    fill(main, 
      h('div', { class: 'topbar' }, h('h1', null, 'النسخ الاحتياطي والاستعادة')),
      h('div', { class: 'card' },
        h('h2', null, 'تنزيل نسخة احتياطية كاملة'),
        h('p', { class: 'desc' }, 'ملف واحد يحتوي المحتوى (المنشور والمسودة والسجل) والإهداءات والمستخدمين والصور المرفوعة. احفظيه في مكان آمن؛ يحتوي بيانات حساسة (كلمات المرور فيه مُجزّأة وغير مقروءة).'),
        h('a', { class: 'btn pri', href: '/api/admin/backup' }, 'تنزيل النسخة الاحتياطية'),
        can('admin') ? h('a', { class: 'btn', href: '/api/admin/dedications.csv', style: 'margin-inline-start:8px' }, 'تصدير الإهداءات CSV') : null
      ),
      h('div', { class: 'card' },
        h('h2', null, 'الاستعادة من نسخة احتياطية'),
        h('p', { class: 'desc' }, 'تستبدل كل البيانات الحالية بمحتوى الملف، وتُنهي كل الجلسات. تُستخدم أيضًا لنقل الموقع إلى استضافة جديدة. نزّلي نسخة من الوضع الحالي أولًا.'),
        file,
        h('div', null, h('button', { class: 'btn danger', type: 'button', style: 'margin-top:10px', onclick: async () => {
          const f = file.files[0];
          if (!f) return toast('اختاري ملف النسخة أولًا.', true);
          if (!confirm('ستُستبدل كل بيانات الموقع الحالية بمحتوى هذا الملف. هل أنت متأكدة؟')) return;
          try {
            const text = await f.text();
            JSON.parse(text);
            await api('/api/admin/restore', { method: 'POST', body: text, headers: { 'Content-Type': 'application/json' } });
            S.draft = null;
            S.dirty = false;
            alert('تمت الاستعادة. سجّلي الدخول مجددًا بحساب موجود في النسخة.');
            S.me = null;
            boot();
          } catch (e) {
            toast(e.message || 'الملف غير صالح.', true);
          }
        } }, 'استعادة'))
      )
    );
  }

  // ======================= عرض: حسابي =======================
  async function viewAccount(main) {
    const cur = h('input', { class: 'in', type: 'password', autocomplete: 'current-password' });
    const n1 = h('input', { class: 'in', type: 'password', autocomplete: 'new-password' });
    const n2 = h('input', { class: 'in', type: 'password', autocomplete: 'new-password' });
    fill(main, 
      h('div', { class: 'topbar' }, h('h1', null, 'حسابي')),
      h('div', { class: 'card' }, h('p', null, h('b', null, S.me.name || ''), ' — ', h('span', { dir: 'ltr' }, S.me.email), ' — ', ROLE_AR[S.me.role])),
      h('form', { class: 'card', onsubmit: async (e) => {
        e.preventDefault();
        if (n1.value !== n2.value) return toast('كلمتا المرور غير متطابقتين.', true);
        try { await api('/api/auth/password', { method: 'POST', body: { current: cur.value, password: n1.value } }); toast('تغيّرت كلمة المرور وأُنهيت الجلسات الأخرى.'); cur.value = n1.value = n2.value = ''; } catch (e2) { toast(e2.message, true); }
      } },
        h('h2', null, 'تغيير كلمة المرور'),
        h('label', { class: 'f' }, h('span', null, 'كلمة المرور الحالية'), cur),
        h('label', { class: 'f' }, h('span', null, 'الجديدة (10 أحرف على الأقل)'), n1),
        h('label', { class: 'f' }, h('span', null, 'تأكيد الجديدة'), n2),
        h('button', { class: 'btn pri', type: 'submit', style: 'margin-top:12px' }, 'حفظ'))
    );
  }

  boot();
})();
