/* ============================================================
   views/admin-api.js —— 管理端：API Key 与运行控制
   要点：Key 密码型输入、掩码、👁 短暂显示、加密存储、立即抹除、
         暂停/恢复全局调用、状态灯、调用统计。Key 明文绝不出现在
         其他页面 / 日志 / URL。
   ============================================================ */
window.App = window.App || {};
App.views = App.views || {};

App.views['admin-api'] = (function () {
  'use strict';
  const utils = App.utils;
  const store = App.store;
  const api = App.api;
  const crypto = App.crypto;
  const el = utils.el;

  function render(root) {
    root.innerHTML = '';
    const wrap = el('div', { class: 'content-pad anim-fade', style: 'max-width:760px' });
    wrap.appendChild(el('div', { class: 'section-title', text: 'API Key 与运行控制' }));
    wrap.appendChild(el('div', { class: 'section-desc', text: 'Key 经 Web Crypto（AES-GCM）加密后存入 localStorage；纯前端方案仅适合教学演示，接入真实数据前请改为后端代理。' }));

    const c = store.state.config;

    /* 状态卡片 */
    const statusCls = c.paused ? 'stop' : (c.apiEnabled ? 'run' : 'off');
    const statusTxt = c.paused ? '已停止' : (c.apiEnabled ? '运行中' : '未配置');
    const statCard = el('div', { class: 'card', style: 'margin-bottom:16px;display:flex;align-items:center;gap:14px' }, [
      el('span', { class: 'dot ' + statusCls, style: 'width:14px;height:14px' }),
      el('div', { class: 'flex-1' }, [
        el('div', { class: 'fw-700', text: '运行状态：' + statusTxt }),
        el('div', { class: 'text-sm t-muted', text: '最近调用：' + (store.state.runtime.lastCall || '—') + '　|　今日调用：' + store.state.runtime.todayCalls + ' 次　|　累计 Token：' + store.state.runtime.totalTokens })
      ])
    ]);
    wrap.appendChild(statCard);

    /* 表单卡片 */
    const card = el('div', { class: 'card' });

    // API Key
    const keyInput = el('input', { class: 'input', type: 'password', placeholder: c.apiKeyEnc ? '已加密保存，输入新 Key 可覆盖' : '粘贴你的 OpenAI 兼容 API Key', autocomplete: 'off' });
    const eyeBtn = el('button', { class: 'affix-btn', type: 'button', title: '短暂显示', text: '👁' });
    eyeBtn.addEventListener('click', async () => {
      if (keyInput.type === 'password') {
        // 若已有加密 Key，解密后短暂显示；否则显示当前输入
        if (keyInput.value) { keyInput.type = 'text'; }
        else if (c.apiKeyEnc) {
          const dec = await crypto.decrypt(c.apiKeyEnc);
          keyInput.type = 'text'; keyInput.value = dec; keyInput.disabled = true;
          setTimeout(() => { keyInput.type = 'password'; keyInput.value = ''; keyInput.disabled = false; }, 3000);
        } else { keyInput.type = 'text'; }
      } else { keyInput.type = 'password'; if (c.apiKeyEnc && !keyInput.value) keyInput.value = ''; }
    });
    const copyBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '复制（打码）' });
    copyBtn.addEventListener('click', () => {
      const masked = c.apiKeyEnc ? utils.maskSecret('sk-xxxxxxxxxxxxxxxxxxxxxxxx') : '（未配置）';
      utils.copyText(masked).then(() => utils.toast('已复制打码后的占位文本', 'info'));
    });

    card.appendChild(el('div', { class: 'field' }, [
      el('label', { text: 'API Key（密码型，默认掩码）' }),
      el('div', { class: 'input-affix' }, [keyInput, eyeBtn]),
      el('div', { class: 'text-xs t-muted', style: 'margin-top:6px' }, [copyBtn])
    ]));

    // Base URL
    card.appendChild(el('div', { class: 'field' }, [
      el('label', { text: 'Base URL（OpenAI 兼容）' }),
      el('input', { class: 'input', value: c.baseUrl || '', placeholder: 'https://api.openai.com/v1' })
    ]));
    // Model
    card.appendChild(el('div', { class: 'field' }, [
      el('label', { text: '模型名称' }),
      el('input', { class: 'input', value: c.model || '', placeholder: 'gpt-4o-mini' })
    ]));

    // 按钮组
    const saveBtn = el('button', { class: 'btn btn-primary' }, '保存并启用');
    const eraseBtn = el('button', { class: 'btn btn-danger' }, '立即抹除 Key');
    const pauseBtn = el('button', { class: 'btn ' + (c.paused ? 'btn-mint' : 'btn-warning') }, c.paused ? '▶ 恢复 API 调用' : '⏸ 暂停 API 调用');

    saveBtn.addEventListener('click', async () => {
      const keyVal = keyInput.value.trim();
      const baseUrl = card.querySelectorAll('.input')[1].value.trim();
      const model = card.querySelectorAll('.input')[2].value.trim();
      store.state.config.baseUrl = baseUrl || 'https://api.openai.com/v1';
      store.state.config.model = model || 'gpt-4o-mini';
      if (keyVal) {
        try {
          store.state.config.apiKeyEnc = await crypto.encrypt(keyVal);
          store.state.config.cryptoStrong = crypto.isStrong();
        } catch (e) {
          utils.toast('加密失败：' + (e.message || e), 'err'); return;
        }
      }
      store.state.config.apiEnabled = true;
      store.state.config.paused = false;   // 保存并启用：解除暂停，全局开关置 on
      store.save();
      utils.toast('已保存并启用' + (crypto.supported() ? '（AES-GCM 加密）' : '（已混淆，建议用本地服务器以获得 AES-GCM）'), 'ok');
      if (App.router && App.router.refreshTopbar) App.router.refreshTopbar();
      render(root);
    });

    eraseBtn.addEventListener('click', () => {
      utils.confirm({
        title: '立即抹除 Key', message: '将清空本地 Key 并停止全部 AI 调用，且不可恢复。确认？', danger: true, okText: '抹除',
        onOk: () => {
          store.state.config.apiKeyEnc = null;
          store.state.config.apiEnabled = false;
          store.state.config.paused = false;
          store.save();
          api.clearKeyCache();
          utils.toast('Key 已抹除，AI 调用已中断', 'ok');
          if (App.router && App.router.refreshTopbar) App.router.refreshTopbar();
          render(root);
        }
      });
    });

    pauseBtn.addEventListener('click', () => {
      store.state.config.paused = !store.state.config.paused;
      store.save();
      api.clearKeyCache();
      utils.toast(store.state.config.paused ? '已暂停全部 AI 调用' : '已恢复 AI 调用', store.state.config.paused ? 'warn' : 'ok');
      if (App.router && App.router.refreshTopbar) App.router.refreshTopbar();
      render(root);
    });

    card.appendChild(el('div', { class: 'flex gap-sm wrap', style: 'margin-top:6px' }, [saveBtn, eraseBtn, pauseBtn]));
    wrap.appendChild(card);

    // 安全提示
    wrap.appendChild(el('div', { class: 'card', style: 'margin-top:16px;background:var(--c-surface-2)' }, [
      el('div', { class: 'fw-600', text: '🔐 Key 保护说明' }),
      el('ul', { class: 'text-sm t-2', style: 'margin-top:6px;padding-left:18px;list-style:disc' }, [
        el('li', { text: 'Key 仅在内存闭包中短暂存在，页面切换即清空；localStorage 中均为密文。' }),
        el('li', { text: '日志、报错、Toast、URL 中均不含 Key 明文。' }),
        el('li', { text: '当前加密强度：' + (crypto.supported() ? 'AES-GCM（需在 https/localhost 下）' : '异或混淆（file:// 降级，仅防随手查看）') }),
        el('li', { text: '接入真实医院数据前，务必改为「前端→自家后端→LLM」代理转发。' })
      ])
    ]));

    root.appendChild(wrap);
  }

  return { render };
})();
