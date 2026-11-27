/* 流程總覽：彙整系統內各項流程的步驟、負責角色與目前件數。只給件數，不含個案內容。
   步驟、狀態名稱與「誰能處理」是依各頁程式整理，改流程或權限時要一併修改這裡。 */
'use strict';

const countBy = (list, status) => () => list().filter(x => x.status === status).length;
const nobody = () => 0;
/** 一個步驟。wait 表示停在這一步的案件還需要有人處理；
    mine 回傳「目前身分現在就能操作」的件數。能開啟頁面不等於能處理，兩者分開判斷。 */
const flowStep = (name, who, count, wait = false, mine = nobody) => ({ name, who, count, wait, mine });

/** 商品已下架但狀態仍是「已發布」時，歸在「已下架」。 */
const productState = p => p.offline && p.status === '已發布' ? '已下架' : p.status;
const productCount = s => () => DB.products.filter(p => productState(p) === s).length;
const kbState = d => d.status === '已核准' && !isLive(d) ? '已逾效期' : d.status;
const kbCount = s => () => DB.kbDocs.filter(d => kbState(d) === s).length;
/** 商品與推薦規則共用的兩關審核。 */
const reviewStep = (name, who, list, count) => flowStep(name, who, count(name), true, mineIn(list, name, WORK.review));
const reviewSteps = (list, count) => [
  flowStep('草稿', '商品人員送審', count('草稿')),
  reviewStep('待專業審核', '營養師／藥師', list, count),
  reviewStep('待法遵審核', '法遵人員', list, count),
  reviewStep('已核准', '商品或法遵發布', list, count),
  flowStep('已發布', '—', count('已發布'))
];
const alertList = () => DB.alerts, orderList = () => DB.orders, adverseList = () => DB.adverse, productList = () => DB.products, ruleList = () => DB.rules, consultList = () => DB.consults;
/** 目前身分在這一步能處理幾件。判斷規則在 queue.js 的 WORK。 */
const mineIn = (list, status, isMine) => () => list().filter(x => x.status === status && isMine(x)).length;
/** 步驟名稱就是資料狀態時使用。 */
const workStep = (name, who, list, isMine) => flowStep(name, who, countBy(list, name), true, mineIn(list, name, isMine));
/** 警示限可視範圍內的對象。 */
const visibleAlerts = () => { const ids = visibleSubjects().map(s => s.id); return DB.alerts.filter(a => ids.includes(a.subject)); };
const kbList = () => DB.kbDocs;

const FLOWS = [
  { title: '量測', page: 'measure', note: '沒有有效同意不能量測；品質不合格只提示重測，不產生警示。',
    steps: [flowStep('取得同意', '受測者或代簽人'), flowStep('量測', '受測者或現場操作員'), flowStep('品質檢查與判定', '系統'), flowStep('超出警示門檻時產生警示', '系統')] },
  { title: '警示處置', page: 'alerts', total: () => DB.alerts.length, note: '設定不要求複測時，直接從「待處理」開始。結案必須填寫備註。',
    steps: [flowStep('待複測', '當事人複測', countBy(alertList, '待複測'), true), flowStep('待處理', '負責的照護者、職安或健康管理員', countBy(alertList, '待處理'), true, mineIn(visibleAlerts, '待處理', WORK.alert)), flowStep('處理中', '負責的照護者、職安或健康管理員', countBy(alertList, '處理中'), true, mineIn(visibleAlerts, '處理中', WORK.alert)), flowStep('已結案', '—', countBy(alertList, '已結案'))] },
  { title: '商品審核', page: 'products', total: () => DB.products.length, note: '不得自審，兩關不得同一人，審核資格須在效期內；系統管理者不能略過。',
    steps: reviewSteps(productList, productCount), others: [reviewStep('已退回', '商品人員修改', productList, productCount), flowStep('已下架', '—', productCount('已下架'))] },
  { title: '推薦規則審核', page: 'rules', total: () => DB.rules.length, note: '審核方式與商品相同。',
    steps: reviewSteps(ruleList, s => countBy(ruleList, s)), others: [workStep('已退回', '商品人員修改', ruleList, WORK.review)] },
  { title: '知識文件審核', page: 'kb', total: () => DB.kbDocs.length, note: '目前只有法遵一關；維護人不得審自己的文件。',
    steps: [flowStep('待法遵審核', '法遵人員', kbCount('待法遵審核'), true, mineIn(kbList, '待法遵審核', WORK.kb)), flowStep('已核准', '—', kbCount('已核准'))],
    others: [flowStep('已退回', '法遵人員修改後重送', kbCount('已退回'), true, mineIn(kbList, '已退回', WORK.kb)), flowStep('已逾效期', '法遵撤銷後重新送審', kbCount('已逾效期')), flowStep('已撤銷', '—', kbCount('已撤銷'))] },
  { title: '自建購物訂單', page: 'orders', total: () => DB.orders.length, note: '付款結果經驗證才入帳；取消時回補庫存。',
    steps: [flowStep('待付款', '買家', countBy(orderList, '待付款'), true), workStep('已付款・待出貨', '商品人員出貨', orderList, WORK.order), flowStep('已出貨', '—', countBy(orderList, '已出貨'))],
    others: [flowStep('已退貨退款', '—', countBy(orderList, '已退貨退款')), flowStep('已取消', '—', countBy(orderList, '已取消'))] },
  { title: '不良反應與客訴', page: 'adverse', total: () => DB.adverse.length, note: '結案必須填寫結果類別與給回報人的說明。下架商品不等於結案。',
    steps: [workStep('待受理', '商品人員、營養師／藥師或法遵', adverseList, WORK.adverse), workStep('處理中', '商品人員、營養師／藥師或法遵', adverseList, WORK.adverse), flowStep('已結案', '—', countBy(adverseList, '已結案'))] },
  { title: '專業諮詢', page: 'consult', total: () => DB.consults.length, note: '本人追問後回到「待回覆」。本人隨時可結案；營養師／藥師須在回覆後填寫原因才能結案。結案後附上的量測停止分享。提問或追問含緊急關鍵字時，先顯示 119 提示，本人確認後才送出。回覆者資格須在效期內。',
    steps: [workStep('待回覆', '營養師／藥師', consultList, WORK.consult), flowStep('已回覆', '本人追問或結案', countBy(consultList, '已回覆')), flowStep('已結案', '—', countBy(consultList, '已結案'))] }
];

/** 目前有案件等人處理的步驟。 */
const pendingFlowSteps = () => FLOWS.flatMap(f => [...f.steps, ...(f.others || [])].filter(s => s.wait && s.count()).map(s => ({ flow: f, step: s })));
/** 管理角色看全部以掌握卡在哪裡；審核與處理角色預設只看自己能處理的。 */
const flowMineOnly = () => view.flowMine ?? !['hadmin', 'sysadmin'].includes(me().role);

const noAccess = '<span class="flow-locked"><i class="bi bi-lock" aria-hidden="true"></i> 無開啟權限</span>';
/** 待處理表格的操作欄：能處理給按鈕，只能看給文字連結，打不開顯示鎖頭。 */
function pendingAction(flow, mine) {
  if (!canOpen(flow.page)) return noAccess;
  const target = `<span class="visually-hidden">${ROUTES[flow.page].title}</span>`;
  return mine ? `<a class="btn btn-sm btn-outline-primary text-nowrap flow-do" href="#/${flow.page}">處理<span aria-hidden="true"> →</span>${target}</a>` : `<a class="flow-see" href="#/${flow.page}">查看${target}</a>`;
}
function pendingCard() {
  const all = pendingFlowSteps(), only = flowMineOnly();
  const list = all.map(x => ({ ...x, total: x.step.count(), mine: x.step.mine() })).filter(x => !only || x.mine);
  const rows = list.map(({ flow, step, total, mine }) => {
    // 兩個數字不同時才加註，避免每列重複
    const sub = mine && mine < total ? `<small>${only ? `全部 ${total} 件` : `你可處理 ${mine} 件`}</small>` : '';
    return [flow.title, step.name, `<span class="flow-num">${only ? mine : total}</span>${sub}`, step.who, pendingAction(flow, mine)];
  });
  const empty = only && all.length
    ? `<p class="mb-2">目前沒有你要處理的案件。</p><button class="btn btn-sm btn-outline-secondary" data-act="flowShowAll">查看全部（${all.length} 項）</button>`
    : '<p class="mb-0 text-muted">目前沒有等待處理的案件</p>';
  const tools = `<label class="form-check form-switch d-inline-block me-2 mb-0 no-print"><input class="form-check-input" type="checkbox" id="flowMine" data-change="setView" data-key="flowMine" ${only ? 'checked' : ''}><span class="form-check-label small">只看我要處理的</span></label><button class="btn btn-sm btn-outline-secondary no-print" data-act="printPage">列印／PDF</button>`;
  return card(only ? '我要處理的案件' : '目前等人處理的案件', `<div class="flow-pending">${rows.length ? table(['流程', '停在', '件數', '等誰處理', '操作'], rows) : empty}</div>`, tools);
}

const flowFlag = '<span class="flow-flag"><span aria-hidden="true">●</span> 有案件停留</span>';
function flowBox(s) {
  const n = s.count ? s.count() : null, stuck = s.wait && n > 0;
  return `<div class="flow-step${stuck ? ' has-wait' : ''}">${stuck ? flowFlag : ''}<strong>${s.name}</strong><small>${s.who}</small>${n === null ? '' : `<span class="flow-count">${n} 件</span>`}</div>`;
}
function flowCard(f) {
  const others = f.others || [];
  // 需要處理的分支畫成節點，不能收起；只有不需在此處理的狀態用一行文字帶過
  const branches = others.filter(s => s.wait), idle = others.filter(s => !s.wait);
  const body = `<div class="flow-body"><ol class="flow-steps">${f.steps.map(s => `<li>${flowBox(s)}</li>`).join('')}</ol>
    ${branches.length ? `<div class="flow-side"><p class="flow-branch-title">分支（需處理）</p><ul class="flow-branches">${branches.map(s => `<li>${flowBox(s)}</li>`).join('')}</ul></div>` : ''}</div>
    ${idle.length ? `<p class="flow-idle">其他狀態：${idle.map(s => `${s.name} ${s.count()} 件${s.who === '—' ? '' : `（${s.who}）`}`).join('、')}</p>` : ''}
    <details class="flow-note"><summary>規則說明</summary><p>${f.note}</p></details>`;
  const link = canOpen(f.page) ? `<a href="#/${f.page}">開啟${ROUTES[f.page].title}</a>` : noAccess;
  // 四步以上占整列，三步以下在寬螢幕兩兩並排
  return `<div class="flow-card${f.steps.length >= 4 ? ' wide' : ''}">${card(f.total ? `${f.title}（共 ${f.total()} 件）` : f.title, body, `<span class="small no-print">${link}</span>`)}</div>`;
}

route('flows', {
  title: '流程總覽', icon: 'diagram-3', roles: ['hadmin', 'sysadmin', 'merch', 'pro', 'legal'], stage: '2～4', fr: 'FR-40～44、89、91～95、103',
  render(el) {
    expireProducts();
    el.innerHTML = `<div class="flow-legend">${flowFlag}<span>只顯示件數，不含個案內容。</span>
        <details class="flow-help page-help"><summary><i class="bi bi-info-circle" aria-hidden="true"></i> 說明</summary>
          <p>件數是全系統目前的資料。粗框節點表示有案件停在該步驟等人處理；「分支（需處理）」是主流程以外、仍需要有人處理的狀態；沒有案件時是虛線框，有案件時改為粗實線框。「只看我要處理的」依目前身分判斷現在能操作的案件，能開啟頁面不一定能處理。各流程的步驟固定寫在程式中，雛型沒有可自行設定關卡的流程引擎。</p></details></div>
      ${pendingCard()}
      <div class="flow-grid">${FLOWS.map(flowCard).join('')}</div>`;
  }
});
ACTIONS.flowShowAll = () => { view.flowMine = false; App.render(); };
