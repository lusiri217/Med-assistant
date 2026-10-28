/* ============================================================
   views/student-quiz.js —— 学生端：题库练习与积分
   按病例选择；每病例默认 4 选择 + 1 简答。选择题即时判分 + 解析，
   简答题按要点评分；实时积分与正确率统计。
   ============================================================ */
window.App = window.App || {};
App.views = App.views || {};

App.views['student-quiz'] = (function () {
  'use strict';
  const utils = App.utils;
  const store = App.store;
  const api = App.api;
  const score = App.score;
  const el = utils.el;

  const answered = {};      // questionId -> { chosen, correct }
  let stats = { total: 0, correct: 0 };

  function render(root) {
    root.innerHTML = '';
    const wrap = el('div', { class: 'content-pad anim-fade' });
    wrap.appendChild(el('div', { class: 'section-title', text: '题库练习' }));
    wrap.appendChild(el('div', { class: 'section-desc', text: '选择病例进行练习，选择题即时判分并展示解析，简答题按要点评分。' }));

    const cases = store.getPublishedCases();
    if (!cases.length) {
      wrap.appendChild(el('div', { class: 'empty' }, [el('div', { class: 'e-ico', text: '📝' }), el('p', { text: '暂无可练习的病例，请等待管理端发布。' })]));
      root.appendChild(wrap); return;
    }

    /* 顶部统计 */
    const statsBar = el('div', { class: 'grid grid-3', style: 'margin-bottom:16px' }, [
      statCard('🪙', '累计积分', String(store.getStudent().score)),
      statCard('✅', '已做题', String(stats.total)),
      statCard('📊', '正确率', stats.total ? Math.round(stats.correct / stats.total * 100) + '%' : '—')
    ]);
    wrap.appendChild(statsBar);

    /* 病例选择 */
    const sel = el('select', { class: 'select', style: 'max-width:300px;margin-bottom:16px' });
    cases.forEach(c => sel.appendChild(el('option', { value: c.id }, c.title || c.id)));
    wrap.appendChild(el('div', { class: 'flex gap-sm items-center' }, [
      el('span', { class: 't-2', text: '选择病例：' }), sel,
      el('button', { class: 'btn btn-ghost btn-sm', onClick: () => regenerate(sel.value, wrap) }, '⟳ 用 AI 重新生成')
    ]));

    const list = el('div', {}, []);
    wrap.appendChild(list);

    sel.addEventListener('change', () => drawQuestions(sel.value, list, statsBar));
    drawQuestions(sel.value, list, statsBar);

    root.appendChild(wrap);
  }

  function statCard(ico, label, val) {
    return el('div', { class: 'stat' }, [
      el('div', { class: 's-ico', text: ico }),
      el('div', { class: 's-num', text: val }),
      el('div', { class: 's-label', text: label })
    ]);
  }

  function refreshStats(statsBar) {
    const cards = statsBar.querySelectorAll('.s-num');
    if (cards[0]) cards[0].textContent = String(store.getStudent().score);
    if (cards[1]) cards[1].textContent = String(stats.total);
    if (cards[2]) cards[2].textContent = stats.total ? Math.round(stats.correct / stats.total * 100) + '%' : '—';
  }

  function drawQuestions(caseId, list, statsBar) {
    list.innerHTML = '';
    const qs = store.getQuestionsByCase(caseId).filter(q => q.enabled);
    if (!qs.length) {
      list.appendChild(el('div', { class: 'empty' }, [el('div', { class: 'e-ico', text: '📚' }), el('p', { text: '该病例暂无题目，可使用上方「用 AI 重新生成」。' })]));
      return;
    }
    qs.forEach((q, i) => list.appendChild(renderQuestion(q, i + 1, statsBar)));
  }

  function renderQuestion(q, idx, statsBar) {
    const card = el('div', { class: 'quiz-card' });
    card.appendChild(el('div', { class: 'quiz-stem' }, [
      el('span', { class: 'tag ' + (q.type === 'essay' ? 'tag-warning' : 'tag-primary'), style: 'margin-right:8px', text: q.type === 'essay' ? '简答' : '选择' }),
      el('span', { text: idx + '. ' + q.stem })
    ]));

    const state = answered[q.id];
    const explainBox = el('div', { class: 'quiz-explain', style: 'display:none' });

    if (q.type === 'choice') {
      const optBox = el('div', {}, []);
      const letters = (q.options || []).map(o => o.charAt(0));
      (q.options || []).forEach(opt => {
        const letter = opt.charAt(0);
        const row = el('div', { class: 'quiz-opt' }, [
          el('span', { class: 'opt-key', text: letter }),
          el('span', { html: utils.inline(opt.slice(1).replace(/^[.、)]\s*/, '')) })
        ]);
        row.addEventListener('click', () => {
          if (answered[q.id]) return;
          const correct = letter === q.answer;
          answered[q.id] = { chosen: letter, correct };
          // 高亮
          optBox.querySelectorAll('.quiz-opt').forEach(r => {
            const l = r.querySelector('.opt-key').textContent;
            if (l === q.answer) r.classList.add('correct');
            else if (l === letter) r.classList.add('wrong');
          });
          score.applyQuizChoice(correct);
          stats.total++; if (correct) stats.correct++;
          showExplain(explainBox, q, correct ? '回答正确！' : '回答错误。');
          refreshStats(statsBar);
        });
        optBox.appendChild(row);
      });
      card.appendChild(optBox);
      // 若已作答，恢复状态
      if (state) {
        optBox.querySelectorAll('.quiz-opt').forEach(r => {
          const l = r.querySelector('.opt-key').textContent;
          if (l === q.answer) r.classList.add('correct');
          else if (l === state.chosen) r.classList.add('wrong');
        });
        showExplain(explainBox, q, state.correct ? '回答正确！' : '回答错误。');
        stats.total = Math.max(stats.total, 0);
      }
    } else {
      const ta = el('textarea', { class: 'textarea', placeholder: '请输入你的答案要点…' });
      const btn = el('button', { class: 'btn btn-primary btn-sm', text: '提交' });
      const essayWrap = el('div', { class: 'flex-col gap-sm' }, [ta, btn]);
      btn.addEventListener('click', async () => {
        if (answered[q.id]) return;
        const ans = ta.value.trim();
        if (!ans) { utils.toast('请先作答', 'warn'); return; }
        btn.disabled = true; btn.textContent = '评分中…';
        const percent = await scoreEssay(ans, q.answer, q);
        answered[q.id] = { correct: percent >= 0.6, percent };
        stats.total++; if (percent >= 0.6) stats.correct++;
        showExplain(explainBox, q, '评分：' + Math.round(percent * 100) + '%', percent);
        score.applyQuizEssay(percent);
        refreshStats(statsBar);
      });
      card.appendChild(essayWrap);
      if (state) {
        ta.value = '（已作答）';
        showExplain(explainBox, q, '评分：' + Math.round((state.percent || 0) * 100) + '%', state.percent);
      }
    }

    card.appendChild(explainBox);
    return card;
  }

  function showExplain(box, q, head, percent) {
    box.style.display = 'block';
    box.innerHTML = '';
    box.appendChild(el('div', { class: 'qe-title', text: head }));
    if (q.type === 'choice') {
      box.appendChild(el('div', { text: '正确答案：' + q.answer }));
    } else {
      box.appendChild(el('div', { text: '参考答案要点：' + (q.answer || '（无）') }));
    }
    box.appendChild(el('div', { style: 'margin-top:6px', text: '解析：' + (q.explanation || '（无）') }));
    box.appendChild(el('div', { class: 'text-xs t-muted', style: 'margin-top:6px', text: '知识点：' + (q.knowledgePoint || '（无）') }));
  }

  /* 简答题评分（mock 启发式：要点词命中率；真实 API 可用评分提示词增强） */
  async function scoreEssay(ans, ref, q) {
    if (api.getMode() === 'real') {
      try {
        const sys = '你是医学简答题评分助手。根据参考答案要点，对学生的回答给出 0~1 的得分比例与简短评语。严格返回 JSON：{"percent":0.0~1.0,"comment":"评语"}';
        const r = await api.chat([{ role: 'system', content: sys }, { role: 'user', content: '参考答案：' + ref + '\n学生回答：' + ans }], { mode: 'quiz' });
        const j = api.extractJson(r.content);
        return utils.clamp(j.percent || 0, 0, 1);
      } catch (e) { /* 回退启发式 */ }
    }
    const refWords = (ref || '').replace(/[（(].*?[)）]/g, '').split(/[，。、；,.\s]+/).filter(w => w.length >= 2);
    if (!refWords.length) return 0.7;
    let hit = 0;
    refWords.forEach(w => { if (ans.indexOf(w) >= 0) hit++; });
    return utils.clamp(hit / refWords.length, 0, 1);
  }

  /* 用 AI 重新生成该病例题库 */
  async function regenerate(caseId, wrap) {
    const c = store.getCase(caseId); if (!c) return;
    utils.toast('正在生成题目…', 'info');
    try {
      const qs = await api.generateQuiz(c, { quizPrompt: store.state.prompts.quiz });
      if (Array.isArray(qs) && qs.length) {
        // 清空该病例旧题并写入新题
        store.getQuestionsByCase(caseId).forEach(o => store.deleteQuestion(o.id));
        qs.forEach(item => store.addQuestion({
          caseId, type: item.type === 'essay' ? 'essay' : 'choice',
          stem: item.stem, options: item.options || [], answer: item.answer || '',
          explanation: item.explanation || '', knowledgePoint: item.knowledgePoint || '', difficulty: c.difficulty, enabled: true
        }));
        utils.toast('已重新生成 ' + qs.length + ' 道题', 'ok');
      } else {
        utils.toast('生成结果为空，未变更', 'warn');
      }
    } catch (e) {
      utils.toast('生成失败：' + (e.friendly || e.message), 'err');
    }
    // 重新渲染整页
    const content = document.querySelector('.content');
    if (content) render(content);
  }

  return { render };
})();
