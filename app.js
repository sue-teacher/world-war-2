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
    reviewCleared: false,            // 복습(전체) 1회 이상 완료했는지
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
  // 화면 전환 시 항상 맨 위로. 렌더 직후·다음 프레임 모두에서 보장.
  function scrollToTop() {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }

  function go(route) {
    state.route = route;
    scrollToTop();
    renderChrome();
    clear(stage);
    if (route === "home") renderHome();
    else if (route === "learn") renderLearn();
    else if (route === "order") renderOrder();
    else if (route === "review") renderReview();
    else if (route === "result") renderResult();
    stage.classList.remove("fade-in");
    void stage.offsetWidth;
    stage.classList.add("fade-in");
    // 렌더로 레이아웃이 바뀐 뒤에도 한 번 더 상단 보장(지도 빌드 등 대비)
    scrollToTop();
    requestAnimationFrame(scrollToTop);
  }

  /* 상단바(학습 중에만 표시) 갱신 */
  function renderChrome() {
    const showTop = state.route !== "home";
    topbar.hidden = !showTop;
    if (!showTop) return;

    // 단계 잠금 규칙(홈과 동일): 앞 단계를 완료해야 다음 단계가 열린다.
    const learnDone = state.learnedMax >= SORTED.length;
    const orderDone = state.orderDone;
    const unlocked = {
      learn: true,
      order: learnDone,
      review: orderDone,
    };

    clear(stepNav);
    STEPS.forEach((s, i) => {
      const isCurrent =
        (s.key === "learn" && state.route === "learn") ||
        (s.key === "order" && state.route === "order") ||
        (s.key === "review" && (state.route === "review" || state.route === "result"));
      let done = false;
      if (s.key === "learn") done = learnDone;
      if (s.key === "order") done = orderDone;
      if (s.key === "review") done = state.route === "result";

      const isUnlocked = unlocked[s.key];
      const pill = el("button", {
        class: "step-pill" + (done ? " done" : "") + (isUnlocked ? "" : " locked"),
        type: "button",
        disabled: !isUnlocked,
        "aria-current": isCurrent ? "true" : "false",
        "aria-disabled": isUnlocked ? "false" : "true",
        "aria-label": (i + 1) + "단계 " + s.label + (done ? " 완료" : "") + (isUnlocked ? "" : " 잠김"),
        title: isUnlocked ? "" : "이전 임무를 먼저 완료하세요",
        onclick: () => { if (isUnlocked) go(s.key); },
      }, [
        // 모바일: 번호 원형(1·2·3) / 데스크톱: 이모지도 함께
        el("span", { class: "step-no", "aria-hidden": "true" }, isUnlocked ? String(i + 1) : "🔒"),
        el("span", { class: "step-emoji", "aria-hidden": "true" }, isUnlocked ? s.emoji : ""),
        el("span", { class: "step-label" }, s.label + (done ? " ✓" : "")),
      ]);
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
      el("p", { class: "hero-kicker" }, "지수쌤과 작전브리핑"),
      el("h1", { class: "home-title" }, [
        "세계지도로 보는",
        el("br", { class: "br-mobile" }),
        " ",
        el("span", { class: "u" }, "제2차 세계대전"),
      ]),
      el("p", { class: "hero-desc" }, [
        "작전 브리핑의 지도 요원이 되어 세계지도 위 주요 전장을 순서대로 조사하고,",
        el("br", {}),
        "사건의 순서를 복원한 뒤, 복습 임무로 기억을 점검해요.",
      ]),
    ]);

    // 임무 잠금 상태: 앞 단계를 완료해야 다음 단계가 열린다.
    const learnDone = state.learnedMax >= SORTED.length;
    const orderDone = state.orderDone;
    const reviewDone = state.reviewCleared;

    const ops = el("div", { class: "ops-grid" }, [
      opsCard({
        step: "임무 01", title: "지도 조사",
        desc: "세계지도의 번호 핀을 따라 8개 전장을 시간 순서대로 조사해요.",
        route: "learn", unlocked: true, done: learnDone,
      }),
      opsCard({
        step: "임무 02", title: "순서 복원",
        desc: "뒤섞인 작전 보고서에 올바른 순번을 매겨 전쟁의 흐름을 복원해요.",
        route: "order", unlocked: learnDone, done: orderDone,
      }),
      opsCard({
        step: "임무 03", title: "복습 점검",
        desc: "객관식·OX 문제로 핵심 정보를 다시 점검해요.",
        route: "review", unlocked: orderDone, done: reviewDone,
      }),
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
      // 홈 지도도 마우스 드래그로 이동 가능(build에서 dragging: true)
      WAR_MAP.build(document.getElementById("homeMap"), SORTED, () => go("learn"));
    }, 0);
  }

  function opsCard(opt) {
    const { step, title, desc, route, unlocked, done } = opt;
    const state2 = done ? "done" : (unlocked ? "open" : "locked");

    let btn;
    if (!unlocked) {
      btn = el("button", {
        class: "ops-start locked", type: "button", disabled: true,
        "aria-label": title + " 잠김 — 이전 임무를 먼저 완료하세요",
      }, [el("span", { "aria-hidden": "true" }, "🔒 "), "잠김"]);
    } else {
      btn = el("button", {
        class: "ops-start" + (done ? " again" : ""),
        type: "button",
        onclick: () => go(route),
      }, done ? "다시 하기" : "시작");
    }

    return el("div", { class: "ops-card " + state2 }, [
      el("div", { class: "ops-card-head" }, [
        el("span", { class: "ops-step" }, step),
        done ? el("span", { class: "ops-badge" }, "완료 ✓") : null,
      ]),
      el("p", { class: "ops-card-title" }, title),
      el("p", { class: "ops-card-desc" }, desc),
      btn,
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
        el("div", { class: "map-guide-row" }, [
          el("span", { class: "map-guide" }, "번호 핀을 누르거나 ‹ › 버튼으로 순서대로 조사하세요"),
          el("button", {
            class: "map-reset-btn", type: "button",
            onclick: () => learnMapApi && learnMapApi.resetView(),
          }, "🌍 전체 지도 보기"),
        ]),
      ]),
      el("div", { class: "brief-col", id: "eventPanel" }),
    ]);
    shell.appendChild(layout);
    stage.appendChild(shell);

    setTimeout(() => {
      learnMapApi = WAR_MAP.build(
        document.getElementById("learnMap"),
        SORTED,
        (ev) => selectEvent(ev.id),
        { fitWorld: false }
      );
      // 처음 진입 시 첫 사건 또는 이어보기. 지도 크기 측정 후 확대되도록 약간 지연.
      const startId = currentLearnId || SORTED[0].id;
      learnMapApi.map.invalidateSize();
      setTimeout(() => selectEvent(startId), 120);
    }, 0);
  }

  function selectEvent(id, scrollTop) {
    currentLearnId = id;
    const ev = EVENT_BY_ID[id];
    if (!ev) return;
    state.learnedMax = Math.max(state.learnedMax, ev.order);
    // 사건 선택 시 해당 지역으로 확대·이동
    if (learnMapApi) learnMapApi.focus(id, true);
    renderEventPanel(ev);
    renderChrome();
    // 이전/다음 버튼으로 넘길 때는 화면 맨 위로 스크롤
    if (scrollTop) window.scrollTo({ top: 0, behavior: "smooth" });
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
        onclick: () => prev && selectEvent(prev.id, true),
      }, "‹ 이전"),
      el("span", { class: "brief-counter" }, (idx + 1) + " / " + SORTED.length),
      isLast
        ? el("button", { class: "btn btn-rust", type: "button", onclick: () => go("order") }, "순서 복원 →")
        : el("button", { class: "btn btn-navy", type: "button", onclick: () => next && selectEvent(next.id, true) }, "다음 ›"),
    ]);

    const panelCard = el("div", { class: "brief" }, [head, body, nav]);
    panel.appendChild(panelCard);
  }

  /* ============================================================
     순서 맞추기 (번호 선택)
     ============================================================ */
  let orderShuffled = null;
  let orderPicks = {};      // 사용자가 고른 순번(id -> number) 기억
  let orderGraded = false;  // 한 번 채점했는지(다시 들어와도 결과 복원)

  function renderOrder() {
    if (!orderShuffled) {
      orderShuffled = shuffle(ORDER_QUIZ.itemIds).map((id) => EVENT_BY_ID[id]);
    }
    const shell = el("div", { class: "wrap" });

    shell.appendChild(el("div", { class: "page-top" }, [
      el("button", { class: "back-link", type: "button", onclick: () => go("learn") }, "← 지도 조사"),
    ]));

    // instruction은 배열(여러 줄) 또는 문자열(한 줄) 모두 지원
    const instrLines = Array.isArray(ORDER_QUIZ.instruction)
      ? ORDER_QUIZ.instruction
      : [ORDER_QUIZ.instruction];
    const instrChildren = [];
    instrLines.forEach((line, i) => {
      if (i > 0) instrChildren.push(el("br", {}));
      instrChildren.push(line);
    });
    shell.appendChild(el("div", { class: "quiz-head" }, [
      el("h2", {}, ORDER_QUIZ.title),
      el("p", {}, instrChildren),
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
      // 이전에 고른 값이 있으면 복원(임무2로 다시 돌아와도 유지)
      if (orderPicks[ev.id]) sel.value = String(orderPicks[ev.id]);
      // 연도 힌트: 기본 숨김, 버튼을 눌러야 보임(정답 노출 방지)
      const yearSpan = el("span", {
        class: "order-year-hint", id: "yh-" + ev.id, hidden: true,
      }, ev.year + "년");
      const hintBtn = el("button", {
        class: "order-hint-btn", type: "button",
        "aria-expanded": "false",
        "aria-controls": "yh-" + ev.id,
        onclick: (e) => {
          const btn = e.currentTarget;
          const shown = !yearSpan.hidden;
          yearSpan.hidden = shown;
          btn.setAttribute("aria-expanded", shown ? "false" : "true");
          btn.textContent = shown ? "💡 연도 힌트" : "🙈 힌트 숨기기";
        },
      }, "💡 연도 힌트");

      const card = el("div", { class: "order-card", id: "card-" + ev.id }, [
        el("span", { class: "order-card-emoji", "aria-hidden": "true" }, ev.emoji),
        el("div", { class: "order-card-body" }, [
          el("p", { class: "order-card-title" }, ev.title),
          el("p", { class: "order-card-place" }, [
            ev.place,
            el("span", { class: "order-hint-wrap" }, [hintBtn, yearSpan]),
          ]),
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

    // 이미 채점한 적이 있으면(임무2로 되돌아온 경우) 결과 화면을 그대로 복원
    if (orderGraded) checkOrder(true);
  }

  function checkOrder(silent) {
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

    // 고른 값 기억(다시 돌아와도 복원) + 채점함 표시
    orderPicks = Object.assign({}, picks);
    orderGraded = true;

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
      // 채점 후에는 연도를 공개(확인용)하고 힌트 버튼은 숨김
      const yh = document.getElementById("yh-" + ev.id);
      if (yh) yh.hidden = false;
      const hb = card.querySelector(".order-hint-btn");
      if (hb) hb.hidden = true;
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
      if (!silent) toast("순서 완성! 잘했어요 🎉", "good");
    } else if (!silent) {
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
    // 전체 복습을 한 번이라도 끝내면 '복습 점검' 임무를 완료로 표시
    if (!state.reviewIsRetry) state.reviewCleared = true;
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
        // 틀린 문제가 남아 있으면: 다시 풀기 / 모두 맞혔으면: 처음부터 다시 시작
        wrong.length > 0
          ? el("button", {
              class: "btn btn-rust", type: "button",
              onclick: () => startReview(wrong.slice(), true),
            }, "틀린 문제 다시 풀기 (" + wrong.length + ")")
          : el("button", {
              class: "btn btn-rust", type: "button",
              onclick: restartAll,
            }, "🔄 작전 브리핑 다시 시작하기"),
        el("button", { class: "btn btn-navy", type: "button", onclick: () => go("learn") }, "지도 다시 조사"),
        el("button", { class: "btn btn-ghost", type: "button", onclick: () => go("home") }, "지도실로"),
      ]),
    ]));

    stage.appendChild(shell);
  }

  // 작전 브리핑 전체 처음부터 다시 시작(모든 진행 상태 초기화 후 지도 조사로)
  function restartAll() {
    state.learnedMax = 0;
    state.orderDone = false;
    state.orderScore = 0;
    state.reviewCleared = false;
    state.reviewPool = REVIEW_QUIZ.slice();
    state.reviewIsRetry = false;
    state.reviewIndex = 0;
    state.reviewScore = 0;
    state.reviewAnswered = {};
    // 순서 복원·지도 조사 로컬 상태 초기화
    orderShuffled = null;
    orderPicks = {};
    orderGraded = false;
    currentLearnId = null;
    toast("작전 브리핑을 처음부터 다시 시작해요!", "good");
    go("learn");
  }

  /* ---------------- 시작 ---------------- */
  go("home");
})();
