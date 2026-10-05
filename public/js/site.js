'use strict';
(function () {
  const DATA = JSON.parse(document.getElementById('site-data').textContent);
  const C = DATA.content;
  const PREVIEW = !!DATA.preview;
  const icon = window.icon;

  // ---------- أدوات ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
    return el;
  }
  // نص مع أسطر جديدة وتمييز [[كلمة]]
  function rich(str) {
    const frag = document.createDocumentFragment();
    String(str || '')
      .split('\n')
      .forEach((line, i) => {
        if (i) frag.append(h('br'));
        line.split(/(\[\[[^\]]+\]\])/).forEach((part) => {
          const m = part.match(/^\[\[([^\]]+)\]\]$/);
          frag.append(m ? h('span', { class: 'hl' }, m[1]) : document.createTextNode(part));
        });
      });
    return frag;
  }
  const visible = (x) => x && !x.hidden && !x.deletedAt;
  const currentSlug = location.pathname.startsWith('/p/') ? decodeURIComponent(location.pathname.slice(3)).replace(/\/$/, '') : '';
  const page = C.pages.find((p) => p.slug === currentSlug && !p.deletedAt) || C.pages[0];
  const onHome = page.slug === '';
  function safeHref(t) {
    t = String(t || '');
    if (t.startsWith('#')) return onHome ? t : '/' + t;
    if (t.startsWith('/') && !t.startsWith('//')) return t + (PREVIEW && !t.includes('#') ? '?preview=1' : '');
    if (/^(https?:|mailto:)/i.test(t)) return t;
    return '#';
  }
  function linkAttrs(t) {
    const href = safeHref(t);
    return /^https?:/i.test(href) ? { href, target: '_blank', rel: 'noopener' } : { href };
  }
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'X-Requested-With': 'athar' }, opts.headers || {});
    if (opts.body && typeof opts.body !== 'string') {
      opts.body = JSON.stringify(opts.body);
      opts.headers['Content-Type'] = 'application/json';
    }
    return fetch(path, opts).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'تعذّر الاتصال بالخادم.');
      return j;
    });
  }
  const writeSec = (C.pages.find((p) => p.slug === '') || C.pages[0]).sections.find((s) => s.type === 'write' && !s.deletedAt);
  const cardStyles = (writeSec && writeSec.data.cardStyles) || [];
  function styleVars(id) {
    const s = cardStyles.find((x) => x.id === id) || cardStyles[0];
    if (!s) return {};
    return { '--card-bg': s.bg2 ? `linear-gradient(90deg, ${s.bg}, ${s.bg2})` : s.bg, '--card-fg': s.fg };
  }
  function setVars(el, vars) {
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
    return el;
  }

  // ---------- الترويسة ----------
  if (PREVIEW) document.getElementById('preview-bar').hidden = false;
  document.getElementById('brand-badge').textContent = C.header.badgeText || '';
  document.getElementById('brand-word').textContent = C.header.wordmark || '';
  const langBtn = document.getElementById('lang-btn');
  if (C.header.showLangButton) langBtn.append(icon('globe'));
  else langBtn.hidden = true;
  const navEl = document.getElementById('nav');
  const navLinks = [];
  for (const n of C.nav.filter(visible)) {
    const a = h('a', linkAttrs(n.target), icon(n.icon), h('span', null, n.label));
    a.dataset.target = n.target;
    navLinks.push(a);
    navEl.append(a);
  }

  // ---------- الأقسام ----------
  const main = document.getElementById('main');
  const renderers = { hero: renderHero, write: renderWrite, garden: renderGarden, text: renderText, image: renderImage };
  for (const s of page.sections.filter(visible)) {
    const fn = renderers[s.type];
    if (fn) main.append(fn(s));
  }
  main.append(h('div', { class: 'page-end' }));

  function section(s, cls, ...kids) {
    return h('section', { class: 'section ' + cls, id: s.id }, h('div', { class: 'inner' }, ...kids));
  }
  function secHead(d, extraSub) {
    return h(
      'div',
      { class: 'sec-head' },
      d.pill ? h('span', { class: 'pill pill-soft' }, icon('sparkles'), d.pill) : null,
      h('h2', { class: 'sec-title' }, d.emoji ? d.emoji + ' ' : '', d.title || ''),
      extraSub || (d.subtitle ? h('p', { class: 'sec-sub' }, d.subtitle) : null)
    );
  }

  function renderHero(s) {
    const d = s.data;
    const cta = h(
      'button',
      { class: 'cta', type: 'button', onclick: openGift },
      icon('gift', 'big'),
      h('span', null, d.ctaLabel || ''),
      icon('sparkles')
    );
    if (!C.gift || !C.gift.enabled) cta.hidden = true;
    return section(
      s,
      'hero',
      h('span', { class: 'date-pill' }, d.datePillImage ? h('img', { src: d.datePillImage, alt: '' }) : null, h('span', null, d.datePillText || '')),
      h('div', { class: 'ring-wrap' }, h('div', { class: 'ring' }, h('div', { class: 'ring-inner' }, h('span', { class: 'ring-text' }, d.ringText || '')))),
      d.quote ? h('p', { class: 'hero-quote' }, d.quote) : null,
      d.cardText ? h('div', { class: 'hero-card' }, rich(d.cardText)) : null,
      cta,
      h(
        'div',
        { class: 'btn-row' },
        (d.buttons || []).filter(visible).map((b) => h('a', Object.assign({ class: 'btn-soft' }, linkAttrs(b.target)), icon(b.icon), b.label))
      )
    );
  }

  function renderText(s) {
    const d = s.data;
    return section(
      s,
      'text-sec',
      secHead(d, h('p', { class: 'sec-sub' }, d.subtitle || '')),
      d.body ? h('p', { class: 'body' }, rich(d.body)) : null,
      d.buttonLabel ? h('div', { class: 'btn-row' }, h('a', Object.assign({ class: 'btn-soft' }, linkAttrs(d.buttonTarget)), icon(d.buttonIcon || 'none'), d.buttonLabel)) : null
    );
  }

  function renderImage(s) {
    const d = s.data;
    if (!d.src) return h('div');
    return section(s, 'image-sec', h('figure', null, h('img', { src: d.src, alt: d.alt || '', loading: 'lazy' }), d.caption ? h('figcaption', null, d.caption) : null));
  }

  // ---------- نموذج الإهداء ----------
  function renderWrite(s) {
    const d = s.data;
    const max = Number(d.maxLength) || 500;
    const state = { recipientType: 'single', cardStyle: (cardStyles.find(visible) || {}).id, senderRole: '', preview: false };

    const choice = (val, label, ic) => {
      const b = h('button', { class: 'choice', type: 'button', 'aria-pressed': String(state.recipientType === val) }, h('span', { class: 'tile' }, icon(ic)), h('span', null, label));
      b.addEventListener('click', () => {
        state.recipientType = val;
        choices.forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
      });
      return b;
    };
    const choices = [choice('single', d.singleLabel, 'user'), choice('group', d.groupLabel, 'users')];

    const inp = (name, placeholder, ic, maxlen) =>
      h('div', { class: 'input-wrap' }, h('input', { class: 'input' + (ic ? ' has-icon' : ''), name, id: 'f-' + name, placeholder, maxlength: maxlen, autocomplete: 'off' }), ic ? icon(ic) : null);

    const teacher = inp('teacherName', d.teacherPlaceholder, null, 120);
    const school = inp('school', d.schoolPlaceholder, 'building', 120);
    const country = inp('country', d.countryPlaceholder, 'earth', 60);
    const sender = inp('senderName', d.senderPlaceholder, null, 80);
    const anon = h('input', { type: 'checkbox', name: 'anonymous' });
    const ta = h('textarea', { class: 'textarea', name: 'body', id: 'f-body', placeholder: d.textPlaceholder, maxlength: max });
    const counter = h('span', { class: 'counter', 'aria-live': 'polite' }, `0 / ${max}`);
    ta.addEventListener('input', () => {
      counter.textContent = `${ta.value.length} / ${max}`;
      counter.classList.toggle('over', ta.value.length >= max);
      ta.removeAttribute('aria-invalid');
      if (state.preview) drawPreview();
    });
    anon.addEventListener('change', () => {
      sender.querySelector('input').disabled = anon.checked;
      if (state.preview) drawPreview();
    });

    let sugIdx = -1;
    const helpBtn = h('button', { class: 'help-btn', type: 'button' }, icon('sparkles'), h('span', null, d.helpLabel));
    helpBtn.addEventListener('click', () => {
      const list = (d.suggestions || []).filter(Boolean);
      if (!list.length) return;
      if (ta.value.trim() && !list.includes(ta.value) && !confirm('سيُستبدل النص الحالي باقتراح جاهز. هل تريد المتابعة؟')) return;
      sugIdx = (sugIdx + 1) % list.length;
      ta.value = list[sugIdx].slice(0, max);
      ta.dispatchEvent(new Event('input'));
      ta.focus();
    });

    const styleBtns = cardStyles.filter(visible).map((st) => {
      const b = h(
        'button',
        { class: 'style-opt', type: 'button', 'aria-pressed': String(st.id === state.cardStyle) },
        h('span', { class: 'sw', style: { background: st.bg2 ? `linear-gradient(90deg, ${st.bg}, ${st.bg2})` : st.bg, color: st.fg } }, d.swatchText || ''),
        h('span', null, st.name)
      );
      b.addEventListener('click', () => {
        state.cardStyle = st.id;
        styleBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        if (state.preview) drawPreview();
      });
      return b;
    });

    const previewBox = h('div', { class: 'card-preview', hidden: true });
    function drawPreview() {
      previewBox.replaceChildren(
        dedCard({
          teacherName: teacher.querySelector('input').value.trim() || '—',
          school: school.querySelector('input').value.trim(),
          country: country.querySelector('input').value.trim(),
          senderName: anon.checked ? '' : sender.querySelector('input').value.trim(),
          anonymous: anon.checked,
          body: ta.value.trim() || d.textPlaceholder,
          cardStyle: state.cardStyle,
        })
      );
    }
    const prevBtn = h('button', { class: 'preview-toggle', type: 'button', 'aria-expanded': 'false' }, icon('eye'), d.previewLabel);
    prevBtn.addEventListener('click', () => {
      state.preview = !state.preview;
      prevBtn.setAttribute('aria-expanded', String(state.preview));
      previewBox.hidden = !state.preview;
      if (state.preview) drawPreview();
    });

    // من أنت؟
    const who = h('div', { class: 'who', 'data-open': 'false' });
    const whoBody = h('div', { class: 'who-body', hidden: true });
    const roleChips = (d.whoOptions || []).map((r) => {
      const c = h('button', { class: 'chip', type: 'button', 'aria-pressed': 'false' }, r);
      c.addEventListener('click', () => {
        state.senderRole = state.senderRole === r ? '' : r;
        roleChips.forEach((x) => x.setAttribute('aria-pressed', String(x.textContent === state.senderRole)));
      });
      return c;
    });
    whoBody.append(...roleChips);
    const whoBtn = h('button', { class: 'who-btn', type: 'button', 'aria-expanded': 'false' }, icon('user'), h('span', null, d.whoLabel), icon('chevronDown', 'chev'));
    whoBtn.addEventListener('click', () => {
      const open = who.dataset.open !== 'true';
      who.dataset.open = String(open);
      whoBtn.setAttribute('aria-expanded', String(open));
      whoBody.hidden = !open;
    });
    who.append(whoBtn, whoBody);
    if (!roleChips.length) who.hidden = true;

    const msg = h('div', { role: 'status', 'aria-live': 'polite' });
    const hp = h('input', { class: 'hp', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    const submit = h('button', { class: 'submit', type: 'submit' }, h('span', null, d.submitLabel), icon('send'));

    const form = h(
      'form',
      { class: 'form-card', novalidate: true },
      h('div', { class: 'step-head' }, h('span', { class: 'step-num' }, '1'), h('h3', { class: 'step-title' }, d.step1Title)),
      h('div', { class: 'choice-grid' }, choices),
      h('div', { class: 'field' }, h('label', { for: 'f-teacherName' }, d.teacherLabel, h('span', { class: 'req' }, '*')), teacher),
      h('div', { class: 'field' }, h('label', { for: 'f-school' }, d.schoolLabel), school),
      h('div', { class: 'field' }, h('label', { for: 'f-country' }, d.countryLabel), country),
      h('div', { class: 'sender-box' }, h('div', { class: 'field' }, h('label', { for: 'f-senderName' }, d.senderLabel), sender), h('label', { class: 'check' }, anon, h('span', null, d.anonymousLabel))),
      h('div', { class: 'step2' }, h('div', { class: 'step-head' }, h('span', { class: 'step-num' }, '2'), h('h3', { class: 'step-title' }, d.step2Title), helpBtn)),
      h('div', { class: 'label-row' }, h('label', { for: 'f-body' }, d.textLabel, h('span', { class: 'req' }, '*')), counter),
      ta,
      h('p', { class: 'style-label' }, d.styleLabel),
      h('div', { class: 'style-grid' }, styleBtns),
      prevBtn,
      previewBox,
      h('hr', { class: 'sep' }),
      who,
      hp,
      submit,
      msg
    );

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.className = '';
      msg.textContent = '';
      const tInput = teacher.querySelector('input');
      const payload = {
        recipientType: state.recipientType,
        teacherName: tInput.value.trim(),
        school: school.querySelector('input').value.trim(),
        country: country.querySelector('input').value.trim(),
        senderName: anon.checked ? '' : sender.querySelector('input').value.trim(),
        anonymous: anon.checked,
        senderRole: state.senderRole,
        body: ta.value.trim(),
        cardStyle: state.cardStyle,
        website: hp.value,
      };
      if (!payload.teacherName) {
        tInput.setAttribute('aria-invalid', 'true');
        tInput.focus();
        return showMsg('err', 'اكتب اسم المعلم أو المعلمة.');
      }
      tInput.removeAttribute('aria-invalid');
      if (!payload.body) {
        ta.setAttribute('aria-invalid', 'true');
        ta.focus();
        return showMsg('err', 'اكتب نص الإهداء.');
      }
      if (PREVIEW) return showMsg('err', 'الإرسال معطّل في وضع المعاينة.');
      submit.disabled = true;
      try {
        const r = await api('/api/dedications', { method: 'POST', body: payload });
        showMsg('ok', r.status === 'approved' ? d.successMessage : d.pendingMessage);
        form.querySelectorAll('input:not([type=checkbox]), textarea').forEach((x) => (x.value = ''));
        anon.checked = false;
        sender.querySelector('input').disabled = false;
        ta.dispatchEvent(new Event('input'));
        if (r.item) document.dispatchEvent(new CustomEvent('athar:new', { detail: r.item }));
      } catch (err) {
        showMsg('err', err.message);
      } finally {
        submit.disabled = false;
      }
    });
    function showMsg(kind, text) {
      msg.className = 'form-msg ' + kind;
      msg.textContent = text;
    }

    return section(s, 'write-sec', secHead(d), form);
  }

  function dedCard(x) {
    const where = [x.school, x.country].filter(Boolean).join(' — ');
    const gardenSec = (C.pages.find((p) => p.slug === '') || C.pages[0]).sections.find((s) => s.type === 'garden');
    const anonName = gardenSec ? gardenSec.data.anonymousName : '';
    const card = h(
      'article',
      { class: 'ded-card' },
      h('span', { class: 'mark' }, (writeSec && writeSec.data.swatchText) || ''),
      h('p', { class: 'to' }, x.teacherName),
      where ? h('p', { class: 'where' }, where) : null,
      h('p', { class: 'body' }, x.body),
      h('p', { class: 'from' }, '— ', x.anonymous || !x.senderName ? anonName : x.senderName, x.senderRole ? ` (${x.senderRole})` : '')
    );
    return setVars(card, styleVars(x.cardStyle));
  }

  // ---------- حديقة الامتنان ----------
  function renderGarden(s) {
    const d = s.data;
    const st = { q: '', filter: 'all', country: '', before: 0, loading: false };
    const search = h('input', { class: 'input search', type: 'search', placeholder: d.searchPlaceholder, 'aria-label': d.searchPlaceholder });
    const filters = [
      ['all', d.filterAll],
      ['male', d.filterMale],
      ['female', d.filterFemale],
      ['group', d.filterGroup],
    ].filter((f) => f[1]);
    const chips = filters.map(([val, label]) => {
      const c = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(val === 'all') }, label);
      c.addEventListener('click', () => {
        st.filter = val;
        chips.forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
        load(true);
      });
      return c;
    });
    const select = h('select', { class: 'select', 'aria-label': d.allCountries }, h('option', { value: '' }, d.allCountries));
    select.addEventListener('change', () => {
      st.country = select.value;
      load(true);
    });
    const list = h('div', { class: 'ded-list', 'aria-live': 'polite' });
    const empty = h('p', { class: 'empty', hidden: true }, d.emptyText);
    const more = h('button', { class: 'btn-soft more-btn', type: 'button', hidden: true }, d.loadMore);
    more.addEventListener('click', () => load(false));
    let tmr;
    search.addEventListener('input', () => {
      clearTimeout(tmr);
      tmr = setTimeout(() => {
        st.q = search.value.trim();
        load(true);
      }, 300);
    });

    let reqId = 0;
    async function load(reset) {
      const my = ++reqId;
      if (reset) st.before = 0;
      const qs = new URLSearchParams({ q: st.q, filter: st.filter, country: st.country, limit: '24' });
      if (st.before) qs.set('before', st.before);
      try {
        const r = await api('/api/dedications?' + qs);
        if (my !== reqId) return;
        if (reset) list.replaceChildren();
        r.items.forEach((it) => list.append(dedCard(it)));
        if (r.items.length) st.before = r.items[r.items.length - 1].id;
        empty.hidden = list.children.length > 0;
        more.hidden = !r.hasMore;
      } catch (e) {
        if (my !== reqId) return;
        empty.hidden = false;
        empty.textContent = e.message;
      }
    }
    async function loadCountries() {
      try {
        const r = await api('/api/countries');
        const cur = select.value;
        select.replaceChildren(h('option', { value: '' }, d.allCountries), ...r.countries.map((c) => h('option', { value: c }, c)));
        select.value = cur;
      } catch {}
    }
    document.addEventListener('athar:new', () => {
      load(true);
      loadCountries();
    });
    load(true);
    loadCountries();

    return section(
      s,
      'garden-sec',
      secHead(d, h('p', { class: 'garden-sub' }, d.subtitle || '')),
      // مربع البحث والتصفية يظهر فقط عند تفعيله من لوحة الإدارة
      d.showFilters === true
        ? h(
            'div',
            { class: 'filter-card' },
            h('div', { class: 'input-wrap' }, search, icon('search')),
            h('div', { class: 'chips', role: 'group' }, chips),
            h('div', { class: 'country-row' }, icon('mapPin'), h('div', { class: 'select-wrap' }, select, icon('chevronsUpDown')))
          )
        : (list.classList.add('no-filter'), null),
      list,
      empty,
      more
    );
  }

  // ---------- نافذة الهدية ----------
  const modal = document.getElementById('gift-modal');
  const box = modal.querySelector('.modal-box');
  let lastFocus = null;
  (function fillGift() {
    const g = C.gift || {};
    modal.querySelector('.modal-close').append(icon('x'));
    document.getElementById('gift-tile').append(icon('gift'));
    const badge = document.getElementById('gift-badge');
    badge.append(icon('sparkles'), h('span', null, g.badge || ''));
    document.getElementById('gift-title').textContent = g.title || '';
    document.getElementById('gift-lead').textContent = g.lead || '';
    document.getElementById('gift-paras').replaceChildren(...(g.paragraphs || []).map((p) => h('p', { class: 'gift-para' }, p)));
    const q = document.getElementById('gift-quote');
    q.textContent = g.quote || '';
    q.hidden = !g.quote;
    document.getElementById('gift-closing').textContent = g.closingLead || '';
    document.getElementById('gift-signature').textContent = g.signature || '';
  })();
  function openGift() {
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    box.scrollTop = 0;
    box.focus();
  }
  function closeGift() {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeGift();
  });
  document.addEventListener('keydown', (e) => {
    if (modal.hidden) return;
    if (e.key === 'Escape') closeGift();
    if (e.key === 'Tab') {
      const f = [...box.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])')];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) (e.preventDefault(), f[f.length - 1].focus());
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) (e.preventDefault(), f[0].focus());
    }
  });
  window.atharOpenGift = openGift;

  // ---------- تمييز عنصر القائمة النشط ----------
  function setActive(target) {
    navLinks.forEach((a) => a.classList.toggle('active', a.dataset.target === target));
  }
  if (onHome) {
    const ids = navLinks.map((a) => a.dataset.target).filter((t) => t && t.startsWith('#'));
    const secs = ids.map((t) => document.getElementById(t.slice(1))).filter(Boolean);
    const update = () => {
      const y = window.scrollY + 90;
      let cur = secs[0];
      for (const s of secs) if (s.offsetTop <= y) cur = s;
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) cur = secs[secs.length - 1];
      if (cur) setActive('#' + cur.id);
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
  } else {
    setActive('/p/' + page.slug);
  }
})();
