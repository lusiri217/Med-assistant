/* ============================================================
   views/student-diagnosis.js —— 学生端：诊断对话（微信风格）
   流程：选病例 → 随机外国患者 → 问诊（不问不答/不泄题/人文反馈）
        → 关键线索高亮可点击 → 结束诊断评分生成报告。
   ============================================================ */
window.App = window.App || {};
App.views = App.views || {};

App.views['student-diagnosis'] = (function () {
  'use strict';
  const utils = App.utils;
  const store = App.store;
  const api = App.api;
  const prompts = App.prompts;
  const score = App.score;
  const el = utils.el;

  let session = null;     // 当前会话
  let timer = null;

  function render(root) {
    session = null;
    if (timer) { clearInterval(timer); timer = null; }
    root.innerHTML = '';

    if (api.getMode() === 'blocked') {
      root.appendChild(el('div', { class: 'content-pad anim-fade' }, [
        el('div', { class: 'maintain-banner' }, '⛔ 系统维护中，AI 服务已暂停，暂不可开始诊断。请联系管理员恢复服务。')
      ]));
      return;
    }

    // 开始页
    const start = el('div', { class: 'content-pad anim-fade', style: 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%' }, [
      el('div', { class: 'empty' }, [
        el('div', { class: 'e-ico', text: '💬' }),
        el('h2', { style: 'margin:8px 0', text: '开始一次模拟问诊' }),
        el('p', { class: 't-2', text: '选择一例病例，与模拟患者对话，练习采集病史、识别关键线索并给出诊断。' }),
        el('button', { class: 'btn btn-primary btn-lg', style: 'margin-top:14px', onClick: () => openCasePicker(root) }, '开始诊断')
      ])
    ]);
    root.appendChild(start);
  }

  /* ---------- 病例选择面板 ---------- */
  function openCasePicker(root) {
    const cases = store.getPublishedCases();
    if (!cases.length) {
      utils.toast('暂无可练习的病例（请等待管理端发布）', 'warn'); return;
    }
    const types = ['全部', '心血管', '呼吸', '消化', '内分泌', '神经', '急诊', '其他'];
    const grid = el('div', { class: 'case-grid' });
    const filterBar = el('div', { class: 'case-filter' });

    function draw(filter) {
      grid.innerHTML = '';
      const list = filter === '全部' ? cases : cases.filter(c => (c.caseType || '其他') === filter);
      if (!list.length) { grid.appendChild(el('div', { class: 't-muted', text: '该分类暂无病例' })); return; }
      list.forEach(c => {
        const card = el('div', { class: 'case-pick' }, [
          el('div', { class: 'cp-title', text: c.title || '（无标题）' }),
          el('div', { class: 't-2 text-sm', text: c.chiefComplaint || '' }),
          el('div', { class: 'cp-meta' }, [
            el('span', { class: 'tag tag-primary', text: c.caseType || '其他' }),
            el('span', { class: 'tag', text: ({ easy: '简单', medium: '中等', hard: '困难' })[c.difficulty] || c.difficulty }),
            el('span', { class: 'tag tag-mint', text: '约 ' + ((c.keyClues || []).length + 3) + ' 轮' })
          ])
        ]);
        card.addEventListener('click', () => { m.close(); startSession(c, root); });
        grid.appendChild(card);
      });
    }
    types.forEach((t, i) => {
      const chip = el('button', { class: 'btn btn-sm ' + (i === 0 ? 'btn-primary' : 'btn-ghost'), text: t });
      chip.addEventListener('click', () => {
        filterBar.querySelectorAll('button').forEach(b => b.className = 'btn btn-sm btn-ghost');
        chip.className = 'btn btn-sm btn-primary';
        draw(t);
      });
      filterBar.appendChild(chip);
    });
    draw('全部');
    const body = el('div', {}, [el('div', { class: 'section-desc', text: '按类型筛选，选择病例开始问诊（部分病例有 10% 概率为外籍患者，需英语问诊）。' }), filterBar, grid]);
    const m = utils.modal({ title: '选择病例', body, size: 'lg' });
  }

  /* ---------- 开始会话 ---------- */
  function startSession(caseData, root) {
    const rate = (store.state.settings.behavior.foreignPatientRate != null) ? store.state.settings.behavior.foreignPatientRate : 0.1;
    const foreign = Math.random() < rate;
    session = {
      caseData, foreign,
      messages: [],
      discovered: new Set(),
      sessionAccum: { empathy: 0, repeatIrrelevant: 0 },
      startTime: Date.now(),
      scoreBefore: store.getStudent().score,
      ended: false
    };
    renderChat(root);
  }

  /* ---------- 渲染聊天界面 ---------- */
  function renderChat(root) {
    root.innerHTML = '';
    const c = session.caseData;
    const wrap = el('div', { class: 'chat anim-fade' });

    const head = el('div', { class: 'chat-head' }, [
      el('div', { class: 'ch-avatar', text: session.foreign ? '🌐' : '🧑' }),
      el('div', { class: 'ch-meta' }, [
        el('div', { class: 'ch-name', text: c.title || '模拟患者' }),
        el('div', { class: 'ch-status', id: 'clueStatus', text: clueText() })
      ]),
      el('div', { class: 'flex gap-sm items-center' }, [
        session.foreign ? el('span', { class: 'tag tag-warning', title: '外籍患者，请使用英语问诊', text: '🌐 英文' }) : null,
        el('button', { class: 'btn btn-ghost btn-sm', onClick: () => endDiagnosis(root) }, '结束诊断'),
        el('button', { class: 'btn btn-ghost btn-sm', onClick: () => saveDraftAndExit(root) }, '保存草稿')
      ].filter(Boolean))
    ]);
    wrap.appendChild(head);

    const body = el('div', { class: 'chat-body scroll-y', id: 'chatBody' });
    wrap.appendChild(body);

    // 开场白
    const opening = session.foreign
      ? "Hello doctor. I don't feel well... Could you ask me what you need to know?"
      : "（患者看上去有些不安，搓着衣角）大夫，我不太舒服……您问什么我就答什么。";
    pushMessage('patient', opening, body, true);

    const ta = el('textarea', { class: 'textarea', placeholder: session.foreign ? 'Ask the patient in English…' : '请输入问诊内容（Enter 发送，Shift+Enter 换行）', rows: 1 });
    const sendBtn = el('button', { class: 'btn btn-primary', text: '发送' });
    const foot = el('div', { class: 'chat-foot' }, [ta, sendBtn]);
    wrap.appendChild(foot);
    root.appendChild(wrap);

    // 计时
    timer = setInterval(() => { /* 计时仅用于结束时长统计，无需实时刷新 DOM */ }, 1000);

    function doSend() {
      const t = ta.value.trim();
      if (!t || session.ended) return;
      ta.value = '';
      sendMessage(t, body, ta, sendBtn);
    }
    sendBtn.addEventListener('click', doSend);
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
    });
  }

  function clueText() {
    const total = (session.caseData.keyClues || []).length;
    return '关键线索 ' + session.discovered.size + '/' + total;
  }

  /* ---------- 发送一条医生消息 ---------- */
  async function sendMessage(text, body, ta, sendBtn) {
    session.messages.push({ role: 'doctor', text });
    pushMessage('doctor', text, body);

    const tone = utils.analyzeTone(text);
    const prevDoctors = session.messages.filter(m => m.role === 'doctor');
    let repeatIrrelevant = false;
    if (tone.chitchat && prevDoctors.length >= 2) {
      const prev = utils.analyzeTone(prevDoctors[prevDoctors.length - 2].text);
      repeatIrrelevant = prev.chitchat;
    }

    const apiMessages = buildApiMessages();
    setBusy(true, ta, sendBtn);
    const typing = pushTyping(body);

    try {
      const result = await api.patientReply(apiMessages, {
        caseData: session.caseData, foreign: session.foreign,
        stream: store.state.settings.stream,
        onToken: (chunk) => { typing.querySelector('.bubble').insertAdjacentText('beforeend', chunk); body.scrollTop = body.scrollHeight; }
      });
      const content = result.content || '（无回应）';
      typing.remove();
      session.messages.push({ role: 'patient', text: content });
      pushMessage('patient', content, body, true);

      // 发现线索
      let discoveredNew = false;
      (session.caseData.keyClues || []).forEach(cl => {
        if (content.indexOf(cl.word) >= 0 || content.indexOf('[[' + cl.word + ']]') >= 0) {
          if (!session.discovered.has(cl.word)) { session.discovered.add(cl.word); discoveredNew = true; }
        }
      });
      const status = document.getElementById('clueStatus');
      if (status) status.textContent = clueText();
      score.applyTurn({ empathy: tone.empathy, rude: tone.rude, chitchat: tone.chitchat, repeatIrrelevant }, discoveredNew, session.sessionAccum);
    } catch (err) {
      typing.remove();
      const msg = (err && err.friendly) ? err.friendly : (err && err.message ? err.message : '出错了');
      pushMessage('patient', '（患者没有回应）' + msg, body);
      if (err && err.code === 'MAINTENANCE') {
        utils.toast('AI 服务已暂停', 'warn');
      }
    } finally {
      setBusy(false, ta, sendBtn);
      ta.focus();
    }
  }

  function buildApiMessages() {
    const sys = prompts.buildPatientPrompt(session.caseData, store.state.settings, enabledResources(), session.foreign);
    const msgs = [{ role: 'system', content: sys }];
    session.messages.forEach(m => {
      msgs.push({ role: m.role === 'doctor' ? 'user' : 'assistant', content: m.text });
    });
    return msgs;
  }
  function enabledResources() {
    return store.state.resources.filter(r => r.enabled).map(r => ({ url: r.url, note: r.note }));
  }

  /* ---------- 气泡渲染 ---------- */
  function pushMessage(role, text, body, isPatient) {
    const m = el('div', { class: 'msg ' + (role === 'doctor' ? 'doctor' : 'patient') }, [
      el('div', { class: 'm-avatar', text: role === 'doctor' ? '🧑‍⚕️' : (session.foreign ? '🌐' : '🧑') }),
      el('div', {}, [
        el('div', { class: 'bubble', html: utils.renderClues(text) }),
        el('div', { class: 'm-time', text: utils.fmtTime() })
      ])
    ]);
    body.appendChild(m);
    body.scrollTop = body.scrollHeight;
    if (isPatient) bindClueClicks(m);
    return m;
  }
  function pushTyping(body) {
    const m = el('div', { class: 'msg patient' }, [
      el('div', { class: 'm-avatar', text: session.foreign ? '🌐' : '🧑' }),
      el('div', {}, [el('div', { class: 'bubble' }, [el('div', { class: 'typing' }, [el('span'), el('span'), el('span')])])])
    ]);
    body.appendChild(m); body.scrollTop = body.scrollHeight; return m;
  }
  function bindClueClicks(node) {
    node.querySelectorAll('.clue-tag').forEach(tag => {
      tag.addEventListener('click', () => openClueDrawer(tag.getAttribute('data-clue')));
    });
  }
  function openClueDrawer(word) {
    const cl = (session.caseData.keyClues || []).find(x => x.word === word);
    const body = el('div', {}, [
      el('div', { class: 'fw-700', style: 'font-size:16px;margin-bottom:8px', text: word }),
      el('div', { class: 't-2', text: cl ? (cl.clinicalInfo || '（无补充说明）') : '（无补充说明）' })
    ]);
    utils.modal({ title: '关键线索', body, size: 'lg' });
  }

  function setBusy(b, ta, sendBtn) {
    if (ta) ta.disabled = b;
    if (sendBtn) sendBtn.disabled = b;
  }

  /* ---------- 结束诊断 ---------- */
  async function endDiagnosis(root) {
    if (session.ended) return;
    const diag = el('textarea', { class: 'textarea', placeholder: '请输入你的最终诊断' });
    const basis = el('textarea', { class: 'textarea', placeholder: '诊断依据' });
    const diff = el('textarea', { class: 'textarea', placeholder: '需鉴别的疾病（逗号分隔）' });
    const form = el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: '最终诊断' }), diag]),
      el('div', { class: 'field' }, [el('label', { text: '诊断依据' }), basis]),
      el('div', { class: 'field' }, [el('label', { text: '鉴别诊断' }), diff])
    ]);
    const foot = el('div', { class: 'flex gap-sm', style: 'justify-content:flex-end' }, [
      el('button', { class: 'btn btn-ghost', onClick: () => m.close() }, '取消'),
      el('button', { class: 'btn btn-primary', onClick: () => submit() })
    ]);
    const m = utils.modal({ title: '提交诊断', body: form, footer: foot, size: 'lg' });

    async function submit() {
      if (!diag.value.trim()) { utils.toast('请填写最终诊断', 'warn'); return; }
      m.close();
      session.ended = true;
      if (timer) { clearInterval(timer); timer = null; }

      const finalDiag = { diagnosis: diag.value.trim(), basis: basis.value.trim(), differential: diff.value.trim() };
      const dialog = session.messages.slice();
      dialog._final = finalDiag;

      utils.toast('AI 正在评分…', 'info');
      let report;
      try {
        report = await api.scoreDiagnosis(dialog, session.caseData);
      } catch (e) {
        report = { diagnosisCorrect: false, comment: '评分服务不可用，仅记录会话。', clueRate: 0, empathyScore: 0, reasoningScore: 0, knowledgeSummary: '' };
      }
      // 诊断积分
      score.applyDiagnosisResult(report);
      finalizeRecord(finalDiag, report, root);
    }
  }

  function finalizeRecord(finalDiag, report, root) {
    const duration = Math.round((Date.now() - session.startTime) / 1000);
    const rec = {
      id: utils.uid('rec'),
      caseId: session.caseData.id,
      caseTitle: session.caseData.title || '（无标题）',
      startedAt: utils.fmtDateTime(new Date(session.startTime)),
      endedAt: utils.fmtDateTime(),
      duration: duration,
      dialog: session.messages.slice(),
      finalDiagnosis: finalDiag,
      report: report,
      foreign: session.foreign,
      cluesFound: Array.from(session.discovered),
      scoreDelta: store.getStudent().score - session.scoreBefore,
      status: 'done'
    };
    store.addRecord(rec);
    showReport(rec, root);
  }

  function saveDraftAndExit(root) {
    const rec = {
      id: utils.uid('rec'),
      caseId: session.caseData.id,
      caseTitle: session.caseData.title || '（无标题）',
      startedAt: utils.fmtDateTime(new Date(session.startTime)),
      endedAt: utils.fmtDateTime(),
      duration: Math.round((Date.now() - session.startTime) / 1000),
      dialog: session.messages.slice(),
      finalDiagnosis: null,
      report: null,
      foreign: session.foreign,
      cluesFound: Array.from(session.discovered),
      scoreDelta: 0,
      status: 'draft'
    };
    store.addRecord(rec);
    utils.toast('草稿已保存', 'ok');
    location.hash = '#/student/records';
  }

  /* ---------- 问诊报告 ---------- */
  function showReport(rec, root) {
    const r = rec.report || {};
    const correctness = r.diagnosisCorrect === true ? '✅ 正确'
      : (r.diagnosisCorrect === 'partial' ? '🟡 部分正确' : '❌ 错误');
    const body = el('div', {}, [
      el('div', { class: 'report' }, [
        el('div', { class: 'r-row' }, [el('div', { class: 'r-key', text: '诊断结论' }), el('div', { class: 'r-val', text: correctness })]),
        el('div', { class: 'r-row' }, [el('div', { class: 'r-key', text: '关键线索发现率' }), el('div', { class: 'r-val' }, [
          el('div', { class: 'progress', style: 'margin-bottom:4px' }, [el('i', { style: 'width:' + (Math.round((r.clueRate || 0) * 100)) + '%' })]),
          el('span', { class: 'text-sm', text: Math.round((r.clueRate || 0) * 100) + '% （' + rec.cluesFound.length + '/' + ((session && session.caseData.keyClues ? session.caseData.keyClues.length : rec.cluesFound.length)) + '）' })
        ])]),
        el('div', { class: 'r-row' }, [el('div', { class: 'r-key', text: '人文关怀评分' }), el('div', { class: 'r-val', text: (r.empathyScore != null ? r.empathyScore : '—') + ' / 100' })]),
        el('div', { class: 'r-row' }, [el('div', { class: 'r-key', text: '问诊条理评分' }), el('div', { class: 'r-val', text: (r.reasoningScore != null ? r.reasoningScore : '—') + ' / 100' })]),
        el('div', { class: 'r-row' }, [el('div', { class: 'r-key', text: '本次积分变动' }), el('div', { class: 'r-val', text: (rec.scoreDelta >= 0 ? '+' : '') + rec.scoreDelta + '（当前 ' + store.getStudent().score + '）' })]),
        el('div', { class: 'r-row' }, [el('div', { class: 'r-key', text: '总评' }), el('div', { class: 'r-val', text: r.comment || '—' })])
      ]),
      el('div', { class: 'section-title', style: 'font-size:15px;margin-top:16px', text: '涉及知识点小结' }),
      el('div', { class: 'card-sub', text: r.knowledgeSummary || '（无）' })
    ]);
    const foot = el('div', { class: 'flex gap-sm', style: 'justify-content:flex-end' }, [
      el('button', { class: 'btn btn-ghost', onClick: () => { m.close(); location.hash = '#/student/records'; } }, '查看记录'),
      el('button', { class: 'btn btn-primary', onClick: () => { m.close(); location.hash = '#/student/quiz'; } }, '针对该病例做题')
    ]);
    const m = utils.modal({ title: '问诊报告', body, footer: foot, size: 'lg' });
  }

  return { render };
})();
