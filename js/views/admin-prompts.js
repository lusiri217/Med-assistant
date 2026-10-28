/* ============================================================
   views/admin-prompts.js —— 管理端：提示词管理
   两个可编辑文本域：前置提示词 / 诊断逻辑链、出题策略提示词。
   含「恢复默认」按钮；修改即时生效（存于 store.prompts）。
   ============================================================ */
window.App = window.App || {};
App.views = App.views || {};

App.views['admin-prompts'] = (function () {
  'use strict';
  const utils = App.utils;
  const store = App.store;
  const prompts = App.prompts;
  const el = utils.el;

  function render(root) {
    root.innerHTML = '';
    const wrap = el('div', { class: 'content-pad anim-fade' });
    wrap.appendChild(el('div', { class: 'section-title', text: '提示词管理' }));
    wrap.appendChild(el('div', { class: 'section-desc', text: '编辑患者人设 / 诊断逻辑链，以及出题策略。保存后学生端与管理端出题立即使用新提示词。' }));

    const p = store.state.prompts;

    // 前置提示词
    const frontTa = el('textarea', { class: 'textarea', style: 'min-height:300px;font-family:var(--font-mono);font-size:13px', text: p.front || '' });
    const frontReset = el('button', { class: 'btn btn-ghost btn-sm' }, '恢复默认');
    frontReset.addEventListener('click', () => { frontTa.value = prompts.DEFAULT_FRONT; utils.toast('已恢复默认前置提示词', 'info'); });

    // 出题策略
    const quizTa = el('textarea', { class: 'textarea', style: 'min-height:260px;font-family:var(--font-mono);font-size:13px', text: p.quiz || '' });
    const quizReset = el('button', { class: 'btn btn-ghost btn-sm' }, '恢复默认');
    quizReset.addEventListener('click', () => { quizTa.value = prompts.DEFAULT_QUIZ; utils.toast('已恢复默认出题策略', 'info'); });

    wrap.appendChild(el('div', { class: 'card', style: 'margin-bottom:16px' }, [
      el('div', { class: 'flex justify-between items-center', style: 'margin-bottom:8px' }, [
        el('div', { class: 'card-title', text: '前置提示词 / 诊断逻辑链' }),
        frontReset
      ]),
      frontTa,
      el('div', { class: 'text-xs t-muted', style: 'margin-top:6px', text: '提示：保留「[[关键词]]」包裹规则与硬性规则（不问不答 / 不泄题 / 人文反馈）。' })
    ]));

    wrap.appendChild(el('div', { class: 'card', style: 'margin-bottom:16px' }, [
      el('div', { class: 'flex justify-between items-center', style: 'margin-bottom:8px' }, [
        el('div', { class: 'card-title', text: '出题策略提示词' }),
        quizReset
      ]),
      quizTa,
      el('div', { class: 'text-xs t-muted', style: 'margin-top:6px', text: '提示：保持「严格返回 JSON 数组」的输出格式约定。' })
    ]));

    const saveBtn = el('button', { class: 'btn btn-primary' }, '保存并生效');
    saveBtn.addEventListener('click', () => {
      store.state.prompts.front = frontTa.value;
      store.state.prompts.quiz = quizTa.value;
      store.save();
      utils.toast('提示词已保存并即时生效', 'ok');
    });
    wrap.appendChild(saveBtn);
    root.appendChild(wrap);
  }

  return { render };
})();
