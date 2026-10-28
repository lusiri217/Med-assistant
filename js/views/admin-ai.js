/* ============================================================
   views/admin-ai.js —— 管理端：AI 参数 / Token 限制 / 调用要求 / 行为开关
   保存即时生效。
   ============================================================ */
window.App = window.App || {};
App.views = App.views || {};

App.views['admin-ai'] = (function () {
  'use strict';
  const utils = App.utils;
  const store = App.store;
  const el = utils.el;

  function render(root) {
    root.innerHTML = '';
    const wrap = el('div', { class: 'content-pad anim-fade', style: 'max-width:820px' });
    wrap.appendChild(el('div', { class: 'section-title', text: 'AI 参数管理' }));
    wrap.appendChild(el('div', { class: 'section-desc', text: 'Token 限制与调用要求；系统级行为开关将写入患者系统提示词。修改即时生效。' }));

    const s = store.state.settings;

    /* Token 限制 */
    const tCard = el('div', { class: 'card', style: 'margin-bottom:16px' }, [el('div', { class: 'card-title', text: 'Token 限制' })]);
    tCard.appendChild(numField('单次请求最大输出 token（默认 1000）', 'maxOutTokens', s.maxOutTokens));
    tCard.appendChild(numField('单次会话累计 token 上限（默认 30000，超出终止会话）', 'sessionTokenLimit', s.sessionTokenLimit));
    tCard.appendChild(numField('单日总量上限（0 = 不限）', 'dailyTokenLimit', s.dailyTokenLimit));

    /* 调用要求 */
    const cCard = el('div', { class: 'card', style: 'margin-bottom:16px' }, [el('div', { class: 'card-title', text: '调用要求' })]);
    cCard.appendChild(numField('temperature（0~1，默认 0.7）', 'temperature', s.temperature, 0, 1, 0.1));
    cCard.appendChild(numField('top_p（0~1，默认 1）', 'topP', s.topP, 0, 1, 0.05));
    cCard.appendChild(numField('最大回复字数（0 = 不限）', 'maxReplyChars', s.maxReplyChars));
    cCard.appendChild(numField('超时时间（毫秒，默认 30000）', 'timeoutMs', s.timeoutMs));
    cCard.appendChild(numField('失败重试次数（默认 2）', 'retries', s.retries));
    cCard.appendChild(switchRow('流式输出（SSE）', 'stream', s.stream, '开启后逐字显示患者回复'));

    /* 系统级行为开关 */
    const b = s.behavior;
    const bCard = el('div', { class: 'card' }, [el('div', { class: 'card-title', text: '系统级行为开关（写入患者提示词）' })]);
    bCard.appendChild(switchRow('患者只答不问、不主动给信息', 'patientOnlyAnswer', b.patientOnlyAnswer));
    bCard.appendChild(switchRow('拒绝回答与临床诊断无关的话题', 'refuseIrrelevant', b.refuseIrrelevant));
    bCard.appendChild(switchRow('绝不直接告知诊断结论', 'neverReveal', b.neverReveal));
    bCard.appendChild(switchRow('使用通俗语言', 'plainLanguage', b.plainLanguage));
    bCard.appendChild(switchRow('对医生人文关怀语言作出情绪反馈', 'empathyFeedback', b.empathyFeedback));

    // 外国患者概率
    const rateField = el('div', { class: 'field' }, [
      el('label', { text: '外国患者概率（默认 10%，学生端随机触发英文问诊）' }),
      el('div', { class: 'input-group' }, [
        (function () {
          const inp = el('input', { class: 'input', type: 'number', min: '0', max: '100', step: '5', value: Math.round((b.foreignPatientRate || 0.1) * 100) });
          inp.dataset.key = 'foreignPatientRate';
          return inp;
        })(),
        el('span', { class: 't-muted', text: '%' })
      ])
    ]);
    bCard.appendChild(rateField);

    /* 保存 */
    const saveBtn = el('button', { class: 'btn btn-primary', style: 'margin-top:16px' }, '保存并生效');
    saveBtn.addEventListener('click', () => {
      const nums = tCard.querySelectorAll('input[type=number]');
      s.maxOutTokens = +nums[0].value; s.sessionTokenLimit = +nums[1].value; s.dailyTokenLimit = +nums[2].value;
      const cn = cCard.querySelectorAll('input[type=number]');
      s.temperature = +cn[0].value; s.topP = +cn[1].value; s.maxReplyChars = +cn[2].value;
      s.timeoutMs = +cn[3].value; s.retries = +cn[4].value;
      cCard.querySelectorAll('.switch input').forEach(sw => {
        if (sw.dataset.key === 'stream') s.stream = sw.checked;
      });
      bCard.querySelectorAll('.switch input').forEach(sw => {
        const k = sw.dataset.key;
        if (k === 'foreignPatientRate') return;
        b[k] = sw.checked;
      });
      const rateInput = bCard.querySelector('input[data-key=foreignPatientRate]');
      b.foreignPatientRate = Math.max(0, Math.min(1, (+rateInput.value || 0) / 100));
      store.save();
      utils.toast('已保存并即时生效', 'ok');
    });

    wrap.appendChild(tCard); wrap.appendChild(cCard); wrap.appendChild(bCard); wrap.appendChild(saveBtn);
    root.appendChild(wrap);
  }

  function numField(label, key, val, min, max, step) {
    const inp = el('input', { class: 'input', type: 'number', value: val });
    if (min != null) inp.min = min; if (max != null) inp.max = max; if (step != null) inp.step = step;
    return el('div', { class: 'field' }, [el('label', { text: label }), inp]);
  }
  function switchRow(label, key, checked, desc) {
    const sw = el('input', { type: 'checkbox' });
    if (checked) sw.checked = true;
    sw.dataset.key = key;
    return el('div', { class: 'switch-row' }, [
      el('div', {}, [el('div', { class: 'sr-label', text: label }), desc ? el('div', { class: 'sr-desc', text: desc }) : null]),
      el('label', { class: 'switch' }, [sw, el('span', { class: 'slider' })])
    ]);
  }

  return { render };
})();
