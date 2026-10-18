/* Day 플래너 — 화면과 시트 동기화 */
(function () {
  'use strict';
  const C = window.DayCore;
  const WD = C.WD;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const LS = {
    get(k, d) { try { const v = localStorage.getItem('day.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('day.' + k, JSON.stringify(v)); } catch (e) { /* 저장 못 해도 화면은 동작 */ } },
    del(k) { try { localStorage.removeItem('day.' + k); } catch (e) { /* noop */ } },
  };

  const I = {
    left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    repeat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 2.5 20.5 6 17 9.5M3.5 11.5V10a4 4 0 0 1 4-4h13M7 21.5 3.5 18 7 14.5M20.5 12.5V14a4 4 0 0 1-4 4h-13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z M10 20a2.2 2.2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="12" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  const S = {
    url: LS.get('url', ''),
    sheetUrl: LS.get('sheetUrl', ''),
    sheetTitle: LS.get('sheetTitle', ''),
    tab: LS.get('tab', 'cal'),
    weekStart: LS.get('weekStart', 0),
    theme: LS.get('theme', ''),
    raw: null,
    data: null,
    done: new Map(),
    outbox: LS.get('outbox', []),
    inflight: [],
    syncing: false,
    status: 'idle',
    error: '',
    lastSync: 0,
    lastTry: 0,
    today: C.today(),
    sel: null,
    view: null,
    month: null,
    alertsNow: [],
    popKey: '',
  };
  S.sel = S.today;
  S.view = S.today;

  /* ── 날짜 글자 ───────────────────────── */
  const monthOf = (d) => { const p = C.parts(d); return { y: p.y, m: p.m }; };
  const yearPrefix = (d) => (C.parts(d).y !== C.parts(S.today).y ? `${C.parts(d).y}년 ` : '');
  const fmtLong = (d) => { const p = C.parts(d); return `${yearPrefix(d)}${p.m}월 ${p.d}일 ${WD[C.weekday(d)]}요일`; };
  const fmtShort = (d) => { const p = C.parts(d); return `${yearPrefix(d)}${p.m}월 ${p.d}일 (${WD[C.weekday(d)]})`; };
  const fmtMD = (d) => { const p = C.parts(d); return `${p.m}/${p.d}`; };
  function rel(d) {
    const n = C.diffDays(S.today, d);
    if (n === 0) return '오늘';
    if (n === 1) return '내일';
    if (n === 2) return '모레';
    if (n === -1) return '어제';
    return n > 0 ? `${n}일 후` : `${-n}일 전`;
  }
  const ddayText = (left) => (left === 0 ? 'D-DAY' : `D-${left}`);

  /* ── 예시 데이터 (시트 연결 전) ───────────────────────── */
  function demoRaw() {
    const t = S.today;
    const a = (k) => C.addDays(t, k);
    return {
      events: [
        { row: 2, 날짜: '', 시작: '07:00', 끝: '07:40', 제목: '아침 운동', 반복: '매일', 메모: '스트레칭 + 러닝' },
        { row: 3, 날짜: t, 시작: '10:00', 끝: '11:00', 제목: '팀 회의', 반복: '매주' },
        { row: 4, 날짜: a(3), 시작: '18:00', 제목: '기획서 마감', 알림: '3일 전', 메모: 'PDF로 제출' },
        { row: 5, 날짜: a(1), 시작: '19:30', 제목: '친구랑 저녁', 메모: '강남역' },
        { row: 6, 날짜: a(9), 제목: '엄마 생신', 반복: '매년', 알림: '1주 전' },
        { row: 7, 날짜: '', 제목: '카드값 확인', 반복: '매월 25일', 알림: '2일 전' },
        { row: 8, 날짜: a(-4), 시작: '14:00', 끝: '15:00', 제목: '치과' },
        { row: 9, 날짜: a(12), 시작: '09:00', 제목: '토익 시험', 알림: '2주 전' },
      ],
      tasks: [
        { row: 2, 날짜: '', 할일: '물 2L 마시기', 반복: '매일' },
        { row: 3, 날짜: '', 할일: '영어 단어 30개', 반복: '평일' },
        { row: 4, 날짜: '', 할일: '일기 쓰기', 반복: '매일', 메모: '자기 전에' },
        { row: 5, 날짜: t, 할일: '택배 반품 보내기' },
        { row: 6, 날짜: a(2), 할일: '과제 제출', 알림: '2일 전' },
        { row: 7, 날짜: a(-2), 할일: '보고서 초안 쓰기' },
        { row: 8, 날짜: '', 할일: '방 청소', 반복: '주간' },
        { row: 9, 날짜: '', 할일: '분리수거', 반복: '화,금' },
        { row: 10, 날짜: '', 할일: '책 반납하기' },
      ],
      done: [{ 날짜: t, 할일: '물 2L 마시기', 완료시각: t }],
    };
  }

  function currentRaw() {
    if (S.url) return S.raw || { events: [], tasks: [], done: [] };
    const demo = demoRaw();
    const adds = LS.get('demoAdds', { events: [], tasks: [] });
    return {
      events: demo.events.concat(adds.events),
      tasks: demo.tasks.concat(adds.tasks),
      done: LS.get('demoDone', null) || demo.done,
    };
  }

  /* 시트 데이터 + 아직 시트에 안 올라간 변경(대기열)을 합쳐서 화면용 데이터로 */
  function rebuild() {
    const raw = currentRaw();
    const r = { events: raw.events.slice(), tasks: raw.tasks.slice(), done: raw.done.slice() };
    const pend = S.url ? S.inflight.concat(S.outbox) : [];
    let n = 0;
    for (const op of pend) {
      if (op.action === 'add') (op.kind === 'event' ? r.events : r.tasks).push(Object.assign({}, op.row, { row: 'new' + (++n), pending: true }));
    }
    S.data = C.normalize(r);
    S.done = S.data.done;
    for (const op of pend) {
      if (op.action !== 'toggle') continue;
      const k = C.keyOf(op.date, op.title);
      if (op.done) S.done.set(k, op.at || S.today);
      else S.done.delete(k);
    }
  }

  /* ── 시트와 주고받기 ───────────────────────── */
  async function api(body, url) {
    const u = url || S.url;
    const res = body
      ? await fetch(u, { method: 'POST', body: JSON.stringify(body) }) // text/plain → 사전 요청 없이 바로 감
      : await fetch(u + (u.includes('?') ? '&' : '?') + '_=' + Date.now(), { cache: 'no-store' });
    const text = await res.text();
    let j;
    try { j = JSON.parse(text); } catch (e) {
      throw new Error('시트가 응답하지 않아요. 배포할 때 액세스 권한을 "모든 사용자"로 했는지 확인해주세요.');
    }
    if (!j.ok) throw new Error(j.error || '시트에서 오류가 났어요');
    return j;
  }

  function friendly(e) {
    if (e && e.name === 'TypeError') return navigator.onLine === false ? '인터넷이 끊겨 있어요.' : '시트에 닿지 못했어요. URL이 맞는지 확인해주세요.';
    return (e && e.message) || String(e);
  }

  function applyServer(j) {
    S.raw = { events: j.events || [], tasks: j.tasks || [], done: j.done || [] };
    LS.set('cache', S.raw);
    if (j.sheetUrl) { S.sheetUrl = j.sheetUrl; LS.set('sheetUrl', j.sheetUrl); }
    if (j.title) { S.sheetTitle = j.title; LS.set('sheetTitle', j.title); }
    S.lastSync = Date.now();
    S.status = 'ok';
    S.error = '';
  }

  const saveOutbox = () => LS.set('outbox', S.inflight.concat(S.outbox));

  async function sync(manual) {
    if (!S.url) { rebuild(); render(); if (manual) toast('예시 화면이에요. ⚙ 설정에서 시트를 연결해주세요'); return; }
    if (S.syncing) { S.again = true; return; }
    S.syncing = true;
    S.lastTry = Date.now();
    updateStatus();
    try {
      let j;
      if (S.outbox.length) {
        S.inflight = S.outbox;
        S.outbox = [];
        j = await api({ ops: S.inflight });
        S.inflight = [];
        saveOutbox();
      } else {
        j = await api();
      }
      applyServer(j);
      if (manual) toast('시트에서 새로 불러왔어요');
    } catch (e) {
      if (S.inflight.length) { S.outbox = S.inflight.concat(S.outbox); S.inflight = []; saveOutbox(); }
      S.status = navigator.onLine === false ? 'offline' : 'error';
      S.error = friendly(e);
      if (manual) toast(S.error);
    } finally {
      S.syncing = false;
      rebuild();
      render();
      if (S.again) { S.again = false; setTimeout(sync, 200); }
    }
  }

  function queue(op) {
    op.id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    if (op.action === 'toggle') S.outbox = S.outbox.filter((o) => !(o.action === 'toggle' && o.date === op.date && o.title === op.title));
    S.outbox.push(op);
    saveOutbox();
    rebuild();
    render();
    clearTimeout(S.flushTimer);
    S.flushTimer = setTimeout(sync, 700); // 연달아 체크하면 한 번에 묶어서 보냄
  }

  /* ── 체크 · 추가 ───────────────────────── */
  function toggle(date, title) {
    const k = C.keyOf(date, title);
    const done = !S.done.has(k);
    S.popKey = done ? k : '';
    if (navigator.vibrate && done) { try { navigator.vibrate(8); } catch (e) { /* noop */ } }
    if (S.url) return queue({ action: 'toggle', date, title, done, at: S.today });
    let list = LS.get('demoDone', null) || demoRaw().done;
    list = list.filter((r) => !(r.날짜 === date && r.할일 === title));
    if (done) list.push({ 날짜: date, 할일: title, 완료시각: S.today });
    LS.set('demoDone', list);
    rebuild();
    render();
  }

  function addRow(kind, row) {
    if (S.url) return queue({ action: 'add', kind, row });
    const adds = LS.get('demoAdds', { events: [], tasks: [] });
    const list = kind === 'event' ? adds.events : adds.tasks;
    list.push(Object.assign({ row: 100 + list.length }, row));
    LS.set('demoAdds', adds);
    rebuild();
    render();
  }

  /* ── 조각 HTML ───────────────────────── */
  function tags(it, opts) {
    opts = opts || {};
    let h = '';
    if (opts.note && !it.dateBad) h += `<span class="tag">${esc(opts.note)}</span>`;
    if (opts.late) h += `<span class="tag late">${esc(opts.late)}</span>`;
    if (it.dateBad) h += '<span class="tag late">날짜를 못 읽음 · 시트 확인</span>';
    if (it.rep && it.rep.label) h += `<span class="tag">${I.repeat}${esc(it.rep.label)}</span>`;
    if (it.alert != null) h += `<span class="tag alert">${I.bell}${esc(C.alertLabel(it.alert))}</span>`;
    if (it.pending) h += '<span class="tag pending">시트에 저장 중</span>';
    if (it.memo) h += `<span class="memo">${esc(it.memo)}</span>`;
    return h ? `<span class="meta">${h}</span>` : '';
  }

  function taskHtml(t, opts) {
    const done = S.done.has(t.key);
    const pop = done && S.popKey === t.key ? ' pop' : '';
    return `<button class="task${done ? ' done' : ''}${pop}" data-action="toggle" data-date="${esc(t.dateKey)}" data-title="${esc(t.title)}" role="checkbox" aria-checked="${done}">
      <span class="box">${I.check}</span>
      <span class="task-body"><span class="task-title">${esc(t.title)}</span>${tags(t, opts)}</span>
    </button>`;
  }

  function evHtml(e) {
    const time = e.start
      ? `<div class="ev-time">${e.start}${e.end ? `<small>~ ${e.end}</small>` : ''}</div>`
      : '<div class="ev-time allday">종일</div>';
    return `<div class="ev${e.alert != null ? ' alert' : ''}">${time}<div class="ev-bar"></div>
      <div class="ev-body"><div class="ev-title">${esc(e.title)}</div>${tags(e)}</div></div>`;
  }

  function alertHtml(a) {
    const lvl = a.left <= 1 ? a.left : a.left <= 3 ? 2 : 3;
    const time = a.item.start ? ` · ${a.item.start}` : '';
    const kind = a.item.kind === 'task' ? '할 일' : '일정';
    return `<button class="alert-card lvl-${lvl}" data-action="goto" data-date="${a.date}">
      <span class="dday">${ddayText(a.left)}</span>
      <span class="a-body"><span class="a-title ellipsis">${esc(a.item.title)}</span><span class="a-date">${fmtShort(a.date)}${time} · ${kind}</span></span>
    </button>`;
  }

  /* ── 달력 탭 ───────────────────────── */
  function renderCal() {
    const { y, m } = S.month;
    const start = C.weekStart(C.ymd(y, m, 1), S.weekStart);
    const last = C.ymd(y, m, C.daysInMonth(y, m));
    const weeks = Math.ceil((C.diffDays(start, last) + 1) / 7);
    const dow = [0, 1, 2, 3, 4, 5, 6].map((i) => (S.weekStart + i) % 7)
      .map((w) => `<span class="${w === 0 ? 'sun' : w === 6 ? 'sat' : ''}">${WD[w]}</span>`).join('');
    let cells = '';
    for (let i = 0; i < weeks * 7; i++) {
      const d = C.addDays(start, i);
      const p = C.parts(d);
      const wd = C.weekday(d);
      const items = C.cellItems(S.data, d, S.done);
      const cls = ['cell', p.m !== m && 'out', d === S.today && 'today', d === S.sel && 'sel', wd === 0 && 'sun', wd === 6 && 'sat'].filter(Boolean).join(' ');
      const chips = items.slice(0, 3).map((it) =>
        `<span class="chip${it.kind === 'task' ? ' todo' : ''}${it.alert ? ' alert' : ''}${it.done ? ' done' : ''}">${it.time ? `<span class="t">${it.time}</span>` : ''}${esc(it.title)}</span>`).join('');
      const more = (items.length > 3 ? `<span class="more more-d">+${items.length - 3}</span>` : '')
        + (items.length > 2 ? `<span class="more more-m">+${items.length - 2}</span>` : '');
      const label = `${p.m}월 ${p.d}일${d === S.today ? ' 오늘' : ''}${items.length ? `, ${items.length}개` : ''}`;
      cells += `<button class="${cls}" data-action="pick" data-date="${d}" aria-label="${label}" aria-pressed="${d === S.sel}"><span class="num">${p.d}</span><span class="chips">${chips}</span>${more}</button>`;
    }
    return `<div class="cal-wrap">
      <section class="card cal" aria-label="${y}년 ${m}월 달력">
        <div class="cal-head">
          <h2><small>${y}년</small>${m}월</h2>
          <span class="spacer"></span>
          <button class="pill" data-action="month-today">오늘</button>
          <button class="nav-btn" data-action="month" data-dir="-1" aria-label="이전 달">${I.left}</button>
          <button class="nav-btn" data-action="month" data-dir="1" aria-label="다음 달">${I.right}</button>
        </div>
        <div class="dow">${dow}</div>
        <div class="grid" id="grid">${cells}</div>
      </section>
      <section class="card day" aria-live="polite">${dayPanel(S.sel)}</section>
    </div>`;
  }

  function dayPanel(d) {
    const ev = C.eventsOn(S.data, d);
    const tk = C.tasksOn(S.data, d);
    const doneN = tk.filter((t) => S.done.has(t.key)).length;
    return `<div class="day-head">
        <div><h2>${fmtLong(d)}</h2><span class="rel${d === S.today ? ' is-today' : ''}">${rel(d)}</span></div>
        <button class="add-sm" data-action="add" data-date="${d}">${I.plus}추가</button>
      </div>
      <div class="sec">
        <h3 class="sec-title">일정 <span class="count">${ev.length || ''}</span></h3>
        ${ev.length ? `<div class="evs">${ev.map(evHtml).join('')}</div>` : '<div class="empty">일정이 없어요</div>'}
      </div>
      <div class="sec">
        <h3 class="sec-title">할 일 <span class="count">${tk.length ? `${doneN}/${tk.length}` : ''}</span></h3>
        ${tk.length ? `<div class="tasks">${tk.map((t) => taskHtml(t)).join('')}</div>` : '<div class="empty">할 일이 없어요</div>'}
      </div>`;
  }

  /* ── 오늘 탭 ───────────────────────── */
  function renderToday() {
    const d = S.view;
    const isToday = d === S.today;
    const day = C.tasksOn(S.data, d);
    const any = C.anytimeTasks(S.data).filter((t) => !S.done.has(t.key) || S.done.get(t.key) === d);
    const week = C.weekTasks(S.data, d, S.weekStart);
    const overdue = isToday ? C.overdueTasks(S.data, d, S.done) : [];
    const ev = C.eventsOn(S.data, d);
    const all = day.concat(any, week);
    const doneN = all.filter((t) => S.done.has(t.key)).length;
    const pct = all.length ? doneN / all.length : 0;
    const R = 23;
    const CIRC = 2 * Math.PI * R;
    const ws = C.weekStart(d, S.weekStart);
    const al = S.alertsNow;

    const main = `<section class="card today-main">
      <div class="today-head">
        <div class="date-nav">
          <button class="nav-btn" data-action="view-day" data-dir="-1" aria-label="전날">${I.left}</button>
          <div class="label">
            <h2>${fmtLong(d)}</h2>
            <span class="rel${isToday ? ' is-today' : ''}">${rel(d)}</span>
            ${isToday ? '' : '<button class="pill back-today" data-action="view-today">오늘로</button>'}
          </div>
          <button class="nav-btn" data-action="view-day" data-dir="1" aria-label="다음날">${I.right}</button>
        </div>
        <div class="ring" role="img" aria-label="${all.length}개 중 ${doneN}개 완료">
          <svg viewBox="0 0 58 58"><circle class="bg" cx="29" cy="29" r="${R}" fill="none" stroke-width="6"/><circle class="fg" cx="29" cy="29" r="${R}" fill="none" stroke-width="6" stroke-linecap="round" stroke-dasharray="${CIRC.toFixed(2)}" stroke-dashoffset="${(CIRC * (1 - pct)).toFixed(2)}" style="${pct === 0 ? 'opacity:0' : ''}"/></svg>
          <span class="txt">${doneN}/${all.length}</span>
        </div>
      </div>
      ${all.length && doneN === all.length ? `<div class="cheer">${isToday ? '오늘' : '이날'} 할 일을 다 끝냈어요 🎉</div>` : ''}
      <div class="sec">
        <h3 class="sec-title">체크리스트 <span class="count">${day.length + any.length || ''}</span></h3>
        ${day.length + any.length
          ? `<div class="tasks">${day.map((t) => taskHtml(t)).join('')}${any.map((t) => taskHtml(t, { note: '언제든' })).join('')}</div>`
          : '<div class="empty">할 일이 없어요. + 로 추가하거나 시트에 적어주세요.</div>'}
      </div>
      ${week.length ? `<div class="sec">
        <h3 class="sec-title">이번 주 안에 <span class="count">${fmtMD(ws)} ~ ${fmtMD(C.addDays(ws, 6))}</span></h3>
        <div class="tasks">${week.map((t) => taskHtml(t)).join('')}</div>
      </div>` : ''}
      ${overdue.length ? `<div class="sec">
        <h3 class="sec-title">밀린 할 일 <span class="count">${overdue.length}</span></h3>
        <div class="tasks">${overdue.map((t) => taskHtml(t, { late: `${C.diffDays(t.date, d)}일 지남` })).join('')}</div>
      </div>` : ''}
    </section>`;

    const alerts = `<section class="card alerts-card">
      <div class="sec">
        <h3 class="sec-title">${I.bell.replace('<svg', '<svg width="14" height="14"')} 다가오는 마감 <span class="count">${al.length || ''}</span></h3>
        ${al.length
          ? `<div class="alert-list">${al.map(alertHtml).join('')}</div>`
          : '<div class="empty">곧 다가오는 마감이 없어요.<br>시트 \'알림\' 칸에 "3일 전"처럼 적으면 여기 떠요.</div>'}
      </div>
    </section>`;

    const evs = `<section class="card events-card">
      <div class="sec">
        <h3 class="sec-title">${isToday ? '오늘' : '이날'} 일정 <span class="count">${ev.length || ''}</span></h3>
        ${ev.length ? `<div class="evs">${ev.map(evHtml).join('')}</div>` : '<div class="empty">일정이 없어요</div>'}
      </div>
    </section>`;

    return `<div class="today-wrap">${main}<aside class="side">${alerts}${evs}</aside></div>`;
  }

  /* ── 위쪽 알림 줄 · 상태 ───────────────────────── */
  function renderNotice() {
    let h = '';
    const pend = S.outbox.length + S.inflight.length;
    if (!S.url) {
      h += '<div class="banner demo"><span class="grow"><b>예시 화면이에요.</b> 구글 시트를 연결하면 내 일정으로 바뀌어요.</span><button class="go" data-action="settings">연결하기</button></div>';
    } else if (S.status === 'error' || S.status === 'offline') {
      h += `<div class="banner err"><span class="grow"><b>${S.status === 'offline' ? '오프라인이에요.' : '시트와 연결이 안 돼요.'}</b> ${esc(S.error)}${pend ? ` · 저장 대기 ${pend}개 (연결되면 자동 저장)` : ''}</span><button class="go" data-action="refresh">다시 시도</button></div>`;
    }
    if (S.tab === 'cal' && S.alertsNow.length) {
      const a = S.alertsNow[0];
      const rest = S.alertsNow.length - 1;
      h += `<button class="banner deadline" data-action="tab" data-tab="today">
        <span class="bell">${I.bell}</span>
        <span class="grow ellipsis"><b>${ddayText(a.left)}</b> ${esc(a.item.title)}${rest ? ` 외 ${rest}개` : ''}</span>
        <span class="go">마감 보기</span></button>`;
    }
    $('#notice').innerHTML = h;
  }

  function ago(ts) {
    const s = (Date.now() - ts) / 1000;
    if (s < 50) return '방금 동기화';
    if (s < 3600) return `${Math.floor(s / 60)}분 전 동기화`;
    const t = new Date(ts);
    return `${C.pad(t.getHours())}:${C.pad(t.getMinutes())} 동기화`;
  }

  function updateStatus() {
    const el = $('#sync');
    const pend = S.outbox.length + S.inflight.length;
    let st;
    let txt;
    if (!S.url) { st = 'demo'; txt = '예시 데이터'; }
    else if (S.syncing) { st = 'loading'; txt = pend ? '저장 중…' : '동기화 중…'; }
    else if (S.status === 'ok') { st = pend ? 'loading' : 'ok'; txt = pend ? `저장 대기 ${pend}` : ago(S.lastSync); }
    else if (S.status === 'idle') { st = 'loading'; txt = '불러오는 중…'; }
    else { st = 'error'; txt = pend ? `저장 대기 ${pend}` : '연결 안 됨'; }
    el.dataset.status = st;
    $('#sync-text').textContent = txt;
    el.title = `${txt} · 눌러서 새로고침`;
    el.setAttribute('aria-label', el.title);
  }

  function focusSig() {
    const a = document.activeElement;
    if (!a || !a.dataset || !a.dataset.action || !$('#view').contains(a)) return null;
    return [a.dataset.action, a.dataset.date || '', a.dataset.title || '', a.dataset.dir || ''];
  }
  function restoreFocus(sig) {
    if (!sig) return;
    for (const el of $('#view').querySelectorAll(`[data-action="${sig[0]}"]`)) {
      if ((el.dataset.date || '') === sig[1] && (el.dataset.title || '') === sig[2] && (el.dataset.dir || '') === sig[3]) { el.focus({ preventScroll: true }); return; }
    }
  }

  function render() {
    if (!S.data) rebuild();
    S.alertsNow = C.alerts(S.data, S.today, S.done);
    for (const b of document.querySelectorAll('.tabs [role=tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === S.tab));
    const badge = $('#tab-badge');
    badge.hidden = !S.alertsNow.length;
    badge.textContent = S.alertsNow.length;
    const sig = focusSig();
    $('#view').innerHTML = S.tab === 'cal' ? renderCal() : renderToday();
    S.popKey = '';
    renderNotice();
    updateStatus();
    restoreFocus(sig);
  }

  function setTab(t) {
    S.tab = t === 'today' ? 'today' : 'cal';
    LS.set('tab', S.tab);
    render();
    window.scrollTo({ top: 0 });
  }
  function shiftMonth(k) {
    let { y, m } = S.month;
    m += k;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    S.month = { y, m };
    const cur = monthOf(S.sel);
    if (cur.y !== y || cur.m !== m) S.sel = (y === C.parts(S.today).y && m === C.parts(S.today).m) ? S.today : C.ymd(y, m, 1);
    render();
  }
  function shiftView(k) { S.view = C.addDays(S.view, k); render(); }

  /* ── 추가하기 창 ───────────────────────── */
  function repeatOptions(kind) {
    const o = [['', '반복 안 함'], ['매일', '매일'], ['평일', '평일 (월~금)'], ['주말', '주말 (토·일)'], ['매주', '매주 (같은 요일)'], ['pick', '요일 고르기'],
      ['격주', '격주 (2주마다)'], ['매월', '매월 (같은 날짜)'], ['매년', '매년']];
    if (kind === 'task') o.push(['주간', '매주 아무 때나 한 번']);
    return o.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  }

  function openAdd(opts) {
    opts = opts || {};
    const kind = opts.kind || (S.tab === 'today' ? 'task' : 'event');
    const date = opts.date || (S.tab === 'today' ? S.view : S.sel);
    const dayOrder = [0, 1, 2, 3, 4, 5, 6].map((i) => (S.weekStart + i) % 7);
    const dlg = $('#dlg-add');
    dlg.innerHTML = `<form id="add-form" novalidate>
      <div class="sheet-head"><h2 id="add-title">추가하기</h2><button type="button" class="icon-btn" data-action="close" aria-label="닫기">${I.x}</button></div>
      <div class="sheet-body">
        <div class="seg" role="radiogroup" aria-label="종류">
          <label><input type="radio" name="kind" value="task"${kind === 'task' ? ' checked' : ''}><span>할 일 (체크리스트)</span></label>
          <label><input type="radio" name="kind" value="event"${kind === 'event' ? ' checked' : ''}><span>일정</span></label>
        </div>
        <label class="field"><span>제목</span><input name="title" maxlength="120" autocomplete="off" enterkeyhint="done" placeholder="예: 기획서 제출"></label>
        <div class="row date-row">
          <label class="field"><span>날짜 <em class="task-only">(비우면 언제든)</em></span><input type="date" name="date" value="${date}"></label>
          <label class="field ev-only"><span>시작 <em>(선택)</em></span><input type="time" name="start"></label>
          <label class="field ev-only"><span>끝 <em>(선택)</em></span><input type="time" name="end"></label>
        </div>
        <div class="row">
          <label class="field"><span>반복</span><select name="repeat"></select></label>
          <label class="field"><span>마감 알림</span><select name="alert">
            <option value="">알림 없음</option><option>당일</option><option>1일 전</option><option>2일 전</option><option>3일 전</option><option>1주 전</option><option>2주 전</option><option>한 달 전</option>
          </select></label>
        </div>
        <div class="days-pick" hidden>${dayOrder.map((i) => `<label><input type="checkbox" name="days" value="${WD[i]}"><span>${WD[i]}</span></label>`).join('')}</div>
        <label class="field until-f" hidden><span>반복 끝나는 날 <em>(선택)</em></span><input type="date" name="until"></label>
        <label class="field"><span>메모 <em>(선택)</em></span><input name="memo" maxlength="300" autocomplete="off"></label>
        <p class="form-err" id="add-err" role="alert"></p>
      </div>
      <div class="sheet-foot"><button type="button" class="btn" data-action="close">취소</button><button type="submit" class="btn primary">추가</button></div>
    </form>`;
    const form = $('#add-form');
    const F = form.elements;
    F.repeat.innerHTML = repeatOptions(kind);
    syncAddForm(form);
    form.addEventListener('change', (e) => {
      if (e.target.name === 'kind') {
        const prev = F.repeat.value;
        F.repeat.innerHTML = repeatOptions(F.kind.value);
        F.repeat.value = [...F.repeat.options].some((o) => o.value === prev) ? prev : '';
      }
      syncAddForm(form);
    });
    form.addEventListener('submit', (e) => { e.preventDefault(); submitAdd(form); });
    dlg.showModal();
    if (matchMedia('(hover: hover)').matches) F.title.focus();
  }

  function syncAddForm(form) {
    const F = form.elements;
    const isEv = F.kind.value === 'event';
    form.querySelectorAll('.ev-only').forEach((el) => { el.hidden = !isEv; });
    form.querySelectorAll('.task-only').forEach((el) => { el.hidden = isEv; });
    form.querySelector('.date-row').classList.toggle('three', isEv);
    form.querySelector('.date-row').classList.toggle('one', !isEv);
    const rep = F.repeat.value;
    form.querySelector('.days-pick').hidden = rep !== 'pick';
    form.querySelector('.until-f').hidden = !rep;
  }

  function submitAdd(form) {
    const err = (m) => { $('#add-err').textContent = m; };
    const F = form.elements;
    const kind = F.kind.value;
    const title = F.title.value.trim();
    const date = F.date.value || '';
    let repeat = F.repeat.value;
    if (!title) { F.title.focus(); return err('제목을 적어주세요'); }
    if (repeat === 'pick') {
      const days = [...form.querySelectorAll('[name=days]:checked')].map((x) => x.value);
      if (!days.length) return err('요일을 하나 이상 골라주세요');
      repeat = days.join(',');
    }
    const floating = /^(매일|평일|주말)$/.test(repeat) || repeat.includes(',') || (kind === 'task' && (repeat === '' || repeat === '주간'));
    if (!date && !floating) return err(repeat ? '반복의 기준이 될 날짜를 골라주세요' : '날짜를 골라주세요');
    const until = repeat ? F.until.value : '';
    if (until && date && until < date) return err('반복 끝나는 날이 시작 날짜보다 빨라요');
    const base = { 날짜: date, 반복: repeat, 반복끝: until, 알림: F.alert.value, 메모: F.memo.value.trim() };
    const row = kind === 'event'
      ? Object.assign(base, { 제목: title, 시작: F.start.value, 끝: F.end.value })
      : Object.assign(base, { 할일: title });
    addRow(kind, row);
    $('#dlg-add').close();
    if (date && S.tab === 'cal') { S.sel = date; S.month = monthOf(date); render(); }
    toast(S.url ? '추가했어요 · 시트에 저장하는 중' : '추가했어요 (예시 화면이라 이 기기에만 저장돼요)');
  }

  /* ── 설정 창 ───────────────────────── */
  function openSettings() {
    const probs = (S.data && S.data.problems) || [];
    const ok = S.status === 'ok';
    const state = !S.url ? '' : ok
      ? `연결됨${S.sheetTitle ? ` · '${esc(S.sheetTitle)}'` : ''} · ${ago(S.lastSync)}`
      : S.syncing || S.status === 'idle' ? '확인하는 중…' : esc(S.error || '연결 안 됨');
    const dlg = $('#dlg-settings');
    dlg.innerHTML = `
      <div class="sheet-head"><h2 id="settings-title">설정</h2><button class="icon-btn" data-action="close" aria-label="닫기">${I.x}</button></div>
      <div class="sheet-body">
        <section class="set-sec">
          <h3>구글 시트 연결</h3>
          <p class="hint">시트의 Apps Script를 웹 앱으로 배포하고 받은 URL(…/exec)을 붙여넣으세요. <a href="https://github.com/jun2peter/day#readme" target="_blank" rel="noopener">설정 방법 보기</a></p>
          <input class="input" id="url-input" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(S.url)}">
          <p class="form-err" id="url-err" role="alert"></p>
          <div class="btns">
            <button class="btn sm primary" data-action="save-url">${S.url ? '다시 연결' : '연결하기'}</button>
            ${S.url ? '<button class="btn sm danger" data-action="disconnect">연결 끊기</button>' : ''}
          </div>
          ${S.url ? `<div class="state ${ok ? 'ok' : 'bad'}"><span class="sync-dot"></span><span>${state}</span></div>` : ''}
        </section>
        ${S.url ? `<section class="set-sec">
          <h3>폰·다른 컴퓨터에서 쓰기</h3>
          <p class="hint">연결 링크를 복사해서 폰으로 보내고(카톡 '나와의 채팅' 등) 열면, 그 기기도 이 시트에 바로 연결돼요. 링크를 가진 사람은 내 일정을 볼 수 있으니 남에게는 보내지 마세요.</p>
          <div class="btns">
            <button class="btn sm" data-action="copy-link">${I.copy}연결 링크 복사</button>
            ${S.sheetUrl ? `<a class="btn sm" href="${esc(S.sheetUrl)}" target="_blank" rel="noopener">${I.ext}시트 열기</a>` : ''}
          </div>
        </section>` : ''}
        <section class="set-sec">
          <h3>보기</h3>
          <div class="row">
            <label class="field"><span>한 주의 시작</span><select id="opt-week"><option value="0">일요일</option><option value="1">월요일</option></select></label>
            <label class="field"><span>화면 테마</span><select id="opt-theme"><option value="">기기 설정대로</option><option value="light">밝게</option><option value="dark">어둡게</option></select></label>
          </div>
        </section>
        <section class="set-sec">
          <h3>시트 점검</h3>
          ${probs.length
            ? `<p class="hint">시트에서 제대로 못 읽은 칸이에요. 시트에서 고치면 자동으로 반영돼요.</p><ul class="problems">${probs.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
            : `<p class="ok-line">${S.url ? '시트 내용을 문제없이 다 읽었어요.' : '시트를 연결하면 잘못 적힌 칸을 여기서 알려줘요.'}</p>`}
        </section>
      </div>`;
    $('#opt-week').value = String(S.weekStart);
    $('#opt-theme').value = S.theme;
    $('#opt-week').addEventListener('change', (e) => { S.weekStart = +e.target.value; LS.set('weekStart', S.weekStart); render(); });
    $('#opt-theme').addEventListener('change', (e) => { S.theme = e.target.value; LS.set('theme', S.theme); applyTheme(); });
    $('#url-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveUrl($('[data-action=save-url]')); } });
    if (!dlg.open) dlg.showModal();
  }

  async function saveUrl(btn) {
    const v = $('#url-input').value.trim();
    const errEl = $('#url-err');
    errEl.textContent = '';
    if (!/^https:\/\/script\.google\.com\/.+/.test(v)) { errEl.textContent = 'https://script.google.com/… 으로 시작하는 웹 앱 URL을 넣어주세요.'; return; }
    if (/\/dev(\?|$)/.test(v)) { errEl.textContent = '끝이 …/dev 가 아니라 …/exec 인 URL이어야 해요.'; return; }
    btn.disabled = true;
    btn.textContent = '확인하는 중…';
    try {
      const j = await api(null, v);
      if (v !== S.url) { S.outbox = []; S.inflight = []; saveOutbox(); }
      S.url = v;
      LS.set('url', v);
      applyServer(j);
      rebuild();
      render();
      $('#dlg-settings').close();
      toast(`'${j.title}' 시트에 연결됐어요`);
    } catch (e) {
      errEl.textContent = friendly(e);
      btn.disabled = false;
      btn.textContent = S.url ? '다시 연결' : '연결하기';
    }
  }

  function disconnect() {
    if (!confirm('이 기기에서 시트 연결을 끊을까요? 시트 내용은 그대로 남아요.')) return;
    S.url = '';
    S.raw = null;
    S.outbox = [];
    S.inflight = [];
    S.status = 'idle';
    ['url', 'cache', 'outbox', 'sheetUrl', 'sheetTitle'].forEach(LS.del);
    S.sheetUrl = '';
    S.sheetTitle = '';
    rebuild();
    render();
    openSettings();
  }

  async function copyLink() {
    const link = `${location.origin}${location.pathname}#connect=${encodeURIComponent(S.url)}`;
    try {
      await navigator.clipboard.writeText(link);
      toast('연결 링크를 복사했어요. 폰에서 열어보세요');
    } catch (e) {
      window.prompt('아래 링크를 복사하세요', link);
    }
  }

  function applyTheme() {
    if (S.theme) document.documentElement.dataset.theme = S.theme;
    else delete document.documentElement.dataset.theme;
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /* ── 이벤트 ───────────────────────── */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'tab') setTab(el.dataset.tab);
    else if (a === 'pick') { S.sel = el.dataset.date; const p = monthOf(S.sel); if (p.y !== S.month.y || p.m !== S.month.m) S.month = p; render(); }
    else if (a === 'month') shiftMonth(+el.dataset.dir);
    else if (a === 'month-today') { S.sel = S.today; S.month = monthOf(S.today); render(); }
    else if (a === 'view-day') shiftView(+el.dataset.dir);
    else if (a === 'view-today') { S.view = S.today; render(); }
    else if (a === 'goto') { S.sel = el.dataset.date; S.month = monthOf(S.sel); setTab('cal'); }
    else if (a === 'toggle') toggle(el.dataset.date, el.dataset.title);
    else if (a === 'add') openAdd({ date: el.dataset.date });
    else if (a === 'settings') openSettings();
    else if (a === 'refresh') sync(true);
    else if (a === 'close') el.closest('dialog').close();
    else if (a === 'save-url') saveUrl(el);
    else if (a === 'disconnect') disconnect();
    else if (a === 'copy-link') copyLink();
  });

  // 대화상자 바깥(어두운 부분)을 누르면 닫기
  for (const dlg of document.querySelectorAll('dialog')) {
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }

  // 폰에서 좌우로 밀면 달/날짜 넘기기
  let touch = null;
  document.addEventListener('touchstart', (e) => {
    const g = e.target.closest('#grid, .today-head');
    if (!g || e.touches.length > 1) { touch = null; return; }
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), cal: g.id === 'grid' };
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!touch) return;
    const p = e.changedTouches[0];
    const dx = p.clientX - touch.x;
    const dy = p.clientY - touch.y;
    const t = touch;
    touch = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - t.t > 700) return;
    if (t.cal) shiftMonth(dx < 0 ? 1 : -1);
    else shiftView(dx < 0 ? 1 : -1);
  }, { passive: true });

  // 키보드: ← → 로 달/날짜 넘기기
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (document.querySelector('dialog[open]') || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const k = e.key === 'ArrowLeft' ? -1 : 1;
    if (S.tab === 'cal') shiftMonth(k); else shiftView(k);
  });

  // 시트를 고치면 알아서 반영: 화면이 보일 때 1분마다 + 다시 볼 때마다 새로 불러옴
  setInterval(() => {
    const t = C.today();
    if (t !== S.today) {
      const was = S.today;
      S.today = t;
      if (S.view === was) S.view = t;
      if (S.sel === was) { S.sel = t; S.month = monthOf(t); }
      render();
    }
    if (!S.url || S.syncing || document.visibilityState !== 'visible') return updateStatus();
    const wait = S.status === 'ok' ? 60000 : 30000;
    if (Date.now() - Math.max(S.lastSync, S.lastTry) > wait) sync();
    else updateStatus();
  }, 15000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.url && Date.now() - S.lastTry > 8000) sync();
  });
  window.addEventListener('online', () => { if (S.url) sync(); });

  /* ── 시작 ───────────────────────── */
  function init() {
    applyTheme();
    let connected = false;
    const m = location.hash.match(/connect=([^&]+)/);
    if (m) {
      history.replaceState(null, '', location.pathname + location.search);
      let u = '';
      try { u = decodeURIComponent(m[1]); } catch (e) { /* 잘못된 링크 */ }
      if (/^https:\/\/script\.google\.com\/.+/.test(u)) {
        if (u !== S.url) { S.url = u; LS.set('url', u); LS.del('cache'); S.outbox = []; saveOutbox(); }
        connected = true;
      }
    }
    if (S.url) S.raw = LS.get('cache', null);
    S.month = monthOf(S.sel);
    rebuild();
    render();
    if (S.url) sync().then(() => { if (connected && S.status === 'ok') toast('이 기기도 시트에 연결됐어요'); });
  }

  init();
})();
