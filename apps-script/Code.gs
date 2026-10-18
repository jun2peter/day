/**
 * Day 플래너 ↔ 구글 시트 연결 코드 · 버전 2 (사이트에서 지우기)
 *
 * 쓰는 법 (한 번만 하면 돼요)
 *  1. 플래너로 쓸 구글 시트에서  확장 프로그램 → Apps Script
 *  2. 원래 있던 코드를 다 지우고 이 파일 내용을 통째로 붙여넣기 → 저장
 *  3. 오른쪽 위 [배포] → [새 배포] → 유형: 웹 앱
 *       실행 사용자: 나 / 액세스 권한: 모든 사용자  → [배포] → 권한 허용
 *  4. 나온 "웹 앱 URL"(…/exec)을 플래너 사이트 ⚙ 설정에 붙여넣기
 *
 * 탭(일정·체크리스트·완료기록)이 없으면 처음 연결할 때 알아서 만들어요.
 * 코드를 고친 뒤에는 [배포] → [배포 관리] → 연필 → 버전: 새 버전 으로 다시 배포해야 반영돼요.
 */

var TABS = {
  event: { name: '일정', headers: ['날짜', '시작', '끝', '제목', '반복', '반복끝', '알림', '메모'], timeCols: [2, 3] },
  task: { name: '체크리스트', headers: ['날짜', '할 일', '반복', '반복끝', '알림', '메모'], timeCols: [] },
  done: { name: '완료기록', headers: ['날짜', '할 일', '완료시각'], timeCols: [] },
};
var REPEAT_CHOICES = ['매일', '평일', '주말', '매주', '격주', '매월', '매년', '주간', '월,수,금', '화,목'];
var ALERT_CHOICES = ['당일', '1일 전', '2일 전', '3일 전', '1주 전', '2주 전', '한 달 전'];

function doGet() {
  try {
    return out_(readAll_());
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      // 지우기는 아래 줄부터 처리해야 줄 번호가 안 밀려요
      var ops = body.ops || [];
      var dels = ops.filter(function (o) { return o && o.action === 'delete'; })
        .sort(function (a, b) { return Number(b.row) - Number(a.row); });
      ops.filter(function (o) { return !o || o.action !== 'delete'; }).concat(dels).forEach(applyOp_);
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
    return out_(readAll_());
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  }
}

function applyOp_(op) {
  if (!op || !op.action) return;
  var cache = CacheService.getScriptCache();
  if (op.id && cache.get('op:' + op.id)) return; // 같은 요청이 두 번 와도 한 번만
  if (op.action === 'toggle') toggle_(op);
  else if (op.action === 'add') add_(op);
  else if (op.action === 'delete') delete_(op);
  if (op.id) cache.put('op:' + op.id, '1', 21600);
}

/* 체크 / 체크 해제 → '완료기록' 탭에 한 줄 추가하거나 지움 */
function toggle_(op) {
  var sh = sheet_(TABS.done);
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var title = String(op.title || '').trim();
  var date = String(op.date || '').trim();
  if (!title || !date) return;
  var values = sh.getDataRange().getValues();
  var hit = [];
  for (var r = 1; r < values.length; r++) {
    var d = values[r][0] instanceof Date ? Utilities.formatDate(values[r][0], tz, 'yyyy-MM-dd') : String(values[r][0]).trim();
    if (d === date && String(values[r][1]).trim() === title) hit.push(r + 1);
  }
  if (op.done) {
    if (!hit.length) {
      sh.appendRow([date, title, new Date()]);
      sh.getRange(sh.getLastRow(), 3).setNumberFormat('yyyy-mm-dd hh:mm');
    }
  } else {
    for (var i = hit.length - 1; i >= 0; i--) sh.deleteRow(hit[i]);
  }
}

/* 사이트에서 [+ 추가] → 해당 탭 맨 아래에 한 줄 */
function add_(op) {
  var tab = op.kind === 'event' ? TABS.event : TABS.task;
  var sh = sheet_(tab);
  var width = sh.getLastColumn();
  var heads = sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h).replace(/\s/g, ''); });
  var row = heads.map(function () { return ''; });
  var data = op.row || {};
  Object.keys(data).forEach(function (k) {
    var i = heads.indexOf(String(k).replace(/\s/g, ''));
    if (i >= 0) row[i] = data[k] == null ? '' : String(data[k]);
  });
  if (row.join('') === '') return;
  sh.appendRow(row);
}

/* 사이트에서 [지우기] → 그 줄을 통째로 지움.
 * 그사이 시트에서 줄이 밀렸으면 제목+날짜가 같은 줄을 찾아서 지움 */
function delete_(op) {
  var sh = sheet_(op.kind === 'event' ? TABS.event : TABS.task);
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var title = String(op.title || '').trim();
  if (!title) return;
  var range = sh.getDataRange();
  var values = range.getValues();
  var shown = range.getDisplayValues();
  var heads = values[0].map(function (h) { return String(h).replace(/\s/g, ''); });
  var names = op.kind === 'event' ? ['제목', '일정', '내용', '할일'] : ['할일', '제목', '내용', '항목'];
  var tc = -1;
  names.some(function (n) { tc = heads.indexOf(n); return tc >= 0; });
  if (tc < 0) return;
  var dc = heads.indexOf('날짜');
  var titleAt = function (r) { return String(shown[r - 1][tc]).trim(); };
  var dateAt = function (r) {
    if (dc < 0) return '';
    var v = values[r - 1][dc];
    return v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(shown[r - 1][dc]).trim();
  };
  var r = Number(op.row);
  if (!(r >= 2 && r <= values.length && titleAt(r) === title)) {
    r = -1;
    for (var i = 2; i <= values.length; i++) {
      if (titleAt(i) === title && dateAt(i) === String(op.date || '')) { r = i; break; }
    }
  }
  if (r > 0) sh.deleteRow(r);
}

function readAll_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  return {
    ok: true,
    version: 2,
    title: ss.getName(),
    sheetUrl: ss.getUrl(),
    events: readTable_(sheet_(TABS.event), tz),
    tasks: readTable_(sheet_(TABS.task), tz),
    done: readTable_(sheet_(TABS.done), tz),
    at: new Date().toISOString(),
  };
}

/* 첫 줄(제목줄) 이름을 키로 한 객체 배열. 띄어쓰기는 빼고 씀: '할 일' → '할일' */
function readTable_(sh, tz) {
  var range = sh.getDataRange();
  var values = range.getValues();
  var shown = range.getDisplayValues();
  if (values.length < 2) return [];
  var heads = values[0].map(function (h) { return String(h).replace(/\s/g, ''); });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var o = { row: r + 1 };
    var any = false;
    for (var c = 0; c < heads.length; c++) {
      if (!heads[c]) continue;
      var v = cell_(values[r][c], shown[r][c], tz, heads[c]);
      o[heads[c]] = v;
      if (v !== '') any = true;
    }
    if (any) rows.push(o);
  }
  return rows;
}

function cell_(v, shown, tz, head) {
  if (v instanceof Date) {
    if (v.getFullYear() < 1900) return String(shown).trim(); // 시간만 적힌 칸 (예: 14:00)
    return Utilities.formatDate(v, tz, head === '완료시각' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
  }
  return String(shown).trim();
}

function sheet_(tab) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(tab.name) || createTab_(ss, tab);
}

function createTab_(ss, tab) {
  var sh = ss.insertSheet(tab.name);
  var n = tab.headers.length;
  sh.getRange(1, 1, 1, n).setValues([tab.headers]).setFontWeight('bold').setBackground('#eef1fb');
  sh.setFrozenRows(1);
  tab.timeCols.forEach(function (c) { sh.getRange(2, c, sh.getMaxRows() - 1, 1).setNumberFormat('@'); });
  var rep = tab.headers.indexOf('반복') + 1;
  if (rep > 0) {
    sh.getRange(2, rep, sh.getMaxRows() - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(REPEAT_CHOICES, true).setAllowInvalid(true).build());
  }
  var al = tab.headers.indexOf('알림') + 1;
  if (al > 0) {
    sh.getRange(2, al, sh.getMaxRows() - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(ALERT_CHOICES, true).setAllowInvalid(true).build());
  }
  if (rep > 0) {
    // 날짜·반복끝 칸: 더블클릭하면 달력이 뜨게
    [1, tab.headers.indexOf('반복끝') + 1].forEach(function (c) {
      sh.getRange(2, c, sh.getMaxRows() - 1, 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(true).build());
    });
  }
  sh.autoResizeColumns(1, n);
  return sh;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* 편집기에서 한 번 실행해보면 탭이 만들어지고 권한도 미리 허용돼요 (안 해도 됨) */
function setup() {
  readAll_();
}
