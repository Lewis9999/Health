/* 功能權限總覽（NFR-05）。「能否開啟頁面」直接讀各頁的 roles，改權限時本表自動跟著變。
   「頁面內限制」與「資料範圍」是人工整理的文字，改程式規則時要一併修改。 */
'use strict';

const PAGE_NOTES = {
  worksite: '職安人員限所屬單位',
  rehab: '照護者限指派個案',
  kiosk: '確認、結果畫面與識別碼輸入會自動清除',
  daycare: '照護者限指派長輩；家屬未授權檢視時不能通知',
  pharmacy: '只有資格有效的藥師／營養師能看分享內容、回覆與結案；結案或撤回後看不到分享內容；健康管理員僅檢視',
  consent: '受測者限本人；操作員限本場域。操作員與健康管理員可建立無帳號受測者',
  measure: '須有有效同意；操作員只看當次結果',
  list: '只列可視範圍內的紀錄',
  history: '只看可視範圍內的對象',
  lifelog: '僅本人',
  alerts: '限可視範圍；電子郵件開關限健康管理員',
  group: '只有彙總；少於 5 人不顯示',
  dashboard: '只有彙總',
  recommend: '僅本人；同意由家屬代簽者不開放個人化推薦。只能追問、結案自己的諮詢，收到回覆後才能追問；含緊急關鍵字時先顯示 119 提示',
  shop: '僅本人下單',
  products: '編輯、送審：商品人員。專業審核：資格有效的營養師／藥師。法遵審核：法遵。發布：商品或法遵。緊急下架：商品、營養師／藥師、法遵。不得自審、兩關不得同一人；系統管理者不能略過審核',
  rules: '修訂：商品人員；審核依兩關規則；發布：商品或法遵',
  consult: '回覆與結案者資格須在效期內；回覆後才能由營養師／藥師結案，須填原因',
  adverse: '受測者只看自己的回報與結案結果；受理、處理、結案與「下架並通知已購者」限商品人員、營養師／藥師、法遵',
  orders: '看不到生理數值',
  channels: '傳出資料不含健康資訊',
  sales: '只有彙總',
  assistant: '只檢索該角色可查閱且在效期內的文件',
  eduqa: '只顯示審核過的原文',
  reviewassist: '輔助用，不取代人工審核',
  kb: '核准、退回、撤銷、送審：法遵（維護人不得審自己的文件）。停用助理：法遵、健康管理員',
  metrics: '「實驗中」指標的結果只有健康管理員看得到',
  reference: '配對明細顯示受測者姓名；匯出的 CSV 不含姓名',
  thresholds: '只能新增版本，不改歷史判定',
  devices: '至少保留一台啟用裝置',
  audit: '看得到查閱、匯出與紅旗提示紀錄（紅旗紀錄不含諮詢內容）',
  deploy: '修改量測服務網址限系統管理者',
  flows: '唯讀；只有件數，不含個案內容。能處理的案件顯示「處理」，只能開啟的顯示「查看」，打不開的顯示鎖頭',
  permissions: '唯讀'
};

const DATA_SCOPE = {
  subject: '本人資料',
  operator: '本場域人員可協助量測，只看當次結果，不看歷史',
  care: '指派的個案',
  ohs: '所屬單位人員',
  manager: '沒有個人數值，只看彙總',
  hadmin: '全部受測者',
  pro: '沒有一般個人數值；僅本人分享的諮詢量測（資格須有效）',
  merch: '沒有個人生理數值',
  legal: '沒有個人生理數值',
  sysadmin: '沒有生理數值'
};

/** 依目前模組分類列出所有功能頁。 */
const permissionRows = () => MODULES.flatMap(m => m.sections.flatMap(s => Object.keys(s.pages).map(p => ({ module: m.name, section: s.name, path: p, title: ROUTES[p].title, roles: ROUTES[p].roles, note: PAGE_NOTES[p] || '' }))));

route('permissions', {
  title: '功能權限總覽', icon: 'person-lock', roles: ['hadmin', 'sysadmin'], stage: '1', fr: 'NFR-05',
  render(el) {
    const roles = Object.keys(ROLE_NAMES), rows = permissionRows(), only = view.permRole || '';
    const shown = only ? rows.filter(r => r.roles.includes(only)) : rows;
    const cols = only ? [only] : roles;
    const mark = ok => ok ? '<i class="bi bi-check-lg perm-yes" aria-hidden="true"></i><span class="visually-hidden">可使用</span>' : '<span class="perm-no" aria-hidden="true">—</span><span class="visually-hidden">不可使用</span>';
    let last = '';
    const body = shown.map(r => {
      const group = r.module === last ? '' : `<tr class="perm-group"><th colspan="${cols.length + 2}" scope="colgroup">${last = r.module}</th></tr>`;
      return `${group}<tr><th scope="row"><a href="#/${r.path}">${r.title}</a><small>${r.section}</small></th>${cols.map(c => `<td class="perm-cell">${mark(r.roles.includes(c))}</td>`).join('')}<td class="perm-note">${r.note || '—'}</td></tr>`;
    }).join('');
    el.innerHTML = `${pageNote('雛型權限<strong>不代表安全保證</strong>；勾號只代表能開啟頁面。', '雛型的權限由瀏覽器程式模擬，<strong>不代表安全保證</strong>；正式系統須在伺服器端檢查（依 EIIS 權限設定）。勾號只代表能開啟頁面，能執行哪些操作見「頁面內限制」。總覽與各模組首頁不另列。')}
      ${card(`功能 × 角色（${shown.length} 項功能）`, `<div class="row g-2 mb-2 no-print"><div class="col-sm-6 col-md-4"><label class="form-label" for="permRole">只看某個角色</label><select class="form-select" id="permRole" data-change="setView" data-key="permRole">${opts([['', '全部角色'], ...roles.map(k => [k, ROLE_NAMES[k]])], only)}</select></div></div>
        <div class="table-responsive"><table class="table table-bordered align-middle mb-0 perm-table"><thead><tr><th scope="col">功能</th>${cols.map(c => `<th scope="col" class="perm-cell">${ROLE_NAMES[c].replaceAll('／', '／<wbr>')}</th>`).join('')}<th scope="col">頁面內限制</th></tr></thead><tbody>${body}</tbody></table></div>`,
        '<button class="btn btn-sm btn-outline-success no-print" data-act="exportPerm">匯出 CSV</button> <button class="btn btn-sm btn-outline-secondary no-print" data-act="printPage">列印／PDF</button>')}
      ${card('角色、示範使用者與資料範圍', table(['角色', '示範使用者', '可開啟功能數', '可看的健康資料'], roles.map(k => [ROLE_NAMES[k], DB.users.filter(u => u.role === k).map(u => esc(u.name)).join('、') || '—', `${rows.filter(r => r.roles.includes(k)).length}／${rows.length}`, DATA_SCOPE[k]])))}`;
  }
});
// 匯出一律包含全部角色，不受畫面篩選影響
ACTIONS.exportPerm = () => exportCsv('功能權限總覽', [['模組', '分類', '功能', ...Object.values(ROLE_NAMES), '頁面內限制'],
  ...permissionRows().map(r => [r.module, r.section, r.title, ...Object.keys(ROLE_NAMES).map(k => r.roles.includes(k) ? '可' : ''), r.note])]);
