/* 模組分類：導覽、模組總覽與模組首頁都由這份清單產生。要搬動頁面只改這裡。 */
'use strict';

const HOME_COLOR = '#23402f';
// 模組色只表示「目前在哪個模組」，用低彩度的自然色。鮮明的綠、黃、紅保留給健康判定。
const MODULES = [
  {
    id: 'process', tab: 'flows', name: '流程管理', icon: 'diagram-3', color: '#4d5270', tint: '#e9eaf0', spec: 'FR-40～44、89、91～95、103',
    desc: '各項作業流程的步驟、負責角色與目前件數',
    sections: [
      { name: '流程', pages: { flows: '各流程的步驟、負責角色與目前件數' } }
    ]
  },
  {
    id: 'health', name: '健康管理', icon: 'heart-pulse', color: '#17594a', tint: '#e3eee8', spec: '規格 6.1～6.8',
    desc: '同意、量測、趨勢、警示與場景應用',
    sections: [
      { name: '場景應用', cards: true, pages: { worksite: '班別量測狀況與熱危害', rehab: '運動復健場次與前中後流程', kiosk: '大字、少步驟、自動清畫面', daycare: '每日報到、關懷名單與家屬通知', pharmacy: '本人同意才分享量測給藥師' } },
      { name: '量測與同意', pages: { consent: '簽署、撤回與查看量測同意', measure: '選擇情境與模式後量測，逐項顯示結果', list: '查看可視範圍內的量測紀錄', lifelog: '自願填寫睡眠、運動等紀錄供對照' } },
      { name: '分析與警示', pages: { history: '個人趨勢、基準線與運動前後比較', alerts: '複測、通知、處置到結案', group: '去識別的量測率與指標分布', dashboard: '活躍人數與量測頻率' } }
    ]
  },
  {
    id: 'shop', name: '健康商品', icon: 'bag-heart', color: '#75495f', tint: '#f2e9ec', spec: '規格 6.9',
    desc: '商品審核、推薦、購物與銷售通路',
    sections: [
      { name: '我的衛教與購物', pages: { recommend: '同意、問卷與安全檢查通過後的推薦', shop: '商品專區、購物車與付款模擬' } },
      { name: '商品與專業審核', pages: { products: '商品資料、兩關審核與發布', rules: '推薦條件的建立與審核', consult: '營養師與藥師回覆提問、追問到結案', adverse: '不良反應與客訴從回報、受理到結案' } },
      { name: '訂單與通路', pages: { orders: '出貨、庫存與依批號查訂單', channels: '外部電商同步與下架', sales: '只看彙總的銷售數字' } }
    ]
  },
  {
    id: 'assist', name: '知識助理', icon: 'chat-square-quote', color: '#31607a', tint: '#e4eef0', spec: '規格 6.10',
    desc: '附出處的查詢、衛教問答與知識文件',
    sections: [
      { name: '提問', pages: { assistant: '查操作手冊與處置程序，回答附出處', eduqa: '只顯示審核過的衛教原文' } },
      { name: '審核與文件', pages: { reviewassist: '文案疑慮標示與版本比對', kb: '知識文件的審核、撤銷與停用' } }
    ]
  },
  {
    id: 'admin', name: '系統設定', icon: 'gear', color: '#6a5742', tint: '#eeeadf', spec: '規格 6.3、6.7、8',
    desc: '指標、門檻、裝置、權限、稽核與地端部署',
    sections: [
      { name: '量測設定', pages: { metrics: '指標啟用與驗證等級', thresholds: '分族群的門檻與版本', devices: '量測裝置與場域', reference: '與參考儀器配對做場域驗證' } },
      { name: '權限管理', pages: { permissions: '全部功能與各角色可使用範圍' } },
      { name: '稽核與部署', pages: { audit: '查閱與匯出紀錄', deploy: '地端位址限制與待決事項' } }
    ]
  }
];

const DEMOS = [
  { mod: 'health', title: '同意控管', desc: '未同意者無法量測，同意後才能開始', user: 'u_sub3', to: 'measure', fr: 'FR-02～04' },
  { mod: 'health', title: '量測與逐項狀態', desc: '秒數或品質不足時不給數值', user: 'u_sub1', to: 'measure', fr: 'FR-10～15' },
  { mod: 'health', title: '警示與處置', desc: '複測、通知（不含數值）、處置到結案', user: 'u_care', to: 'alerts', fr: 'FR-40～44' },
  { mod: 'health', title: '個人趨勢', desc: '門檻區間、基準線、資料不足、運動前後比較', user: 'u_sub2', to: 'history', fr: 'FR-30～32、70～72' },
  { mod: 'health', title: '群體統計', desc: '主管只看彙總，少於 5 人不顯示', user: 'u_mgr', to: 'group', fr: 'FR-33、74' },
  { mod: 'health', title: '現場機台模式', desc: '以員工證辨識身分，結束後自動清畫面', user: 'u_op', to: 'kiosk', fr: 'FR-53' },
  { mod: 'health', title: '長照據點', desc: '關懷名單、家屬授權後才通知（不含數值）', user: 'u_day', to: 'daycare', fr: 'FR-53、54（延伸）' },
  { mod: 'shop', title: '商品審核', desc: '兩關審核、不得自審、文案檢核', user: 'u_merch', to: 'products', fr: 'FR-80、81、91～95' },
  { mod: 'shop', title: '推薦與安全抑制', desc: '要看到商品，需先由健康管理員把收縮壓或血乳酸改為「已驗證」', user: 'u_sub2', to: 'recommend', fr: 'FR-82～85' },
  { mod: 'health', title: '社區藥局', desc: '本人勾選才分享量測給藥師，可隨時撤回', user: 'u_sub2', to: 'recommend', fr: 'FR-86（延伸）' },
  { mod: 'shop', title: '電商與自建購物', desc: '下架同步、付款簽章與重複通知、批號回收', user: 'u_merch', to: 'channels', fr: 'FR-96～106' },
  { mod: 'assist', title: '作業知識助理', desc: '引用出處、查不到就說查不到、紅旗分流', user: 'u_ohs', to: 'assistant', fr: 'FR-112～115' },
  { mod: 'admin', title: '門檻版本', desc: '改門檻不改寫歷史判定', user: 'u_admin', to: 'thresholds', fr: 'FR-22、23' }
];

const moduleById = id => MODULES.find(m => m.id === id);
const moduleOf = path => path.startsWith('m-') ? moduleById(path.slice(2)) : MODULES.find(m => m.sections.some(s => path in s.pages));
const moduleHref = m => m.tab || 'm-' + m.id;
const canOpen = (path, u = me()) => ROUTES[path] && ROUTES[path].roles.includes(u.role);
/** 目前身分在該模組看得到的分類與頁面；沒有頁面的分類不列出。 */
const sectionsFor = m => m.sections.map(s => ({ name: s.name, cards: s.cards, pages: Object.entries(s.pages).filter(([p]) => canOpen(p)) })).filter(s => s.pages.length);
const pendingAlerts = () => DB.notifications.filter(x => x.to === me().id && openAlertById(x.alert)).length;
const countBadge = path => { const n = path === 'alerts' ? pendingAlerts() : 0; return n ? `<span class="badge text-bg-danger">${n}<span class="visually-hidden"> 則待處理通知</span></span>` : ''; };

function renderNav(path) {
  const mod = moduleOf(path);
  const color = mod ? mod.color : HOME_COLOR;
  document.body.style.setProperty('--mod', color);
  document.body.style.setProperty('--mod-tint', mod ? mod.tint : '#e7ecdd');
  const sections = mod ? sectionsFor(mod) : [];
  document.body.classList.toggle('no-rail', !sections.length);

  const tab = (href, label, icon, c, on, extra = '') => `<a class="modtab${on ? ' active' : ''}" style="--c:${c}" href="#/${href}"${on ? ' aria-current="true"' : ''}><i class="bi bi-${icon}" aria-hidden="true"></i><span>${label}</span>${extra}</a>`;
  $('#modtabs').innerHTML = tab('home', '總覽', 'grid', HOME_COLOR, !mod) +
    MODULES.filter(m => sectionsFor(m).length).map(m => tab(moduleHref(m), m.name, m.icon, m.color, mod === m, m.id === 'health' && path !== 'alerts' ? countBadge('alerts') : '')).join('');
  $('#modtabs .active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

  if (!sections.length) { $('#rail').innerHTML = ''; return; }
  $('#rail').innerHTML = `<a class="rail-head" href="#/${moduleHref(mod)}"><i class="bi bi-${mod.icon}" aria-hidden="true"></i><span>${mod.name}</span></a>` +
    sections.map(s => `<div class="rail-group"><h2>${s.name}</h2><ul>${s.pages.map(([p]) => `<li><a class="rail-link${p === path ? ' active' : ''}" href="#/${p}"${p === path ? ' aria-current="page"' : ''}><i class="bi bi-${ROUTES[p].icon}" aria-hidden="true"></i><span>${ROUTES[p].title}</span>${countBadge(p)}</a></li>`).join('')}</ul></div>`).join('');
}

const demoList = demos => `<ul class="demo-list">${demos.map(d => `<li style="--c:${moduleById(d.mod).color}"><div><strong>${d.title}</strong><p>${d.desc}</p></div><span class="demo-fr">${d.fr}</span><button class="btn btn-outline-secondary btn-sm" data-act="goAs" data-demo="${DEMOS.indexOf(d)}" data-user="${d.user}" data-to="${d.to}">以「${esc(userName(d.user))}」開始</button></li>`).join('')}</ul>`;

/* ---------- 總覽：模組指引 ---------- */
route('home', {
  title: '總覽', icon: 'grid', roles: ALL,
  render(el) {
    const u = me();
    const mine = MODULES.filter(m => sectionsFor(m).length), others = MODULES.filter(m => !mine.includes(m));
    el.innerHTML = `
      ${bannerHtml()}
      <p class="lead-line">${esc(u.name)}，你目前的身分是「${ROLE_NAMES[u.role]}」。下面列出這個身分能使用的模組與頁面，其他身分請從右上角切換。</p>
      ${todoHtml()}
      <div class="directory">${mine.map(m => `<section class="dir-row" style="--c:${m.color};--t:${m.tint}">
        <a class="dir-plate" href="#/${moduleHref(m)}"><i class="bi bi-${m.icon}" aria-hidden="true"></i><h2>${m.name}</h2><p>${m.desc}</p></a>
        <div class="dir-body">${sectionsFor(m).map(s => `<div><h3>${s.name}</h3><ul>${s.pages.map(([p]) => `<li><a href="#/${p}">${ROUTES[p].title}</a> ${countBadge(p)}</li>`).join('')}</ul></div>`).join('')}</div>
      </section>`).join('')}</div>
      ${others.length ? `<p class="small text-muted mt-2">這個身分沒有使用權限的模組：${others.map(m => m.name).join('、')}。</p>` : ''}
      <h2 class="block-title">展示情境</h2>
      <p class="small text-muted">按下按鈕會切換成指定身分、開啟對應頁面，並顯示逐步引導。</p>
      ${MODULES.filter(m => DEMOS.some(d => d.mod === m.id)).map(m => `<h3 class="demo-head" style="--c:${m.color}">${m.name}</h3>${demoList(DEMOS.filter(d => d.mod === m.id))}`).join('')}
      <div class="proto-note"><strong>這是需求確認用的雛型。</strong>依《健康系統需求規格書（草案 v0.6）》製作。人名、數值、商品、許可字號與知識文件全部虛構；量測、檢索、金流、電商同步皆為模擬，未啟用攝影機，也不對外連線。畫面上的「伺服器端檢查」以瀏覽器程式模擬，不代表實際安全性。操作結果存在這台電腦的瀏覽器，按「重置資料」可還原。</div>
      <details class="mt-3"><summary>本次雛型未包含的需求</summary><ul class="mt-2 mb-0">
        <li>FR-55 視訊診療整合：規格另案評估法規，台灣法規問題暫保留不開發。</li>
        <li>FR-54 遠距照護、FR-63 對外 API、FR-75 研究資料集（階段 4C）、FR-35 綜合分數：僅在指標主檔保留項目。</li>
        <li>FR-24 個人化門檻（C）。</li>
        <li>FR-60、61、125～132 等部署、網路與整合需求無法用靜態畫面驗證，僅在「地端部署與待決事項」列出。</li></ul></details>`;
  }
});

/* ---------- 各模組首頁 ---------- */
const pageList = pages => `<ul class="page-list">${pages.map(([p, desc]) => `<li><a href="#/${p}"><i class="bi bi-${ROUTES[p].icon}" aria-hidden="true"></i><span class="page-name">${ROUTES[p].title}</span><span class="page-desc">${desc}</span>${countBadge(p)}<i class="bi bi-chevron-right" aria-hidden="true"></i></a></li>`).join('')}</ul>`;
const pageCards = pages => `<ul class="page-cards">${pages.map(([p, desc]) => `<li><a href="#/${p}"><span class="page-icon"><i class="bi bi-${ROUTES[p].icon}" aria-hidden="true"></i></span><span class="page-name">${ROUTES[p].title}</span><span class="page-desc">${desc}</span>${countBadge(p)}</a></li>`).join('')}</ul>`;
for (const m of MODULES) {
  const paths = m.sections.flatMap(s => Object.keys(s.pages));
  route('m-' + m.id, {
    title: m.name, icon: m.icon, fr: m.spec,
    roles: ALL.filter(role => paths.some(p => ROUTES[p].roles.includes(role))),
    render(el) {
      const demos = DEMOS.filter(d => d.mod === m.id);
      el.innerHTML = `<p class="lead-line">${m.desc}。</p>
        ${sectionsFor(m).map(s => `<h2 class="block-title">${s.name}</h2>${(s.cards ? pageCards : pageList)(s.pages)}`).join('')}
        ${demos.length ? `<h2 class="block-title">展示情境</h2>${demoList(demos)}` : ''}`;
    }
  });
}
