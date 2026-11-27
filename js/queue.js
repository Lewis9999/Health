/* 各頁共用的做法：頁面說明收納，以及清單頁「我能處理的排前面」。
   WORK 是唯一的判斷來源，流程總覽與各清單頁都用它；改各頁的操作權限時要一併修改這裡。
   能開啟頁面不等於能處理。 */
'use strict';

const WORK = {
  /** 「待複測」等的是當事人，不算工作人員的待辦。呼叫端須先限制在可視範圍內。 */
  alert: a => ['待處理', '處理中'].includes(a.status) && ROUTES.alerts.roles.includes(me().role),
  /** 商品與推薦規則：待審逐件檢查（自審、資格到期、兩關同一人）。 */
  review: x => {
    if (['待專業審核', '待法遵審核'].includes(x.status)) return !reviewBlock(x);
    if (x.status === '已核准') return ['merch', 'legal'].includes(me().role);
    return x.status === '已退回' && me().role === 'merch';
  },
  /** 知識文件限法遵處理；維護人不得審自己送審的文件。 */
  kb: d => me().role === 'legal' && (d.status === '已退回' || (d.status === '待法遵審核' && d.maintainer !== me().id)),
  order: o => o.status === '已付款・待出貨' && me().role === 'merch',
  adverse: a => a.status !== '已結案' && adverseHandler(),
  consult: c => c.status === '待回覆' && qualifiedPro()
};

/** 各清單頁目前身分能處理的件數；不在這裡的頁面不顯示件數（例如同意、量測不放人數）。 */
const QUEUE_ITEMS = {
  alerts: () => { const ids = visibleSubjects().map(s => s.id); return DB.alerts.filter(a => ids.includes(a.subject) && WORK.alert(a)); },
  products: () => DB.products.filter(WORK.review),
  rules: () => DB.rules.filter(WORK.review),
  kb: () => DB.kbDocs.filter(WORK.kb),
  orders: () => DB.orders.filter(WORK.order),
  adverse: () => DB.adverse.filter(WORK.adverse),
  consult: () => DB.consults.filter(WORK.consult),
  pharmacy: () => DB.consults.filter(WORK.consult)
};
const queueCount = path => QUEUE_ITEMS[path] && canOpen(path) ? QUEUE_ITEMS[path]().length : 0;
const queueTag = path => { const n = queueCount(path); return n ? `<span class="mine-tag"><span aria-hidden="true">●</span> 待我處理 ${n}</span>` : ''; };

/* ---------- 頁面說明收納 ---------- */
/** key 是常駐顯示的一句重點，其餘收在「說明」。安全警告與目前狀態提示不要用這個收起來。 */
const pageNote = (key, body) => `<div class="page-note"><span>${key}</span><details class="page-help"><summary><i class="bi bi-info-circle" aria-hidden="true"></i> 說明</summary><p>${body}</p></details></div>`;

// 收合的內容在紙本上也要看得到：列印前展開，印完還原
const PRINT_DETAILS = '#view details.page-help, #view details.flow-note';
addEventListener('beforeprint', () => document.querySelectorAll(PRINT_DETAILS).forEach(d => { if (!d.open) { d.open = true; d.dataset.printOpened = '1'; } }));
addEventListener('afterprint', () => document.querySelectorAll('#view details[data-print-opened]').forEach(d => { d.open = false; delete d.dataset.printOpened; }));

/* ---------- 清單頁 ---------- */
/** 預設顯示全部，不隱藏任何項目；能處理的排前面，使用者可自己打開篩選。
    rank 用於比「能不能處理」更優先的排序（例如含緊急關鍵字的諮詢）。 */
function workQueue(key, list, isMine, rank = () => 0) {
  const viewKey = 'mine_' + key, only = !!view[viewKey];
  const marked = list.map((item, i) => ({ item, i, mine: !!isMine(item), rank: +rank(item) }));
  const count = marked.filter(m => m.mine).length;
  const items = marked.filter(m => !only || m.mine).sort((a, b) => b.rank - a.rank || b.mine - a.mine || a.i - b.i).map(m => m.item);
  return {
    items,
    tag: item => isMine(item) ? '<span class="mine-tag"><span aria-hidden="true">●</span> 待我處理</span>' : '',
    // 沒有可處理的項目時不放開關，避免切換後只看到空清單
    tools: count || only ? `<span class="small me-2">待我處理 ${count} 件</span><label class="form-check form-switch d-inline-block me-2 mb-0 no-print"><input class="form-check-input" type="checkbox" data-change="setView" data-key="${viewKey}" ${only ? 'checked' : ''}><span class="form-check-label small">只看我要處理的</span></label>` : '',
    /** 篩選後沒有項目時，取代原本的清單。 */
    wrap: html => only && !items.length ? `<p class="mb-2">目前沒有你要處理的項目。</p><button class="btn btn-sm btn-outline-secondary" data-act="queueShowAll" data-key="${viewKey}">查看全部（${list.length} 項）</button>` : html
  };
}
ACTIONS.queueShowAll = el => { view[el.dataset.key] = false; App.render(); };
/** 清單列上開啟案件的按鈕：能處理的給「處理」，其餘給「查看」。 */
const openButton = (act, id, mine, label = '查看') => `<button class="btn btn-sm ${mine ? 'btn-primary' : 'btn-outline-secondary'} text-nowrap" data-act="${act}" data-id="${id}">${mine ? '處理<span aria-hidden="true"> →</span>' : label}</button>`;
