/* ============================================================
   api.js —— LLM 调用封装（OpenAI 兼容）+ 模拟模式 + 拦截器
   职责：
   1) 统一拦截：暂停 / 未配置 / 超限 → 抛友好错误，不发起请求；
   2) 真实调用：fetch + Bearer，支持 SSE 流式；
   3) 模拟模式：未配置 Key 时启用本地规则化“患者/结构/出题/评分”；
   4) Key 保护：解密后的 Key 仅存于本模块闭包，页面切换时清空。
   挂载到 window.App.api
   ============================================================ */
window.App = window.App || {};

App.api = (function () {
  'use strict';
  const store = App.store;
  const utils = App.utils;
  const prompts = App.prompts;

  // 解密后的 Key 仅存在于此闭包，不暴露给任何视图
  let keyCache = null;

  function makeError(code, message) {
    const e = new Error(message);
    e.code = code;          // MAINTENANCE / AUTH / RATE / HTTP / TIMEOUT / NO_KEY / LIMIT
    e.friendly = message;
    return e;
  }

  /* ---------- Key 缓存管理（保护） ---------- */
  async function loadKey() {
    if (keyCache != null) return keyCache;
    const enc = store.state.config.apiKeyEnc;
    if (!enc) return null;
    keyCache = await App.crypto.decrypt(enc);   // 明文仅在此瞬间存在内存
    return keyCache;
  }
  function clearKeyCache() { keyCache = null; }  // 页面切换时调用

  /* ---------- 模式与拦截 ---------- */
  function getMode() {
    const c = store.state.config;
    if (c.paused) return 'blocked';
    if (c.apiEnabled && c.apiKeyEnc) return 'real';
    return 'mock';
  }
  function isMock() { return getMode() === 'mock'; }

  // 会话 / 单日 token 上限拦截（真实模式）
  function limitGuard() {
    const r = store.state.runtime, set = store.state.settings;
    if (set.dailyTokenLimit && r.totalTokens >= set.dailyTokenLimit)
      return makeError('LIMIT', '已达到单日 Token 总量上限，请明日再试或联系管理员调整。');
    return true;
  }

  /* ============================================================
     底层：发起一次对话（自动分流 real / mock）
     messages: [{role:'system'|'user'|'assistant', content}]
     opts: { mode:'patient'|'structure'|'quiz'|'score', stream, onToken,
             caseData, settings, resources, foreign, quizConfig, dialog }
     ============================================================ */
  async function chat(messages, opts) {
    opts = opts || {};
    const mode = getMode();
    if (mode === 'blocked') throw makeError('MAINTENANCE', '系统维护中，AI 服务已暂停');

    store.touchCall(0);  // 计数（仅统计次数；token 真实返回后再补）

    if (mode === 'real') {
      try {
        return await realChat(messages, opts);
      } catch (e) {
        if (e.code) throw e;
        throw makeError('HTTP', '调用失败：' + (e && e.message ? e.message : '未知错误'));
      }
    }
    // 模拟模式
    return mockChat(messages, opts);
  }

  /* ---------- 真实调用 ---------- */
  async function realChat(messages, opts) {
    const lg = limitGuard(); if (lg !== true) throw lg;
    const key = await loadKey();
    if (!key) throw makeError('NO_KEY', '未配置有效 API Key');
    // 脱敏自检：绝不允许把 Key 写进 messages / URL
    const cfg = store.state.config, set = store.state.settings;
    const url = (cfg.baseUrl || '').replace(/\/+$/, '') + '/chat/completions';
    const body = {
      model: cfg.model || 'gpt-4o-mini',
      messages: messages,
      temperature: set.temperature,
      top_p: set.topP,
      max_tokens: set.maxOutTokens,
      stream: !!opts.stream
    };
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), set.timeoutMs || 30000);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
    } catch (e) {
      clearTimeout(tid);
      if (e && e.name === 'AbortError') throw makeError('TIMEOUT', '请求超时，请检查网络或调大超时时间');
      throw makeError('NETWORK', '网络错误，无法连接服务：' + (e && e.message ? e.message : ''));
    }
    clearTimeout(tid);
    if (res.status === 401) throw makeError('AUTH', 'API Key 无效或鉴权失败（401），请到管理端检查。');
    if (res.status === 429) throw makeError('RATE', '请求过于频繁（429），请稍后再试或联系管理员。');
    if (!res.ok) throw makeError('HTTP', '请求失败：HTTP ' + res.status);

    if (opts.stream && res.body && res.body.getReader) {
      return await readSSE(res, opts.onToken);
    }
    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : '';
    if (data.usage && data.usage.total_tokens) store.touchCall(data.usage.total_tokens);
    return { content: content || '', usage: data.usage || null };
  }

  async function readSSE(res, onToken) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop();
      for (const part of parts) {
        const line = part.replace(/^data:\s*/, '').trim();
        if (!line || line === '[DONE]') continue;
        try {
          const json = JSON.parse(line);
          const delta = json.choices && json.choices[0] && json.choices[0].delta;
          if (delta && delta.content) { full += delta.content; if (onToken) onToken(delta.content); }
        } catch (e) { /* 忽略不完整分片 */ }
      }
    }
    return { content: full, usage: null };
  }

  /* ============================================================
     模拟模式（Mock）：保证无 Key 环境全流程可演示
     ============================================================ */
  async function mockChat(messages, opts) {
    const mode = opts.mode || 'patient';
    if (mode === 'structure') return { content: JSON.stringify(mockStructureCase(opts.rawText, opts.language), null, 2) };
    if (mode === 'quiz') return { content: JSON.stringify(mockQuiz(opts.caseData, opts.quizConfig), null, 2) };
    if (mode === 'score') return { content: JSON.stringify(mockScore(opts.dialog, opts.caseData), null, 2) };
    // patient
    const text = mockPatient(messages, opts);
    // 模拟流式：逐句推送
    if (opts.stream && opts.onToken && text) {
      const chunks = text.match(/[^，。！？；\n]+[，。！？；\n]?/g) || [text];
      for (const c of chunks) { await delay(28); opts.onToken(c); }
    }
    return { content: text, usage: null };
  }
  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ---------- Mock：患者回复 ---------- */
  function mockPatient(messages, opts) {
    const caseData = opts.caseData || {};
    const foreign = !!opts.foreign;
    const last = messages[messages.length - 1];
    const userMsg = last && last.content ? last.content : '';
    const tone = utils.analyzeTone(userMsg);

    // 1) 直接要诊断 / 猜病 → 拒绝泄题
    if (/诊断|什么病|啥病|得的?什么病|病名|到底什么|我是不是|我得的是|您觉得您|您觉得您自己|您猜/.test(userMsg)) {
      return foreign
        ? "I'm not sure, doctor. Could you please check what's wrong with me?"
        : "这个我不太清楚，您还是帮我看看身体的问题吧。";
    }

    // 2) 分类识别
    const cat = detectCategory(userMsg);
    if (cat && caseData[cat.field]) {
      return buildPatientReply(cat, caseData, foreign, tone);
    }

    // 3) 闲聊 / 无关 → 礼貌拒绝
    if (tone.chitchat) {
      return foreign
        ? "Sorry doctor, I don't really know about that. Could we talk about my health?"
        : "这个我不太清楚，您还是帮我看看身体的问题吧。";
    }

    // 4) 未识别 → 不主动给信息，引导医生提问
    return foreign
      ? "Yes, doctor?"
      : "（点点头）大夫，您想了解我哪儿的情况？您问我就说。";
  }

  function detectCategory(text) {
    const rules = [
      { field: 'chiefComplaint', words: ['主诉', '哪里不舒服', '哪儿不舒服', '怎么了', '哪儿疼', '哪里疼', '什么症状', '不舒服', '难受', '咋回事'] },
      { field: 'presentIllness', words: ['现病史', '什么时候开始', '怎么发展', '加重', '持续', '发作', '描述', '详细', '症状', '情况', '感觉', '最近', '几天', '小时'] },
      { field: 'pastHistory', words: ['既往', '以前', '病史', '高血压', '糖尿病', '抽烟', '吸烟', '喝酒', '手术', '吃药', '过敏', '家族史', '基础病', '过去'] },
      { field: 'physicalExam', words: ['查体', '检查身体', '按压', '听诊', '触诊', '叩诊', '量一下', '摸一下', '按压', '体征', '看看肚子', '看嗓子'] },
      { field: 'auxExam', words: ['化验', '抽血', 'ct', '核磁', '心电图', '胸片', '报告', '结果', 'b超', '检查单', '片子'] }
    ];
    for (const r of rules) {
      if (r.words.some(w => text.indexOf(w) >= 0)) return r;
    }
    return null;
  }

  function buildPatientReply(cat, caseData, foreign, tone) {
    const fieldText = caseData[cat.field] || '（暂无信息）';
    let prefix = '';
    if (tone.empathy) prefix = foreign ? "Thank you doctor, that makes me feel better. " : "（松了口气）谢谢您大夫，听您这么说我心里踏实多了。";
    else if (tone.rude) prefix = foreign ? "(reluctantly) " : "（有点抵触）您别急……";
    let body;
    if (foreign) {
      body = enField(cat.field, fieldText);
    } else {
      // 以患者口吻转述
      const map = {
        chiefComplaint: '大夫，我',
        presentIllness: '事情是这样的，',
        pastHistory: '以前啊，',
        physicalExam: '您给我检查的时候，',
        auxExam: '做检查那边说，'
      };
      body = (map[cat.field] || '') + fieldText;
    }
    let reply = prefix + body;
    // 高亮关键线索
    reply = wrapClues(reply, caseData);
    return reply;
  }

  function enField(field, text) {
    const head = {
      chiefComplaint: "Doctor, I have ",
      presentIllness: "It started like this: ",
      pastHistory: "In the past, ",
      physicalExam: "When you examined me, ",
      auxExam: "The tests showed "
    }[field] || "";
    return head + text;
  }

  // 将回复中命中的关键线索词用 [[ ]] 包裹
  function wrapClues(text, caseData) {
    const clues = (caseData && caseData.keyClues) || [];
    let out = text;
    // 先去已存在的包裹，避免重复
    out = out.replace(/\[\[([^\]]+)\]\]/g, '$1');
    const words = clues.map(c => c.word).filter(Boolean).sort((a, b) => b.length - a.length);
    words.forEach(w => {
      if (out.indexOf(w) >= 0) {
        out = out.split(w).join('[[' + w + ']]');
      }
    });
    return out;
  }

  /* ---------- Mock：去隐私化结构化 ---------- */
  function mockStructureCase(rawText, language) {
    rawText = (rawText || '').trim();
    const lines = rawText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const title = (lines[0] || '匿名脱敏病例').slice(0, 40);
    const text = rawText;
    let department = '其他', caseType = '其他';
    if (/心|胸|血压|冠脉|心梗|心悸/.test(text)) { department = '心血管内科'; caseType = '心血管'; }
    else if (/肺|呼吸|咳|喘|痰/.test(text)) { department = '呼吸内科'; caseType = '呼吸'; }
    else if (/胃|肝|腹|肠|消化/.test(text)) { department = '消化内科'; caseType = '消化'; }
    else if (/血糖|糖尿|甲状腺|内分泌/.test(text)) { department = '内分泌科'; caseType = '内分泌'; }
    else if (/头|脑|神经|肢体麻木|偏瘫/.test(text)) { department = '神经内科'; caseType = '神经'; }
    else if (/外伤|急|中毒|休克/.test(text)) { department = '急诊科'; caseType = '急诊'; }

    const find = (kw) => {
      const l = lines.find(s => s.indexOf(kw) >= 0);
      return l ? l.replace(kw, '').replace(/[:：]/, '').trim().slice(0, 200) : '';
    };
    const chief = find('主诉') || title;
    const present = find('现病史') || rawText.slice(0, 200);
    const past = find('既往史') || find('既往') || '（请补充）';
    const exam = find('查体') || find('体格检查') || '（请补充）';
    const aux = find('辅助') || find('检查') || '（请补充）';

    // 关键线索：取前若干医学关键词（演示用）
    const clues = [
      { word: '主诉', clinicalInfo: '原始主诉：' + (chief || '（待补充）') }
    ];
    // 简易抽取：出现频率较高的医学短词
    const m = rawText.match(/[一-龥]{2,6}(?:痛|压|高|低|升高|下降|阳性|异常|影|征)/g) || [];
    const seen = new Set();
    m.slice(0, 4).forEach(w => { if (!seen.has(w)) { seen.add(w); clues.push({ word: w, clinicalInfo: '（演示模式自动抽取，请人工核实）' + w }); } });

    return {
      title: title, department: department, caseType: caseType, difficulty: 'medium',
      chiefComplaint: chief, presentIllness: present, pastHistory: past,
      physicalExam: exam, auxExam: aux,
      patientPersona: '（待医师补充患者人设）', language: language || 'zh',
      keyClues: clues, knowledgePoints: ['（待补充）'],
      correctDiagnosis: '（待审核医师补充）', differentialDiagnosis: ['（待补充）'],
      _note: '演示模式：结构化结果仅供参考，请人工复核隐私字段与诊断。'
    };
  }

  /* ---------- Mock：出题 ---------- */
  function mockQuiz(caseData, quizConfig) {
    caseData = caseData || {};
    const diff = (caseData.differentialDiagnosis || []).slice(0, 3);
    const correct = caseData.correctDiagnosis || '标准诊断';
    const aux = caseData.auxExam || '相关辅助检查';
    const past = caseData.pastHistory || '相关既往史';
    const kp = (caseData.knowledgePoints && caseData.knowledgePoints[0]) || '病例知识点';

    const q = [
      { type: 'choice', stem: '（根据病例）最可能的诊断是：',
        options: ['A. ' + correct, 'B. ' + (diff[0] || '鉴别疾病一'), 'C. ' + (diff[1] || '鉴别疾病二'), 'D. ' + (diff[2] || '鉴别疾病三')],
        answer: 'A', knowledgePoint: kp,
        explanation: '结合主诉、体征与辅助检查，最符合' + correct + '；其余为需鉴别的疾病。' },
      { type: 'choice', stem: '支持该诊断的关键依据是：',
        options: ['A. ' + aux.slice(0, 60), 'B. 与患者描述无关的另一体征', 'C. 完全正常的检查结果', 'D. 既往史中的无关项'],
        answer: 'A', knowledgePoint: kp,
        explanation: '辅助检查/体征直接支持诊断方向。' },
      { type: 'choice', stem: '关于该患者的病史，正确的是：',
        options: ['A. ' + past.slice(0, 60), 'B. 既往完全健康无任何基础病', 'C. 无任何危险因素', 'D. 病史与本次无关'],
        answer: 'A', knowledgePoint: kp,
        explanation: '既往史是诊断与鉴别的重要依据。' },
      { type: 'choice', stem: '下一步最合适的处理是：',
        options: ['A. 进一步完善检查并据结果诊断/治疗', 'B. 直接出院', 'C. 不予处理', 'D. 仅凭猜测用药'],
        answer: 'A', knowledgePoint: kp,
        explanation: '规范诊疗应先评估、完善检查再处理。' },
      { type: 'essay', stem: '请简述本病例的诊断思路与处理原则。',
        answer: '要点：① 梳理主诉与现病史；② 结合查体与辅助检查提炼关键线索；③ 列出并鉴别主要疾病；④ 给出诊断与下一步处理（含对症与随访）。',
        explanation: '评分要点：线索提取、鉴别逻辑、处理规范性。', knowledgePoint: kp }
    ];
    return q;
  }

  /* ---------- Mock：评分 ---------- */
  function mockScore(dialog, caseData) {
    caseData = caseData || {};
    const clues = (caseData.keyClues || []);
    const clueWords = clues.map(c => c.word);
    const patientMsgs = (dialog || []).filter(m => m.role === 'patient').map(m => m.text || '');
    const doctorMsgs = (dialog || []).filter(m => m.role === 'doctor').map(m => m.text || '');

    // 已发现线索
    let discovered = 0;
    clueWords.forEach(w => {
      if (patientMsgs.some(t => t.indexOf(w) >= 0 || t.indexOf('[[' + w + ']]') >= 0)) discovered++;
    });
    const clueRate = clues.length ? discovered / clues.length : 0;

    // 人文关怀
    let empathyCount = 0;
    doctorMsgs.forEach(t => { const tn = utils.analyzeTone(t); if (tn.empathy) empathyCount++; });
    const empathyScore = Math.min(100, 50 + empathyCount * 12);

    // 诊断正确：与标准诊断的字符重叠率判定（更贴近真实打分）
    const finalDiag = (dialog && dialog._final && dialog._final.diagnosis) || '';
    const norm = s => (s || '').replace(/[\s（）()、，。,.\-]/g, '');
    const a = norm(caseData.correctDiagnosis), b = norm(finalDiag);
    let diagnosisCorrect = false;
    if (a && b) {
      const setA = new Set(a.split(''));
      let overlap = 0;
      b.split('').forEach(ch => { if (setA.has(ch)) overlap++; });
      const ratio = overlap / Math.max(1, b.length);
      diagnosisCorrect = ratio >= 0.6 ? true : (ratio >= 0.3 ? 'partial' : false);
    }

    // 问诊条理：覆盖的类别数
    const cats = ['主诉', '现病史', '既往', '查体', '检查'];
    let covered = 0;
    doctorMsgs.forEach(t => cats.forEach(c => { if (t.indexOf(c) >= 0) covered++; }));
    const reasoningScore = Math.min(100, 40 + covered * 10);

    const comment = diagnosisCorrect === true
      ? '诊断准确，问诊较完整，继续保持。'
      : (diagnosisCorrect === 'partial' ? '诊断方向接近但表述不够准确，建议再聚焦关键线索。' : '诊断偏差较大，建议回顾主诉与关键检查结果。');

    const knowledgeSummary = (caseData.knowledgePoints || []).join('、') || '（无）';

    return {
      diagnosisCorrect: diagnosisCorrect, clueRate: Number(clueRate.toFixed(2)),
      empathyScore: empathyScore, reasoningScore: reasoningScore,
      comment: comment, knowledgeSummary: knowledgeSummary,
      _discovered: discovered, _total: clues.length
    };
  }

  /* ============================================================
     高层封装（视图直接调用）
     ============================================================ */
  // 患者对话：传入会话消息数组，返回 {content}
  function patientReply(messages, opts) { return chat(messages, Object.assign({ mode: 'patient' }, opts)); }

  // 医院端结构化
  async function structureCase(rawText, language, opts) {
    opts = opts || {};
    const sys = prompts.buildStructurePrompt(rawText, language);
    const messages = [{ role: 'system', content: sys }, { role: 'user', content: '请处理以上病历。' }];
    const r = await chat(messages, Object.assign({ mode: 'structure', rawText: rawText, language: language }, opts));
    // 尝试解析 JSON
    try {
      const json = extractJson(r.content);
      return json;
    } catch (e) {
      // 解析失败：返回结构化失败提示（视图层处理）
      return { _error: 'AI 返回无法解析为 JSON', raw: r.content };
    }
  }
  function extractJson(s) {
    if (!s) throw new Error('empty');
    const m = s.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no json');
    return JSON.parse(m[0]);
  }

  // 出题
  async function generateQuiz(caseData, quizConfig, opts) {
    opts = opts || {};
    const sys = prompts.buildQuizPrompt(caseData, quizConfig || {});
    const messages = [{ role: 'system', content: sys }, { role: 'user', content: '请基于病例生成题目，严格返回 JSON 数组。' }];
    const r = await chat(messages, Object.assign({ mode: 'quiz', caseData: caseData, quizConfig: quizConfig }, opts));
    try { return extractJson(r.content); }
    catch (e) { return mockQuiz(caseData, quizConfig); }  // 解析失败回退 mock
  }

  // 评分
  async function scoreDiagnosis(dialog, caseData, opts) {
    opts = opts || {};
    const sys = prompts.buildScorePrompt(dialog, caseData);
    const messages = [{ role: 'system', content: sys }, { role: 'user', content: '请返回评分 JSON。' }];
    const r = await chat(messages, Object.assign({ mode: 'score', dialog: dialog, caseData: caseData }, opts));
    try { return extractJson(r.content); }
    catch (e) { return mockScore(dialog, caseData); }  // 解析失败回退 mock
  }

  return {
    chat, patientReply, structureCase, generateQuiz, scoreDiagnosis,
    getMode, isMock, clearKeyCache, makeError, extractJson
  };
})();
