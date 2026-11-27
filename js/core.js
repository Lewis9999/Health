/* 共用：狀態、權限、判定規則、路由、版面。雛型的「伺服器端檢查」以前端函式模擬。 */
'use strict';

const STORE_KEY = 'health-proto-v7'; // 示範資料有變動時遞增，避免讀到舊資料
let DB;

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nowStr = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${DB.today} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const uid = prefix => prefix + Date.now().toString(36).slice(-5).toUpperCase() + Math.floor(Math.random() * 90 + 10);
const clone = o => JSON.parse(JSON.stringify(o));
const dayDiff = (a, b) => Math.round((new Date(a.slice(0, 10)) - new Date(b.slice(0, 10))) / 86400000);

function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch (e) { /* 無法儲存時仍可操作，只是重新整理後回到初始資料 */ } }
function load() {
  try { const s = localStorage.getItem(STORE_KEY); if (s) return JSON.parse(s); } catch (e) { /* 略過 */ }
  return null;
}

/* ---------- 使用者與資料範圍（第 5 節、NFR-05） ---------- */
const me = () => DB.users.find(u => u.id === DB.currentUser);
const userName = id => (DB.users.find(u => u.id === id) || {}).name || id || '—';
const subjectById = id => DB.subjects.find(s => s.id === id);
const metricBy = code => DB.metrics.find(m => m.code === code);

/** 可看個人數值的對象。主管、商品行銷、法遵、系統管理者一律沒有。 */
function visibleSubjects(u = me()) {
  switch (u.role) {
    case 'subject': return DB.subjects.filter(s => s.id === u.subject);
    case 'care': return DB.subjects.filter(s => u.assigned.includes(s.id));
    case 'ohs': return DB.subjects.filter(s => u.depts.includes(s.dept));
    case 'hadmin': return DB.subjects;
    default: return [];
  }
}
/** 可協助量測的對象（操作員只看當次結果，不看歷史）。 */
function measurableSubjects(u = me()) {
  return u.role === 'operator' ? DB.subjects.filter(s => u.depts.includes(s.dept)) : visibleSubjects(u);
}
function logAccess(subjectId, what) {
  const u = me();
  if (u.role === 'subject' && u.subject === subjectId) return;
  const last = DB.accessLog[0];
  if (last && last.user === u.id && last.subject === subjectId && last.what === what && last.time === nowStr()) return;
  DB.accessLog.unshift({ time: nowStr(), user: u.id, subject: subjectId, what });
  save();
}

/* ---------- 同意（FR-02～04） ---------- */
const activeConsent = sid => DB.consents.find(c => c.subject === sid && c.measure && !c.revoked);

/* ---------- 指標可見性（FR-21） ---------- */
const canSeeExperimental = () => me().role === 'hadmin';
const visibleMetrics = () => DB.metrics.filter(m => m.enabled && (m.level !== '實驗中' || canSeeExperimental())).sort((a, b) => a.order - b.order);

/* ---------- 門檻與判定（FR-22、FR-23） ---------- */
const ageGroup = a => a >= 65 ? '65歲以上' : a >= 40 ? '40–64歲' : '39歲以下';
function findThreshold(code, subject, context, site, date) {
  const fields = [['ageGroup', ageGroup(subject.age)], ['sex', subject.sex], ['context', context], ['site', site]];
  return DB.thresholds
    .filter(t => t.metric === code && t.effective <= date && fields.every(([k, v]) => t[k] === '全部' || t[k] === v))
    .map(t => ({ t, score: fields.filter(([k]) => t[k] !== '全部').length }))
    .sort((a, b) => b.score - a.score || b.t.effective.localeCompare(a.t.effective) || b.t.version - a.t.version)[0]?.t;
}
function judge(value, t) {
  if (!t) return '未判定';
  if ((t.alertLo != null && value < t.alertLo) || (t.alertHi != null && value > t.alertHi)) return '警示';
  if ((t.watchLo != null && value < t.watchLo) || (t.watchHi != null && value > t.watchHi)) return '注意';
  return '正常';
}
const thrText = t => t ? `${t.id} v${t.version}` : '—';

/** 依量測模式秒數、品質與指標主檔產生逐項結果；不足時不給數值（3.1、FR-13）。判定結果寫入紀錄後不再重算。 */
function buildValues(record, seconds) {
  const subject = subjectById(record.subject);
  record.values = {};
  for (const m of DB.metrics.filter(x => x.enabled)) {
    const raw = record.raw[m.code];
    let reason = '';
    if (raw === undefined) reason = '量測服務未回傳';
    else if (seconds < m.minSec) reason = `量測長度不足（需 ${m.minSec} 秒）`;
    else if (record.quality < DB.settings.minQuality) reason = '訊號品質不足';
    if (reason) { record.values[m.code] = { value: null, quality: record.quality, status: '無法估測', reason, judge: '—', thr: '—' }; continue; }
    const t = findThreshold(m.code, subject, record.context, record.site, record.time.slice(0, 10));
    const experimental = m.level === '實驗中';
    record.values[m.code] = {
      value: raw, quality: record.quality, status: m.level === '已驗證' ? '有效' : m.level === '參考' ? '參考' : '實驗中',
      judge: experimental ? '未判定' : judge(raw, t), thr: experimental ? '—' : thrText(t)
    };
  }
}
const recordsOf = sid => DB.records.filter(r => r.subject === sid && r.ok);
const valueOf = (r, code) => r.values && r.values[code] && r.values[code].value != null ? r.values[code] : null;

/* ---------- 警示（FR-40～44） ---------- */
const openAlert = sid => DB.alerts.find(a => a.subject === sid && a.status !== '已結案');
function ownersOf(sid) {
  const s = subjectById(sid);
  return DB.users.filter(u => (u.role === 'care' && u.assigned.includes(sid)) || (u.role === 'ohs' && u.depts.includes(s.dept)));
}
function notifyAlert(a) {
  const owners = ownersOf(a.subject);
  const targets = owners.length ? owners : DB.users.filter(u => u.role === 'hadmin');
  for (const o of targets) DB.notifications.unshift({ time: nowStr(), to: o.id, text: `有一則健康警示待處理（編號 ${a.id}），請登入系統查看。`, alert: a.id });
  if (DB.settings.emailNotify) for (const o of targets) DB.mails.unshift({ time: nowStr(), to: o.id, subject: '健康警示待處理通知', text: `有一則健康警示待處理（編號 ${a.id}），請登入系統查看。`, alert: a.id });
  a.notified = true;
  a.history.push({ time: nowStr(), by: '系統', text: `已通知：${targets.map(t => t.name).join('、')}（通知內容不含生理數值）` });
}
function evaluateAlerts(record) {
  const bad = Object.entries(record.values).filter(([, v]) => v.judge === '警示').map(([k]) => k);
  const existing = openAlert(record.subject);
  if (!bad.length) {
    if (existing && existing.status === '待複測' && Object.values(record.values).some(v => v.value != null)) {
      existing.status = '待處理';
      existing.history.push({ time: nowStr(), by: '系統', text: `複測（${record.id}）未超出警示門檻，仍需人員確認結案` });
      notifyAlert(existing);
    }
    return null;
  }
  if (existing) {
    existing.history.push({ time: nowStr(), by: '系統', text: `複測／再次量測（${record.id}）仍超出警示門檻` });
    existing.metrics = [...new Set([...existing.metrics, ...bad])];
    if (existing.status === '待複測') { existing.status = '待處理'; notifyAlert(existing); }
    return existing;
  }
  const a = { id: uid('A'), subject: record.subject, record: record.id, metrics: bad, time: record.time, createdAt: Date.now(), status: DB.settings.retestRequired ? '待複測' : '待處理', notified: false, history: [{ time: nowStr(), by: '系統', text: `由量測 ${record.id} 產生警示事件` }] };
  DB.alerts.unshift(a);
  if (!DB.settings.retestRequired) notifyAlert(a);
  return a;
}

/* ---------- 統計（FR-31、FR-70～72） ---------- */
function stats(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b), n = s.length, mean = s.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  const sd = n > 1 ? Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const r = x => Math.round(x * 100) / 100;
  return { n, mean: r(mean), median: r(median), min: s[0], max: s[n - 1], sd: r(sd) };
}
const enoughForTrend = recs => recs.length >= DB.settings.trendMinCount && new Set(recs.map(r => r.time.slice(0, 10))).size >= DB.settings.trendMinDays;

/* ---------- 匯出（FR-34，含試算表公式注入防護） ---------- */
function exportCsv(name, rows) {
  const cell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const blob = new Blob(['﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  DB.exportLog.unshift({ time: nowStr(), user: me().id, name, rows: rows.length - 1 });
  save();
  toast('已匯出，並記錄匯出紀錄');
}

/* ---------- UI 元件 ---------- */
const card = (title, body, extra = '') => `<div class="card">${title ? `<div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2"><strong>${title}</strong><div>${extra}</div></div>` : ''}<div class="card-body">${body}</div></div>`;
const table = (heads, rows, empty = '目前沒有資料') => `<div class="table-responsive"><table class="table table-hover align-middle mb-0"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${heads.length}" class="text-center text-muted py-3">${empty}</td></tr>`}</tbody></table></div>`;
const badge = (text, color = 'secondary') => `<span class="badge text-bg-${color}">${esc(text)}</span>`;
const STATUS_COLORS = { 有效: 'success', 參考: 'info', 實驗中: 'secondary', 無法估測: 'secondary', 已發布: 'success', 已核准: 'success', 草稿: 'secondary', 待專業審核: 'warning', 待法遵審核: 'warning', 已退回: 'danger', 已撤銷: 'dark', 已下架: 'dark', 待受理: 'warning', 待回覆: 'warning', 已回覆: 'primary', 待複測: 'warning', 待處理: 'danger', 處理中: 'primary', 已結案: 'success', 已驗證: 'success', 成功: 'success', 失敗: 'danger' };
const sBadge = s => badge(s, STATUS_COLORS[s] || 'secondary');
/** 判定一律「圖示＋文字」，不只靠顏色（NFR-09）。 */
function judgeMark(j) {
  const map = { 正常: ['success', 'check-circle'], 注意: ['warning', 'exclamation-circle'], 警示: ['danger', 'exclamation-triangle-fill'] };
  if (!map[j]) return `<span class="text-muted">${esc(j)}</span>`;
  return `<span class="badge text-bg-${map[j][0]}"><i class="bi bi-${map[j][1]} me-1" aria-hidden="true"></i>${j}</span>`;
}
function valueCell(r, code) {
  const v = r.values?.[code];
  if (!v) return '<span class="text-muted">—</span>';
  if (v.value == null) return `<span class="text-muted" title="${esc(v.reason)}">無法估測</span>`;
  const icon = v.judge === '警示' ? '<i class="bi bi-exclamation-triangle-fill text-danger ms-1" title="警示"></i><span class="visually-hidden">警示</span>' : v.judge === '注意' ? '<i class="bi bi-exclamation-circle text-warning ms-1" title="注意"></i><span class="visually-hidden">注意</span>' : '';
  return `${v.value}${icon}`;
}
const DISCLAIMER = '<div class="alert alert-secondary py-2 small mb-3"><i class="bi bi-info-circle me-1" aria-hidden="true"></i>估測值，僅供健康管理參考，非醫療診斷。</div>';
const EMERGENCY = '<div class="alert alert-danger py-2 small mb-3"><i class="bi bi-telephone-fill me-1" aria-hidden="true"></i>若有胸痛、呼吸困難、昏厥等緊急狀況，請立即撥打 <strong>119</strong>。</div>';
const opts = (list, selected) => list.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${String(v) === String(selected) ? ' selected' : ''}>${esc(t)}</option>`; }).join('');

function toast(text, color = 'primary') {
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${color} border-0`;
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(text)}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="關閉"></button></div>`;
  $('#toasts').appendChild(el);
  el.addEventListener('hidden.bs.toast', () => el.remove());
  new bootstrap.Toast(el, { delay: 4500 }).show();
}
const deny = text => toast('系統拒絕：' + text, 'danger');

function modal(title, body, foot = '<button class="btn btn-secondary" data-bs-dismiss="modal">關閉</button>') {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = body;
  $('#modal-foot').innerHTML = foot;
  bootstrap.Modal.getOrCreateInstance($('#modal')).show();
}
const closeModal = () => bootstrap.Modal.getInstance($('#modal'))?.hide();

let charts = [];
function chart(id, config) {
  const el = document.getElementById(id);
  if (!el) return;
  config.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false }, config.options);
  charts.push(new Chart(el, config));
}

/* ---------- 路由與版面 ---------- */
const ROUTES = {};
const ACTIONS = {};
const ALL = Object.keys(ROLE_NAMES);
/** def: {title, icon, roles, stage, fr, render(el)}；頁面屬於哪個模組由 modules.js 決定 */
const route = (path, def) => { ROUTES[path] = def; };
const view = {}; // 各頁面的篩選條件

const App = {
  render() {
    const path = location.hash.replace(/^#\//, '') || 'home';
    const def = ROUTES[path] || ROUTES.home;
    const u = me();
    charts.forEach(c => c.destroy());
    charts = [];
    if (path !== 'kiosk') kioskReset();
    document.body.classList.toggle('kiosk', path === 'kiosk');
    if (window.innerWidth < 1200) document.body.classList.remove('toggle-sidebar');

    $('#persona').innerHTML = DB.users.map(x => `<option value="${x.id}"${x.id === u.id ? ' selected' : ''}>${esc(ROLE_NAMES[x.role])}｜${esc(x.name)}</option>`).join('');
    renderNav(path in ROUTES ? path : 'home');

    $('#page-title').textContent = def.title;
    $('#page-tags').innerHTML = [def.stage ? `<span>階段 ${def.stage}</span>` : '', def.fr ? `<span>${def.fr}</span>` : ''].join('');
    const el = $('#view');
    renderGuide();
    if (!def.roles.includes(u.role)) {
      el.innerHTML = card('', `<div class="alert alert-warning mb-0"><i class="bi bi-shield-lock me-1"></i>目前身分「${ROLE_NAMES[u.role]}」沒有此功能權限。可用身分：${def.roles.map(r => ROLE_NAMES[r]).join('、')}。請由右上角切換。</div>`);
      return;
    }
    def.render(el);
  },
  refresh() { save(); App.render(); },
  start() {
    DB = load();
    if (!DB) {
      DB = buildSeed();
      DB.records.forEach(r => buildValues(r, 10));
      // 預置一則待處理警示，供處置流程示範
      const r = DB.records.filter(x => x.subject === 'S12').slice(-1)[0];
      r.raw.SPO2 = 86; r.quality = 88; buildValues(r, 10);
      DB.settings.retestRequired = false; evaluateAlerts(r); DB.settings.retestRequired = true;
    }
    expireProducts();
    save();

    const fire = (e, attr) => {
      const el = e.target.closest(`[${attr}]`);
      if (el && !el.disabled && ACTIONS[el.getAttribute(attr)]) ACTIONS[el.getAttribute(attr)](el, e);
    };
    document.addEventListener('click', e => fire(e, 'data-act'));
    document.addEventListener('change', e => fire(e, 'data-change'));
    document.addEventListener('submit', e => { e.preventDefault(); fire(e, 'data-submit'); });
    $('#persona').addEventListener('change', e => { DB.currentUser = e.target.value; closeModal(); Object.keys(view).forEach(k => delete view[k]); App.refresh(); });
    window.addEventListener('hashchange', () => { closeModal(); App.render(); window.scrollTo(0, 0); });
    App.render();
  }
};
const openAlertById = id => DB.alerts.find(a => a.id === id && a.status !== '已結案');

Object.assign(ACTIONS, {
  toggleSidebar: () => document.body.classList.toggle('toggle-sidebar'),
  toggleBig: () => document.documentElement.classList.toggle('big'),
  reset: () => {
    modal('重置示範資料', '<p class="mb-0">清除你在雛型中的所有操作，回到初始示範資料。</p>',
      '<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button><button class="btn btn-danger" data-act="resetConfirm">重置</button>');
  },
  resetConfirm: () => { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* 略過 */ } location.hash = '#/home'; location.reload(); },
  goAs: el => { if (el.dataset.demo) setGuide({ title: DEMOS[+el.dataset.demo].title, step: 0 }); closeModal(); DB.currentUser = el.dataset.user; Object.keys(view).forEach(k => delete view[k]); save(); if (location.hash === '#/' + el.dataset.to) App.render(); else location.hash = '#/' + el.dataset.to; },
  setView: el => { view[el.dataset.key] = el.type === 'checkbox' ? el.checked : (el.dataset.value ?? el.value); App.render(); }
});
