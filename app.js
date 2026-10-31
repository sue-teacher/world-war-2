/* =========================================================================
   지수쌤과 함께하는 제2차 세계대전 탐험 — 앱 로직
   화면: home → learn(지도 학습) → order(순서 맞추기) → review(복습) → result
   순수 JS. 프레임워크/빌드 없음.
   ========================================================================= */
(function () {
  "use strict";

  const { EVENTS, ORDER_QUIZ, REVIEW_QUIZ } = window.WW2_DATA;
  const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
  const SORTED = EVENTS.slice().sort((a, b) => a.order - b.order);

  const stage = document.getElementById("stage");
  const topbar = document.getElementById("topbar");
  const stepNav = document.getElementById("stepNav");
  const scoreBadge = document.getElementById("scoreBadge");
  const scoreValue = document.getElementById("scoreValue");
  const scoreMax = document.getElementById("scoreMax");
  const progressFill = document.getElementById("progressFill");
  const toastEl = document.getElementById("toast");
  document.getElementById("homeBtn").addEventListener("click", () => go("home"));

  /* ---------------- 상태 ---------------- */
  const state = {
    route: "home",
    learnedMax: 0,       // 학습에서 마지막으로 본 사건 순번(진행도)
    orderDone: false,    // 순서 맞추기 완료 여부
    orderScore: 0,       // 순서 맞추기 맞힌 개수
    reviewPool: REVIEW_QUIZ.slice(), // 현재 복습 세션에서 풀 문제들
    reviewIsRetry: false,            // 틀린 문제만 다시 푸는 세션인지
    reviewIndex: 0,      // 복습 현재 문항(풀 내 위치)
    reviewScore: 0,      // 복습 맞힌 개수
    reviewAnswered: {},  // index -> 선택값
  };

  // 복습 세션 시작(pool: 풀 문제 배열, isRetry: 틀린문제 재도전 여부)
  function startReview(pool, isRetry) {
    state.reviewPool = pool;
    state.reviewIsRetry = !!isRetry;
    state.reviewIndex = 0;
    state.reviewScore = 0;
    state.reviewAnswered = {};
    go("review");
  }

  const STEPS = [
    { key: "learn", label: "지도 조사", emoji: "🗺️" },
    { key: "order", label: "순서 복원", emoji: "📋" },
    { key: "review", label: "복습 점검", emoji: "📝" },
  ];

  /* ---------------- 유틸 ---------------- */
  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach((k) => {
        if (k === "class") node.className = props[k];
        else if (k === "html") node.innerHTML = props[k];
        else if (k === "text") node.textContent = props[k];
        else if (k.startsWith("on") && typeof props[k] === "function") {
          node.addEventListener(k.slice(2).toLowerCase(), props[k]);
        } else if (k === "dataset") {
          Object.assign(node.dataset, props[k]);
        } else if (props[k] === true) node.setAttribute(k, "");
        else if (props[k] !== false && props[k] != null) node.setAttribute(k, props[k]);
      });
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null || c === false) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  let toastTimer = null;
  function toast(msg, kind) {
    toastEl.textContent = msg;
    toastEl.className = "toast show" + (kind ? " toast-" + kind : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.className = "toast";
    }, 1800);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ---------------- 라우팅 ---------------- */
  function go(route) {
    state.route = route;
    renderChrome();
    clear(stage);
    if (route === "home") renderHome();
    else if (route === "learn") renderLearn();
    else if (route === "order") renderOrder();
    else if (route === "review") renderReview();
    else if (route === "result") renderResult();
    window.scrollTo({ top: 0, behavior: "smooth" });
    stage.classList.remove("fade-in");
    void stage.offsetWidth;
    stage.classList.add("fade-in");
  }

  /* 상단바(학습 중에만 표시) 갱신 */
  function renderChrome() {
    const showTop = state.route !== "home";
    topbar.hidden = !showTop;
    if (!showTop) return;

    clear(stepNav);
    STEPS.forEach((s) => {
      const isCurrent =
        (s.key === "learn" && state.route === "learn") ||
        (s.key === "order" && state.route === "order") ||
        (s.key === "review" && (state.route === "review" || state.route === "result"));
      let done = false;
      if (s.key === "learn") done = state.learnedMax >= SORTED.length;
      if (s.key === "order") done = state.orderDone;
      if (s.key === "review") done = state.route === "result";

      const pill = el("button", {
        class: "step-pill" + (done ? " done" : ""),
        type: "button",
        "aria-current": isCurrent ? "true" : "false",
        onclick: () => go(s.key),
      }, [el("span", { "aria-hidden": "true" }, s.emoji), s.label + (done ? " ✓" : "")]);
      stepNav.appendChild(pill);
    });

    // 점수: 복습 진행 중일 때 의미 있음(현재 세션 풀 기준)
    const total = state.reviewPool.length;
    scoreValue.textContent = state.reviewScore;
    scoreMax.textContent = "/" + total;
    scoreBadge.style.visibility =
      state.route === "review" || state.route === "result" ? "visible" : "hidden";

    // 전체 진행도(3단계 기준)
    let prog = 0;
    if (state.learnedMax >= SORTED.length) prog += 1;
    if (state.orderDone) prog += 1;
    if (state.route === "result") prog += 1;
    progressFill.style.width = (prog / STEPS.length) * 100 + "%";
  }

  /* ============================================================
     홈
     ============================================================ */
  function renderHome() {
    const shell = el("div", { class: "home" });

    const hero = el("section", { class: "hero-brief" }, [
      el("p", { class: "hero-kicker" }, "작전 브리핑 · 중학교 2학년 세계사"),
      el("h1", { class: "home-title" }, [
        "세계지도로 보는 ",
        el("span", { class: "u" }, "제2차 세계대전"),
      ]),
      el("p", { class: "hero-desc" }, [
        "작전 지도실의 지도 요원이 되어 세계지도 위 주요 전장을 순서대로 조사하고,",
        el("br", {}),
        "사건의 순서를 복원한 뒤, 복습 임무로 기억을 점검해요.",
      ]),
      el("div", { class: "hero-cta" }, [
        el("button", { class: "btn btn-lg", type: "button", onclick: () => go("learn") },
          "지도 조사 시작"),
        el("button", { class: "btn btn-ghost btn-lg", type: "button", onclick: () => go("order") },
          "순서 복원 바로가기"),
      ]),
    ]);

    const ops = el("div", { class: "ops-grid" }, [
      opsCard("임무 01", "지도 조사", "세계지도의 번호 핀을 따라 8개 전장을 시간 순서대로 조사해요."),
      opsCard("임무 02", "순서 복원", "뒤섞인 작전 보고서에 올바른 순번을 매겨 전쟁의 흐름을 복원해요."),
      opsCard("임무 03", "복습 점검", "객관식·OX 문제로 핵심 정보를 다시 점검해요."),
    ]);

    const mapWrap = el("div", { class: "home-map-wrap" }, [
      el("div", { class: "osm-map", id: "homeMap" }),
    ]);

    shell.appendChild(hero);
    shell.appendChild(el("h2", { class: "section-title" }, "작전 순서"));
    shell.appendChild(ops);
    shell.appendChild(el("h2", { class: "section-title" }, "전장 지도"));
    shell.appendChild(mapWrap);
    shell.appendChild(el("p", { class: "home-map-hint" }, "핀 번호를 따라가면 전쟁의 흐름이 보입니다 · 조사를 시작하면 상세 브리핑이 열립니다"));
    stage.appendChild(shell);

    setTimeout(() => {
      const m = WAR_MAP.build(document.getElementById("homeMap"), SORTED, () => go("learn"));
      m.map.dragging.disable();
    }, 0);
  }

  function opsCard(step, title, desc) {
    return el("div", { class: "ops-card" }, [
      el("span", { class: "ops-step" }, step),
      el("p", { class: "ops-card-title" }, title),
      el("p", { class: "ops-card-desc" }, desc),
    ]);
  }

  /* ============================================================
     지도 학습
     ============================================================ */
  let learnMapApi = null;
  let currentLearnId = null;

  function renderLearn() {
    const shell = el("div", { class: "wrap" });

    shell.appendChild(el("div", { class: "page-top" }, [
      el("button", { class: "back-link", type: "button", onclick: () => go("home") }, "← 지도실"),
      el("h1", { class: "stage-title" }, "전장 지도 조사"),
    ]));

    const layout = el("div", { class: "learn-layout" }, [
      el("div", { class: "map-panel" }, [
        el("div", { class: "osm-map", id: "learnMap" }),
        el("p", { class: "map-guide" }, "지도의 번호 핀을 누르거나 ‹ › 버튼으로 순서대로 조사하세요"),
      ]),
      el("div", { class: "brief-col", id: "eventPanel" }),
    ]);
    shell.appendChild(layout);
    stage.appendChild(shell);

    setTimeout(() => {
      learnMapApi = WAR_MAP.build(document.getElementById("learnMap"), SORTED, (ev) => selectEvent(ev.id));
      // 처음 진입 시 첫 사건 또는 이어보기
      const startId = currentLearnId || SORTED[0].id;
      selectEvent(startId);
    }, 0);
  }

  function selectEvent(id) {
    currentLearnId = id;
    const ev = EVENT_BY_ID[id];
    if (!ev) return;
    state.learnedMax = Math.max(state.learnedMax, ev.order);
    if (learnMapApi) learnMapApi.focus(id);
    renderEventPanel(ev);
    renderChrome();
  }

  function renderEventPanel(ev) {
    const panel = document.getElementById("eventPanel");
    if (!panel) return;
    clear(panel);

    const idx = SORTED.findIndex((e) => e.id === ev.id);
    const prev = idx > 0 ? SORTED[idx - 1] : null;
    const next = idx < SORTED.length - 1 ? SORTED[idx + 1] : null;
    const isLast = idx === SORTED.length - 1;

    const head = el("div", { class: "brief-head", style: "background:" + ev.color + ";" }, [
      el("span", { class: "brief-no" }, String(ev.order)),
      el("span", { class: "event-banner-emoji", "aria-hidden": "true", style: "font-size:2.4rem;" }, ev.emoji),
      el("div", { class: "brief-head-txt" }, [
        el("h2", { class: "event-title" }, ev.title),
        el("p", { class: "brief-head-meta" }, ev.year + " · " + ev.place),
      ]),
    ]);

    const body = el("div", { class: "brief-body" });
    body.appendChild(el("p", { class: "brief-summary" }, ev.summary));
    ev.body.forEach((p) => body.appendChild(el("p", { class: "brief-para" }, p)));
    body.appendChild(el("p", { class: "brief-points-title" }, "핵심 정보"));
    const ul = el("ul", { class: "brief-points" });
    ev.points.forEach((pt) => ul.appendChild(el("li", {}, el("span", {}, pt))));
    body.appendChild(ul);

    const nav = el("div", { class: "brief-nav" }, [
      el("button", {
        class: "back-link",
        type: "button",
        disabled: !prev,
        onclick: () => prev && selectEvent(prev.id),
      }, "‹ 이전"),
      el("span", { class: "brief-counter" }, (idx + 1) + " / " + SORTED.length),
      isLast
        ? el("button", { class: "btn btn-rust", type: "button", onclick: () => go("order") }, "순서 복원 →")
        : el("button", { class: "btn btn-navy", type: "button", onclick: () => next && selectEvent(next.id) }, "다음 ›"),
    ]);

    const panelCard = el("div", { class: "brief" }, [head, body, nav]);
    panel.appendChild(panelCard);
  }

  /* ============================================================
     순서 맞추기 (번호 선택)
     ============================================================ */
  let orderShuffled = null;

  function renderOrder() {
    if (!orderShuffled) {
      orderShuffled = shuffle(ORDER_QUIZ.itemIds).map((id) => EVENT_BY_ID[id]);
    }
    const shell = el("div", { class: "wrap" });

    shell.appendChild(el("div", { class: "page-top" }, [
      el("button", { class: "back-link", type: "button", onclick: () => go("learn") }, "← 지도 조사"),
    ]));

    shell.appendChild(el("div", { class: "quiz-head" }, [
      el("h2", {}, ORDER_QUIZ.title),
      el("p", {}, ORDER_QUIZ.instruction),
    ]));

    const total = orderShuffled.length;
    const grid = el("div", { class: "order-grid", id: "orderGrid" });
    orderShuffled.forEach((ev) => {
      const sel = el("select", {
        class: "order-select",
        id: "sel-" + ev.id,
        "aria-label": ev.title + "의 순서 번호 선택",
      });
      sel.appendChild(el("option", { value: "" }, "선택"));
      for (let n = 1; n <= total; n++) {
        sel.appendChild(el("option", { value: String(n) }, String(n) + "번째"));
      }
      const card = el("div", { class: "order-card", id: "card-" + ev.id }, [
        el("span", { class: "order-card-emoji", "aria-hidden": "true" }, ev.emoji),
        el("div", { class: "order-card-body" }, [
          el("p", { class: "order-card-title" }, ev.title),
          el("p", { class: "order-card-place" }, ev.year + "년 · " + ev.place),
        ]),
        el("span", { class: "order-result-icon", id: "icon-" + ev.id }, ""),
        el("div", { class: "order-select-wrap" }, [
          el("span", { class: "order-select-label" }, "순서"),
          sel,
        ]),
      ]);
      grid.appendChild(card);
    });
    shell.appendChild(grid);

    const feedback = el("div", { id: "orderFeedback" });
    shell.appendChild(feedback);

    shell.appendChild(el("div", { class: "quiz-actions" }, [
      el("button", { class: "btn", type: "button", id: "orderCheckBtn", onclick: checkOrder }, "채점하기"),
    ]));

    stage.appendChild(shell);
  }

  function checkOrder() {
    const total = orderShuffled.length;
    const picks = {};
    let allFilled = true;
    orderShuffled.forEach((ev) => {
      const v = document.getElementById("sel-" + ev.id).value;
      if (!v) allFilled = false;
      picks[ev.id] = v ? parseInt(v, 10) : null;
    });

    if (!allFilled) {
      toast("모든 사건에 순서를 골라주세요!", "bad");
      return;
    }

    // 중복 선택 확인
    const used = Object.values(picks);
    const dup = used.length !== new Set(used).size;

    let correct = 0;
    orderShuffled.forEach((ev) => {
      const card = document.getElementById("card-" + ev.id);
      const icon = document.getElementById("icon-" + ev.id);
      const sel = document.getElementById("sel-" + ev.id);
      const ok = picks[ev.id] === ev.order;
      card.classList.remove("ok", "ng");
      card.classList.add(ok ? "ok" : "ng");
      icon.textContent = ok ? "✅" : "❌";
      sel.disabled = false;
      if (ok) correct++;
    });

    state.orderScore = correct;
    state.orderDone = correct === total;
    renderChrome();

    const fb = document.getElementById("orderFeedback");
    clear(fb);
    const perfect = correct === total;
    const box = el("div", { class: "order-feedback " + (perfect ? "good" : "bad") }, [
      el("h3", {}, perfect ? "작전 순서 복원 완료!" : total + "개 중 " + correct + "개 일치"),
      el("p", {}, perfect
        ? "전쟁의 흐름을 정확히 복원했어요. 이제 복습 임무로 마무리해요!"
        : (dup ? "같은 번호를 두 번 쓴 곳이 있어요. 번호가 겹치지 않게 다시 골라보세요." : "빨간 줄로 표시된 보고서의 순서를 바꿔 다시 채점해 보세요.")),
    ]);
    fb.appendChild(box);

    if (perfect) {
      box.appendChild(el("div", { style: "margin-top:14px;text-align:center;" }, [
        el("button", { class: "btn btn-rust", type: "button", onclick: () => go("review") }, "복습 임무 →"),
      ]));
      toast("순서 완성! 잘했어요 🎉", "good");
    } else {
      toast(correct + " / " + total + " 맞았어요", correct > total / 2 ? "good" : "bad");
    }
  }

  /* ============================================================
     복습 퀴즈 (객관식 / OX)
     ============================================================ */
  function renderReview() {
    const pool = state.reviewPool;
    const idx = state.reviewIndex;
    const q = pool[idx];
    const total = pool.length;
    const shell = el("div", { class: "wrap" });

    shell.appendChild(el("div", { class: "page-top" }, [
      el("button", { class: "back-link", type: "button", onclick: () => go("order") }, "← 순서 복원"),
      state.reviewIsRetry
        ? el("span", { class: "retry-tag" }, "틀린 문제 다시 풀기")
        : null,
    ]));

    shell.appendChild(el("div", { class: "quiz-top" }, [
      el("span", { class: "quiz-progress-text" }, "임무 " + (idx + 1) + " / " + total),
      el("span", { class: "quiz-score" }, "점수 " + state.reviewScore),
    ]));

    const answered = Object.prototype.hasOwnProperty.call(state.reviewAnswered, idx);
    const picked = state.reviewAnswered[idx];

    const card = el("div", { class: "question-card" }, [
      el("span", { class: "question-type-tag" + (q.type === "ox" ? " ox" : "") }, q.type === "ox" ? "O / X" : "객관식"),
      el("h2", { class: "question-text" }, q.question),
      buildChoices(q, idx, answered, picked),
    ]);
    shell.appendChild(card);

    // 피드백
    if (answered) {
      const isCorrect = checkAnswer(q, picked);
      shell.appendChild(el("div", { class: "feedback " + (isCorrect ? "good" : "bad") }, [
        el("p", { class: "feedback-head" }, [
          el("span", { "aria-hidden": "true" }, isCorrect ? "✔" : "✕"),
          isCorrect ? "정답이에요!" : "아쉬워요, 다시 확인해요.",
        ]),
        el("p", { class: "feedback-text" }, q.explain),
      ]));
    }

    const isLast = idx === total - 1;
    const nav = el("div", { class: "quiz-nav" }, [
      idx > 0
        ? el("button", { class: "back-link", type: "button", onclick: () => { state.reviewIndex--; go("review"); } }, "‹ 이전")
        : null,
      answered
        ? (isLast
            ? el("button", { class: "btn btn-rust", type: "button", onclick: () => go("result") }, "결과 보기")
            : el("button", { class: "btn btn-navy", type: "button", onclick: () => { state.reviewIndex++; go("review"); } }, "다음 ›"))
        : null,
    ]);
    shell.appendChild(nav);

    stage.appendChild(shell);
  }

  function buildChoices(q, idx, answered, picked) {
    if (q.type === "ox") {
      const wrap = el("div", { class: "choices ox-choices" });
      [{ label: "O 맞아요", val: true }, { label: "X 아니에요", val: false }].forEach((opt) => {
        wrap.appendChild(oxOrMcqButton(q, idx, answered, picked, opt.val, opt.label, true));
      });
      return wrap;
    }
    const wrap = el("div", { class: "choices" });
    q.choices.forEach((text, i) => {
      wrap.appendChild(oxOrMcqButton(q, idx, answered, picked, i, text, false));
    });
    return wrap;
  }

  function oxOrMcqButton(q, idx, answered, picked, value, label, isOx) {
    let cls = "choice";
    if (answered) {
      const correctVal = q.answer;
      const isThisCorrect = value === correctVal;
      const isThisPicked = value === picked;
      if (isThisCorrect) cls += " correct";
      else if (isThisPicked) cls += " wrong";
    }
    const children = [];
    if (!isOx) {
      children.push(el("span", { class: "choice-mark", "aria-hidden": "true" }, String.fromCharCode(65 + value)));
    }
    children.push(el("span", {}, label));

    return el("button", {
      class: cls,
      type: "button",
      disabled: answered,
      onclick: () => answerReview(idx, value),
    }, children);
  }

  function checkAnswer(q, picked) {
    return picked === q.answer;
  }

  function answerReview(idx, value) {
    if (Object.prototype.hasOwnProperty.call(state.reviewAnswered, idx)) return;
    state.reviewAnswered[idx] = value;
    const q = state.reviewPool[idx];
    const correct = checkAnswer(q, value);
    if (correct) {
      state.reviewScore++;
      toast("정답!", "good");
    } else {
      toast("오답", "bad");
    }
    renderChrome();
    go("review");
  }

  /* ============================================================
     결과
     ============================================================ */
  function renderResult() {
    const pool = state.reviewPool;
    const total = pool.length;
    const score = state.reviewScore;
    const ratio = total ? score / total : 0;
    const shell = el("div", { class: "wrap" });

    // 이번 세션에서 틀린 문제 모으기
    const wrong = pool.filter((q, i) => !checkAnswer(q, state.reviewAnswered[i]));

    let stamp, emoji, title, msg, rank;
    if (ratio === 1) {
      stamp = "S"; emoji = "🗺️"; title = "최고 사령관"; rank = 3;
      msg = "모든 임무를 완수했어요. 제2차 세계대전의 흐름을 완벽하게 이해했네요!";
    } else if (ratio >= 0.6) {
      stamp = "A"; emoji = "🧭"; title = "우수 지도 요원"; rank = 2;
      msg = "대부분의 임무를 잘 수행했어요. 틀린 문제를 한 번 더 점검하면 완벽해질 거예요.";
    } else {
      stamp = "B"; emoji = "📻"; title = "훈련 중인 요원"; rank = 1;
      msg = "지도 조사를 다시 하고 오면 훨씬 쉬워져요. 포기하지 말고 다시 도전!";
    }

    const ribbons = el("div", { class: "result-ribbons", "aria-label": "등급 " + rank + " / 3" });
    for (let i = 1; i <= 3; i++) {
      ribbons.appendChild(el("span", { class: "result-ribbon" + (i <= rank ? " on" : ""), "aria-hidden": "true" }, i <= rank ? "★" : "☆"));
    }

    shell.appendChild(el("div", { class: "result" }, [
      el("div", { class: "result-stamp", "aria-hidden": "true" }, "RANK " + stamp),
      el("div", { class: "result-emoji", "aria-hidden": "true" }, emoji),
      el("h2", { class: "result-title" }, title),
      ribbons,
      el("p", { class: "result-score" }, [
        "복습 점수 ",
        el("span", { class: "num" }, score + " / " + total),
      ]),
      el("p", { class: "result-msg" }, msg),
      el("div", { class: "result-actions" }, [
        wrong.length > 0
          ? el("button", {
              class: "btn btn-rust", type: "button",
              onclick: () => startReview(wrong.slice(), true),
            }, "틀린 문제 다시 풀기 (" + wrong.length + ")")
          : null,
        el("button", { class: "btn btn-navy", type: "button", onclick: () => go("learn") }, "지도 다시 조사"),
        el("button", { class: "btn btn-ghost", type: "button", onclick: () => startReview(REVIEW_QUIZ.slice(), false) }, "전체 복습 다시"),
        el("button", { class: "btn btn-ghost", type: "button", onclick: () => go("home") }, "지도실로"),
      ]),
    ]));

    stage.appendChild(shell);
  }

  /* ---------------- 시작 ---------------- */
  go("home");
})();
