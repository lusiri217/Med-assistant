/* ============================================================
   router.js —— hash 路由 + 三端框架外壳
   职责：解析 #/role/view，构建侧边栏/顶栏/内容区/底部 Tab，
         路由切换时清空 api.js 闭包中的 Key 引用（安全），刷新后停留当前页。
   挂载到 window.App.router（DOMContentLoaded 时启动）
   ============================================================ */
window.App = window.App || {};

App.router = (function () {
  'use strict';
  const utils = App.utils;
  const store = App.store;
  const api = App.api;
  const el = utils.el;

  // 三端导航配置
  const ROLES = {
    student: {
      label: '学生端', icon: '🎓',
      items: [
        { hash: '#/student/diagnosis', label: '诊断对话', icon: '💬' },
        { hash: '#/student/records', label: '历史记录', icon: '📋' },
        { hash: '#/student/quiz', label: '题库练习', icon: '📝' }
      ]
    },
    hospital: {
      label: '医院端', icon: '🏥',
      items: [
        { hash: '#/hospital/upload', label: '病例上传', icon: '📤' },
        { hash: '#/hospital/cases', label: '我的病例', icon: '🗂️' }
      ]
    },
    admin: {
      label: '管理端', icon: '🛠️',
      items: [
        { hash: '#/admin/api', label: 'API 与运行', icon: '🔑' },
        { hash: '#/admin/ai', label: 'AI 参数', icon: '⚙️' },
        { hash: '#/admin/resources', label: '资源白名单', icon: '🌐' },
        { hash: '#/admin/prompts', label: '提示词管理', icon: '📜' },
        { hash: '#/admin/questions', label: '题库编辑', icon: '📚' },
        { hash: '#/admin/cases', label: '病例审核', icon: '✅' },
        { hash: '#/admin/dashboard', label: '数据总览', icon: '📊' }
      ]
    }
  };
  const DEFAULT_VIEW = { student: 'diagnosis', hospital: 'upload', admin: 'api' };

  let refs = {};   // 当前外壳引用，用于局部刷新（如积分飘字、状态灯）

  /* ---------- 启动 ---------- */
  function start() {
    App.store.load();   // 启动时加载/初始化本地数据（含预置示例病例与题库）
    window.addEventListener('hashchange', route);
    route();
  }

  /* ---------- 路由分发 ---------- */
  function route() {
    api.clearKeyCache();   // 关键：切换页面即清空内存中的 Key 引用

    let hash = location.hash || '#/portal';
    if (hash === '#' || hash === '') hash = '#/portal';
    const parts = hash.replace(/^#\//, '').split('/');
    const role = parts[0];
    let view = parts[1];

    if (role === 'portal' || !ROLES[role]) {
      const app = document.getElementById('app');
      app.innerHTML = '';
      if (App.views.portal && App.views.portal.render) App.views.portal.render(app);
      else app.appendChild(el('div', { class: 'empty' }, el('p', { text: '入口页面缺失' })));
      return;
    }
    if (!view) view = DEFAULT_VIEW[role];
    renderShell(role, view);
  }

  /* ---------- 构建外壳 ---------- */
  function renderShell(role, view) {
    const cfg = ROLES[role];
    const app = document.getElementById('app');
    app.innerHTML = '';
    const shell = el('div', { class: 'shell anim-fade' });

    // 侧边栏
    const sidebar = el('aside', { class: 'sidebar' });
    sidebar.appendChild(el('div', { class: 'sidebar-brand' }, [
      el('div', { class: 'logo', text: cfg.icon }),
      el('span', { class: 'txt', text: 'AI 模拟患者平台' })
    ]));
    sidebar.appendChild(el('div', { class: 'sidebar-role', text: cfg.label }));
    const nav = el('nav', { class: 'nav' });
    const curHash = '#/' + role + '/' + view;
    cfg.items.forEach(it => {
      const item = el('div', {
        class: 'nav-item' + (it.hash === curHash ? ' active' : ''),
        'data-hash': it.hash, onClick: () => { location.hash = it.hash; }
      }, [
        el('span', { class: 'ni-ico', text: it.icon }),
        el('span', { class: 'ni-label', text: it.label })
      ]);
      nav.appendChild(item);
    });
    sidebar.appendChild(nav);
    sidebar.appendChild(el('div', { class: 'sidebar-foot' }, [
      el('button', { class: 'btn btn-ghost btn-block btn-sm', onClick: () => location.hash = '#/portal' }, '← 返回入口')
    ]));
    shell.appendChild(sidebar);

    // 主区域
    const main = el('div', { class: 'main' });
    const topbar = buildTopbar(role, view, cfg, sidebar);
    main.appendChild(topbar);
    const content = el('div', { class: 'content scroll-y' });
    const banner = buildBanner(role);
    if (banner) content.appendChild(banner);
    main.appendChild(content);
    shell.appendChild(main);

    // 底部 Tab（移动端）
    const tabbar = el('nav', { class: 'tabbar' });
    cfg.items.forEach(it => {
      tabbar.appendChild(el('div', {
        class: 'tb-item' + (it.hash === curHash ? ' active' : ''),
        'data-hash': it.hash, onClick: () => { location.hash = it.hash; }
      }, [
        el('div', { class: 'ti-ico', text: it.icon }),
        el('div', { text: it.label })
      ]));
    });
    shell.appendChild(tabbar);

    // 侧边栏遮罩（移动端）
    const mask = el('div', {
      class: 'side-mask',
      onClick: () => { sidebar.classList.remove('mobile-open'); mask.style.display = 'none'; }
    });
    shell.appendChild(mask);

    app.appendChild(shell);

    // 保存引用，供局部刷新
    refs = {
      role, view, sidebar, mask,
      scorePill: topbar.querySelector('.score-pill'),
      statusDot: topbar.querySelector('.status-dot')
    };

    // 渲染视图
    const mod = App.views[role + '-' + view];
    if (mod && mod.render) {
      try { mod.render(content); }
      catch (e) { content.appendChild(el('div', { class: 'empty' }, [el('div', { class: 'e-ico', text: '⚠️' }), el('p', { text: '页面渲染出错：' + (e && e.message || e) })])); }
    } else {
      content.appendChild(el('div', { class: 'empty' }, [el('div', { class: 'e-ico', text: '⚠️' }), el('p', { text: '页面不存在：' + role + '/' + view })]));
    }
  }

  /* ---------- 顶栏 ---------- */
  function buildTopbar(role, view, cfg, sidebar) {
    const item = cfg.items.find(i => i.hash === '#/' + role + '/' + view) || cfg.items[0];
    const tb = el('div', { class: 'topbar' });
    const hb = el('button', {
      class: 'hamburger', 'aria-label': '菜单',
      onClick: () => {
        sidebar.classList.add('mobile-open');
        const mask = sidebar.parentElement.querySelector('.side-mask');
        if (mask) mask.style.display = 'block';
      }
    }, '☰');
    tb.appendChild(hb);
    tb.appendChild(el('div', {}, [
      el('div', { class: 'tb-title', text: item.label }),
      el('div', { class: 'tb-sub', text: cfg.label })
    ]));
    tb.appendChild(el('div', { class: 'tb-spacer' }));
    tb.appendChild(buildStatus());
    if (role === 'student') tb.appendChild(buildScorePill());
    tb.appendChild(el('button', { class: 'btn btn-ghost btn-sm', 'aria-label': '退出', onClick: () => location.hash = '#/portal' }, '退出'));
    return tb;
  }

  function buildStatus() {
    const c = store.state.config;
    let cls = 'off', txt = '未配置';
    if (c.paused) { cls = 'stop'; txt = '已停止'; }
    else if (c.apiEnabled) { cls = 'run'; txt = '运行中'; }
    const dot = el('span', { class: 'dot ' + cls });
    return el('div', { class: 'status-dot', title: '运行状态' }, [dot, el('span', { text: txt })]);
  }

  function buildScorePill() {
    const s = store.getStudent().score;
    return el('div', { class: 'score-pill', title: '当前积分' }, [
      el('span', { text: '🪙' }), el('span', { text: String(s) })
    ]);
  }

  /* ---------- 顶部横幅（演示 / 维护） ---------- */
  function buildBanner(role) {
    if (role === 'admin') return null;
    const mode = api.getMode();
    if (mode === 'blocked') {
      return el('div', { class: 'maintain-banner', style: 'margin:14px;' }, '⛔ 系统维护中，AI 服务已暂停。学生端问诊与医院端上传暂不可用，请联系管理员恢复。');
    }
    if (mode === 'mock') {
      return el('div', { class: 'demo-banner', style: 'margin:14px 14px 0;' }, [
        el('span', { text: '🧪' }),
        el('span', { text: '当前为演示模式：未配置 API Key，使用本地模拟数据完整走通流程。到管理端「API 与运行」配置 Key 后可接入真实大模型。' })
      ]);
    }
    return null;
  }

  /* ---------- 局部刷新（积分飘字后同步顶栏） ---------- */
  function refreshTopbar() {
    if (refs.statusDot) {
      const c = store.state.config;
      let cls = 'off', txt = '未配置';
      if (c.paused) { cls = 'stop'; txt = '已停止'; }
      else if (c.apiEnabled) { cls = 'run'; txt = '运行中'; }
      refs.statusDot.innerHTML = '';
      refs.statusDot.appendChild(el('span', { class: 'dot ' + cls }));
      refs.statusDot.appendChild(el('span', { text: txt }));
    }
    if (refs.scorePill && refs.role === 'student') {
      const s = store.getStudent().score;
      const numSpan = refs.scorePill.querySelector('span:last-child');
      if (numSpan) numSpan.textContent = String(s);
    }
  }

  return { start, route, refreshTopbar, ROLES, buildBanner };
})();

/* 启动路由（DOM 就绪后） */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.router.start());
} else {
  App.router.start();
}
