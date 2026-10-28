/* ============================================================
   views/admin-resources.js —— 管理端：可访问网址 / 资源白名单
   列表支持启用/禁用/删除；注入到 AI 系统提示词作为知识来源约束。
   ============================================================ */
window.App = window.App || {};
App.views = App.views || {};

App.views['admin-resources'] = (function () {
  'use strict';
  const utils = App.utils;
  const store = App.store;
  const el = utils.el;

  function render(root) {
    root.innerHTML = '';
    const wrap = el('div', { class: 'content-pad anim-fade', style: 'max-width:860px' });
    wrap.appendChild(el('div', { class: 'section-title', text: '资源白名单' }));
    wrap.appendChild(el('div', { class: 'section-desc', text: '添加可参考的医学资源网址，将作为 AI 生成诊断逻辑链与出题解析的知识来源约束注入系统提示词。' }));

    // 添加区
    const urlInp = el('input', { class: 'input', placeholder: 'https://example.com/内科学' });
    const noteInp = el('input', { class: 'input', placeholder: '备注，如「第 9 版内科学在线版」' });
    const addBtn = el('button', { class: 'btn btn-primary' }, '添加');
    addBtn.addEventListener('click', () => {
      const u = urlInp.value.trim(); const n = noteInp.value.trim();
      if (!u) { utils.toast('请输入网址', 'warn'); return; }
      store.addResource(u, n);
      utils.toast('已添加', 'ok'); render(root);
    });
    wrap.appendChild(el('div', { class: 'card', style: 'margin-bottom:16px' }, [
      el('div', { class: 'field', style: 'margin-bottom:8px' }, [el('label', { text: '网址' }), urlInp]),
      el('div', { class: 'field' }, [el('label', { text: '备注（可选）' }), noteInp]),
      addBtn
    ]));

    // 列表
    const list = store.state.resources;
    if (!list.length) {
      wrap.appendChild(el('div', { class: 'empty' }, [el('div', { class: 'e-ico', text: '🌐' }), el('p', { text: '暂无资源，添加后将出现在患者/出题系统提示词中' })]));
    } else {
      const table = el('table', { class: 'tbl' });
      table.appendChild(el('thead', {}, el('tr', {}, [
        el('th', { text: '网址' }), el('th', { text: '备注' }), el('th', { text: '状态' }), el('th', { text: '操作' })
      ])));
      const tb = el('tbody', {});
      list.forEach(r => {
        const sw = el('input', { type: 'checkbox' }); if (r.enabled) sw.checked = true;
        sw.addEventListener('change', () => { store.updateResource(r.id, { enabled: sw.checked }); utils.toast('已' + (sw.checked ? '启用' : '禁用'), 'ok'); });
        tb.appendChild(el('tr', {}, [
          el('td', {}, [el('a', { href: r.url, target: '_blank', rel: 'noopener', text: r.url })]),
          el('td', { class: 't-muted', text: r.note || '-' }),
          el('td', {}, [el('span', { class: 'tag ' + (r.enabled ? 'tag-mint' : 'tag'), text: r.enabled ? '已启用' : '已禁用' })]),
          el('td', {}, [el('div', { class: 'row-actions' }, [
            el('label', { class: 'switch', style: 'display:inline-block;width:40px' }, [sw, el('span', { class: 'slider' })]),
            el('button', { class: 'btn btn-danger btn-sm', onClick: () => {
              utils.confirm({ title: '删除资源', message: '确认删除该网址？', danger: true, okText: '删除', onOk: () => { store.deleteResource(r.id); utils.toast('已删除', 'ok'); render(root); } });
            } }, '删除')
          ])])
        ]));
      });
      table.appendChild(tb);
      wrap.appendChild(el('div', { class: 'table-wrap' }, table));
    }
    root.appendChild(wrap);
  }

  return { render };
})();
