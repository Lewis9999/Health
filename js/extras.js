/* 跨模組的使用體驗功能：待辦摘要、逐步展示引導、意見回饋、橫幅收合。 */
'use strict';

/** 讀寫瀏覽器儲存；無法使用時照常操作，只是不記住。 */
function readPref(storage, key, fallback) {
  try { const s = window[storage].getItem(key); return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; }
}
function writePref(storage, key, value) {
  try { if (value == null) window[storage].removeItem(key); else window[storage].setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
}

/* ---------- 待辦摘要 ---------- */
/** 只列目前身分能處理的事項；只給件數，不含個人資料。 */
function todoItems(u = me()) {
  const list = [];
  const add = (to, label, count) => { if (count && canOpen(to, u)) list.push({ to, label, count }); };
  const ids = visibleSubjects(u).map(s => s.id);
  if (u.role === 'subject') add('consent', '尚未同意量測', activeConsent(u.subject) ? 0 : 1);
  add('daycare', '今日需要關心的長輩', visibleSubjects(u).filter(s => s.program === 'daycare' && careReasons(s).length).length);
  add('alerts', '未結案的警示', DB.alerts.filter(a => ids.includes(a.subject) && a.status !== '已結案').length);
  add('products', '等你審核的商品', DB.products.filter(p => !reviewBlock(p)).length);
  if (['merch', 'pro', 'legal'].includes(u.role)) add('products', '即將到期或逾期的商品複審', DB.products.filter(reviewDue).length);
  add('rules', '等你審核的推薦規則', DB.rules.filter(r => !reviewBlock(r)).length);
  if (u.role === 'pro' && u.qualUntil >= DB.today) add('consult', '待回覆的諮詢', DB.consults.filter(c => !c.reply).length);
  if (u.role === 'merch') add('orders', '待出貨的訂單', DB.orders.filter(o => o.status === '已付款・待出貨').length);
  if (u.role !== 'subject') add('adverse', '尚未處置的不良反應與客訴', DB.adverse.filter(a => !a.action).length);
  if (u.role === 'legal') add('kb', '等你審核的知識文件', DB.kbDocs.filter(d => d.status === '待法遵審核' && d.maintainer !== u.id).length);
  return list;
}
function todoHtml() {
  const list = todoItems();
  return `<section class="todo no-print" aria-labelledby="todo-title"><h2 id="todo-title">待辦摘要</h2>${list.length
    ? `<ul>${list.map(t => `<li><a href="#/${t.to}"><span>${t.label}</span><strong>${t.count}</strong></a></li>`).join('')}</ul>`
    : '<p class="mb-0 text-muted">這個身分目前沒有待辦事項。</p>'}</section>`;
}

/* ---------- 逐步展示引導 ---------- */
// 每一步：[說明, 身分, 頁面]。步驟內容與 README「建議展示流程」一致。
const GUIDE_STEPS = {
  '同意控管': [
    ['按「開始量測」，確認系統拒絕；再試「略過畫面直接呼叫上傳 API」。', 'u_sub3', 'measure'],
    ['勾選「量測與儲存」後簽署同意。', 'u_sub3', 'consent'],
    ['回到量測頁，這次可以完成量測。', 'u_sub3', 'measure']],
  '量測與逐項狀態': [
    ['模擬情況選「訊號品質不足」量一次：不給數值，也不產生警示。', 'u_sub1', 'measure'],
    ['啟用指標「呼吸頻率」。', 'u_admin', 'metrics'],
    ['受測者選「王示範」，用「快速」模式、「正常結果」量測：呼吸頻率顯示量測長度不足。', 'u_admin', 'measure']],
  '警示與處置': [
    ['模擬情況選「血壓偏高」量一次：系統要求複測。', 'u_sub1', 'measure'],
    ['再量一次：發出通知。', 'u_sub1', 'measure'],
    ['開啟事件，記錄處置並填備註後結案。', 'u_ohs', 'alerts']],
  '個人趨勢': [
    ['查看門檻區間、個人基準線與運動前後比較。', 'u_sub2', 'history']],
  '群體統計': [
    ['預設範圍會顯示收縮壓分布圖。', 'u_mgr', 'group'],
    ['單位改選「行政部」（少於 5 人）或「工程部」（相減只剩 3 人）：不顯示。', 'u_mgr', 'group']],
  '現場機台模式': [
    ['輸入 S01 後量測，結果畫面倒數結束會自動清除。可另試未同意的 S15。進入機台畫面後本引導會隱藏。', 'u_op', 'kiosk']],
  '商品審核': [
    ['開啟 P005，查看文案檢核。', 'u_merch', 'products'],
    ['開啟 P004，進行專業審核。', 'u_pharm', 'products'],
    ['開啟 P004，進行法遵審核，再按發布。可另試系統管理者、資格到期的營養師，系統會拒絕。', 'u_legal1', 'products']],
  '推薦與安全抑制': [
    ['指標尚未驗證，此時不推薦商品。', 'u_sub2', 'recommend'],
    ['把收縮壓改為「已驗證」。', 'u_admin', 'metrics'],
    ['推薦頁出現商品。勾「孕期或哺乳」送出問卷，推薦停止；取消勾選再送出，商品重新出現。', 'u_sub2', 'recommend'],
    ['開啟「我目前有身體不適」。', 'u_sub2', 'lifelog'],
    ['回到推薦頁：推薦停止。', 'u_sub2', 'recommend']],
  '電商與自建購物': [
    ['勾選「模擬平台同步失敗」。', 'u_merch', 'channels'],
    ['開啟 P002，緊急下架。', 'u_merch', 'products'],
    ['查看告警，並按重試。', 'u_merch', 'channels'],
    ['把商品加入購物車並結帳，試合法通知、重送與偽造簽章。', 'u_sub1', 'shop'],
    ['輸入批號 L2610B 查訂單。', 'u_merch', 'orders']],
  '作業知識助理': [
    ['用範例問題提問：回答附出處、查不到就說查不到、紅旗題分流。', 'u_ohs', 'assistant'],
    ['試衛教問答的禁答題與紅旗題。', 'u_sub1', 'eduqa'],
    ['撤銷文件 K01。', 'u_legal1', 'kb'],
    ['再問一次「量測失敗怎麼處理」：不再引用 K01。', 'u_ohs', 'assistant']],
  '長照據點': [
    ['查看今日關懷名單：魏玉蘭超過 3 天未報到，童添丁近期多次「注意」。這只用來決定先關心誰，不是照護判斷。', 'u_day', 'daycare'],
    ['童添丁的家屬尚未授權檢視：按「通知家屬」會被拒絕。開啟授權後再通知，內容只有報到次數，不含數值。', 'u_day', 'daycare'],
    ['按任一長輩的「量測」：裝置自動帶入據點量測站。', 'u_day', 'daycare']],
  '社區藥局': [
    ['在「營養師／藥師諮詢」輸入問題，勾選「附上最近一次量測給藥師」後送出。', 'u_sub2', 'recommend'],
    ['查看本人分享的量測並回覆。可另切換成資格到期的營養師：看不到分享內容。', 'u_pharm', 'pharmacy'],
    ['在諮詢紀錄按「撤回分享」。', 'u_sub2', 'recommend'],
    ['藥師這邊改顯示「本人已撤回」。', 'u_pharm', 'pharmacy']],
  '門檻版本': [
    ['替任一門檻建立新版本：舊紀錄的判定與引用版本不變。', 'u_admin', 'thresholds']]
};
const GUIDE_KEY = 'health-proto-guide'; // sessionStorage：按「重置資料」重新載入後仍停在同一步
let guide = readPref('sessionStorage', GUIDE_KEY, null);

function setGuide(next) {
  guide = next;
  writePref('sessionStorage', GUIDE_KEY, next);
  renderGuide();
}
function renderGuide() {
  const el = $('#guide');
  const steps = guide && GUIDE_STEPS[guide.title];
  document.body.classList.toggle('has-guide', !!steps && !guide.min);
  el.hidden = !steps;
  if (!steps) { el.innerHTML = ''; return; }
  const i = Math.min(guide.step, steps.length - 1), [text, user, to] = steps[i];
  el.innerHTML = `<div class="guide-head"><strong>展示引導：${guide.title}</strong><span>${i + 1}／${steps.length}</span>
      <button type="button" data-act="guideMin" aria-expanded="${!guide.min}" aria-label="${guide.min ? '展開引導' : '收合引導'}"><i class="bi bi-chevron-${guide.min ? 'up' : 'down'}" aria-hidden="true"></i></button>
      <button type="button" data-act="guideClose" aria-label="結束引導"><i class="bi bi-x-lg" aria-hidden="true"></i></button></div>
    ${guide.min ? '' : `<div class="guide-body"><p>${text}</p><p class="text-muted small">身分：${esc(userName(user))}｜頁面：${ROUTES[to].title}${i === 0 ? '<br>開始前建議先按「重置資料」，重置後引導仍會保留。' : ''}</p>
      <div class="guide-foot"><button type="button" class="btn btn-sm btn-outline-secondary" data-act="guidePrev" ${i === 0 ? 'disabled' : ''}>上一步</button>
      <button type="button" class="btn btn-sm btn-outline-primary" data-act="goAs" data-user="${user}" data-to="${to}">切到這一步的畫面</button>
      <button type="button" class="btn btn-sm btn-primary" data-act="${i === steps.length - 1 ? 'guideClose' : 'guideNext'}">${i === steps.length - 1 ? '完成' : '下一步'}</button></div></div>`}`;
}
Object.assign(ACTIONS, {
  guideNext: () => setGuide({ ...guide, step: guide.step + 1 }),
  guidePrev: () => setGuide({ ...guide, step: Math.max(0, guide.step - 1) }),
  guideMin: () => setGuide({ ...guide, min: !guide.min }),
  guideClose: () => setGuide(null)
});

/* ---------- 意見回饋 ---------- */
// 與示範資料分開存放：展示流程要求每個情境前重置資料，回饋不能跟著清掉。
const FEEDBACK_KEY = 'health-proto-feedback';
let feedback = readPref('localStorage', FEEDBACK_KEY, []);

function feedbackModal() {
  const page = $('#page-title').textContent;
  modal('意見回饋', `<form id="feedbackForm" data-submit="saveFeedback" data-page="${esc(page)}">
      <p class="small text-muted">目前頁面：${esc(page)}。回饋只存在這台電腦的瀏覽器，不會傳送出去；請勿填寫個資或健康資料。</p>
      <label class="form-label" for="fbKind">類型</label><select class="form-select mb-2" id="fbKind" name="kind">${opts(['操作看不懂', '流程或需求不符', '文字或版面', '其他建議'])}</select>
      <label class="form-label" for="fbText">內容</label><textarea class="form-control" id="fbText" name="text" rows="3" maxlength="500" required></textarea></form>
    <h6 class="mt-3">已記錄 ${feedback.length} 則</h6>${table(['時間', '身分', '頁面', '類型', '內容'], feedback.map(f => [f.time, esc(f.role), esc(f.page), esc(f.kind), esc(f.text)]), '尚無回饋')}`,
    `<button class="btn btn-secondary" data-bs-dismiss="modal">關閉</button>${feedback.length ? '<button class="btn btn-outline-secondary" data-act="exportFeedback">匯出 CSV</button><button class="btn btn-outline-danger" data-act="clearFeedback">清除全部回饋</button>' : ''}<button class="btn btn-primary" form="feedbackForm">送出</button>`);
}
Object.assign(ACTIONS, {
  openFeedback: () => feedbackModal(),
  saveFeedback: el => {
    const f = new FormData(el), text = f.get('text').trim();
    if (!text) return deny('請填寫內容');
    feedback.unshift({ time: nowStr(), role: ROLE_NAMES[me().role], page: el.dataset.page, kind: f.get('kind'), text });
    const saved = writePref('localStorage', FEEDBACK_KEY, feedback);
    feedbackModal();
    toast(saved ? '已記錄回饋' : '瀏覽器無法儲存，關閉頁面後回饋會消失，請先匯出', saved ? 'success' : 'danger');
  },
  exportFeedback: () => exportCsv('意見回饋', [['時間', '身分', '頁面', '類型', '內容'], ...feedback.map(f => [f.time, f.role, f.page, f.kind, f.text])]),
  clearFeedback: el => {
    if (!el.dataset.sure) { el.dataset.sure = '1'; el.textContent = '再按一次確認清除'; return; }
    feedback = []; writePref('localStorage', FEEDBACK_KEY, null); feedbackModal();
  }
});

/* ---------- 總覽橫幅收合 ---------- */
const BANNER_KEY = 'health-proto-banner-hidden';
let bannerHidden = readPref('localStorage', BANNER_KEY, false);
const bannerHtml = () => `<div class="banner-bar no-print"><button type="button" class="btn btn-link btn-sm" data-act="toggleBanner" aria-expanded="${!bannerHidden}">${bannerHidden ? '顯示插畫' : '收合插畫'}</button></div>
  ${bannerHidden ? '' : '<div class="home-banner no-print"><img src="assets/img/module-overview-nature.svg" alt="" width="3200" height="900"></div>'}`;
ACTIONS.toggleBanner = () => { bannerHidden = !bannerHidden; writePref('localStorage', BANNER_KEY, bannerHidden); App.render(); };
