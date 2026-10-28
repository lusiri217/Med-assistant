/* ============================================================
   views/admin-questions.js —— 管理端：题库编辑
   表格：题干摘要 / 所属病例 / 题型 / 难度 / 状态 / 操作。
   支持新增、编辑、删除、启用/停用、导出 JSON、按病例/题型/知识点筛选。
   ============================================================ */
window.App = window.App || {};
App.views = App.views || {};

App.views['admin-questions'] = (function () {
  'use strict';
  const utils = App.utils;
  const store = App.store;
  const el = utils.el;

  function caseTitle(id) { const c = store.getCase(id); return c ? (c.title || id) : '(公共/未关联)'; }

  function render(root, filter) {
    filter = filter || {};
    root.innerHTML = '';
    const wrap = el('div', { class: 'content-pad anim-fade' });
    wrap.appendChild(el('div', { class: 'section-title', text: '题库编辑' }));
    wrap.appendChild(el('div', { class: 'section-desc', text: '管理所有练习题目；改动对学生端即时同步。' }));

    /* 筛选栏 */
    const caseSel = el('select', { class: 'select', style: 'max-width:240px' }, [el('option', { value: '' }, '全部病例')]);
    store.getCases().forEach(c => caseSel.appendChild(el('option', { value: c.id }, c.title || c.id)));
    caseSel.value = filter.caseId || '';
    const typeSel = el('select', { class: 'select', style: 'max-width:160px' }, [
      el('option', { value: '' }, '全部题型'), el('option', { value: 'choice' }, '选择题'), el('option', { value: 'essay' }, '简答题')
    ]);
    typeSel.value = filter.type || '';
    caseSel.addEventListener('change', () => { filter.caseId = caseSel.value; render(root, filter); });
    typeSel.addEventListener('change', () => { filter.type = typeSel.value; render(root, filter); });

    const addBtn = el('button', { class: 'btn btn-primary' }, '＋ 新增题目');
    addBtn.addEventListener('click', () => openEditor(null, wrap, filter));
    const exportBtn = el('button', { class: 'btn btn-ghost' }, '导出 JSON');
    exportBtn.addEventListener('click', exportJson);

    wrap.appendChild(el('div', { class: 'flex gap-sm wrap items-center', style: 'margin-bottom:14px' }, [
      caseSel, typeSel, el('div', { class: 'flex-1' }), addBtn, exportBtn
    ]));

    /* 列表 */
    let list = store.getQuestions();
    if (filter.caseId) list = list.filter(q => q.caseId === filter.caseId);
    if (filter.type) list = list.filter(q => q.type === filter.type);

    if (!list.length) {
      wrap.appendChild(el('div', { class: 'empty' }, [el('div', { class: 'e-ico', text: '📚' }), el('p', { text: '暂无题目，点击「新增题目」或从病例自动生成。' })]));
      root.appendChild(wrap); return;
    }

    const table = el('table', { class: 'tbl' });
    table.appendChild(el('thead', {}, el('tr', {}, [
      el('th', { text: '题干摘要' }), el('th', { text: '所属病例' }), el('th', { text: '题型' }),
      el('th', { text: '难度' }), el('th', { text: '状态' }), el('th', { text: '操作' })
    ])));
    const tb = el('tbody', {});
    list.forEach(q => {
      tb.appendChild(el('tr', {}, [
        el('td', { text: (q.stem || '').slice(0, 46) + ((q.stem || '').length > 46 ? '…' : '') }),
        el('td', { class: 't-muted text-sm', text: caseTitle(q.caseId) }),
        el('td', {}, [el('span', { class: 'tag', text: q.type === 'essay' ? '简答' : '选择' })]),
        el('td', {}, [el('span', { class: 'tag', text: ({ easy: '简单', medium: '中等', hard: '困难' })[q.difficulty] || q.difficulty })]),
        el('td', {}, [el('span', { class: 'tag ' + (q.enabled ? 'tag-mint' : 'tag'), text: q.enabled ? '启用' : '停用' })]),
        el('td', {}, [buildActions(q, wrap, filter)])
      ]));
    });
    table.appendChild(tb);
    wrap.appendChild(el('div', { class: 'table-wrap' }, table));
    root.appendChild(wrap);
  }

  function buildActions(q, wrap, filter) {
    const box = el('div', { class: 'row-actions' });
    box.appendChild(el('button', { class: 'btn btn-ghost btn-sm', onClick: () => openEditor(q, wrap, filter) }, '编辑'));
    box.appendChild(el('button', { class: 'btn btn-ghost btn-sm', onClick: () => { store.toggleQuestion(q.id, !q.enabled); utils.toast(q.enabled ? '已停用' : '已启用', 'ok'); rerender(wrap, filter); } }, q.enabled ? '停用' : '启用'));
    box.appendChild(el('button', { class: 'btn btn-danger btn-sm', onClick: () => {
      utils.confirm({ title: '删除题目', message: '确认删除该题目？', danger: true, okText: '删除', onOk: () => { store.deleteQuestion(q.id); utils.toast('已删除', 'ok'); rerender(wrap, filter); } });
    } }, '删除'));
    return box;
  }

  function rerender(wrap, filter) { const content = document.querySelector('.content'); if (content) render(content, filter); }

  /* 题目编辑器 */
  function openEditor(q, wrap, filter) {
    const isEdit = !!q;
    const data = q || { type: 'choice', caseId: filter.caseId || (store.getCases()[0] && store.getCases()[0].id) || '', difficulty: 'medium', enabled: true, knowledgePoint: '' };

    const typeSel = el('select', { class: 'select' }, [el('option', { value: 'choice' }, '选择题'), el('option', { value: 'essay' }, '简答题')]);
    typeSel.value = data.type;
    const caseOpt = el('select', { class: 'select' }, store.getCases().map(c => el('option', { value: c.id }, c.title || c.id)));
    caseOpt.value = data.caseId;
    const diffSel = el('select', { class: 'select' }, [el('option', { value: 'easy' }, '简单'), el('option', { value: 'medium' }, '中等'), el('option', { value: 'hard' }, '困难')]);
    diffSel.value = data.difficulty;
    const stem = el('textarea', { class: 'textarea', text: data.stem || '' });
    const kp = el('input', { class: 'input', value: data.knowledgePoint || '' });

    const form = el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: '题型' }), typeSel]),
      el('div', { class: 'field' }, [el('label', { text: '所属病例' }), caseOpt]),
      el('div', { class: 'field' }, [el('label', { text: '难度' }), diffSel]),
      el('div', { class: 'field' }, [el('label', { text: '题干' }), stem]),
      el('div', { class: 'field' }, [el('label', { text: '知识点标签' }), kp])
    ]);
    const optBox = el('div', { class: 'field' }, [el('label', { text: '选项（选择题）' })]);
    const ansBox = el('div', { class: 'field', style: 'display:none' });
    const explain = el('textarea', { class: 'textarea', text: data.explanation || '' });

    function buildOptions() {
      optBox.innerHTML = ''; optBox.appendChild(el('label', { text: '选项（选择题，每行一个，前缀 A./B.… 或仅字母）' }));
      const ta = el('textarea', { class: 'textarea', text: (data.options || ['A. ', 'B. ', 'C. ', 'D. ']).join('\n') });
      optBox.appendChild(ta); optBox._ta = ta;
      ansBox.innerHTML = '';
      ansBox.appendChild(el('label', { text: '正确答案（字母，如 A）' }));
      const ans = el('input', { class: 'input', value: data.answer || 'A', style: 'max-width:120px' });
      ansBox.appendChild(ans); ansBox._ans = ans;
    }
    function buildEssay() {
      optBox.innerHTML = ''; optBox.appendChild(el('label', { text: '参考答案要点' }));
      const ansTa = el('textarea', { class: 'textarea', text: data.answer || '' });
      optBox.appendChild(ansTa); optBox._essay = ansTa;
      ansBox.style.display = 'none';
    }
    if (data.type === 'choice') { buildOptions(); ansBox.style.display = ''; } else { buildEssay(); }

    typeSel.addEventListener('change', () => {
      if (typeSel.value === 'choice') { buildOptions(); ansBox.style.display = ''; } else { buildEssay(); }
    });

    form.appendChild(optBox);
    form.appendChild(ansBox);
    form.appendChild(el('div', { class: 'field' }, [el('label', { text: '解析' }), explain]));

    const foot = el('div', { class: 'flex gap-sm', style: 'justify-content:flex-end' }, [
      el('button', { class: 'btn btn-ghost', onClick: () => m.close() }, '取消'),
      el('button', { class: 'btn btn-primary', onClick: () => {
        const payload = {
          type: typeSel.value, caseId: caseOpt.value, difficulty: diffSel.value,
          stem: stem.value.trim(), knowledgePoint: kp.value.trim(), explanation: explain.value.trim(),
          enabled: data.enabled !== false
        };
        if (!payload.stem) { utils.toast('题干不能为空', 'warn'); return; }
        if (payload.type === 'choice') {
          const opts = (optBox._ta.value || '').split('\n').map(s => s.trim()).filter(Boolean);
          if (opts.length < 2) { utils.toast('至少 2 个选项', 'warn'); return; }
          payload.options = opts; payload.answer = (ansBox._ans.value || 'A').trim().toUpperCase().slice(0, 1);
        } else {
          payload.answer = optBox._essay.value.trim();
          if (!payload.answer) { utils.toast('简答题需填写参考答案', 'warn'); return; }
        }
        if (isEdit) { store.updateQuestion(q.id, payload); utils.toast('已更新', 'ok'); }
        else { store.addQuestion(payload); utils.toast('已新增', 'ok'); }
        m.close(); rerender(wrap, filter);
      } }, isEdit ? '保存' : '新增')
    ]);

    const m = utils.modal({ title: isEdit ? '编辑题目' : '新增题目', body: form, footer: foot, size: 'lg' });
  }

  function exportJson() {
    const data = store.getQuestions();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'aips_questions.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    utils.toast('已导出题库 JSON', 'ok');
  }

  return { render };
})();
