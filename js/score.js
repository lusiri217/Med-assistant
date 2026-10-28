/* ============================================================
   score.js —— 积分计算引擎（规则集中配置）
   积分规则常量集中在 SCORE_RULES，便于统一管理。
   挂载到 window.App.score
   ============================================================ */
window.App = window.App || {};

App.score = (function () {
  'use strict';
  const store = App.store;
  const utils = App.utils;

  // ===== 积分规则（集中配置，可在此调整） =====
  const SCORE_RULES = {
    INIT_SCORE: 700,            // 初始积分
    FLOOR: 0,                   // 积分下限
    FIRST_CLUE: 5,              // 首次发现一个关键线索
    REPEAT_IRRELEVANT: -2,      // 重复追问同一无关问题（单轮上限 -10）
    EMPATHY: 3,                 // 使用人文关怀语言（每次会话上限 +15）
    RUDE: -3,                   // 不礼貌 / 打断 / 冷漠
    DIAG_CORRECT: 50,           // 最终诊断正确
    DIAG_PARTIAL: 20,           // 诊断部分正确
    DIAG_WRONG: -30,            // 诊断错误
    QUIZ_RIGHT: 10,             // 选择题答对
    QUIZ_WRONG: -5,             // 选择题答错
    ESSAY_BASE: 20              // 简答题满分基准（按 AI 评分百分比 × 此值）
  };

  // 每次会话内的累计上限
  const SESSION_CAP = { empathy: 15, repeatIrrelevant: -10 };

  /* 统一加分入口：写流水、落库、弹飘字 */
  function add(delta, reason, opts) {
    opts = opts || {};
    delta = Math.round(delta);
    if (delta === 0) return store.getStudent().score;
    const after = store.addScoreRecord(delta, reason);
    // 顶栏飘字提示
    if (opts.flyTo) flyScore(opts.flyTo, delta);
    else flyScore(null, delta);
    // 同步顶栏积分数字 / 状态
    if (App.router && App.router.refreshTopbar) App.router.refreshTopbar();
    return after;
  }

  /* 顶栏积分飘字（可选指定容器，否则自动找 .score-pill） */
  function flyScore(container, delta) {
    const pill = container || document.querySelector('.score-pill');
    if (!pill) return;
    const span = utils.el('span', { class: 'score-fly ' + (delta >= 0 ? 'plus' : 'minus') }, (delta >= 0 ? '+' : '') + delta);
    pill.appendChild(span);
    setTimeout(() => span.remove(), 1000);
  }

  /* 诊断结束评分：传入 AI/规则得到的报告对象 */
  function applyDiagnosisResult(report) {
    if (!report) return;
    if (report.diagnosisCorrect === true) add(SCORE_RULES.DIAG_CORRECT, '最终诊断正确');
    else if (report.diagnosisCorrect === 'partial') add(SCORE_RULES.DIAG_PARTIAL, '诊断部分正确');
    else add(SCORE_RULES.DIAG_WRONG, '诊断错误');
  }

  /* 题库答题计分 */
  function applyQuizChoice(correct) {
    if (correct) add(SCORE_RULES.QUIZ_RIGHT, '选择题答对');
    else add(SCORE_RULES.QUIZ_WRONG, '选择题答错');
  }
  function applyQuizEssay(percent) {
    // percent: 0~1
    const delta = Math.round(SCORE_RULES.ESSAY_BASE * (percent || 0));
    add(delta, '简答题评分 ' + Math.round((percent || 0) * 100) + '%');
  }

  /* 按一轮医生发言更新会话内积分（在诊断页调用）
     tone: {empathy, rude, chitchat, repeatIrrelevant}
     discoveredNewClue: 本轮回合是否首次发现新线索
     sessionAccum: {empathy, repeatIrrelevant} 引用，做会话上限 */
  function applyTurn(tone, discoveredNewClue, sessionAccum) {
    sessionAccum = sessionAccum || { empathy: 0, repeatIrrelevant: 0 };

    if (discoveredNewClue) add(SCORE_RULES.FIRST_CLUE, '首次发现关键线索');

    if (tone.empathy) {
      const room = SESSION_CAP.empathy - sessionAccum.empathy;
      if (room > 0) { add(SCORE_RULES.EMPATHY, '人文关怀语言'); sessionAccum.empathy += SCORE_RULES.EMPATHY; }
    }
    if (tone.rude) add(SCORE_RULES.RUDE, '不礼貌/冷漠');
    if (tone.repeatIrrelevant) {
      const room = SESSION_CAP.repeatIrrelevant - sessionAccum.repeatIrrelevant; // 负数，room 表示还能扣多少
      if (room < 0) {
        const d = Math.max(SCORE_RULES.REPEAT_IRRELEVANT, room);
        add(d, '重复追问无关问题'); sessionAccum.repeatIrrelevant += d;
      }
    }
  }

  function getRules() { return SCORE_RULES; }

  return {
    SCORE_RULES, SESSION_CAP,
    add, flyScore, applyDiagnosisResult, applyQuizChoice, applyQuizEssay, applyTurn, getRules
  };
})();
