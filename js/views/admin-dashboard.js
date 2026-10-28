/* ============================================================
   views/admin-dashboard.js —— 管理端：数据总览
   统计卡片：病例总数 / 已发布数 / 学生问诊次数 / 题目总数 / 平均积分 /
            各病例练习次数。
   ============================================================ */
window.App = window.App || {};
App.views = App.views || {};

App.views['admin-dashboard'] = (function () {
  'use strict';
  const utils = App.utils;
  const store = App.store;
  const el = utils.el;

  function render(root) {
    root.innerHTML = '';
    const wrap = el('div', { class: 'content-pad anim-fade' });
    wrap.appendChild(el('div', { class: 'section-title', text: '数据总览' }));
    wrap.appendChild(el('div', { class: 'section-desc', text: '平台运行概览（本地数据，随使用实时更新）。' }));

    const cases = store.getCases();
    const published = cases.filter(c => c.status === 'published').length;
    const records = store.getStudent().records;
    const questions = store.getQuestions();
    const student = store.getStudent();

    const stats = [
      { ico: '📁', num: cases.length, label: '病例总数' },
      { ico: '✅', num: published, label: '已发布数' },
      { ico: '💬', num: records.length, label: '学生问诊次数' },
      { ico: '📚', num: questions.length, label: '题目总数' },
      { ico: '🪙', num: student.score, label: '平均积分（单学员）' }
    ];

    const grid = el('div', { class: 'grid grid-3' });
    stats.forEach(s => {
      grid.appendChild(el('div', { class: 'stat' }, [
        el('div', { class: 's-ico', text: s.ico }),
        el('div', { class: 's-num', text: String(s.num) }),
        el('div', { class: 's-label', text: s.label })
      ]));
    });
    wrap.appendChild(grid);

    /* 各病例练习次数 */
    const counts = {};
    records.forEach(r => { if (r.caseId) counts[r.caseId] = (counts[r.caseId] || 0) + 1; });
    wrap.appendChild(el('div', { class: 'card', style: 'margin-top:20px' }, [
      el('div', { class: 'card-title', text: '各病例练习次数' }),
      (function () {
        const table = el('table', { class: 'tbl' });
        table.appendChild(el('thead', {}, el('tr', {}, [el('th', { text: '病例' }), el('th', { text: '科室' }), el('th', { text: '状态' }), el('th', { text: '练习次数' })])));
        const tb = el('tbody', {});
        if (!cases.length) {
          tb.appendChild(el('tr', {}, [el('td', { colspan: '4', class: 't-muted' }, '暂无病例')]));
        }
        cases.forEach(c => {
          const sc = c.status === 'published' ? 'badge-published' : (c.status === 'rejected' ? 'badge-rejected' : 'badge-pending');
          const sl = ({ published: '已发布', rejected: '已驳回', pending: '待审核' })[c.status] || c.status;
          tb.appendChild(el('tr', {}, [
            el('td', { text: c.title || '（无标题）' }), el('td', { text: c.department || '-' }),
            el('td', {}, [el('span', { class: 'tag ' + sc, text: sl })]),
            el('td', { text: String(counts[c.id] || 0) })
          ]));
        });
        table.appendChild(tb);
        return el('div', { class: 'table-wrap', style: 'margin-top:10px' }, table);
      })()
    ]));

    /* 最近积分流水 */
    wrap.appendChild(el('div', { class: 'card', style: 'margin-top:20px' }, [
      el('div', { class: 'card-title', text: '最近积分流水' }),
      (function () {
        const log = student.scoreLog.slice(0, 10);
        if (!log.length) return el('div', { class: 'text-sm t-muted', text: '暂无积分变动' });
        const table = el('table', { class: 'tbl' });
        table.appendChild(el('thead', {}, el('tr', {}, [el('th', { text: '时间' }), el('th', { text: '变动' }), el('th', { text: '原因' }), el('th', { text: '结余' })])));
        const tb = el('tbody', {});
        log.forEach(l => {
          tb.appendChild(el('tr', {}, [
            el('td', { class: 'text-sm t-muted', text: l.ts }),
            el('td', {}, [el('span', { class: l.delta >= 0 ? 'tag tag-mint' : 'tag tag-danger', text: (l.delta >= 0 ? '+' : '') + l.delta })]),
            el('td', { text: l.reason }),
            el('td', { class: 'text-sm', text: String(l.after) })
          ]));
        });
        table.appendChild(tb);
        return el('div', { class: 'table-wrap', style: 'margin-top:10px' }, table);
      })()
    ]));

    root.appendChild(wrap);
  }

  return { render };
})();
