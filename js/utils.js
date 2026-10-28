/* ============================================================
   utils.js —— 工具函数
   提供：DOM 选择 / 创建、防抖、时间格式化、Markdown 轻量渲染、
        关键词高亮（[[关键词]] -> 可点击标签）、Toast、模态框、剪贴板（打码）
   所有函数挂载到 window.App.utils
   ============================================================ */
window.App = window.App || {};

App.utils = (function () {
  'use strict';

  /* ---------- DOM 选择 ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------- 唯一 ID ---------- */
  function uid(prefix) {
    prefix = prefix || 'id';
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- 防抖 ---------- */
  function debounce(fn, ms) {
    ms = ms || 300;
    let t = null;
    return function () {
      const ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), ms);
    };
  }

  /* ---------- HTML 转义 ---------- */
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function stripTags(s) { return String(s || '').replace(/<[^>]*>/g, ''); }

  /* ---------- 数值约束 ---------- */
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  /* ---------- 时间 ---------- */
  function fmtTime(d) {
    d = d || new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function fmtDateTime(d) {
    d = d || new Date();
    const p = n => ('0' + n).slice(-2);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function dateKey(d) {
    d = d || new Date();
    const p = n => ('0' + n).slice(-2);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function fmtDuration(sec) {
    sec = Math.round(sec || 0);
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + '分' + (s < 10 ? '0' : '') + s + '秒';
  }

  /* ---------- 极简 Markdown -> HTML ----------
     支持：**粗体**、*斜体*、`代码`、行内、# 标题、- 无序列表、1. 有序列表、换行段落 */
  function markdownToHtml(md) {
    if (!md) return '';
    const lines = String(md).split('\n');
    let html = '', inList = false, inP = false;
    const closeP = () => { if (inP) { html += '</p>'; inP = false; } };
    const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
    for (let raw of lines) {
      const line = raw.replace(/\s+$/, '');
      if (/^\s*$/.test(line)) { closeP(); closeList(); continue; }
      let m;
      if ((m = line.match(/^\s*#{1,3}\s+(.*)$/))) { closeP(); closeList(); html += '<h4>' + inline(m[1]) + '</h4>'; continue; }
      if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { closeP(); if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + inline(m[1]) + '</li>'; continue; }
      if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) { closeP(); if (!inList) { html += '<ol>'; inList = true; } html += '<li>' + inline(m[1]) + '</li>'; continue; }
      closeList();
      if (!inP) { html += '<p>'; inP = true; } else { html += '<br>'; }
      html += inline(line);
    }
    closeP(); closeList();
    return html;
  }
  function inline(s) {
    return escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+?)`/g, '<code>$1</code>');
  }

  /* ---------- 关键词高亮 ----------
     将文本中的 [[关键词]] 转为可点击标签；clueMap 可选（word -> clinicalInfo）
     返回 HTML 字符串。点击行为由视图层通过事件委托绑定。 */
  function renderClues(text) {
    if (!text) return '';
    // 先转义，再还原 [[word]] 占位
    let html = escapeHtml(text);
    html = html.replace(/\[\[([^\]]+)\]\]/g, (_, w) =>
      '<span class="clue-tag" data-clue="' + escapeHtml(w) + '">' + escapeHtml(w) + '</span>');
    return html;
  }
  /* 从文本中提取被 [[ ]] 包裹的关键词列表 */
  function extractClueWords(text) {
    const out = [];
    const re = /\[\[([^\]]+)\]\]/g; let m;
    while ((m = re.exec(text || ''))) out.push(m[1]);
    return out;
  }

  /* ---------- 轻量创建元素 ---------- */
  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (k === 'class') e.className = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'text') e.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v);
      }
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach(c => {
        if (c == null) return;
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return e;
  }

  /* ---------- Toast ---------- */
  function toast(msg, type) {
    type = type || 'info';
    const root = document.getElementById('toast-root');
    if (!root) return;
    const icon = { ok: '✓', err: '✕', warn: '!', info: 'i' }[type] || 'i';
    const t = el('div', { class: 'toast ' + type, role: 'status' }, [
      el('span', { text: icon }), el('span', { text: msg })
    ]);
    root.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity .3s, transform .3s';
      t.style.opacity = '0'; t.style.transform = 'translateY(-8px)';
      setTimeout(() => t.remove(), 320);
    }, 2600);
  }

  /* ---------- 模态框 ----------
     opts: { title, body(node|string), footer(node|null), onClose, size:'lg' }
     返回 { close } */
  function modal(opts) {
    const root = document.getElementById('modal-root');
    if (!root) return { close() {} };
    const mask = el('div', { class: 'modal-mask' });
    const dialog = el('div', { class: 'modal' + (opts.size === 'lg' ? ' modal-lg' : '') });
    const head = el('div', { class: 'modal-head' }, [
      el('h3', { text: opts.title || '' }),
      el('button', { class: 'modal-close', 'aria-label': '关闭', onClick: () => close() }, '×')
    ]);
    const body = el('div', { class: 'modal-body' });
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);
    const foot = el('div', { class: 'modal-foot' });
    if (typeof opts.footer === 'string') foot.innerHTML = opts.footer;
    else if (opts.footer) foot.appendChild(opts.footer);
    const frag = [head, body];
    if (opts.footer !== null) frag.push(foot);
    frag.forEach(n => dialog.appendChild(n));
    mask.appendChild(dialog);
    mask.addEventListener('click', e => { if (e.target === mask) close(); });
    root.appendChild(mask);
    function close() { mask.remove(); if (opts.onClose) opts.onClose(); }
    return { close, body, foot, dialog };
  }

  /* ---------- 确认框 ---------- */
  function confirm(opts) {
    // opts: { title, message, okText, danger, onOk }
    const foot = el('div', { class: 'flex gap-sm', style: 'justify-content:flex-end' }, [
      el('button', { class: 'btn btn-ghost', onClick: () => { m.close(); } }, '取消'),
      el('button', {
        class: 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary'),
        onClick: () => { m.close(); opts.onOk && opts.onOk(); }
      }, opts.okText || '确定')
    ]);
    const m = modal({ title: opts.title || '请确认', body: el('div', {}, opts.message || ''), footer: foot });
    return m;
  }

  /* ---------- 剪贴板（带打码） ----------
     复制时对敏感内容自动打码，避免明文泄露到剪贴板/日志 */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove(); return true;
    } catch (e) { return false; }
  }
  // 打码：仅保留首尾各 4 位，中间以 • 代替
  function maskSecret(s) {
    s = String(s || '');
    if (s.length <= 8) return '••••••••';
    return s.slice(0, 4) + '••••••••' + s.slice(-4);
  }

  /* ---------- 简单判定：人文关怀 / 不礼貌 / 无关 ---------- */
  const EMPATHY_WORDS = ['理解', '别担心', '不用担心', '我陪', '会好的', '辛苦', '安慰', '别紧张', '放松', '我们', '一起', '尽力', '难受', '疼', '可怜', '别怕', '放心'];
  const RUDE_WORDS = ['快点', '啰嗦', '烦', '笨', '蠢', '不配合', '你必须', '赶紧', '闭嘴'];
  const CHITCHAT = ['天气', '今天星期', '吃饭', '你多大了', '讲个笑话', '周末', '电影', '游戏'];
  function analyzeTone(text) {
    text = text || '';
    let empathy = EMPATHY_WORDS.some(w => text.indexOf(w) >= 0);
    let rude = RUDE_WORDS.some(w => text.indexOf(w) >= 0);
    let chitchat = CHITCHAT.some(w => text.indexOf(w) >= 0);
    return { empathy, rude, chitchat };
  }

  return {
    $, $$, uid, debounce, escapeHtml, stripTags, clamp,
    fmtTime, fmtDateTime, dateKey, fmtDuration,
    markdownToHtml, inline, renderClues, extractClueWords,
    el, toast, modal, confirm, copyText, maskSecret, analyzeTone
  };
})();
