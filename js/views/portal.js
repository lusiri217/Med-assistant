/* ============================================================
   views/portal.js —— 三端入口页
   ============================================================ */
window.App = window.App || {};
App.views = App.views || {};

App.views.portal = (function () {
  'use strict';
  const utils = App.utils;
  const el = utils.el;

  function render(root) {
    root.innerHTML = '';
    const wrap = el('div', { class: 'portal anim-fade' });

    wrap.appendChild(el('div', { class: 'portal-head' }, [
      el('h1', { text: '🩺 AI 模拟患者诊断教学平台' }),
      el('p', { text: '学生问诊 · 医院上传 · 管理配置 —— 三端一体的医学诊断训练系统' })
    ]));

    const grid = el('div', { class: 'portal-grid' });

    // 学生端
    grid.appendChild(el('div', {
      class: 'portal-card student', onClick: () => location.hash = '#/student/diagnosis'
    }, [
      el('div', { class: 'pc-icon', text: '🎓' }),
      el('h2', { text: '学生端' }),
      el('div', { class: 'card-sub', text: '面向医学生 / 规培生' }),
      el('ul', {}, [
        el('li', { text: '💬 与模拟患者对话问诊' }),
        el('li', { text: '📋 历史问诊记录与知识点总结' }),
        el('li', { text: '📝 题库练习与积分' })
      ])
    ]));

    // 管理端
    grid.appendChild(el('div', {
      class: 'portal-card', onClick: () => location.hash = '#/admin/api'
    }, [
      el('div', { class: 'pc-icon', text: '🛠️' }),
      el('h2', { text: '管理端' }),
      el('div', { class: 'card-sub', text: '面向教师 / 管理员' }),
      el('ul', {}, [
        el('li', { text: '🔑 API Key 与运行控制' }),
        el('li', { text: '⚙️ AI 参数与提示词' }),
        el('li', { text: '✅ 病例审核 / 题库 / 数据总览' })
      ])
    ]));

    // 医院端
    grid.appendChild(el('div', {
      class: 'portal-card hospital', onClick: () => location.hash = '#/hospital/upload'
    }, [
      el('div', { class: 'pc-icon', text: '🏥' }),
      el('h2', { text: '医院端' }),
      el('div', { class: 'card-sub', text: '面向临床医生' }),
      el('ul', {}, [
        el('li', { text: '📤 对话式病例上传' }),
        el('li', { text: '🔒 自动去隐私化结构化' }),
        el('li', { text: '🗂️ 我的病例管理' })
      ])
    ]));

    wrap.appendChild(grid);
    wrap.appendChild(el('div', { class: 'portal-foot' }, [
      el('span', { text: '提示：未配置 API Key 时自动进入演示模式，可完整体验全部流程。' })
    ]));

    root.appendChild(wrap);
  }

  return { render };
})();
