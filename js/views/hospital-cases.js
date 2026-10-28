/* ============================================================
   views/hospital-cases.js —— 医院端：我上传的病例
   表格：标题 / 科室 / 类型 / 难度 / 状态 / 上传时间 / 操作（查看 / 编辑 / 删除）
   状态由管理端审核变更，医院端对未发布病例可编辑/删除。
   ============================================================ */
window.App = window.App || {};
App.views = App.views || {};

App.views['hospital-cases'] = (function () {
  'use strict';
  const utils = App.utils;
  const store = App.store;
  const el = utils.el;

  function render(root) {
    root.innerHTML = '';
    const wrap = el('div', { class: 'content-pad anim-fade' });
    wrap.appendChild(el('div', { class: 'section-title', text: '我上传的病例' }));
    wrap.appendChild(el('div', { class: 'section-desc', text: '状态由管理端审核后变更；待审核 / 已驳回的病例可编辑或删除。' }));

    const cases = store.getCases().filter(c => c.owner !== 'seed'); // 医院端只看自己上传的（含待审核）
    if (!cases.length) {
      wrap.appendChild(el('div', { class: 'empty' }, [
        el('div', { class: 'e-ico', text: '🗂️' }),
        el('p', { text: '还没有上传任何病例' }),
        el('button', { class: 'btn btn-primary', onClick: () => location.hash = '#/hospital/upload' }, '去上传病例')
      ]));
      root.appendChild(wrap); return;
    }

    const table = el('table', { class: 'tbl' });
    table.appendChild(el('thead', {}, el('tr', {}, [
      el('th', { text: '标题' }), el('th', { text: '科室' }), el('th', { text: '类型' }),
      el('th', { text: '难度' }), el('th', { text: '状态' }), el('th', { text: '上传时间' }),
      el('th', { text: '操作' })
    ])));
    const tbody = el('tbody', {});
    cases.forEach(c => {
      const statusMap = { pending: ['badge-pending', '待审核'], published: ['badge-published', '已发布'], rejected: ['badge-rejected', '已驳回'] };
      const [sc, sl] = statusMap[c.status] || ['badge-draft', c.status];
      const tr = el('tr', {}, [
        el('td', { text: c.title || '（无标题）' }),
        el('td', { text: c.department || '-' }),
        el('td', { text: c.caseType || '-' }),
        el('td', {}, [el('span', { class: 'tag', text: ({ easy: '简单', medium: '中等', hard: '困难' })[c.difficulty] || c.difficulty })]),
        el('td', {}, [el('span', { class: 'tag ' + sc, text: sl })]),
        el('td', { class: 't-muted text-sm', text: c.createdAt || '-' }),
        el('td', {}, [buildActions(c)])
      ]);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(el('div', { class: 'table-wrap' }, table));
    root.appendChild(wrap);
  }

  function buildActions(c) {
    const box = el('div', { class: 'row-actions' });
    box.appendChild(el('button', { class: 'btn btn-ghost btn-sm', onClick: () => viewCase(c) }, '查看'));
    if (c.status !== 'published') {
      box.appendChild(el('button', { class: 'btn btn-ghost btn-sm', onClick: () => editCase(c) }, '编辑'));
      box.appendChild(el('button', { class: 'btn btn-danger btn-sm', onClick: () => removeCase(c) }, '删除'));
    }
    return box;
  }

  function fieldRow(k, v) {
    return el('div', { class: 'r-row', style: 'display:flex;gap:10px;padding:8px 0;border-bottom:1px dashed var(--c-border)' }, [
      el('div', { style: 'flex:0 0 96px;color:var(--c-text-2);font-size:13px', text: k }),
      el('div', { style: 'flex:1;font-size:13.5px', text: String(v == null ? '' : v) })
    ]);
  }

  function viewCase(c) {
    const body = el('div', {}, [
      fieldRow('标题', c.title), fieldRow('科室', c.department), fieldRow('类型', c.caseType),
      fieldRow('难度', c.difficulty), fieldRow('主诉', c.chiefComplaint),
      fieldRow('现病史', c.presentIllness), fieldRow('既往史', c.pastHistory),
      fieldRow('体格检查', c.physicalExam), fieldRow('辅助检查', c.auxExam),
      fieldRow('患者人设', c.patientPersona), fieldRow('标准诊断', c.correctDiagnosis),
      fieldRow('鉴别诊断', (c.differentialDiagnosis || []).join('、')),
      fieldRow('知识点', (c.knowledgePoints || []).join('、')),
      fieldRow('状态', ({ pending: '待审核', published: '已发布', rejected: '已驳回' })[c.status] || c.status)
    ]);
    if (c.status === 'rejected' && c.rejectReason) {
      body.appendChild(el('div', { style: 'margin-top:10px;padding:10px;background:var(--c-danger-soft);border-radius:var(--r-md);color:var(--c-danger)' },
        [el('div', { class: 'fw-600', text: '驳回理由' }), el('div', { class: 'text-sm', text: c.rejectReason })]));
    }
    utils.modal({ title: '病例详情', body, size: 'lg' });
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
        store.updateCase(c.id, {
          title: inputs[0].value, department: inputs[1].value,
          chiefComplaint: inputs[2].value, presentIllness: inputs[3].value,
          correctDiagnosis: inputs[4].value, status: 'pending', rejectReason: ''
        });
        utils.toast('已更新并重新提交审核', 'ok'); m.close(); renderCurrent();
      } }, '保存并提交')
    ]);
    const m = utils.modal({ title: '编辑病例（重新提交）', body: f, footer: foot, size: 'lg' });
  }

  function removeCase(c) {
    utils.confirm({
      title: '删除病例', message: '确认删除「' + (c.title || '该病例') + '」？此操作不可撤销。', danger: true, okText: '删除',
      onOk: () => { store.deleteCase(c.id); utils.toast('已删除', 'ok'); renderCurrent(); }
    });
  }

  function renderCurrent() {
    const app = document.getElementById('app');
    const content = app.querySelector('.content');
    if (content) render(content);
  }

  return { render };
})();
