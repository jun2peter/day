/* Day 플래너 — 날짜·반복·알림 계산 (화면과 상관없는 순수 로직)
 * 날짜는 전부 'YYYY-MM-DD' 문자열로 다룬다. */
(function (root) {
  'use strict';

  const DAY_MS = 86400000;
  const WD = ['일', '월', '화', '수', '목', '금', '토'];

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const toNum = (s) => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY_MS); };
  const fromNum = (n) => { const t = new Date(n * DAY_MS); return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
  const addDays = (s, k) => fromNum(toNum(s) + k);
  const diffDays = (a, b) => toNum(b) - toNum(a);
  const weekday = (s) => (((toNum(s) + 4) % 7) + 7) % 7; // 1970-01-01 = 목요일
  const parts = (s) => { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; };
  const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = () => { const t = new Date(); return ymd(t.getFullYear(), t.getMonth() + 1, t.getDate()); };
  const weekStart = (s, startDow = 0) => addDays(s, -((weekday(s) - startDow + 7) % 7));
  const keyOf = (dateKey, title) => `${dateKey}|${String(title).trim()}`;

  function valid(y, m, d) {
    if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m))) return '';
    return ymd(y, m, d);
  }

  /* 시트에 어떤 모양으로 적어도 최대한 날짜로 읽는다.
   * 2026-10-20 · 2026. 10. 20 · 2026/10/20 · 2026년 10월 20일 · 10/20 · 10월 20일 · 20261020 */
  function parseDate(v, refYear) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return '';
    let m;
    if ((m = s.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/))) return valid(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return valid(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})$/))) return valid(+m[3], +m[1], +m[2]);
    if ((m = s.match(/^(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?\.?$/))) return valid(refYear || new Date().getFullYear(), +m[1], +m[2]);
    return '';
  }

  /* 14:00 · 14:00:00 · 오후 2:00:00 · 2pm · 2시 30분 · 1400 → 'HH:MM' */
  function parseTime(v) {
    const s = String(v == null ? '' : v).trim().toLowerCase();
    if (!s) return '';
    const pm = /오후|저녁|밤|pm|p\.m/.test(s);
    const am = /오전|아침|새벽|am|a\.m/.test(s);
    let h, mi = 0, m;
    if ((m = s.match(/(\d{1,2})\s*[:시]\s*(\d{1,2})?/))) { h = +m[1]; mi = m[2] ? +m[2] : 0; }
    else if ((m = s.match(/^(\d{1,2})(\d{2})$/))) { h = +m[1]; mi = +m[2]; }
    else if ((m = s.match(/(\d{1,2})/))) { h = +m[1]; }
    else return '';
    if (pm && h < 12) h += 12;
    if (am && h === 12) h = 0;
    if (h > 24 || mi > 59) return '';
    return pad(h) + ':' + pad(mi);
  }

  /* 반복 칸 해석.
   * (빈칸)=그날만 · 매일 · 평일 · 주말 · 매주 · 월,수,금 · 격주 · 매월 · 매월 15일 · 매월 말일 · 매년 · 3일마다 · 주간 */
  function parseRepeat(v) {
    const raw = String(v == null ? '' : v).trim();
    const s = raw.replace(/\s+/g, '');
    if (!s || /^(없음|안함|반복없음|한번|1회|-|x|no|none)$/i.test(s)) return { type: 'once', label: '' };
    let m;
    if ((m = s.match(/(\d+)일(마다|간격|에한번)/))) {
      const n = Math.max(1, +m[1]);
      return n === 1 ? { type: 'days', days: [0, 1, 2, 3, 4, 5, 6], interval: 1, label: '매일' } : { type: 'everyN', n, label: `${n}일마다` };
    }
    if (/^(매일|날마다|하루하루|everyday|daily)/i.test(s)) return { type: 'days', days: [0, 1, 2, 3, 4, 5, 6], interval: 1, label: '매일' };
    if (/평일/.test(s)) return { type: 'days', days: [1, 2, 3, 4, 5], interval: 1, label: '평일' };
    if (/주말/.test(s)) return { type: 'days', days: [0, 6], interval: 1, label: '주말' };
    if (/주간|주1회|일주일에한번|아무때나|아무요일/.test(s)) return { type: 'week', label: '주간' };
    if ((m = s.match(/^(매월|매달|monthly)(말일|말|마지막날)$/i))) return { type: 'month', day: -1, label: '매월 말일' };
    if ((m = s.match(/^(매월|매달|monthly)(\d{1,2})?일?$/i))) return { type: 'month', day: m[2] ? +m[2] : null, label: m[2] ? `매월 ${+m[2]}일` : '매월' };
    if (/^(매년|매해|해마다|yearly)$/i.test(s)) return { type: 'year', label: '매년' };
    const biweekly = /격주|2주마다|2주에한번/.test(s);
    const rest = s.replace(/매주|격주|2주마다|2주에한번|요일|마다|에|[,·/.\-&+]/g, '');
    if (rest && /^[일월화수목금토]+$/.test(rest)) {
      const days = [...new Set([...rest].map((c) => WD.indexOf(c)))].sort((a, b) => a - b);
      const label = days.length === 7 ? '매일' : `${biweekly ? '격주' : '매주'} ${days.map((d) => WD[d]).join('')}`;
      return { type: 'days', days, interval: biweekly ? 2 : 1, label };
    }
    if (/^(매주|weekly)$/i.test(s) || (biweekly && !rest)) return { type: 'days', days: null, interval: biweekly ? 2 : 1, label: biweekly ? '격주' : '매주' };
    return { type: 'once', label: '', unknown: raw };
  }

  /* 알림 칸 해석 → 며칠 전부터 보여줄지(숫자). 3일 전 · D-3 · 3 · 1주 전 · 한 달 전 · 당일 */
  function parseAlert(v) {
    const s = String(v == null ? '' : v).replace(/\s+/g, '').toLowerCase();
    if (!s || /^(없음|안함|x|-|no|none)$/.test(s)) return null;
    let m;
    if ((m = s.match(/(\d+)(주|w)/))) return Math.min(+m[1] * 7, 366);
    if ((m = s.match(/(\d+)(개월|달|month)/))) return Math.min(+m[1] * 30, 366);
    if ((m = s.match(/(\d+)/))) return Math.min(+m[1], 366);
    if (/당일|당일날|오늘|d-?day/.test(s)) return 0;
    if (/하루|전날/.test(s)) return 1;
    if (/일주일|한주/.test(s)) return 7;
    if (/한달/.test(s)) return 30;
    return undefined; // 못 읽음
  }

  const alertLabel = (n) => (n === 0 ? '당일' : n % 7 === 0 && n < 60 ? `${n / 7}주 전` : `${n}일 전`);

  const pick = (o, ...names) => {
    for (const n of names) if (o[n] != null && String(o[n]).trim() !== '') return String(o[n]).trim();
    return '';
  };

  const TITLE_KEYS = { event: ['제목', '일정', '내용', '할일'], task: ['할일', '제목', '내용', '항목'] };
  const titleOf = (r, kind) => pick(r, ...TITLE_KEYS[kind]);
  const dateOf = (r) => { const s = pick(r, '날짜', '시작일', '마감일', '일자'); return parseDate(s) || s; };

  /* 시트에서 받은 줄들 → 화면에서 쓰는 모양으로 */
  function normalize(raw) {
    const problems = [];
    const events = [];
    const tasks = [];
    const read = (r, kind) => {
      const sheet = kind === 'event' ? '일정' : '체크리스트';
      const title = titleOf(r, kind);
      if (!title) return null;
      const where = r.pending ? '방금 추가한 줄' : `'${sheet}' ${r.row}행`;
      const dateRaw = pick(r, '날짜', '시작일', '마감일', '일자');
      const untilRaw = pick(r, '반복끝', '반복종료', '종료일');
      const repRaw = pick(r, '반복');
      const alertRaw = pick(r, '알림', '미리알림');
      const date = parseDate(dateRaw);
      const until = parseDate(untilRaw);
      let rep = parseRepeat(repRaw);
      let alert = parseAlert(alertRaw);
      if (dateRaw && !date) problems.push(`${where} — 날짜 "${dateRaw}"를 읽지 못했어요`);
      if (untilRaw && !until) problems.push(`${where} — 반복끝 "${untilRaw}"를 읽지 못했어요`);
      if (rep.unknown) problems.push(`${where} — 반복 "${repRaw}"을 이해하지 못해서 그날 하루만 보여줘요`);
      if (alert === undefined) { problems.push(`${where} — 알림 "${alertRaw}"을 읽지 못했어요 (예: 3일 전)`); alert = null; }

      if (kind === 'task' && rep.type === 'days' && !rep.days && !date) rep = { type: 'week', label: '주간' };
      if (kind === 'event' && rep.type === 'week') rep = { type: 'days', days: null, interval: 1, label: '매주' };
      const needsDate = rep.type === 'once' || rep.type === 'everyN' || rep.type === 'year' || (rep.type === 'days' && !rep.days) || (rep.type === 'month' && !rep.day);
      if (needsDate && !date && !(kind === 'task' && rep.type === 'once')) {
        if (!dateRaw) problems.push(`${where} — "${title}": 날짜가 없어서 넣을 곳을 몰라요`);
        return null;
      }

      const item = { kind, row: r.row, id: (kind === 'event' ? 'e' : 't') + r.row, title, date, until, rep, alert, memo: pick(r, '메모', '비고', '설명'), pending: !!r.pending, dateBad: !!dateRaw && !date };
      if (kind === 'event') {
        let startRaw = pick(r, '시작', '시간', '시작시간');
        let endRaw = pick(r, '끝', '종료', '끝시간', '종료시간');
        const range = startRaw.split(/\s*[~–]\s*|\s+-\s+/);
        if (range.length === 2 && !endRaw) { startRaw = range[0]; endRaw = range[1]; }
        item.start = parseTime(startRaw);
        item.end = parseTime(endRaw);
        if (startRaw && !item.start) problems.push(`${where} — 시작 "${startRaw}"를 시간으로 못 읽었어요`);
      }
      return item;
    };
    for (const r of raw.events || []) { const it = read(r, 'event'); if (it) events.push(it); }
    for (const r of raw.tasks || []) { const it = read(r, 'task'); if (it) tasks.push(it); }
    const done = new Map();
    for (const r of raw.done || []) {
      const d = pick(r, '날짜');
      const t = pick(r, '할일', '제목');
      if (!t) continue;
      done.set(keyOf(parseDate(d) || d, t), (pick(r, '완료시각') || '').slice(0, 10));
    }
    return { events, tasks, done, problems };
  }

  /* 이 항목이 d 날짜에 있나? (주간 항목은 따로 처리) */
  function occursOn(it, d) {
    const r = it.rep;
    if (it.date && d < it.date) return false;
    if (it.until && d > it.until) return false;
    switch (r.type) {
      case 'once': return !!it.date && d === it.date;
      case 'everyN': return !!it.date && diffDays(it.date, d) % r.n === 0;
      case 'days': {
        const days = r.days || (it.date ? [weekday(it.date)] : null);
        if (!days || !days.includes(weekday(d))) return false;
        if (r.interval === 2 && it.date) return Math.floor(diffDays(weekStart(it.date, 0), weekStart(d, 0)) / 7) % 2 === 0;
        return true;
      }
      case 'month': {
        const p = parts(d);
        const dim = daysInMonth(p.y, p.m);
        const target = r.day === -1 ? dim : r.day || (it.date ? parts(it.date).d : 0);
        return !!target && p.d === Math.min(target, dim);
      }
      case 'year': {
        const a = parts(it.date);
        const p = parts(d);
        return a.m === p.m && p.d === Math.min(a.d, daysInMonth(p.y, p.m));
      }
      default: return false;
    }
  }

  const byTime = (a, b) => (a.start || '').localeCompare(b.start || '') || a.title.localeCompare(b.title, 'ko');
  const withKey = (it, dateKey) => Object.assign({}, it, { dateKey, key: keyOf(dateKey, it.title) });

  const eventsOn = (data, d) => data.events.filter((e) => occursOn(e, d)).sort(byTime);
  const tasksOn = (data, d) => data.tasks.filter((t) => t.rep.type !== 'week' && occursOn(t, d)).map((t) => withKey(t, d));
  const anytimeTasks = (data) => data.tasks.filter((t) => t.rep.type === 'once' && !t.date).map((t) => withKey(t, '언제든'));
  function weekTasks(data, d, startDow) {
    const ws = weekStart(d, startDow);
    const we = addDays(ws, 6);
    return data.tasks.filter((t) => t.rep.type === 'week' && (!t.date || t.date <= we) && (!t.until || t.until >= ws)).map((t) => withKey(t, ws));
  }
  /* 날짜가 지났는데 아직 안 한 일회성 할 일 (최근 60일) */
  function overdueTasks(data, d, done) {
    return data.tasks
      .filter((t) => t.rep.type === 'once' && t.date && t.date < d && diffDays(t.date, d) <= 60 && !done.has(keyOf(t.date, t.title)))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => withKey(t, t.date));
  }
  /* 알림을 켜둔 항목 중, 오늘부터 '알림'일 안에 다가오는 것 */
  function alerts(data, d, done) {
    const out = [];
    for (const it of [...data.events, ...data.tasks]) {
      if (it.alert == null || it.rep.type === 'week') continue;
      for (let k = 0; k <= it.alert; k++) {
        const day = addDays(d, k);
        if (!occursOn(it, day)) continue;
        if (it.kind === 'task' && done.has(keyOf(day, it.title))) continue;
        out.push({ item: withKey(it, day), date: day, left: k });
        break;
      }
    }
    return out.sort((a, b) => a.left - b.left || byTime(a.item, b.item));
  }
  /* 달력 칸에 보여줄 것: 일정 전부 + 날짜 있는 일회성 할 일 */
  function cellItems(data, d, done) {
    const ev = eventsOn(data, d).map((e) => ({ kind: 'event', title: e.title, time: e.start, alert: e.alert != null }));
    const tk = data.tasks
      .filter((t) => t.rep.type === 'once' && t.date === d)
      .map((t) => ({ kind: 'task', title: t.title, alert: t.alert != null, done: done.has(keyOf(d, t.title)) }));
    return [...ev, ...tk];
  }

  const api = {
    WD, pad, ymd, toNum, fromNum, addDays, diffDays, weekday, parts, daysInMonth, today, weekStart, keyOf,
    parseDate, parseTime, parseRepeat, parseAlert, alertLabel, normalize, occursOn, titleOf, dateOf,
    eventsOn, tasksOn, anytimeTasks, weekTasks, overdueTasks, alerts, cellItems,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DayCore = api;
})(typeof window !== 'undefined' ? window : this);
