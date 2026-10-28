/* ============================================================
   views/admin-cases.js —— 管理端：病例审核与发布
   列出病例，可查看结构化内容、编辑、发布（学生端可见）或驳回（填理由）。
   ============================================================ */
window.App = window.App || {};
App.views = App.views || {};

App.views['admin-cases'] = (function () {
  'use strict';
  const utils = App.utils;
  const store = App.store;
  const el = utils.el;

  function render(root) {
    root.innerHTML = '';
    const wrap = el('div', { class: 'content-pad anim-fade' });
    wrap.appendChild(el('div', { class: 'section-title', text: '病例审核与发布' }));
    wrap.appendChild(el('div', { class: 'section-desc', text: '发布后学生端可见；驳回需填写理由并通知医院端。' }));

    const cases = store.getCases().slice();
    const pending = cases.filter(c => c.status === 'pending').length;
    wrap.appendChild(el('div', { class: 'card', style: 'margin-bottom:16px' }, [
      el('div', { class: 't-muted text-sm', text: '待审核：' + pending + '　|　已发布：' + cases.filter(c => c.status === 'published').length + '　|　已驳回：' + cases.filter(c => c.status === 'rejected').length })
    ]));

    if (!cases.length) {
      wrap.appendChild(el('div', { class: 'empty' }, [el('div', { class: 'e-ico', text: '✅' }), el('p', { text: '暂无病例' })]));
      root.appendChild(wrap); return;
    }

    const table = el('table', { class: 'tbl' });
    table.appendChild(el('thead', {}, el('tr', {}, [
      el('th', { text: '标题' }), el('th', { text: '科室' }), el('th', { text: '类型' }),
      el('th', { text: '状态' }), el('th', { text: '上传时间' }), el('th', { text: '操作' })
    ])));
    const tb = el('tbody', {});
    cases.forEach(c => {
      const statusMap = { pending: ['badge-pending', '待审核'], published: ['badge-published', '已发布'], rejected: ['badge-rejected', '已驳回'] };
      const [sc, sl] = statusMap[c.status] || ['badge-draft', c.status];
      tb.appendChild(el('tr', {}, [
        el('td', { text: c.title || '（无标题）' }),
        el('td', { text: c.department || '-' }),
        el('td', { text: c.caseType || '-' }),
        el('td', {}, [el('span', { class: 'tag ' + sc, text: sl })]),
        el('td', { class: 't-muted text-sm', text: c.createdAt || '-' }),
        el('td', {}, [buildActions(c)])
      ]));
    });
    table.appendChild(tb);
    wrap.appendChild(el('div', { class: 'table-wrap' }, table));
    root.appendChild(wrap);
  }

  function buildActions(c) {
    const box = el('div', { class: 'row-actions' });
    box.appendChild(el('button', { class: 'btn btn-ghost btn-sm', onClick: () => viewCase(c) }, '查看'));
    if (c.status !== 'published') box.appendChild(el('button', { class: 'btn btn-mint btn-sm', onClick: () => publish(c) }, '发布'));
    if (c.status !== 'rejected') box.appendChild(el('button', { class: 'btn btn-danger btn-sm', onClick: () => reject(c) }, '驳回'));
    box.appendChild(el('button', { class: 'btn btn-ghost btn-sm', onClick: () => editCase(c) }, '编辑'));
    return box;
  }

  function fieldRow(k, v) {
    return el('div', { class: 'r-row', style: 'display:flex;gap:10px;padding:7px 0;border-bottom:1px dashed var(--c-border)' }, [
      el('div', { style: 'flex:0 0 92px;color:var(--c-text-2);font-size:13px', text: k }),
      el('div', { style: 'flex:1;font-size:13.5px', text: String(v == null ? '' : v) })
    ]);
  }

  function viewCase(c) {
    const body = el('div', {}, [
      fieldRow('标题', c.title), fieldRow('科室', c.department), fieldRow('类型', c.caseType), fieldRow('难度', c.difficulty),
      fieldRow('主诉', c.chiefComplaint), fieldRow('现病史', c.presentIllness), fieldRow('既往史', c.pastHistory),
      fieldRow('体格检查', c.physicalExam), fieldRow('辅助检查', c.auxExam), fieldRow('患者人设', c.patientPersona),
      fieldRow('标准诊断', c.correctDiagnosis), fieldRow('鉴别诊断', (c.differentialDiagnosis || []).join('、')),
      fieldRow('知识点', (c.knowledgePoints || []).join('、'))
    ]);
    if (c.keyClues && c.keyClues.length) {
      const kc = el('div', { style: 'margin-top:8px' }, [el('div', { class: 'fw-600', text: '关键线索：' })]);
      c.keyClues.forEach(k => kc.appendChild(el('div', { class: 'text-sm t-2', style: 'margin-top:4px' }, [
        el('span', { class: 'tag tag-primary', text: k.word }), el('span', { text: '　' + (k.clinicalInfo || '') })
      ])));
      body.appendChild(kc);
    }
    if (c.status === 'rejected' && c.rejectReason) {
      body.appendChild(el('div', { style: 'margin-top:10px;padding:10px;background:var(--c-danger-soft);border-radius:var(--r-md);color:var(--c-danger)' }, [
        el('div', { class: 'fw-600', text: '驳回理由' }), el('div', { class: 'text-sm', text: c.rejectReason })
      ]));
    }
    const foot = el('div', { class: 'flex gap-sm', style: 'justify-content:flex-end' }, [
      el('button', { class: 'btn btn-ghost', onClick: () => m.close() }, '关闭'),
      el('button', { class: 'btn btn-mint', onClick: () => { m.close(); publish(c); } }, '直接发布')
    ]);
    const m = utils.modal({ title: '病例详情', body, footer: foot, size: 'lg' });
  }

  function publish(c) {
    store.updateCase(c.id, { status: 'published', rejectReason: '' });
    utils.toast('已发布，学生端可见', 'ok');
    renderCurrent();
  }
  function reject(c) {
    const ta = el('textarea', { class: 'textarea', placeholder: '请填写驳回理由（将反馈给医院端）' });
    const foot = el('div', { class: 'flex gap-sm', style: 'justify-content:flex-end' }, [
      el('button', { class: 'btn btn-ghost', onClick: () => m.close() }, '取消'),
      el('button', { class: 'btn btn-danger', onClick: () => {
        if (!ta.value.trim()) { utils.toast('请填写驳回理由', 'warn'); return; }
        store.updateCase(c.id, { status: 'rejected', rejectReason: ta.value.trim() });
        utils.toast('已驳回', 'ok'); m.close(); renderCurrent();
      } }, '确认驳回')
    ]);
    const m = utils.modal({ title: '驳回病例', body: el('div', {}, [el('div', { class: 'field' }, [el('label', { text: '驳回理由' }), ta])]), footer: foot });
  }
  function editCase(c) {
    const f = el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: '标题' }), el('input', { class: 'input', value: c.title || '' })]),
      el('div', { class: 'field' }, [el('label', { text: '科室' }), el('input', { class: 'input', value: c.department || '' })]),
      el('div', { class: 'field' }, [el('label', { text: '主诉' }), el('textarea', { class: 'textarea', text: c.chiefComplaint || '' })]),
      el('div', { class: 'field' }, [el('label', { text: '现病史' }), el('textarea', { class: 'textarea', text: c.presentIllness || '' })]),
      el('div', { class: 'field' }, [el('label', { text: '标准诊断' }), el('input', { class: 'input', value: c.correctDiagnosis || '' })])
    ]);
    const inputs = f.querySelectorAll('input,textarea');
    const foot = el('div', { class: 'flex gap-sm', style: 'justify-content:flex-end' }, [
      el('button', { class: 'btn btn-ghost', onClick: () => m.close() }, '取消'),
      el('button', { class: 'btn btn-primary', onClick: () => {
        store.updateCase(c.id, { title: inputs[0].value, department: inputs[1].value, chiefComplaint: inputs[2].value, presentIllness: inputs[3].value, correctDiagnosis: inputs[4].value });
        utils.toast('已保存', 'ok'); m.close(); renderCurrent();
      } }, '保存')
    ]);
    const m = utils.modal({ title: '编辑病例', body: f, footer: foot, size: 'lg' });
  }

  function renderCurrent() { const content = document.querySelector('.content'); if (content) render(content); }

  return { render };
})();
