/* ============================================================
   store.js —— 全局状态 + localStorage 持久化 + 数据模型 + 订阅
   所有 localStorage key 统一前缀 aips_。
   挂载到 window.App.store
   ============================================================ */
window.App = window.App || {};

App.store = (function () {
  'use strict';
  const LS_KEY = 'aips_state';        // 唯一持久化键（含加密后的 Key）
  const utils = App.utils;

  /* ---------- 默认状态 ---------- */
  function defaultState() {
    return {
      config: {
        apiKeyEnc: null,        // 加密(或混淆)后的 Key 字符串
        cryptoStrong: false,    // 是否使用了真正的 AES-GCM
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        apiEnabled: false,      // Key 是否已配置并启用（全局）
        paused: false           // 暂停/恢复 API 调用总开关
      },
      settings: {
        maxOutTokens: 1000,
        sessionTokenLimit: 30000,
        dailyTokenLimit: 0,     // 0 = 不限
        temperature: 0.7,
        topP: 1,
        maxReplyChars: 0,
        stream: true,
        timeoutMs: 30000,
        retries: 2,
        behavior: {
          patientOnlyAnswer: true,
          refuseIrrelevant: true,
          neverReveal: true,
          plainLanguage: true,
          empathyFeedback: true,
          foreignPatientRate: 0.1
        }
      },
      resources: [],
      prompts: { front: App.prompts.DEFAULT_FRONT, quiz: App.prompts.DEFAULT_QUIZ },
      questions: [],
      cases: [],
      student: {
        score: 700,
        scoreLog: [],
        records: []
      },
      runtime: { lastCall: null, todayCalls: 0, totalTokens: 0, day: utils.dateKey() }
    };
  }

  let state = defaultState();
  const subscribers = [];

  /* ---------- 持久化 ---------- */
  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (e) {
      // 容量或隐私模式异常：仅告警，不打印敏感内容
      utils.toast('本地保存失败，请检查浏览器存储设置', 'warn');
    }
  }
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = Object.assign(defaultState(), parsed);
        // 深合并 config / settings / student，避免旧版本缺字段
        state.config = Object.assign(defaultState().config, parsed.config || {});
        state.settings = Object.assign(defaultState().settings, parsed.settings || {});
        state.settings.behavior = Object.assign(defaultState().settings.behavior, (parsed.settings && parsed.settings.behavior) || {});
        state.student = Object.assign(defaultState().student, parsed.student || {});
        // 每日调用计数重置
        if (state.runtime.day !== utils.dateKey()) {
          state.runtime.day = utils.dateKey();
          state.runtime.todayCalls = 0;
        }
      } else {
        state = defaultState();
        seed();           // 首次运行：写入示例病例与题库
        save();
      }
    } catch (e) {
      state = defaultState();
      seed();
      save();
    }
  }

  /* ---------- 订阅 ---------- */
  function subscribe(fn) { subscribers.push(fn); }
  function emit(evt) { subscribers.forEach(fn => { try { fn(evt, state); } catch (e) {} }); }

  /* ============================================================
     数据模型：病例
     ============================================================ */
  function getCases() { return state.cases; }
  function getCase(id) { return state.cases.find(c => c.id === id) || null; }
  function getPublishedCases() { return state.cases.filter(c => c.status === 'published'); }
  function addCase(obj) {
    const c = Object.assign({
      id: utils.uid('case'),
      status: 'pending', createdAt: utils.fmtDateTime(), updatedAt: utils.fmtDateTime(),
      rejectReason: '', owner: 'hospital'
    }, obj);
    state.cases.unshift(c);
    save(); emit('cases');
    return c;
  }
  function updateCase(id, patch) {
    const c = getCase(id); if (!c) return null;
    Object.assign(c, patch, { updatedAt: utils.fmtDateTime() });
    save(); emit('cases');
    return c;
  }
  function deleteCase(id) {
    state.cases = state.cases.filter(c => c.id !== id);
    save(); emit('cases');
  }

  /* ============================================================
     数据模型：题库
     ============================================================ */
  function getQuestions() { return state.questions; }
  function getQuestionsByCase(caseId) { return state.questions.filter(q => q.caseId === caseId); }
  function addQuestion(obj) {
    const q = Object.assign({
      id: utils.uid('q'), status: 'enabled', enabled: true,
      createdAt: utils.fmtDateTime()
    }, obj);
    state.questions.push(q); save(); emit('questions'); return q;
  }
  function updateQuestion(id, patch) {
    const q = state.questions.find(x => x.id === id); if (!q) return null;
    Object.assign(q, patch); save(); emit('questions'); return q;
  }
  function deleteQuestion(id) {
    state.questions = state.questions.filter(x => x.id !== id); save(); emit('questions');
  }
  function toggleQuestion(id, enabled) {
    const q = state.questions.find(x => x.id === id); if (!q) return;
    q.enabled = enabled; q.status = enabled ? 'enabled' : 'disabled';
    save(); emit('questions');
  }

  /* ============================================================
     数据模型：学生积分 / 记录
     ============================================================ */
  function getStudent() { return state.student; }
  function addScoreRecord(delta, reason) {
    const s = state.student;
    const before = s.score;
    s.score = Math.max(0, s.score + delta);      // 积分下限 0
    s.scoreLog.unshift({ ts: utils.fmtDateTime(), delta, reason, before, after: s.score });
    if (s.scoreLog.length > 200) s.scoreLog.length = 200;
    save(); emit('score');
    return s.score;
  }
  function addRecord(rec) {
    state.student.records.unshift(rec); save(); emit('records'); return rec;
  }

  /* ============================================================
     数据模型：资源白名单
     ============================================================ */
  function addResource(url, note) {
    state.resources.push({ id: utils.uid('res'), url, note: note || '', enabled: true });
    save(); emit('resources');
  }
  function updateResource(id, patch) {
    const r = state.resources.find(x => x.id === id); if (r) { Object.assign(r, patch); save(); emit('resources'); }
  }
  function deleteResource(id) { state.resources = state.resources.filter(x => x.id !== id); save(); emit('resources'); }

  /* ============================================================
     运行统计
     ============================================================ */
  function touchCall(tokens) {
    const r = state.runtime;
    if (r.day !== utils.dateKey()) { r.day = utils.dateKey(); r.todayCalls = 0; }
    r.lastCall = utils.fmtDateTime();
    r.todayCalls += 1;
    if (tokens) r.totalTokens += tokens;
    save(); emit('runtime');
  }

  /* ============================================================
     预置示例病例 + 题库（首次运行）
     ============================================================ */
  function seed() {
    const caseAMI = {
      id: 'case_ami', title: '胸痛 3 小时的退休工人', department: '心血管内科', caseType: '心血管',
      difficulty: 'hard', status: 'published', language: 'zh', owner: 'seed',
      chiefComplaint: '持续性胸骨后压榨样胸痛 3 小时',
      presentIllness: '58 岁男性，3 小时前无明显诱因出现胸骨后压榨样疼痛，伴大汗、濒死感，向左肩放射，含服硝酸甘油不缓解，伴恶心、呕吐。',
      pastHistory: '高血压 10 年，吸烟 30 年，2 型糖尿病 5 年。',
      physicalExam: '血压 90/60mmHg，心率 102 次/分，律齐，心音低钝，双肺底可闻及少许湿啰音。',
      auxExam: '心电图示 II、III、aVF 导联 ST 段抬高；肌钙蛋白 I 显著升高；CK-MB 升高。',
      patientPersona: '58 岁男性，退休工人，性格急躁，长期吸烟，北方口音，文化程度一般，怕花钱不愿就医。',
      keyClues: [
        { word: '胸痛', clinicalInfo: '胸骨后压榨样疼痛 3 小时，向左肩放射，含服硝酸甘油不缓解——典型急性冠脉综合征表现。' },
        { word: 'ST 段抬高', clinicalInfo: 'II、III、aVF 导联 ST 段抬高，提示急性下壁心肌梗死。' },
        { word: '肌钙蛋白', clinicalInfo: '肌钙蛋白 I 显著升高，是心肌损伤的特异标志物，支持急性心肌梗死。' },
        { word: '大汗', clinicalInfo: '发作性大汗、濒死感为急性心梗常见伴随症状，提示病情危重。' },
        { word: '高血压', clinicalInfo: '高血压、吸烟、糖尿病是冠心病重要危险因素。' }
      ],
      knowledgePoints: ['急性 ST 段抬高型心肌梗死诊断', '心肌损伤标志物', '冠脉危险因素', '硝酸酯类用药注意'],
      correctDiagnosis: '急性下壁 ST 段抬高型心肌梗死（急性冠脉综合征）',
      differentialDiagnosis: ['不稳定型心绞痛', '急性肺栓塞', '主动脉夹层', '急性心包炎'],
      createdAt: utils.fmtDateTime(), updatedAt: utils.fmtDateTime(), rejectReason: ''
    };
    const casePneumonia = {
      id: 'case_pneumonia', title: '发热咳黄痰的高龄教师', department: '呼吸内科', caseType: '呼吸',
      difficulty: 'medium', status: 'published', language: 'zh', owner: 'seed',
      chiefComplaint: '发热、咳嗽、咳黄痰 4 天',
      presentIllness: '65 岁女性，4 天前受凉后出现发热（最高 39.2℃），咳嗽，咳黄色黏痰，伴右侧胸痛、气促，畏寒、乏力。',
      pastHistory: '慢性阻塞性肺疾病（COPD）病史 5 年，否认糖尿病、高血压。',
      physicalExam: '体温 38.8℃，呼吸 24 次/分，右下肺叩诊浊音，可闻及湿啰音及支气管呼吸音。',
      auxExam: '血常规 WBC 13.8×10^9/L，中性粒 0.86；胸片示右下肺斑片状浸润影；CRP 升高。',
      patientPersona: '65 岁女性，退休教师，略焦虑，普通话标准，慢性咳嗽多年，担心住院。',
      keyClues: [
        { word: '发热', clinicalInfo: '高热 39℃ 伴畏寒，提示感染性病变。' },
        { word: '咳黄痰', clinicalInfo: '黄脓痰提示细菌性感染。' },
        { word: '湿啰音', clinicalInfo: '右下肺湿啰音、叩诊浊音、支气管呼吸音——肺实变体征。' },
        { word: '斑片状浸润影', clinicalInfo: '胸片右下肺斑片状浸润影为肺炎典型影像表现。' },
        { word: 'COPD', clinicalInfo: 'COPD 病史为肺炎高危因素，并影响预后与抗感染选择。' }
      ],
      knowledgePoints: ['社区获得性肺炎诊断', '肺实变体征', '抗感染治疗选择', 'CURB-65 病情评估'],
      correctDiagnosis: '社区获得性肺炎（右下肺，细菌性）',
      differentialDiagnosis: ['肺结核', '肺癌伴阻塞性肺炎', '急性支气管炎', '胸腔积液'],
      createdAt: utils.fmtDateTime(), updatedAt: utils.fmtDateTime(), rejectReason: ''
    };
    const caseT2DM = {
      id: 'case_t2dm', title: '多饮多尿体重下降的中年经理', department: '内分泌科', caseType: '内分泌',
      difficulty: 'easy', status: 'published', language: 'zh', owner: 'seed',
      chiefComplaint: '多饮、多尿、体重下降 2 个月',
      presentIllness: '52 岁男性，2 个月来出现口渴多饮、尿量增多、易饥多食，伴体重下降约 5kg，乏力。',
      pastHistory: '肥胖（BMI 29），父亲有 2 型糖尿病史；否认高血压。',
      physicalExam: '身高 172cm，体重 86kg，BMI 29.1，腰围 102cm；血压 130/82mmHg；神清，皮肤稍干燥。',
      auxExam: '空腹血糖 11.8 mmol/L，糖化血红蛋白(HbA1c) 9.6%，尿糖(+++)，尿酮体阴性。',
      patientPersona: '52 岁男性，公司中层，应酬多、饮食油腻，偏胖，带点南方口音，有点讳疾忌医。',
      keyClues: [
        { word: '多饮多尿', clinicalInfo: '“三多一少”（多饮多尿多食体重下降）为糖尿病典型表现。' },
        { word: '体重下降', clinicalInfo: '2 个月体重降 5kg，提示糖代谢异常、能量随尿丢失。' },
        { word: 'HbA1c', clinicalInfo: '糖化血红蛋白 9.6% 明显升高，反映近 2-3 月平均血糖显著增高。' },
        { word: '空腹血糖', clinicalInfo: '空腹血糖 11.8 mmol/L ≥ 7.0 mmol/L，达到糖尿病诊断标准。' },
        { word: '肥胖', clinicalInfo: 'BMI 29.1 属肥胖，是 2 型糖尿病重要危险因素，且有家族史。' }
      ],
      knowledgePoints: ['2 型糖尿病诊断标准', '三多一少症状', 'HbA1c 意义', '生活方式干预与口服药'],
      correctDiagnosis: '2 型糖尿病',
      differentialDiagnosis: ['1 型糖尿病', '继发性糖尿病', '甲状腺功能亢进', '肾性糖尿'],
      createdAt: utils.fmtDateTime(), updatedAt: utils.fmtDateTime(), rejectReason: ''
    };
    state.cases = [caseAMI, casePneumonia, caseT2DM];

    const Q = [];
    // —— 病例1 急性心肌梗死 ——
    Q.push({ id: 'q_ami1', caseId: 'case_ami', type: 'choice', difficulty: 'medium', enabled: true, status: 'enabled',
      stem: '（A2型）患者男，58岁，胸骨后压榨样胸痛 3 小时，向左肩放射，含服硝酸甘油不缓解，大汗、濒死感；心电图 II、III、aVF 导联 ST 段抬高，肌钙蛋白 I 升高。最可能的诊断是：',
      options: ['A. 不稳定型心绞痛', 'B. 急性下壁 ST 段抬高型心肌梗死', 'C. 主动脉夹层', 'D. 急性肺栓塞'],
      answer: 'B', knowledgePoint: '急性心梗诊断',
      explanation: '持续胸痛+对应导联 ST 段抬高+心肌损伤标志物升高，符合急性 ST 段抬高型心肌梗死；下壁对应 II、III、aVF 导联。' });
    Q.push({ id: 'q_ami2', caseId: 'case_ami', type: 'choice', difficulty: 'easy', enabled: true, status: 'enabled',
      stem: '对明确该患者的诊断最有价值的检查组合是：',
      options: ['A. 胸部 X 线', 'B. 心电图 + 肌钙蛋白', 'C. 心脏彩超', 'D. D-二聚体'],
      answer: 'B', knowledgePoint: '心肌损伤标志物',
      explanation: '心电图定位 + 肌钙蛋白/CK-MB 是急性心梗诊断与危险分层的核心依据。' });
    Q.push({ id: 'q_ami3', caseId: 'case_ami', type: 'choice', difficulty: 'hard', enabled: true, status: 'enabled',
      stem: '该患者送达后最优先的处理措施是：',
      options: ['A. 尽快再灌注治疗（PCI 优先，或溶栓）', 'B. 仅止痛观察', 'C. 口服降压药即可', 'D. 先回家休息'],
      answer: 'A', knowledgePoint: '再灌注治疗',
      explanation: 'ST 段抬高型心梗时间就是心肌，应在最短时间内开通血管（直接 PCI 优先，无 PCI 条件则溶栓）。' });
    Q.push({ id: 'q_ami4', caseId: 'case_ami', type: 'choice', difficulty: 'easy', enabled: true, status: 'enabled',
      stem: '下列哪项不属于该患者的冠心病危险因素？',
      options: ['A. 高血压', 'B. 长期吸烟', 'C. 年轻女性、既往体健', 'D. 2 型糖尿病'],
      answer: 'C', knowledgePoint: '冠脉危险因素',
      explanation: '高血压、吸烟、糖尿病均为危险因素；该患者为中年男性而非年轻女性。' });
    Q.push({ id: 'q_ami5', caseId: 'case_ami', type: 'essay', difficulty: 'medium', enabled: true, status: 'enabled',
      stem: '简述急性 ST 段抬高型心肌梗死的即刻处理原则。',
      answer: '要点：① 立即监护、吸氧、建立静脉通路；② 镇痛（吗啡）缓解胸痛与焦虑；③ 抗血小板（阿司匹林 + 氯吡格雷/替格瑞洛）；④ 抗凝；⑤ 他汀强化；⑥ 尽早再灌注（直接 PCI 优先，无条件时溶栓）；⑦ 处理并发症（心律失常、心衰、休克）。',
      explanation: '评分要点：再灌注是核心，辅以抗栓、镇痛、他汀与并发症处理。',
      knowledgePoint: '急性心梗处理' });

    // —— 病例2 社区获得性肺炎 ——
    Q.push({ id: 'q_pn1', caseId: 'case_pneumonia', type: 'choice', difficulty: 'easy', enabled: true, status: 'enabled',
      stem: '（A2型）65 岁女性，发热 39℃、咳黄痰 4 天，右胸痛、气促；右下肺叩诊浊音、湿啰音、支气管呼吸音；胸片右下肺斑片状浸润影。最可能的诊断是：',
      options: ['A. 急性支气管炎', 'B. 社区获得性肺炎', 'C. 肺结核', 'D. 肺癌'],
      answer: 'B', knowledgePoint: '肺炎诊断',
      explanation: '发热、黄痰、肺实变体征 + 影像浸润影，符合社区获得性肺炎。' });
    Q.push({ id: 'q_pn2', caseId: 'case_pneumonia', type: 'choice', difficulty: 'easy', enabled: true, status: 'enabled',
      stem: '确诊肺炎最常用且简便的检查是：',
      options: ['A. 胸部 X 线 / CT', 'B. 痰培养', 'C. 支气管镜', 'D. 血气分析'],
      answer: 'A', knowledgePoint: '肺炎影像',
      explanation: '胸片可快速显示肺部浸润影，是肺炎诊断与随访的首选。' });
    Q.push({ id: 'q_pn3', caseId: 'case_pneumonia', type: 'choice', difficulty: 'easy', enabled: true, status: 'enabled',
      stem: '下列哪项支持细菌性肺炎而非病毒感染？',
      options: ['A. 清涕、声嘶', 'B. 白细胞与中性粒升高、咳黄脓痰', 'C. 干咳无痰', 'D. 胸片正常'],
      answer: 'B', knowledgePoint: '感染判别',
      explanation: '细菌性感染常伴外周血白细胞/中性粒升高与黄脓痰。' });
    Q.push({ id: 'q_pn4', caseId: 'case_pneumonia', type: 'choice', difficulty: 'medium', enabled: true, status: 'enabled',
      stem: '关于该患者治疗，错误的是：',
      options: ['A. 早期经验性抗感染', 'B. 用 CURB-65 评估住院与否', 'C. 一律门诊口服、不顾重症倾向', 'D. 对症支持治疗'],
      answer: 'C', knowledgePoint: '抗感染策略',
      explanation: '应根据病情严重程度（CURB-65）决定门诊或住院，重症需住院甚至 ICU。' });
    Q.push({ id: 'q_pn5', caseId: 'case_pneumonia', type: 'essay', difficulty: 'medium', enabled: true, status: 'enabled',
      stem: '简述社区获得性肺炎的经验性抗感染治疗原则与病情评估要点。',
      answer: '要点：① 用 CURB-65 评估严重程度，决定门诊/住院/ICU；② 常见病原体（肺炎链球菌、流感嗜血杆菌、非典型病原体），选β-内酰胺类、呼吸喹诺酮或大观霉素类；③ 有 COPD 等基础病需覆盖常见革兰阴性及非典型菌；④ 疗程通常 5-7 天，体温正常 48-72h 后可停药；⑤ 辅以吸氧、化痰、补液等支持。',
      explanation: '评分要点：评估分层 + 合理选药 + 疗程与对症。',
      knowledgePoint: '肺炎治疗' });

    // —— 病例3 2型糖尿病 ——
    Q.push({ id: 'q_dm1', caseId: 'case_t2dm', type: 'choice', difficulty: 'easy', enabled: true, status: 'enabled',
      stem: '（A2型）52 岁男性，多饮、多尿、体重下降 2 个月，空腹血糖 11.8 mmol/L，HbA1c 9.6%。诊断主要依据：',
      options: ['A. 仅凭症状', 'B. 空腹血糖≥7.0 且症状 + HbA1c 升高', 'C. 仅尿糖阳性', 'D. 仅体重下降'],
      answer: 'B', knowledgePoint: '糖尿病诊断',
      explanation: '有典型“三多一少”症状 + 空腹血糖≥7.0 mmol/L 即可诊断；HbA1c≥6.5% 亦支持。' });
    Q.push({ id: 'q_dm2', caseId: 'case_t2dm', type: 'choice', difficulty: 'easy', enabled: true, status: 'enabled',
      stem: '糖尿病诊断标准中，空腹血糖应达到：',
      options: ['A. ≥ 6.1 mmol/L', 'B. ≥ 7.0 mmol/L', 'C. ≥ 11.1 mmol/L', 'D. ≥ 5.6 mmol/L'],
      answer: 'B', knowledgePoint: '诊断标准',
      explanation: '空腹血糖 ≥ 7.0 mmol/L（伴症状）为糖尿病诊断切点。' });
    Q.push({ id: 'q_dm3', caseId: 'case_t2dm', type: 'choice', difficulty: 'easy', enabled: true, status: 'enabled',
      stem: '该患者初诊、无明显急性并发症，首先应进行的是：',
      options: ['A. 立即终身胰岛素', 'B. 仅观察不干预', 'C. 生活方式干预 + 必要时口服降糖药', 'D. 手术治疗'],
      answer: 'C', knowledgePoint: '初始管理',
      explanation: '2 型糖尿病初始以生活方式干预为基础，必要时起始二甲双胍等口服药，并逐步达标。' });
    Q.push({ id: 'q_dm4', caseId: 'case_t2dm', type: 'choice', difficulty: 'easy', enabled: true, status: 'enabled',
      stem: '下列哪项不是该患者的危险因素？',
      options: ['A. 肥胖（BMI 29.1）', 'B. 糖尿病家族史', 'C. 年轻女性、既往体健', 'D. 饮食油腻、应酬多'],
      answer: 'C', knowledgePoint: '危险因素',
      explanation: '肥胖、家族史、不良饮食均为危险因素；该者为中年肥胖男性。' });
    Q.push({ id: 'q_dm5', caseId: 'case_t2dm', type: 'essay', difficulty: 'medium', enabled: true, status: 'enabled',
      stem: '简述 2 型糖尿病的诊断标准与初始管理要点。',
      answer: '要点：① 诊断：典型症状 + 任意时间血糖≥11.1，或空腹血糖≥7.0，或 OGTT 2h≥11.1，或 HbA1c≥6.5%（无明确高血糖症状时需两次异常）；② 初始管理：医学营养治疗与运动、减重为基础；监测血糖/HbA1c；必要时二甲双胍起始；筛查并发症（眼底、尿微量白蛋白、神经）；患者教育与随访。',
      explanation: '评分要点：诊断标准 + 生活方式为基础的综合管理。',
      knowledgePoint: '糖尿病管理' });

    state.questions = Q;
  }

  /* ---------- 暴露接口 ---------- */
  return {
    get state() { return state; },   // 用 getter 暴露，保证 load() 重新赋值后外部仍拿到最新状态
    save, load, subscribe, emit,
    getCases, getCase, getPublishedCases, addCase, updateCase, deleteCase,
    getQuestions, getQuestionsByCase, addQuestion, updateQuestion, deleteQuestion, toggleQuestion,
    getStudent, addScoreRecord, addRecord,
    addResource, updateResource, deleteResource,
    touchCall
  };
})();
