/* ============================================================
   views/hospital-upload.js —— 医院端：对话式病例上传
   左：医生上传的原始内容；右：AI 去隐私化 + 结构化结果。
   支持文本 / PDF（pdf.js）/ 图片（base64，演示模式提示补文字）。
   ============================================================ */
window.App = window.App || {};
App.views = App.views || {};

App.views['hospital-upload'] = (function () {
  'use strict';
  const utils = App.utils;
  const store = App.store;
  const api = App.api;
  const el = utils.el;

  let draftRaw = '';     // 累计原始文本
  let currentCase = null; // 最近一次结构化结果
  let busy = false;

  function render(root) {
    draftRaw = ''; currentCase = null; busy = false;
    root.innerHTML = '';
    const wrap = el('div', { class: 'chat anim-fade' });

    // 顶栏
    const head = el('div', { class: 'chat-head' }, [
      el('div', { class: 'ch-avatar', text: '🏥' }),
      el('div', { class: 'ch-meta' }, [
        el('div', { class: 'ch-name', text: '病例上传（对话式）' }),
        el('div', { class: 'ch-status', text: '粘贴病历，AI 自动去隐私化并结构化' })
      ]),
      el('button', { class: 'btn btn-ghost btn-sm', onClick: () => render(root) }, '清空重来')
    ]);
    wrap.appendChild(head);

    const body = el('div', { class: 'chat-body scroll-y' });
    wrap.appendChild(body);

    // 维护模式拦截
    if (api.getMode() === 'blocked') {
      body.appendChild(el('div', { class: 'maintain-banner' }, '⛔ 系统维护中，AI 服务已暂停，病例上传暂时不可用。'));
      root.appendChild(wrap);
      return;
    }

    // 底部输入
    const ta = el('textarea', { class: 'textarea', placeholder: '在此粘贴病历文本，或点击下方按钮上传 PDF / 图片…', rows: 2 });
    const sendBtn = el('button', { class: 'btn btn-primary', 'aria-label': '发送文本' }, '发送');
    const pdfBtn = el('button', { class: 'btn btn-ghost btn-sm', 'aria-label': '上传 PDF' }, '📄 PDF');
    const imgBtn = el('button', { class: 'btn btn-ghost btn-sm', 'aria-label': '上传图片' }, '🖼️ 图片');
    const submitBtn = el('button', { class: 'btn btn-mint', 'aria-label': '提交到平台', disabled: 'true' }, '提交到平台');

    const foot = el('div', { class: 'chat-foot' }, [
      el('div', { class: 'flex-col gap-sm full' }, [
        el('div', { class: 'flex gap-sm wrap' }, [pdfBtn, imgBtn, submitBtn]),
        ta
      ]),
      sendBtn
    ]);
    wrap.appendChild(foot);
    root.appendChild(wrap);

    // 隐藏文件输入
    const pdfInput = el('input', { type: 'file', accept: '.pdf', style: 'display:none' });
    const imgInput = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    wrap.appendChild(pdfInput); wrap.appendChild(imgInput);

    // 开场白
    addAI(body, el('div', {}, [
      el('p', { text: '您好，我是病历结构化助手。请把患者病历粘贴到下方，或上传 PDF / 图片，我会自动去隐私化并整理为结构化病例。' })
    ]), false);

    /* ---- 事件 ---- */
    sendBtn.addEventListener('click', () => {
      const t = ta.value.trim();
      if (!t) return;
      ta.value = '';
      handleRaw(t, body);
    });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendBtn.click(); }
    });
    pdfBtn.addEventListener('click', () => pdfInput.click());
    imgBtn.addEventListener('click', () => imgInput.click());
    pdfInput.addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      pdfInput.value = '';
      const txt = await readPdf(f);
      if (txt == null) { utils.toast('PDF 解析需联网加载 pdf.js，请直接粘贴文本', 'warn'); return; }
      if (!txt.trim()) { utils.toast('未能从 PDF 提取到文字', 'warn'); return; }
      handleRaw(txt, body);
    });
    imgInput.addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      imgInput.value = '';
      const reader = new FileReader();
      reader.onload = () => {
        addMe(body, el('div', {}, [el('p', { text: '🖼️ [图片已上传：' + f.name + ']' })]));
        addAI(body, el('div', {}, [el('p', { text: '（演示模式不支持图片识别，请补充一段文字描述，我会据此结构化。）' })]), false);
        body.scrollTop = body.scrollHeight;
      };
      reader.readAsDataURL(f);
    });
    submitBtn.addEventListener('click', () => submitCase(body));

    function setBusy(b) {
      busy = b;
      sendBtn.disabled = b; pdfBtn.disabled = b; imgBtn.disabled = b; submitBtn.disabled = b || !currentCase;
    }

    async function handleRaw(text, body) {
      if (busy) return;
      draftRaw = (draftRaw ? draftRaw + '\n' : '') + text;
      addMe(body, el('div', {}, [el('p', { text: text.length > 400 ? text.slice(0, 400) + '…' : text })]));
      setBusy(true);
      // 处理中
      const typing = addAI(body, el('div', { class: 'typing' }, [el('span'), el('span'), el('span')]), false);
      try {
        const result = await api.structureCase(draftRaw, 'zh');
        typing.remove();
        if (result && result._error) {
          addAI(body, el('div', {}, [el('p', { text: '结构化失败，请检查文本或稍后重试。' })]), false);
        } else {
          currentCase = result;
          renderStructuredAI(body, result);
          submitBtn.disabled = false;
        }
      } catch (err) {
        typing.remove();
        addAI(body, el('div', {}, [el('p', { text: '出错了：' + (err.friendly || err.message) })]), false);
      } finally {
        setBusy(false);
        body.scrollTop = body.scrollHeight;
      }
    }

    window.__hospitalSetBusy = setBusy; // 供 submitCase 调用
  }

  /* 医生消息（左） */
  function addMe(body, node) {
    const m = el('div', { class: 'msg patient' }, [
      el('div', { class: 'm-avatar', text: '🧑‍⚕️' }),
      el('div', {}, [el('div', { class: 'bubble' }, [node]), el('div', { class: 'm-time', text: utils.fmtTime() })])
    ]);
    body.appendChild(m); body.scrollTop = body.scrollHeight; return m;
  }
  /* AI 消息（右） */
  function addAI(body, node, withTime) {
    const m = el('div', { class: 'msg doctor' }, [
      el('div', { class: 'm-avatar', text: '🤖' }),
      el('div', {}, [el('div', { class: 'bubble' }, [node])])
    ]);
    body.appendChild(m); body.scrollTop = body.scrollHeight; return m;
  }

  /* 结构化结果卡片 + 脱敏清单 */
  function renderStructuredAI(body, c) {
    const card = el('div', {}, []);
    card.appendChild(el('p', { class: 'fw-700', text: '✅ 去隐私化结构化完成' }));

    const fields = [
      ['标题', c.title], ['科室', c.department], ['类型', c.caseType], ['难度', c.difficulty],
      ['主诉', c.chiefComplaint], ['现病史', c.presentIllness], ['既往史', c.pastHistory],
      ['体格检查', c.physicalExam], ['辅助检查', c.auxExam], ['患者人设', c.patientPersona],
      ['标准诊断', c.correctDiagnosis], ['鉴别诊断', (c.differentialDiagnosis || []).join('、')],
      ['知识点', (c.knowledgePoints || []).join('、')]
    ];
    const tbl = el('div', { style: 'margin-top:8px' });
    fields.forEach(([k, v]) => {
      if (!v) return;
      tbl.appendChild(el('div', { class: 'r-row', style: 'display:flex;gap:8px;padding:4px 0;border-bottom:1px dashed var(--c-border)' }, [
        el('div', { style: 'flex:0 0 76px;color:var(--c-text-2);font-size:13px', text: k }),
        el('div', { style: 'flex:1;font-size:13.5px', text: String(v) })
      ]));
    });
    card.appendChild(tbl);

    // 关键线索
    if (c.keyClues && c.keyClues.length) {
      const kc = el('div', { style: 'margin-top:8px' }, [el('div', { class: 'fw-600', text: '关键线索：' })]);
      c.keyClues.forEach(k => kc.appendChild(el('span', { class: 'tag tag-primary', style: 'margin:2px', text: k.word })));
      card.appendChild(kc);
    }

    // 脱敏字段清单
    const privacy = detectPrivacy(draftRaw);
    const pr = el('div', { style: 'margin-top:10px;padding:10px;background:var(--c-surface-2);border-radius:var(--r-md)' }, [
      el('div', { class: 'fw-600', text: '🔒 已脱敏字段清单' })
    ]);
    if (privacy.length) {
      privacy.forEach(p => pr.appendChild(el('div', { class: 'text-sm', style: 'color:var(--c-text-2);margin-top:2px', text: '· ' + p })));
    } else {
      pr.appendChild(el('div', { class: 'text-sm', text: '· 未在文本中检测到明显隐私字段（姓名/证件/电话/医院名/日期等）' }));
    }
    card.appendChild(pr);

    addAI(body, card, false);
    utils.toast('结构化完成，可继续补充或提交', 'ok');
    if (window.__hospitalSetBusy) window.__hospitalSetBusy(false);
  }

  /* 隐私字段识别（用于脱敏清单展示） */
  function detectPrivacy(text) {
    const list = [];
    if (/身份证|(\d{17}[\dXx])/.test(text)) list.push('身份证号 → 已删除/替换');
    if (/1[3-9]\d{9}/.test(text)) list.push('手机号 → 已删除/替换');
    if (/住院号|门诊号|病案号|病历号/.test(text)) list.push('住院号/门诊号 → 已替换');
    if (/(第.?人民|中心|总|附属|专科)医院/.test(text)) list.push('医院名称 → ××医院');
    if (/[张王李赵刘陈杨黄][\u4e00-\u9fa5]{1,2}(先生|女士|大爷|大妈|同志)?/.test(text)) list.push('姓名 → 患者');
    if (/\d{4}年\d{1,2}月\d{1,2}日/.test(text)) list.push('具体日期 → 约 X 天前');
    if (/工作单位|公司|厂|局|学校/.test(text)) list.push('工作单位 → 已删除');
    return list;
  }

  /* 提交到平台 */
  function submitCase(body) {
    if (!currentCase) { utils.toast('请先上传并完成结构化', 'warn'); return; }
    const c = currentCase;
    const created = store.addCase({
      title: c.title || '匿名脱敏病例', department: c.department || '其他',
      caseType: c.caseType || '其他', difficulty: c.difficulty || 'medium',
      chiefComplaint: c.chiefComplaint || '', presentIllness: c.presentIllness || '',
      pastHistory: c.pastHistory || '', physicalExam: c.physicalExam || '',
      auxExam: c.auxExam || '', patientPersona: c.patientPersona || '',
      language: c.language || 'zh', keyClues: c.keyClues || [],
      knowledgePoints: c.knowledgePoints || [], correctDiagnosis: c.correctDiagnosis || '',
      differentialDiagnosis: c.differentialDiagnosis || [], status: 'pending'
    });
    utils.toast('已提交，等待管理端审核', 'ok');
    // 重置
    draftRaw = ''; currentCase = null;
    const foot = body.parentElement.querySelector('.chat-foot');
    if (foot) { const sb = foot.querySelector('[aria-label="提交到平台"]'); if (sb) sb.disabled = true; }
    addAI(body, el('div', {}, [el('p', { text: '✅ 已提交至平台，状态：待审核。您可在「我的病例」中查看进度。' })]), false);
    setTimeout(() => location.hash = '#/hospital/cases', 800);
  }

  /* PDF 解析（需联网加载 pdf.js） */
  async function readPdf(file) {
    if (!window.pdfjsLib) return null;
    try {
      if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc)
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const buf = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        text += tc.items.map(it => it.str).join(' ') + '\n';
      }
      return text;
    } catch (e) { return null; }
  }

  return { render };
})();
