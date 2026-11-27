/* 流程總覽：彙整系統內各項流程的步驟、負責角色與目前件數。只給件數，不含個案內容。
   步驟與狀態名稱是依各頁程式整理，改流程時要一併修改這裡。 */
'use strict';

const countBy = (list, status) => () => list().filter(x => x.status === status).length;
/** 一個步驟。wait 表示停在這一步的案件還需要有人處理。 */
const flowStep = (name, who, count, wait = false) => ({ name, who, count, wait });
/** 商品已下架但狀態仍是「已發布」時，歸在「已下架」。 */
const productState = p => p.offline && p.status === '已發布' ? '已下架' : p.status;
const productCount = s => () => DB.products.filter(p => productState(p) === s).length;
const kbState = d => d.status === '已核准' && !isLive(d) ? '已逾效期' : d.status;
const kbCount = s => () => DB.kbDocs.filter(d => kbState(d) === s).length;
const reviewSteps = count => [
  flowStep('草稿', '商品人員送審', count('草稿')),
  flowStep('待專業審核', '營養師／藥師', count('待專業審核'), true),
  flowStep('待法遵審核', '法遵人員', count('待法遵審核'), true),
  flowStep('已核准', '商品或法遵發布', count('已核准'), true),
  flowStep('已發布', '—', count('已發布'))
];
const alertList = () => DB.alerts, orderList = () => DB.orders, adverseList = () => DB.adverse, ruleList = () => DB.rules, consultList = () => DB.consults;

const FLOWS = [
  { title: '量測', page: 'measure', note: '沒有有效同意不能量測；品質不合格只提示重測，不產生警示。',
    steps: [flowStep('取得同意', '受測者或代簽人'), flowStep('量測', '受測者或現場操作員'), flowStep('品質檢查與判定', '系統'), flowStep('超出警示門檻時產生警示', '系統')] },
  { title: '警示處置', page: 'alerts', total: () => DB.alerts.length, note: '設定不要求複測時，直接從「待處理」開始。結案必須填寫備註。',
    steps: [flowStep('待複測', '當事人複測', countBy(alertList, '待複測'), true), flowStep('待處理', '負責的照護者、職安或健康管理員', countBy(alertList, '待處理'), true), flowStep('處理中', '負責的照護者、職安或健康管理員', countBy(alertList, '處理中'), true), flowStep('已結案', '—', countBy(alertList, '已結案'))] },
  { title: '商品審核', page: 'products', total: () => DB.products.length, note: '不得自審，兩關不得同一人，審核資格須在效期內；系統管理者不能略過。',
    steps: reviewSteps(productCount), others: [flowStep('已退回', '商品人員修改', productCount('已退回'), true), flowStep('已下架', '—', productCount('已下架'))] },
  { title: '推薦規則審核', page: 'rules', total: () => DB.rules.length, note: '審核方式與商品相同。',
    steps: reviewSteps(s => countBy(ruleList, s)), others: [flowStep('已退回', '商品人員修改', countBy(ruleList, '已退回'), true)] },
  { title: '知識文件審核', page: 'kb', total: () => DB.kbDocs.length, note: '目前只有法遵一關；維護人不得審自己的文件。',
    steps: [flowStep('待法遵審核', '法遵人員', kbCount('待法遵審核'), true), flowStep('已核准', '—', kbCount('已核准'))],
    others: [flowStep('已退回', '法遵人員修改後重送', kbCount('已退回'), true), flowStep('已逾效期', '法遵人員重新送審', kbCount('已逾效期')), flowStep('已撤銷', '—', kbCount('已撤銷'))] },
  { title: '自建購物訂單', page: 'orders', total: () => DB.orders.length, note: '付款結果經驗證才入帳；取消時回補庫存。',
    steps: [flowStep('待付款', '買家', countBy(orderList, '待付款'), true), flowStep('已付款・待出貨', '商品人員出貨', countBy(orderList, '已付款・待出貨'), true), flowStep('已出貨', '—', countBy(orderList, '已出貨'))],
    others: [flowStep('已退貨退款', '—', countBy(orderList, '已退貨退款')), flowStep('已取消', '—', countBy(orderList, '已取消'))] },
  { title: '不良反應與客訴', page: 'adverse', total: () => DB.adverse.length, note: '結案必須填寫結果類別與給回報人的說明。下架商品不等於結案。',
    steps: [flowStep('待受理', '商品人員、營養師／藥師或法遵', countBy(adverseList, '待受理'), true), flowStep('處理中', '商品人員、營養師／藥師或法遵', countBy(adverseList, '處理中'), true), flowStep('已結案', '—', countBy(adverseList, '已結案'))] },
  { title: '專業諮詢', page: 'consult', total: () => DB.consults.length, note: '本人追問後回到「待回覆」。本人隨時可結案；營養師／藥師須在回覆後填寫原因才能結案。結案後附上的量測停止分享。提問或追問含緊急關鍵字時，先顯示 119 提示，本人確認後才送出。回覆者資格須在效期內。',
    steps: [flowStep('待回覆', '營養師／藥師', countBy(consultList, '待回覆'), true), flowStep('已回覆', '本人追問或結案', countBy(consultList, '已回覆')), flowStep('已結案', '—', countBy(consultList, '已結案'))] }
];

/** 目前有案件等人處理的步驟。 */
const pendingFlowSteps = () => FLOWS.flatMap(f => [...f.steps, ...(f.others || [])].filter(s => s.wait && s.count()).map(s => ({ flow: f, step: s })));

route('flows', {
  title: '流程總覽', icon: 'diagram-3', roles: ['hadmin', 'sysadmin', 'merch', 'pro', 'legal'], stage: '2～4', fr: 'FR-40～44、89、91～95、103',
  render(el) {
    expireProducts();
    const goto = f => canOpen(f.page) ? `<a href="#/${f.page}">前往${ROUTES[f.page].title}</a>` : '<span class="text-muted">此身分無法開啟</span>';
    const box = s => {
      const n = s.count ? s.count() : null;
      return `<div class="flow-step${s.wait && n ? ' has-wait' : ''}"><strong>${s.name}</strong><small>${s.who}</small>${n === null ? '' : `<span class="flow-count">${n} 件</span>`}</div>`;
    };
    el.innerHTML = `<div class="alert alert-secondary py-2 small">件數是全系統目前的資料，只有數字，不含個案內容。粗框表示有案件停在該步驟等人處理。各流程的步驟固定寫在程式中，雛型沒有可自行設定關卡的流程引擎。</div>
      ${card('目前等人處理的案件', `<div class="flow-pending">${table(['流程', '停在', '件數', '等誰處理', '前往'], pendingFlowSteps().map(({ flow, step }) => [flow.title, step.name, step.count(), step.who, goto(flow)]), '目前沒有等待處理的案件')}</div>`, '<button class="btn btn-sm btn-outline-secondary no-print" data-act="printPage">列印／PDF</button>')}
      ${FLOWS.map(f => `<div class="flow-card">${card(f.total ? `${f.title}（共 ${f.total()} 件）` : f.title,
        `<ol class="flow-steps">${f.steps.map(s => `<li>${box(s)}</li>`).join('')}</ol>
        ${f.others ? `<p class="small mt-3 mb-0">其他狀態：${f.others.map(s => `${s.name} ${s.count()} 件${s.who === '—' ? '' : `（${s.who}）`}`).join('、')}</p>` : ''}
        <p class="small text-muted mt-2 mb-0">${f.note}</p>`, `<span class="small no-print">${goto(f)}</span>`)}</div>`).join('')}`;
  }
});
