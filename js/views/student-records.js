/* ============================================================
   views/student-records.js —— 学生端：历史问诊记录与知识点总结
   列表：病例 / 时间 / 时长 / 诊断是否正确 / 得分 / 积分变动。
   详情：完整对话回放（高亮线索）+ 问诊报告 + 知识点小结（可折叠）。
   ============================================================ */
window.App = window.App || {};
App.views = App.views || {};

App.views['student-records'] = (function () {
  'use strict';
  const utils = App.utils;
  const store = App.store;
  const el = utils.el;

  function render(root) {
    root.innerHTML = '';
    const wrap = el('div', { class: 'content-pad anim-fade' });
    wrap.appendChild(el('div', { class: 'section-title', text: '历史问诊记录' }));
    wrap.appendChild(el('div', { class: 'section-desc', text: '点击任意记录查看完整对话回放、问诊报告与知识点总结。当前积分：' + store.getStudent().score }));

    const records = store.getStudent().records;
    if (!records.length) {
      wrap.appendChild(el('div', { class: 'empty' }, [
        el('div', { class: 'e-ico', text: '📋' }),
        el('p', { text: '还没有问诊记录，去「诊断对话」开始第一次练习吧。' }),
        el('button', { class: 'btn btn-primary', onClick: () => location.hash = '#/student/diagnosis' }, '开始诊断')
      ]));
      root.appendChild(wrap); return;
    }

    const table = el('table', { class: 'tbl' });
    table.appendChild(el('thead', {}, el('tr', {}, [
      el('th', { text: '病例' }), el('th', { text: '时间' }), el('th', { text: '时长' }),
      el('th', { text: '诊断' }), el('th', { text: '积分变动' }), el('th', { text: '操作' })
    ])));
    const tb = el('tbody', {});
    records.forEach(r => {
      const correct = r.report ? (r.report.diagnosisCorrect === true ? '正确' : (r.report.diagnosisCorrect === 'partial' ? '部分正确' : '错误')) : '草稿';
      const correctTag = r.report ? (r.report.diagnosisCorrect === true ? 'tag-mint' : (r.report.diagnosisCorrect === 'partial' ? 'tag-warning' : 'tag-danger')) : 'tag';
      tb.appendChild(el('tr', {}, [
        el('td', { text: r.caseTitle || '（无标题）' }),
        el('td', { class: 'text-sm t-muted', text: r.endedAt || r.startedAt || '-' }),
        el('td', { class: 'text-sm', text: utils.fmtDuration(r.duration) }),
        el('td', {}, [el('span', { class: 'tag ' + correctTag, text: correct })]),
        el('td', {}, [el('span', { class: 'tag ' + (r.scoreDelta >= 0 ? 'tag-mint' : 'tag-danger'), text: (r.scoreDelta >= 0 ? '+' : '') + (r.scoreDelta || 0) })]),
        el('td', {}, [el('button', { class: 'btn btn-ghost btn-sm', onClick: () => viewDetail(r) }, '查看')])
      ]));
    });
    table.appendChild(tb);
    wrap.appendChild(el('div', { class: 'table-wrap' }, table));
    root.appendChild(wrap);
  }

  function viewDetail(r) {
    const c = store.getCase(r.caseId);
    const body = el('div', {}, []);

    // 对话回放
    body.appendChild(el('div', { class: 'section-title', style: 'font-size:15px', text: '对话回放' }));
    const chat = el('div', { class: 'chat-body scroll-y', style: 'background:var(--c-bg);border-radius:var(--r-md);max-height:340px;margin-top:8px' });
    (r.dialog || []).forEach(m => {
      const node = el('div', { class: 'msg ' + (m.role === 'doctor' ? 'doctor' : 'patient') }, [
        el('div', { class: 'm-avatar', text: m.role === 'doctor' ? '🧑‍⚕️' : (r.foreign ? '🌐' : '🧑') }),
        el('div', {}, [el('div', { class: 'bubble', html: utils.renderClues(m.text) })])
      ]);
      chat.appendChild(node);
      if (m.role === 'patient') node.querySelectorAll('.clue-tag').forEach(t => t.addEventListener('click', () => {
        const cl = (c && c.keyClues || []).find(x => x.word === t.getAttribute('data-clue'));
        utils.modal({ title: '关键线索', body: el('div', {}, [el('div', { class: 'fw-700', text: t.getAttribute('data-clue') }), el('div', { class: 't-2', text: cl ? (cl.clinicalInfo || '') : '（无说明）' })]), size: 'lg' });
      }));
    });
    body.appendChild(chat);

    // 报告
    if (r.report) {
      const rp = r.report;
      body.appendChild(el('div', { class: 'section-title', style: 'font-size:15px;margin-top:16px', text: '问诊报告' }));
      const correctness = rp.diagnosisCorrect === true ? '✅ 正确' : (rp.diagnosisCorrect === 'partial' ? '🟡 部分正确' : '❌ 错误');
      body.appendChild(el('div', { class: 'report', style: 'margin-top:8px' }, [
        el('div', { class: 'r-row' }, [el('div', { class: 'r-key', text: '诊断结论' }), el('div', { class: 'r-val', text: correctness })]),
        el('div', { class: 'r-row' }, [el('div', { class: 'r-key', text: '线索发现率' }), el('div', { class: 'r-val', text: Math.round((rp.clueRate || 0) * 100) + '%' })]),
        el('div', { class: 'r-row' }, [el('div', { class: 'r-key', text: '人文关怀' }), el('div', { class: 'r-val', text: (rp.empathyScore != null ? rp.empathyScore : '—') + '/100' })]),
        el('div', { class: 'r-row' }, [el('div', { class: 'r-key', text: '问诊条理' }), el('div', { class: 'r-val', text: (rp.reasoningScore != null ? rp.reasoningScore : '—') + '/100' })]),
        el('div', { class: 'r-row' }, [el('div', { class: 'r-key', text: '总评' }), el('div', { class: 'r-val', text: rp.comment || '—' })])
      ]));
    }

    // 知识点小结（折叠）
    if (r.report && r.report.knowledgeSummary) {
      body.appendChild(el('div', { class: 'section-title', style: 'font-size:15px;margin-top:16px', text: '知识点总结' }));
      const details = el('details', { class: 'knowledge', open: 'open' }, [
        el('summary', { text: '本次涉及知识点提纲' }),
        el('div', { class: 'k-body', text: r.report.knowledgeSummary })
      ]);
      body.appendChild(details);
      body.appendChild(el('button', { class: 'btn btn-ghost btn-sm', style: 'margin-top:8px', onClick: () => utils.toast('已加入我的知识卡片（演示）', 'ok') }, '＋ 加入我的知识卡片'));
    }

    const foot = el('div', { class: 'flex gap-sm', style: 'justify-content:flex-end' }, [
      el('button', { class: 'btn btn-ghost', onClick: () => m.close() }, '关闭'),
      el('button', { class: 'btn btn-primary', onClick: () => { m.close(); location.hash = '#/student/quiz'; } }, '针对该病例做题')
    ]);
    const m = utils.modal({ title: r.caseTitle || '记录详情', body, footer: foot, size: 'lg' });
  }

  return { render };
})();
