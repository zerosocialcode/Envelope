/* Envelope — builder interactions
   Developed by Anhar Hussan (github.com/zerosocialcode) */
(function () {
  "use strict";

  const form = document.getElementById('builder-form');
  const preview = document.getElementById('preview');
  let debounceTimer = null;
  let spamDebounce = null;
  let restoring = false;

  // ---------------------------------------------------------------
  // Generic form <-> plain-object helpers
  // ---------------------------------------------------------------
  function getFields() {
    const data = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name || el.type === 'file' || el.type === 'submit') return;
      if (el.type === 'checkbox') {
        data[el.name] = el.checked;
      } else {
        data[el.name] = el.value;
      }
    });
    return data;
  }

  function setFields(data, opts) {
    opts = opts || {};
    restoring = true;
    Array.from(form.elements).forEach((el) => {
      if (!el.name || !(el.name in data)) return;
      if (el.type === 'checkbox') {
        el.checked = !!data[el.name];
      } else {
        el.value = data[el.name];
      }
    });
    restoring = false;
    if (!opts.silent) {
      updatePreview();
      updateInboxMock();
      updateSubjectCount();
      updateContrastHint();
      scheduleSpamCheck();
    }
  }

  // ---------------------------------------------------------------
  // Live email preview (debounced AJAX render)
  // ---------------------------------------------------------------
  async function updatePreview() {
    const formData = new FormData(form);
    try {
      const res = await fetch('/preview', { method: 'POST', body: formData });
      const html = await res.text();
      preview.srcdoc = html;
    } catch (err) {
      console.error('Preview update failed', err);
    }
  }

  function scheduleUpdate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updatePreview();
      pushHistory();
    }, 250);
  }

  form.addEventListener('input', () => {
    if (restoring) return;
    updateInboxMock();
    updateSubjectCount();
    updateContrastHint();
    scheduleUpdate();
    scheduleSpamCheck();
  });
  form.addEventListener('change', () => {
    if (restoring) return;
    scheduleUpdate();
  });

  // ---------------------------------------------------------------
  // Accordion sections
  // ---------------------------------------------------------------
  document.querySelectorAll('.group-head').forEach((head) => {
    head.addEventListener('click', () => {
      const group = head.closest('.group');
      const isOpen = group.getAttribute('data-open') === 'true';
      group.setAttribute('data-open', isOpen ? 'false' : 'true');
    });
  });

  // ---------------------------------------------------------------
  // Device width toggle
  // ---------------------------------------------------------------
  document.querySelectorAll('.w-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.w-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const w = btn.dataset.w;
      preview.style.maxWidth = w === '100%' ? '700px' : w;
    });
  });

  // Dark inbox preview toggle
  const darkPreviewCheck = document.getElementById('dark-preview-check');
  const frameWrap = document.querySelector('.preview-frame-wrap');
  darkPreviewCheck.addEventListener('change', () => {
    frameWrap.classList.toggle('dark-inbox', darkPreviewCheck.checked);
  });

  // ---------------------------------------------------------------
  // Builder theme (light/dark chrome) — persisted
  // ---------------------------------------------------------------
  const themeToggle = document.getElementById('theme-toggle');
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('envelope_theme', theme);
  }
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
  (function initTheme() {
    const saved = localStorage.getItem('envelope_theme');
    if (saved) applyTheme(saved);
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) applyTheme('dark');
  })();

  // ---------------------------------------------------------------
  // Inbox mock (subject / from / preheader live preview)
  // ---------------------------------------------------------------
  function updateInboxMock() {
    const subject = form.elements['subject_line'].value.trim();
    const from = form.elements['from_name'].value.trim();
    const pre = form.elements['preheader'].value.trim();
    document.getElementById('inbox-subject').textContent = subject || 'Your subject line will appear here';
    document.getElementById('inbox-from').textContent = from || 'Your Company';
    document.getElementById('inbox-preheader').textContent = pre || 'Preheader preview text shows up right after the subject in most inboxes';
    document.getElementById('inbox-avatar').textContent = (from || 'E').trim().charAt(0).toUpperCase() || 'E';
  }

  function updateSubjectCount() {
    const len = form.elements['subject_line'].value.length;
    document.getElementById('subject-count').textContent = len;
  }

  // ---------------------------------------------------------------
  // Merge-tag chips -> insert into body_text at cursor
  // ---------------------------------------------------------------
  document.querySelectorAll('.tag-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const ta = document.getElementById('body_text');
      const tag = chip.dataset.tag;
      const start = ta.selectionStart || ta.value.length;
      const end = ta.selectionEnd || ta.value.length;
      ta.value = ta.value.slice(0, start) + tag + ta.value.slice(end);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + tag.length;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  // ---------------------------------------------------------------
  // Brand color presets
  // ---------------------------------------------------------------
  document.querySelectorAll('#brand-presets .swatch').forEach((sw) => {
    sw.addEventListener('click', () => {
      const [primary, secondary, textOn] = sw.dataset.set.split(',');
      form.elements['header_bg'].value = '#' + 'ffffff';
      form.elements['button_bg'].value = '#' + primary;
      form.elements['button2_border'] && (form.elements['button2_border'].value = '#' + primary);
      form.elements['button2_text_color'] && (form.elements['button2_text_color'].value = '#' + primary);
      form.elements['social_icon_color'].value = '#' + primary;
      form.elements['header_text_color'].value = '#' + textOn;
      form.dispatchEvent(new Event('input', { bubbles: true }));
      form.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  // ---------------------------------------------------------------
  // Contrast checker for the primary CTA button
  // ---------------------------------------------------------------
  function relativeLuminance(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;
    const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }
  function contrastRatio(hex1, hex2) {
    const l1 = relativeLuminance(hex1);
    const l2 = relativeLuminance(hex2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }
  function updateContrastHint() {
    const hint = document.getElementById('contrast-hint');
    try {
      const bg = form.elements['button_bg'].value;
      const fg = form.elements['button_text_color'].value;
      const ratio = contrastRatio(bg, fg);
      hint.classList.add('show');
      if (ratio < 3) {
        hint.className = 'contrast-hint show warn';
        hint.textContent = `Low contrast (${ratio.toFixed(1)}:1) — button text may be hard to read. Aim for 4.5:1+.`;
      } else if (ratio < 4.5) {
        hint.className = 'contrast-hint show warn';
        hint.textContent = `Contrast is ${ratio.toFixed(1)}:1 — acceptable for large text, borderline for small text.`;
      } else {
        hint.className = 'contrast-hint show ok';
        hint.textContent = `Contrast ${ratio.toFixed(1)}:1 — passes WCAG AA for text.`;
      }
    } catch (e) { /* invalid color mid-typing */ }
  }

  // ---------------------------------------------------------------
  // Client-side deliverability / spam-word heuristic checker
  // ---------------------------------------------------------------
  const SPAM_WORDS = [
    "free", "guarantee", "no obligation", "act now", "click here", "urgent",
    "winner", "cash bonus", "risk-free", "100% free", "limited time",
    "buy now", "cancel at any time", "congratulations", "double your",
    "earn extra cash", "eliminate debt", "get paid", "no credit check",
    "once in a lifetime", "order now", "please read", "satisfaction guaranteed",
    "this isn't spam", "while supplies later", "work from home"
  ];
  function runSpamCheck() {
    const subject = form.elements['subject_line'].value || '';
    const pre = form.elements['preheader'].value || '';
    const body = form.elements['body_text'].value || '';
    const text = (subject + ' ' + pre + ' ' + body).toLowerCase();
    const hits = SPAM_WORDS.filter((w) => text.includes(w));
    const capsWords = (subject.match(/\b[A-Z]{4,}\b/g) || []).length;
    const exclaim = Math.max(0, (subject.match(/!/g) || []).length - 1);
    const score = Math.min(100, hits.length * 8 + capsWords * 6 + exclaim * 5);

    const fill = document.getElementById('spam-meter-fill');
    const label = document.getElementById('spam-label');
    fill.style.width = score + '%';
    if (score < 20) {
      fill.style.background = '#22c55e';
      label.textContent = hits.length ? `Looking clean — minor flag: "${hits[0]}"` : 'Deliverability check: looking clean';
    } else if (score < 50) {
      fill.style.background = '#f59e0b';
      label.textContent = `Some risk — flagged: ${hits.slice(0, 3).join(', ') || 'style issues'}`;
    } else {
      fill.style.background = '#ef4444';
      label.textContent = `High spam-filter risk — flagged: ${hits.slice(0, 4).join(', ')}`;
    }
  }
  function scheduleSpamCheck() {
    clearTimeout(spamDebounce);
    spamDebounce = setTimeout(runSpamCheck, 300);
  }

  // ---------------------------------------------------------------
  // Undo / redo history
  // ---------------------------------------------------------------
  const history = [];
  let historyIndex = -1;
  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');

  function refreshHistoryButtons() {
    undoBtn.disabled = historyIndex <= 0;
    redoBtn.disabled = historyIndex >= history.length - 1;
  }

  function pushHistory() {
    if (restoring) return;
    const snap = JSON.stringify(getFields());
    if (history[historyIndex] === snap) return;
    history.splice(historyIndex + 1); // drop redo branch
    history.push(snap);
    if (history.length > 60) history.shift();
    historyIndex = history.length - 1;
    refreshHistoryButtons();
  }

  function goHistory(delta) {
    const newIndex = historyIndex + delta;
    if (newIndex < 0 || newIndex >= history.length) return;
    historyIndex = newIndex;
    setFields(JSON.parse(history[historyIndex]));
    refreshHistoryButtons();
  }

  undoBtn.addEventListener('click', () => goHistory(-1));
  redoBtn.addEventListener('click', () => goHistory(1));

  document.addEventListener('keydown', (e) => {
    const meta = e.ctrlKey || e.metaKey;
    if (!meta) return;
    if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); goHistory(-1); }
    if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') { e.preventDefault(); goHistory(1); }
    if (e.key.toLowerCase() === 's') { e.preventDefault(); openSaveModal(); }
  });

  // ---------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------
  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ---------------------------------------------------------------
  // More menu (export / import / copy html)
  // ---------------------------------------------------------------
  const moreBtn = document.getElementById('more-btn');
  const moreMenu = document.getElementById('more-menu');
  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    moreMenu.classList.toggle('open');
  });
  document.addEventListener('click', () => moreMenu.classList.remove('open'));

  document.getElementById('export-json-btn').addEventListener('click', () => {
    const data = getFields();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (form.elements['filename'].value || 'email-design') + '.json';
    a.click();
    toast('Design exported as JSON');
  });

  const importInput = document.getElementById('import-json-input');
  document.getElementById('import-json-btn').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', () => {
    const file = importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        setFields(data);
        pushHistory();
        toast('Design imported');
      } catch (e) {
        toast('That file could not be read as a design JSON');
      }
    };
    reader.readAsText(file);
    importInput.value = '';
  });

  document.getElementById('copy-html-btn').addEventListener('click', async () => {
    try {
      const res = await fetch('/preview', { method: 'POST', body: new FormData(form) });
      const html = await res.text();
      await navigator.clipboard.writeText(html);
      toast('HTML copied to clipboard');
    } catch (e) {
      toast('Could not copy — clipboard access blocked');
    }
  });

  // ---------------------------------------------------------------
  // Save-to-library modal
  // ---------------------------------------------------------------
  const saveOverlay = document.getElementById('save-overlay');
  const saveNameInput = document.getElementById('save-name-input');
  function openSaveModal() {
    saveOverlay.classList.add('open');
    saveNameInput.value = '';
    saveNameInput.focus();
  }
  document.getElementById('save-btn').addEventListener('click', openSaveModal);
  document.getElementById('save-close').addEventListener('click', () => saveOverlay.classList.remove('open'));
  saveOverlay.addEventListener('click', (e) => { if (e.target === saveOverlay) saveOverlay.classList.remove('open'); });

  document.getElementById('save-confirm-btn').addEventListener('click', async () => {
    const name = saveNameInput.value.trim() || 'Untitled template';
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, fields: getFields() }),
      });
      if (!res.ok) throw new Error('save failed');
      saveOverlay.classList.remove('open');
      toast(`Saved "${name}" to your template library`);
      refreshSavedList();
    } catch (e) {
      toast('Could not save — is the server running?');
    }
  });

  // ---------------------------------------------------------------
  // Send email modal
  // ---------------------------------------------------------------
  const sendOverlay = document.getElementById('send-overlay');
  const sendSetup = document.getElementById('send-setup');
  const senderEmailInput = document.getElementById('sender-email-input');
  const senderAppPasswordInput = document.getElementById('sender-app-password-input');
  const sendAccountNote = document.getElementById('send-account-note');
  const sendAccountEmail = document.getElementById('send-account-email');
  const sendToInput = document.getElementById('send-to-input');
  const sendConfirmBtn = document.getElementById('send-confirm-btn');
  const sendConfirmLabel = document.getElementById('send-confirm-label');

  let emailConfigured = false;
  let forceAccountChange = false;

  function showSendSetup(show) {
    sendSetup.classList.toggle('hidden', !show);
    sendAccountNote.classList.toggle('hidden', show);
  }

  async function openSendModal() {
    sendOverlay.classList.add('open');
    sendToInput.value = '';
    senderAppPasswordInput.value = '';
    forceAccountChange = false;
    sendConfirmLabel.textContent = 'Send email';
    sendConfirmBtn.disabled = false;
    showSendSetup(true); // default while we check
    try {
      const res = await fetch('/api/email-config');
      const data = await res.json();
      emailConfigured = !!data.configured;
      if (emailConfigured) {
        senderEmailInput.value = data.email || '';
        sendAccountEmail.textContent = data.email || '';
        showSendSetup(false);
        sendToInput.focus();
      } else {
        senderEmailInput.value = '';
        showSendSetup(true);
        senderEmailInput.focus();
      }
    } catch (e) {
      // If we can't even reach the server, let the confirm click surface the error.
      emailConfigured = false;
      showSendSetup(true);
    }
  }

  document.getElementById('send-btn').addEventListener('click', openSendModal);
  document.getElementById('send-close').addEventListener('click', () => sendOverlay.classList.remove('open'));
  sendOverlay.addEventListener('click', (e) => { if (e.target === sendOverlay) sendOverlay.classList.remove('open'); });

  document.getElementById('send-change-account').addEventListener('click', (e) => {
    e.preventDefault();
    forceAccountChange = true;
    senderEmailInput.value = sendAccountEmail.textContent || '';
    senderAppPasswordInput.value = '';
    showSendSetup(true);
    senderEmailInput.focus();
  });

  sendConfirmBtn.addEventListener('click', async () => {
    const needsSetup = !emailConfigured || forceAccountChange;
    const to = sendToInput.value.trim();

    if (!to) {
      toast('Enter a recipient email address');
      sendToInput.focus();
      return;
    }

    sendConfirmBtn.disabled = true;

    try {
      if (needsSetup) {
        const email = senderEmailInput.value.trim();
        const appPassword = senderAppPasswordInput.value.trim();
        if (!email || !appPassword) {
          toast('Enter your email and app password');
          sendConfirmBtn.disabled = false;
          return;
        }
        sendConfirmLabel.textContent = 'Saving account…';
        const cfgRes = await fetch('/api/email-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, app_password: appPassword }),
        });
        const cfgData = await cfgRes.json();
        if (!cfgRes.ok) throw new Error(cfgData.error || 'Could not save account');
        emailConfigured = true;
        forceAccountChange = false;
        sendAccountEmail.textContent = cfgData.email || email;
        showSendSetup(false);
      }

      sendConfirmLabel.textContent = 'Sending…';
      const formData = new FormData(form);
      formData.set('send_to', to);
      const res = await fetch('/send', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send email');

      toast(`Email sent to ${data.to}`);
      sendOverlay.classList.remove('open');
    } catch (e) {
      toast(e.message || 'Could not send — is the server running?');
    } finally {
      sendConfirmLabel.textContent = 'Send email';
      sendConfirmBtn.disabled = false;
    }
  });

  // ---------------------------------------------------------------
  // Template gallery modal (starters + saved)
  // ---------------------------------------------------------------
  const galleryOverlay = document.getElementById('gallery-overlay');
  document.getElementById('gallery-btn').addEventListener('click', () => {
    galleryOverlay.classList.add('open');
    refreshSavedList();
  });
  document.getElementById('gallery-close').addEventListener('click', () => galleryOverlay.classList.remove('open'));
  galleryOverlay.addEventListener('click', (e) => { if (e.target === galleryOverlay) galleryOverlay.classList.remove('open'); });

  document.querySelectorAll('.modal-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.modal-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('starters-tab').classList.toggle('hidden', tab.dataset.tab !== 'starters');
      document.getElementById('saved-tab').classList.toggle('hidden', tab.dataset.tab !== 'saved');
    });
  });

  async function refreshSavedList() {
    const list = document.getElementById('saved-list');
    try {
      const res = await fetch('/api/templates');
      const items = await res.json();
      if (!items.length) {
        list.innerHTML = '<p class="empty-hint">No saved templates yet — build something and hit "Save".</p>';
        return;
      }
      list.innerHTML = '';
      items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'saved-row';
        const date = item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '';
        row.innerHTML = `
          <span class="t-name">${escapeHtml(item.name)}</span>
          <span class="t-date">${date}</span>
          <button type="button" data-action="load">Load</button>
          <button type="button" data-action="delete" class="danger">Delete</button>
        `;
        row.querySelector('[data-action="load"]').addEventListener('click', async () => {
          const r = await fetch(`/api/templates/${item.id}`);
          const full = await r.json();
          setFields(full.fields || {});
          pushHistory();
          galleryOverlay.classList.remove('open');
          toast(`Loaded "${item.name}"`);
        });
        row.querySelector('[data-action="delete"]').addEventListener('click', async () => {
          await fetch(`/api/templates/${item.id}`, { method: 'DELETE' });
          refreshSavedList();
          toast('Template deleted');
        });
        list.appendChild(row);
      });
    } catch (e) {
      list.innerHTML = '<p class="empty-hint">Could not reach the template library.</p>';
    }
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ---------------------------------------------------------------
  // Starter templates (pure client-side presets)
  // ---------------------------------------------------------------
  const STARTERS = [
    {
      id: 'newsletter', name: 'Monthly newsletter', desc: 'Digest with two-column highlights',
      grad: 'linear-gradient(135deg,#3b82f6,#0ea5e9)', letter: 'N',
      fields: {
        subject_line: 'Your March highlights, in one email', from_name: 'The Team',
        preheader: 'Three stories worth five minutes of your time',
        container_bg: '#ffffff', page_bg: '#eef2ff', border_radius: '12',
        show_header: true, header_bg: '#ffffff', header_text: 'Monthly Digest', header_text_color: '#111111', header_align: 'left',
        show_hero: false,
        show_body: true, body_heading: "This month's highlights", body_heading_color: '#111827',
        body_text: 'Hi {{first_name}},\n\nHere is a quick recap of what shipped and what is coming next.',
        body_text_color: '#374151', body_align: 'left',
        show_columns: true,
        col1_heading: 'Product update', col1_text: 'A faster, cleaner workflow for the whole team.',
        col2_heading: 'Community spotlight', col2_text: 'Meet the customers pushing the platform further.',
        show_button: true, button_text: 'Read the full recap', button_bg: '#3b82f6', button_text_color: '#ffffff',
        show_button2: false,
        show_divider: true, divider_color: '#e5e7eb',
        show_social: true, social_icon_color: '#3b82f6',
        show_footer: true, footer_text: '© 2026 Your Company, Inc. All rights reserved.', footer_link_text: 'Unsubscribe',
      }
    },
    {
      id: 'promo', name: 'Promotional sale', desc: 'Bold hero banner + dual CTA',
      grad: 'linear-gradient(135deg,#ec4899,#f43f5e)', letter: 'S',
      fields: {
        subject_line: '48 hours only: 30% off everything', from_name: 'Your Store',
        preheader: 'Our biggest sale of the season ends Sunday at midnight',
        container_bg: '#ffffff', page_bg: '#fdf2f8', border_radius: '16',
        show_header: true, header_bg: '#111111', header_text: 'YOUR STORE', header_text_color: '#ffffff', header_align: 'center',
        show_hero: true, hero_alt: 'Sale banner',
        show_body: true, body_heading: 'Flash sale: 30% off sitewide', body_heading_color: '#111827',
        body_text: 'For 48 hours only, take 30% off your entire order — no code needed at checkout.',
        body_text_color: '#4b5563', body_align: 'center',
        show_columns: false,
        show_button: true, button_text: 'Shop the sale', button_bg: '#ec4899', button_text_color: '#ffffff', button_align: 'center',
        show_button2: true, button2_text: 'View new arrivals', button2_border: '#ec4899', button2_text_color: '#ec4899',
        show_divider: false,
        show_social: true, social_icon_color: '#ec4899',
        show_footer: true, footer_text: '© 2026 Your Store. All rights reserved.', footer_link_text: 'Unsubscribe',
      }
    },
    {
      id: 'welcome', name: 'Welcome email', desc: 'Warm onboarding with one clear action',
      grad: 'linear-gradient(135deg,#16a34a,#22c55e)', letter: 'W',
      fields: {
        subject_line: 'Welcome aboard, {{first_name}}!', from_name: 'Your Company',
        preheader: "Here's how to get the most out of your account",
        container_bg: '#ffffff', page_bg: '#f0fdf4', border_radius: '14',
        show_header: true, header_bg: '#ffffff', header_text: '', header_align: 'center',
        show_hero: false,
        show_body: true, body_heading: 'Welcome to {{company}}', body_heading_color: '#111827',
        body_text: "Hi {{first_name}},\n\nWe're glad you're here. Your account is ready — here's a good first step.",
        body_text_color: '#374151', body_align: 'left',
        show_columns: false,
        show_button: true, button_text: 'Complete your profile', button_bg: '#22c55e', button_text_color: '#ffffff',
        show_button2: false,
        show_divider: true, divider_color: '#dcfce7',
        show_social: false,
        show_footer: true, footer_text: '© 2026 Your Company, Inc. All rights reserved.', footer_link_text: 'Unsubscribe',
      }
    },
    {
      id: 'event', name: 'Event invitation', desc: 'Hero image with date, time, RSVP',
      grad: 'linear-gradient(135deg,#f59e0b,#f97316)', letter: 'E',
      fields: {
        subject_line: "You're invited: Product Summit 2026", from_name: 'Events Team',
        preheader: 'Join us on September 12th — seats are limited',
        container_bg: '#ffffff', page_bg: '#fffbeb', border_radius: '14',
        show_header: true, header_bg: '#111827', header_text: 'PRODUCT SUMMIT', header_text_color: '#ffffff', header_align: 'center',
        show_hero: true, hero_alt: 'Event banner',
        show_body: true, body_heading: 'Save your seat for Product Summit 2026', body_heading_color: '#111827',
        body_text: 'September 12, 2026 · 10:00 AM\nOnline and in-person\n\nA full day of product deep-dives, workshops, and networking.',
        body_text_color: '#4b5563', body_align: 'center',
        show_columns: false,
        show_button: true, button_text: 'Reserve my seat', button_bg: '#f59e0b', button_text_color: '#111111',
        show_button2: false,
        show_divider: true, divider_color: '#fde68a',
        show_social: true, social_icon_color: '#f59e0b',
        show_footer: true, footer_text: '© 2026 Your Company, Inc. All rights reserved.', footer_link_text: 'Unsubscribe',
      }
    },
    {
      id: 'receipt', name: 'Transactional receipt', desc: 'Clean order confirmation layout',
      grad: 'linear-gradient(135deg,#111827,#4b5563)', letter: 'R',
      fields: {
        subject_line: 'Your order #10482 is confirmed', from_name: 'Order Updates',
        preheader: 'A copy of your receipt is included below',
        container_bg: '#ffffff', page_bg: '#f9fafb', border_radius: '10',
        show_header: true, header_bg: '#ffffff', header_text: 'ORDER CONFIRMED', header_text_color: '#111111', header_align: 'left',
        show_hero: false,
        show_body: true, body_heading: 'Thanks for your order', body_heading_color: '#111827',
        body_text: 'Hi {{first_name}},\n\nWe have received your order #10482 and it is being prepared for shipment. You will get a tracking link once it ships.',
        body_text_color: '#4b5563', body_align: 'left',
        show_columns: false,
        show_button: true, button_text: 'View order details', button_bg: '#111827', button_text_color: '#ffffff',
        show_button2: false,
        show_divider: true, divider_color: '#e5e7eb',
        show_social: false,
        show_footer: true, footer_text: '© 2026 Your Company, Inc. All rights reserved.', footer_address: '123 Business Ave, Suite 100, City, Country', footer_link_text: 'View invoice',
      }
    },
  ];

  const starterGrid = document.getElementById('starter-grid');
  STARTERS.forEach((tpl) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'template-card';
    card.innerHTML = `
      <div class="template-preview" style="background:${tpl.grad}">${tpl.letter}</div>
      <div class="template-info">
        <div class="t-name">${tpl.name}</div>
        <div class="t-desc">${tpl.desc}</div>
      </div>
    `;
    card.addEventListener('click', () => {
      // reset toggles not specified back to false so switching starters is clean
      ['show_header','show_hero','show_body','show_columns','show_button','show_button2','show_divider','show_spacer','show_social','show_footer']
        .forEach((name) => { if (!(name in tpl.fields)) tpl.fields[name] = false; });
      setFields(tpl.fields);
      pushHistory();
      galleryOverlay.classList.remove('open');
      toast(`Applied "${tpl.name}" template`);
    });
    starterGrid.appendChild(card);
  });

  // ---------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------
  window.addEventListener('DOMContentLoaded', () => {
    updatePreview();
    updateInboxMock();
    updateSubjectCount();
    updateContrastHint();
    runSpamCheck();
    pushHistory();
  });
})();
