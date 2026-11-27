/* 商品主檔與審核、推薦與安全抑制、諮詢與不良反應、購物、外部電商、銷售分析 */
'use strict';

const BANNED_COMMON = ['治療', '治癒', '降血壓', '保證有效', '根治', '藥效', '預防疾病'];
const BANNED_GENERAL = ['調節血壓', '抗疲勞', '延緩疲勞', '調節血脂', '調節血糖', '健康食品', '保健功效'];
const CONTRA_FLAGS = ['孕期或哺乳', '腎臟疾病', '肝臟疾病', '使用抗凝血劑', '多重用藥', '食物過敏', '近期手術', '使用降壓藥或利尿劑', '使用降血脂藥', '限鈉或糖尿病'];
const COMMON_EXCLUDE = ['孕期或哺乳', '腎臟疾病', '肝臟疾病', '使用抗凝血劑', '多重用藥', '食物過敏', '近期手術'];

/** 文案檢核只是輔助，不取代人工審核（FR-81）。 */
function copyCheck(c) {
  const text = `${c.name} ${c.copy}`;
  const hits = BANNED_COMMON.filter(w => text.includes(w));
  if (c.type !== '健康食品') hits.push(...BANNED_GENERAL.filter(w => text.includes(w)));
  return hits;
}
function productProblems(c) {
  const p = [];
  if (!c.name.trim()) p.push('缺名稱');
  if (!c.ingredients.trim()) p.push('缺成分與含量');
  if (!c.expiry || c.expiry < DB.today) p.push('效期缺漏或已過期');
  if (c.type === '健康食品') {
    if (!c.license.trim()) p.push('健康食品缺許可字號');
    if (!c.licenseExpiry || c.licenseExpiry < DB.today) p.push('健康食品許可效期缺漏或已失效');
    if (!c.claim.trim()) p.push('健康食品缺核可功效原文');
  } else if (c.claim || c.license) p.push('非健康食品不得填寫許可字號或功效');
  const hits = copyCheck(c);
  if (hits.length) p.push(`文案含禁用詞：${hits.join('、')}`);
  return p;
}
/** 前台、API、電商同步只能取得已核准版本（FR-91、93）。 */
const liveProduct = p => !p.offline && p.published ? p.published : null;
const productById = id => DB.products.find(p => p.id === id);
function syncChannel(p, action) {
  if (p.published?.channel !== '外部電商') return;
  const fail = DB.syncFail;
  DB.syncLog.unshift({ time: nowStr(), product: p.id, action, result: fail ? '失敗' : '成功' });
  if (!fail) { if (action === '同步下架') delete DB.platformCopy[p.id]; else DB.platformCopy[p.id] = p.published.copy; }
  else DB.notifications.unshift({ time: nowStr(), to: 'u_merch', text: `商品 ${p.id} ${action}失敗，已排入重試，請依人工下架程序處理。`, alert: '' });
}
function takeDown(p, why) {
  p.offline = true; p.offlineReason = why;
  p.reviews.push({ time: nowStr(), by: why.startsWith('系統') ? '系統' : me().name, stage: '緊急下架', result: '下架', comment: why });
  syncChannel(p, '同步下架');
}
function expireProducts() {
  DB.products.filter(p => !p.offline && p.published?.type === '健康食品' && p.published.licenseExpiry < DB.today)
    .forEach(p => takeDown(p, '系統：健康食品許可已失效，自動下架（FR-95）'));
}

/** 上架中商品的複審提醒：距複審日幾天（負數為逾期）。只提醒，不自動下架。 */
const reviewDaysLeft = p => dayDiff(p.nextReview, DB.today);
const reviewDue = p => !!liveProduct(p) && p.nextReview !== '—' && reviewDaysLeft(p) <= DB.settings.reviewRemindDays;
function reviewDueBadge(p) {
  if (!reviewDue(p)) return '';
  const n = reviewDaysLeft(p);
  return ' ' + (n < 0 ? badge(`逾期 ${-n} 天`, 'danger') : badge(n ? `${n} 天內到期` : '今天到期', 'warning'));
}
function reviewDueNotice() {
  const due = DB.products.filter(reviewDue).sort((a, b) => a.nextReview.localeCompare(b.nextReview));
  return due.length ? `<div class="alert alert-warning py-2 small"><i class="bi bi-calendar-event me-1" aria-hidden="true"></i><strong>複審提醒（FR-95）：</strong>${due.length} 件上架商品已逾期，或 ${DB.settings.reviewRemindDays} 天內到期：${due.map(p => `${p.id}（${p.nextReview}${reviewDaysLeft(p) < 0 ? '，已逾期' : ''}）`).join('、')}</div>` : '';
}

/* ---------- 審核流程（FR-91～95），商品與推薦規則共用 ---------- */
function submitForReview(item) {
  item.status = '待專業審核';
  item.submitter = me().id;
  item.snapshot = clone(item.draft || { name: item.name, metric: item.metric, productIds: item.productIds });
}
function reviewBlock(item) {
  const u = me();
  if (!['待專業審核', '待法遵審核'].includes(item.status)) return '目前不在審核中';
  const needed = item.status === '待專業審核' ? 'pro' : 'legal';
  if (u.id === item.creator || u.id === item.submitter) return '建立者／送審者不得審核自己的內容（FR-92）';
  if (u.role !== needed) return `本關需由${ROLE_NAMES[needed]}審核（系統管理者也不能略過）`;
  if (u.qualUntil && u.qualUntil < DB.today) return `審核資格已於 ${u.qualUntil} 到期（FR-94）`;
  if (needed === 'legal' && item.reviews.some(r => r.round === item.round && r.byId === u.id)) return '兩關不得同一人';
  return '';
}
function doReview(item, pass, comment) {
  const block = reviewBlock(item);
  if (block) { deny(block); return false; }
  if (!pass && !comment) { deny('退回必須填寫原因'); return false; }
  const u = me(), stage = item.status === '待專業審核' ? '專業審核' : '法遵審核';
  item.reviews.push({ time: nowStr(), by: u.name, byId: u.id, qual: u.title ? `${u.title}（效期至 ${u.qualUntil}）` : ROLE_NAMES[u.role], stage, result: pass ? '通過' : '退回', comment, round: item.round, snapshot: clone(item.snapshot || {}) });
  item.status = !pass ? '已退回' : stage === '專業審核' ? '待法遵審核' : '已核准';
  return true;
}
const flow = status => {
  const steps = ['草稿', '待專業審核', '待法遵審核', '已核准', '已發布'];
  return `<div class="flow">${steps.map(s => `<span class="${s === status ? 'on' : ''}">${s}</span>`).join('→')}${status === '已退回' ? ' ' + sBadge('已退回') : ''}</div>`;
};
const reviewHistory = list => table(['時間', '審核人', '資格', '關卡', '結果', '意見'], list.map(r => [r.time, esc(r.by), esc(r.qual || '—'), r.stage, esc(r.result), esc(r.comment || '—')]), '尚無審核紀錄');

route('products', {
  title: '商品主檔與審核', icon: 'box-seam', roles: ['merch', 'pro', 'legal', 'sysadmin'], stage: '3', fr: 'FR-80、81、89、91～95',
  render(el) {
    expireProducts();
    el.innerHTML = `<div class="alert alert-info py-2 small">流程：草稿 → 送審 → 專業審核 → 法遵審核 → 核准 → 發布。修改已發布商品只改草稿版本，前台仍顯示上一個核准版本。可切換身分走完流程（建議用「示範鎂鉀膳食纖維包」）。法規用語需法務確認。</div>
      ${reviewDueNotice()}
      ${card('商品清單', table(['編號', '名稱', '類別', '管道', '版本', '審核狀態', '前台', '下次複審', ''], DB.products.map(p => [
        p.id, esc(p.draft.name), p.draft.type, p.draft.channel, 'v' + p.version, sBadge(p.status),
        liveProduct(p) ? badge('上架中', 'success') : p.offline ? badge('已下架', 'dark') : badge('未上架', 'secondary'), p.nextReview + reviewDueBadge(p),
        `<button class="btn btn-sm btn-primary" data-act="openProduct" data-id="${p.id}">開啟</button>`])),
        me().role === 'merch' ? '<button class="btn btn-sm btn-success" data-act="newProduct">新增商品</button>' : '')}`;
  }
});

function productModal(id) {
  const p = productById(id), c = p.draft, u = me();
  const editable = u.role === 'merch' && !['待專業審核', '待法遵審核'].includes(p.status);
  const dis = editable ? '' : 'disabled';
  const input = (k, label, col = 6, type = 'text') => `<div class="col-md-${col}"><label class="form-label">${label}</label><input class="form-control" type="${type}" name="${k}" value="${esc(c[k])}" maxlength="300" ${dis}></div>`;
  const select = (k, label, list) => `<div class="col-md-4"><label class="form-label">${label}</label><select class="form-select" name="${k}" ${dis}>${opts(list, c[k])}</select></div>`;
  const problems = productProblems(c);
  const body = `${flow(p.status)}
    ${problems.length ? `<div class="alert alert-warning small mt-2 mb-2"><strong>檢核提醒（輔助，不取代人工審核）：</strong><ul class="mb-0">${problems.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '<div class="alert alert-success small mt-2 mb-2 py-1">自動檢核未發現問題（仍須人工審核）</div>'}
    <form id="prodForm" data-submit="saveProduct" data-id="${p.id}"><div class="row g-2">
      ${input('name', '名稱')}${select('type', '類別', ['健康食品', '一般食品', '其他'])}${input('price', '售價', 2, 'number')}
      ${select('topic', '關注主題', ['血壓', '乳酸', '一般營養'])}${select('channel', '銷售管道', ['自建', '外部電商'])}${input('expiry', '效期', 4, 'date')}
      ${input('ingredients', '成分與含量')}${input('allergens', '過敏原')}
      ${c.type === '健康食品' ? input('license', '許可字號（健康食品必填）') + input('licenseExpiry', '許可效期', 6, 'date') + input('claim', '核可功效原文', 12) : ''}
      ${input('copy', '商品文案', 12)}
      <div class="col-12"><label class="form-label">禁忌</label><div>${CONTRA_FLAGS.map(f => `<label class="form-check form-check-inline small"><input class="form-check-input" type="checkbox" name="contra" value="${f}" ${c.contra.includes(f) ? 'checked' : ''} ${dis}><span class="form-check-label">${f}</span></label>`).join('')}</div></div>
    </div></form>
    ${p.published ? `<div class="cite small mt-3"><strong>前台目前版本${p.offline ? '（已下架：' + esc(p.offlineReason) + '）' : ''}：</strong>${esc(p.published.name)}｜${esc(p.published.copy)}</div>` : ''}
    <h6 class="mt-3">審核紀錄</h6>${reviewHistory(p.reviews)}
    ${['待專業審核', '待法遵審核'].includes(p.status) ? `<label class="form-label mt-2">審核意見（退回必填）</label><input class="form-control" id="reviewComment" maxlength="200">${reviewBlock(p) ? `<div class="small text-danger mt-1">目前身分無法審核：${reviewBlock(p)}（仍可按按鈕驗證系統拒絕）</div>` : ''}` : ''}`;
  const btn = (act, text, color) => `<button class="btn btn-${color}" data-act="${act}" data-id="${p.id}">${text}</button>`;
  let foot = '<button class="btn btn-secondary" data-bs-dismiss="modal">關閉</button>';
  if (editable) foot += `<button class="btn btn-outline-primary" form="prodForm">儲存草稿</button>`;
  if (editable && ['草稿', '已退回'].includes(p.status)) foot += btn('submitProduct', '送審', 'primary');
  if (['待專業審核', '待法遵審核'].includes(p.status)) foot += btn('rejectProduct', '退回', 'outline-danger') + btn('approveProduct', '審核通過', 'success');
  if (p.status === '已核准') foot += btn('publishProduct', '發布', 'success');
  if (liveProduct(p) && ['merch', 'pro', 'legal'].includes(u.role)) foot += btn('takedownProduct', '緊急下架（免審）', 'danger');
  if (p.offline && u.role === 'merch' && p.status === '已發布') foot += btn('relistProduct', '申請重新上架（需審核）', 'warning');
  modal(`${p.id} ${c.name}`, body, foot);
}
function reopen(id) { save(); App.render(); productModal(id); }

Object.assign(ACTIONS, {
  openProduct: el => productModal(el.dataset.id),
  newProduct: () => {
    const id = 'P' + String(DB.products.length + 1).padStart(3, '0');
    DB.products.push({ id, draft: { name: '新商品', type: '一般食品', topic: '一般營養', ingredients: '', allergens: '無', contra: [], expiry: '', channel: '自建', license: '', licenseExpiry: '', claim: '', copy: '', price: 0 }, status: '草稿', published: null, version: 1, creator: me().id, reviews: [], offline: false, nextReview: '—', lots: [] });
    reopen(id);
  },
  saveProduct: el => {
    if (me().role !== 'merch') return deny('僅商品人員可編輯');
    const p = productById(el.dataset.id), f = new FormData(el), next = clone(p.draft);
    ['name', 'type', 'topic', 'channel', 'expiry', 'ingredients', 'allergens', 'copy', 'license', 'licenseExpiry', 'claim'].forEach(k => { if (f.has(k)) next[k] = f.get(k).trim(); });
    next.price = Math.max(0, +f.get('price') || 0);
    next.contra = f.getAll('contra');
    if (next.type !== '健康食品') { next.license = ''; next.licenseExpiry = ''; next.claim = ''; }
    if (JSON.stringify(next) !== JSON.stringify(p.draft)) {
      if (['已發布', '已核准'].includes(p.status)) p.version++;
      p.draft = next; p.status = '草稿';
      toast('已儲存草稿；內容有修改須重新送審', 'success');
    }
    reopen(p.id);
  },
  submitProduct: el => {
    const p = productById(el.dataset.id), problems = productProblems(p.draft);
    if (me().role !== 'merch') return deny('僅商品人員可送審');
    if (problems.length) return deny('請先儲存並修正檢核問題：' + problems.join('；'));
    p.round = (p.round || 0) + 1; submitForReview(p); reopen(p.id);
  },
  approveProduct: el => { const p = productById(el.dataset.id); if (doReview(p, true, $('#reviewComment').value.trim())) reopen(p.id); },
  rejectProduct: el => { const p = productById(el.dataset.id); if (doReview(p, false, $('#reviewComment').value.trim())) reopen(p.id); },
  publishProduct: el => {
    const p = productById(el.dataset.id);
    if (!['merch', 'legal'].includes(me().role)) return deny('需具 EIIS「發布」權限（雛型：商品或法遵）');
    if (p.status !== '已核准') return deny('未核准不得發布');
    const problems = productProblems(p.snapshot);
    if (problems.length) return deny(problems.join('；'));
    p.published = clone(p.snapshot); p.status = '已發布'; p.offline = false; p.nextReview = '2027-05-31';
    syncChannel(p, '同步上架'); reopen(p.id);
  },
  takedownProduct: el => { takeDown(productById(el.dataset.id), `緊急下架（${me().name}）`); reopen(el.dataset.id); toast('已下架，不需審核'); },
  relistProduct: el => { const p = productById(el.dataset.id), problems = productProblems(p.draft); if (problems.length) return deny(problems.join('；')); p.round = (p.round || 0) + 1; submitForReview(p); reopen(p.id); }
});

/* ---------- 推薦規則（FR-84） ---------- */
route('rules', {
  title: '推薦規則', icon: 'diagram-3', roles: ['merch', 'pro', 'legal'], stage: '3', fr: 'FR-84、91',
  render(el) {
    el.innerHTML = `<div class="alert alert-warning py-2 small">系統固定限制，無法以規則覆寫：<strong>不依心率推薦</strong>、<strong>一律不依血氧推薦或銷售</strong>、不依單次量測、乳酸僅限運動情境、血壓達警示不推薦任何商品。</div>
      ${DB.rules.map(r => card(`${r.id} ${esc(r.name)}（v${r.version}）`, `${flow(r.status)}<p class="mt-2">依據指標：${esc(metricBy(r.metric).name)}｜本人需選擇關注主題：${r.topic}｜商品：${r.productIds.map(i => esc(productById(i).draft.name)).join('、')}</p>${reviewHistory(r.reviews)}`,
        `${['已發布', '草稿', '已退回'].includes(r.status) && me().role === 'merch' ? `<button class="btn btn-sm btn-outline-primary" data-act="ruleSubmit" data-id="${r.id}">修訂並送審</button>` : ''} ${['待專業審核', '待法遵審核'].includes(r.status) ? `<button class="btn btn-sm btn-success" data-act="ruleReview" data-id="${r.id}" data-pass="1">審核通過</button> <button class="btn btn-sm btn-outline-danger" data-act="ruleReview" data-id="${r.id}">退回</button>` : ''} ${r.status === '已核准' ? `<button class="btn btn-sm btn-success" data-act="rulePublish" data-id="${r.id}">發布</button>` : ''}`)).join('')}
      <p class="small text-muted">修訂期間沿用上一個核准版本。交互作用清單由藥師維護（需另行審核）。</p>`;
  }
});
const ruleById = id => DB.rules.find(r => r.id === id);
Object.assign(ACTIONS, {
  ruleSubmit: el => { const r = ruleById(el.dataset.id); if (r.status === '已發布') { r.live = r.version; r.version++; } r.round = (r.round || 0) + 1; submitForReview(r); App.refresh(); },
  ruleReview: el => { const r = ruleById(el.dataset.id), pass = !!el.dataset.pass; if (doReview(r, pass, pass ? '' : '請修訂後重送（示範原因）')) App.refresh(); },
  rulePublish: el => { const r = ruleById(el.dataset.id); if (!['merch', 'legal'].includes(me().role) || r.status !== '已核准') return deny('需具「發布」權限且規則已核准'); r.status = '已發布'; delete r.live; App.refresh(); }
});

/* ---------- 推薦引擎與安全抑制（FR-82～85） ---------- */
function recommend(sid) {
  const s = subjectById(sid), consent = DB.recConsent[sid], q = DB.screening[sid];
  const gates = [];
  const gate = (label, ok, why) => gates.push({ label, ok, why });
  gate('已同意個人化推薦（獨立同意）', !!consent?.on, '未同意');
  gate('禁忌問卷已填且在 180 天內', !!q && dayDiff(DB.today, q.date) <= 180, q ? '問卷已過期' : '尚未填寫');
  gate('年滿 18 歲', s.age >= 18, '未成年');
  gate('量測同意由本人簽署', !activeConsent(sid)?.proxy, '同意由家屬代簽，不開放個人化推薦');
  gate('沒有未結案的警示', !openAlert(sid), '有未處理警示');
  gate('沒有填報不適症狀', !s.symptoms, '有不適症狀');
  const latestO2 = recordsOf(sid).filter(r => valueOf(r, 'SPO2')).slice(-5);
  gate('近期血氧沒有異常', !latestO2.some(r => ['注意', '警示'].includes(valueOf(r, 'SPO2').judge)), '近 5 次血氧有異常');
  const excluded = (q?.flags || []).filter(f => COMMON_EXCLUDE.includes(f));
  gate('不屬於共通排除族群', !excluded.length, `符合：${excluded.join('、')}（改提供諮詢）`);
  const items = [], skipped = [];
  if (gates.every(g => g.ok)) {
    for (const r of DB.rules) {
      const m = metricBy(r.metric);
      const skip = why => skipped.push(`${r.topic}：${why}`);
      if (r.status !== '已發布' && !r.live) { skip('規則尚未核准發布'); continue; }
      if (!consent.topics.includes(r.topic)) { skip('本人未選擇此關注主題'); continue; }
      if (!m.enabled || m.level !== '已驗證') { skip(`指標「${m.name}」尚未完成驗證（目前：${m.enabled ? m.level : '停用'}）`); continue; }
      let recs = recordsOf(sid).filter(x => dayDiff(DB.today, x.time) < 30 && valueOf(x, r.metric) && x.quality >= DB.settings.minQuality);
      // 職場量測資料不用於行銷（僱主導入）
      if (s.program === 'worksite') recs = recs.filter(x => !['上工前', '休息後'].includes(x.context) && !x.site.includes('工地'));
      if (r.metric === 'LAC') recs = recs.filter(x => x.context.startsWith('運動'));
      if (!enoughForTrend(recs)) { skip(s.program === 'worksite' ? '可用資料不足（職場量測資料不得用於行銷，已排除）' : '長期趨勢資料不足（不依單次量測）'); continue; }
      if (r.metric === 'SBP' && recs.some(x => valueOf(x, 'SBP').judge === '警示' || valueOf(x, 'DBP')?.judge === '警示')) { skip('血壓曾達警示，不推薦任何商品；請以血壓計複測並就醫諮詢'); continue; }
      const list = r.productIds.map(productById).filter(p => liveProduct(p) && !p.published.contra.some(c => q.flags.includes(c)));
      if (!list.length) { skip('沒有可推薦的上架商品（已排除下架與禁忌）'); continue; }
      list.forEach(p => items.push({ p, r, why: `您選擇了「${r.topic}」關注主題，且近 30 天有 ${recs.length} 次可用量測紀錄。依據規則 ${r.id} v${r.live || r.version}。這不代表商品能改變任何量測值。` }));
    }
  }
  return { gates, items, skipped };
}

const productCard = (p, extra = '') => {
  const c = liveProduct(p);
  return `<div class="col-md-6 col-xl-4"><div class="card h-100"><div class="card-body d-flex flex-column"><div class="d-flex justify-content-between mt-1">${c.type === '健康食品' ? badge('健康食品', 'success') : badge(c.type, 'secondary')}<small class="text-muted">${c.channel}</small></div>
    <h5 class="card-title mb-0">${esc(c.name)}</h5>${c.type === '健康食品' ? `<div class="small">許可字號：${esc(c.license)}<br>核可功效：${esc(c.claim)}</div>` : ''}
    <div class="small my-2">${esc(c.copy)}<br>成分：${esc(c.ingredients)}<br>過敏原：${esc(c.allergens)}<br>禁忌／注意：${esc(c.contra.join('、') || '—')}</div>${extra}
    <div class="mt-auto d-flex justify-content-between align-items-center"><strong>NT$ ${c.price}</strong>${c.channel === '自建' ? `<button class="btn btn-sm btn-primary" data-act="addCart" data-id="${p.id}">加入購物車</button>` : `<button class="btn btn-sm btn-outline-primary" data-act="outLink" data-id="${p.id}">前往外部電商</button>`}</div></div></div></div>`;
};

route('recommend', {
  title: '我的衛教與商品推薦', icon: 'hand-thumbs-up', roles: ['subject'], stage: '3', fr: 'FR-82～86、90',
  render(el) {
    const sid = me().subject, consent = DB.recConsent[sid] || { on: false, topics: [] }, q = DB.screening[sid];
    const { gates, items, skipped } = recommend(sid);
    const log = { sid, ids: items.map(i => i.p.id).join(','), why: [...gates.filter(g => !g.ok).map(g => g.why), ...skipped].join('；') };
    const last = DB.recLog[0];
    if (!last || last.ids !== log.ids || last.why !== log.why || last.sid !== sid) { DB.recLog.unshift({ time: nowStr(), ...log }); save(); }
    el.innerHTML = `<div class="row"><div class="col-lg-6">${card('① 個人化推薦同意（選填）', `<p class="small">不同意不影響量測與任何健康功能。撤回後刪除推薦標記。</p>
        <form data-submit="saveRecConsent"><div class="mb-2">關注主題（由本人選擇）：${['血壓', '乳酸'].map(t => `<label class="form-check form-check-inline"><input class="form-check-input" type="checkbox" name="topic" value="${t}" ${consent.topics.includes(t) ? 'checked' : ''}><span class="form-check-label">${t === '乳酸' ? '運動恢復（乳酸）' : t}</span></label>`).join('')}</div>
        <button class="btn btn-primary btn-sm">${consent.on ? '更新主題' : '我同意個人化推薦'}</button> ${consent.on ? '<button type="button" class="btn btn-outline-danger btn-sm" data-act="revokeRec">撤回同意</button>' : ''}</form>`)}
      ${card('② 禁忌問卷', `<form data-submit="saveScreening">${CONTRA_FLAGS.map(f => `<label class="form-check form-check-inline small"><input class="form-check-input" type="checkbox" name="flag" value="${f}" ${q?.flags.includes(f) ? 'checked' : ''}><span class="form-check-label">${f}</span></label>`).join('')}<div class="mt-2"><button class="btn btn-primary btn-sm">送出問卷（沒有就直接送出）</button> <small class="text-muted">${q ? '上次填寫 ' + q.date : '尚未填寫'}</small></div></form>`)}</div>
      <div class="col-lg-6">${card('安全檢查明細（雛型展示用）', `<ul class="list-unstyled mb-0">${gates.map(g => `<li><i class="bi bi-${g.ok ? 'check-circle text-success' : 'slash-circle text-danger'} me-1" aria-hidden="true"></i><span class="visually-hidden">${g.ok ? '通過：' : '未通過：'}</span>${g.label}${g.ok ? '' : ` <span class="text-danger small">— ${esc(g.why)}</span>`}</li>`).join('')}</ul>${skipped.length ? `<hr><div class="small text-muted">${skipped.map(esc).join('<br>')}</div>` : ''}`)}</div></div>
      <h5 class="mt-2">衛教內容</h5>${card('', DB.kbDocs.filter(d => d.cat === '衛教' && isLive(d)).map(d => `<details class="mb-2"><summary>${esc(d.title)}（v${d.version}，已審核）</summary>${d.chunks.map(c => `<div class="cite mt-2"><strong>${esc(c.sec)}</strong>\n${esc(c.text)}</div>`).join('')}</details>`).join(''))}
      <h5>為您呈現的商品</h5>${items.length ? `<div class="row">${items.map(i => productCard(i.p, `<details class="small mb-2"><summary>為什麼看到這個？</summary>${esc(i.why)}</details>`)).join('')}</div>` : card('', '<span class="text-muted">目前不提供個人化推薦。您仍可使用所有量測與健康功能。</span>')}
      ${card('營養師／藥師諮詢（FR-86）', `${EMERGENCY}<form data-submit="askConsult" class="row g-2"><div class="col-md-10"><input class="form-control" name="q" maxlength="200" placeholder="想詢問的問題" required></div><div class="col-md-2"><button class="btn btn-outline-primary w-100">送出</button></div>
        <div class="col-12"><label class="form-check small"><input class="form-check-input" type="checkbox" name="share" ${shareableRecord(sid) ? '' : 'disabled'}><span class="form-check-label">附上最近一次量測給藥師（只用於這次諮詢，可隨時撤回）${shareableRecord(sid) ? '' : '：沒有可分享的量測（職場量測不分享）'}</span></label></div></form>
        <p class="small text-muted mt-2">收到回覆後可以追問；沒有其他問題時請結案。結案後不能再追問，附上的量測也停止分享。身體不適請直接就醫，不要等回覆。</p>
        ${ownConsults(sid)}`)}`;
  }
});
Object.assign(ACTIONS, {
  saveRecConsent: el => {
    const topics = new FormData(el).getAll('topic');
    if (!topics.length) return deny('請至少選擇一個關注主題');
    DB.recConsent[me().subject] = { on: true, topics, time: nowStr() }; App.refresh(); toast('已記錄推薦同意', 'success');
  },
  revokeRec: () => { const sid = me().subject; DB.recConsent[sid] = { on: false, topics: [], revoked: nowStr() }; DB.recLog = DB.recLog.filter(l => l.sid !== sid); App.refresh(); toast('已撤回並刪除推薦標記'); },
  saveScreening: el => { DB.screening[me().subject] = { date: DB.today, flags: new FormData(el).getAll('flag') }; App.refresh(); toast('問卷已儲存', 'success'); },
  askConsult: el => {
    const f = new FormData(el), q = f.get('q').trim(), sid = me().subject;
    if (!q) return;
    const draft = { kind: '提問', user: me().id, subject: sid, text: q, wantShare: !!f.get('share') };
    if (redFlagsIn(q).length) return holdForRedFlag(draft);
    commitConsult(draft, []);
  },
  revokeShare: el => { const c = DB.consults.find(x => x.id === el.dataset.id); if (c.subject !== me().subject) return deny('只能撤回自己的分享'); c.shareRevoked = nowStr(); App.refresh(); toast('已撤回分享'); }
});

/* 紅旗分流：提問或追問含紅旗詞時先不送出，顯示緊急提示。
   諮詢可能只是提到病史（例如家人中風過），所以本人確認目前沒有緊急狀況後仍可送出，並在案件上標記。
   稽核只記時間、對象、步驟與是否送出，不記內容與命中的詞。 */
let heldConsult = null;
function holdForRedFlag(draft) {
  const log = { time: nowStr(), subject: draft.subject, stage: `諮詢${draft.kind}`, sent: false };
  DB.redFlagLog.unshift(log); save();
  heldConsult = { draft, log };
  modal('請先確認是否需要緊急協助', `<div class="alert alert-danger"><h5><i class="bi bi-telephone-fill me-1" aria-hidden="true"></i>請立即尋求協助</h5>您描述的狀況可能需要緊急處理。如果<strong>現在</strong>有這些情形，請<strong>立即撥打 119</strong>，或請身邊的人協助就醫。</div>
    <p class="mb-0"><strong>內容尚未送出。</strong>諮詢不是緊急聯絡管道，營養師／藥師不會即時看到，也沒有回覆時限。如果只是詢問過去的狀況或一般問題，確認目前沒有緊急情形後可以送出。</p>`,
    '<button class="btn btn-secondary" data-bs-dismiss="modal">先不送出</button><button class="btn btn-outline-danger" data-act="sendFlagged">目前沒有緊急狀況，仍要送出</button>');
}
function commitConsult(draft, flags) {
  const share = draft.wantShare ? shareableRecord(draft.subject)?.id || '' : '';
  DB.consults.unshift({ id: uid('Q'), time: nowStr(), subject: draft.subject, q: draft.text, flags, status: '待回覆', thread: [], closed: null, share, shareRevoked: '' });
  App.refresh(); toast(share ? '已轉介營養師／藥師，並附上最近一次量測' : '已轉介營養師／藥師', 'success');
}
function commitFollowUp(draft, flags) {
  const c = consultById(draft.id);
  c.thread.push({ from: 'subject', time: nowStr(), text: draft.text, flags });
  c.status = '待回覆'; App.refresh(); toast('已送出追問', 'success');
}
const consultFlagged = c => !!(c.flags?.length || c.thread.some(m => m.flags?.length));
const consultUrgent = c => c.status === '待回覆' && consultFlagged(c);
/** 藥師端排序：含緊急關鍵字且待回覆的排最前面，其餘維持原順序。 */
const proOrder = list => [...list].sort((a, b) => consultUrgent(b) - consultUrgent(a));
const FLAG_NOTE = '「含緊急關鍵字」是本人看過 119 提示、表示目前沒有緊急狀況後仍送出的內容，請優先確認。只靠關鍵字比對，沒有標記不代表不緊急。';

/* 諮詢流程：待回覆 → 已回覆 → 已結案；本人追問後回到「待回覆」。
   本人隨時可結案；藥師／營養師只能在已回覆後結案，且須填寫原因。 */
const consultById = id => DB.consults.find(c => c.id === id);
const qualifiedPro = (u = me()) => u.role === 'pro' && u.qualUntil >= DB.today;
function consultThread(c) {
  const line = (who, time, text, flags) => `<li><strong>${esc(who)}</strong>：${esc(text)}${flags?.length ? ' ' + badge('含緊急關鍵字', 'danger') : ''}<small class="text-muted d-block">${time}</small></li>`;
  const items = [line('提問', c.time, c.q, c.flags), ...c.thread.map(m => line(m.from === 'pro' ? m.name : '追問', m.time, m.text, m.flags))];
  const end = c.closed ? `<li class="text-muted">${esc(c.closed.by)}結案${c.closed.reason ? `：${esc(c.closed.reason)}` : ''}<small class="d-block">${c.closed.time}</small></li>` : '';
  return `<ul class="list-unstyled mb-0 consult-thread">${items.join('')}${end}</ul>`;
}
function ownShare(c) {
  if (!c.share) return '未分享';
  if (c.shareRevoked) return '已撤回';
  if (c.status === '已結案') return '已結案，停止分享';
  return `已分享 <button class="btn btn-sm btn-outline-danger" data-act="revokeShare" data-id="${c.id}">撤回分享</button>`;
}
/** 本人的諮詢逐筆列出，不用表格：手機上追問與結案按鈕才不會被捲到畫面外。 */
function ownConsults(sid) {
  const list = DB.consults.filter(c => c.subject === sid);
  if (!list.length) return '<p class="text-muted mb-0">尚無諮詢</p>';
  return `<ul class="list-unstyled mb-0">${list.map(c => `<li class="border-top py-3"><div class="mb-2">${sBadge(c.status)}</div>${consultThread(c)}<div class="small mt-2">分享給藥師：${ownShare(c)}</div>${ownActions(c)}</li>`).join('')}</ul>`;
}
function ownActions(c) {
  if (c.status === '已結案') return '';
  const follow = c.status === '已回覆' ? `<form data-submit="followUp" data-id="${c.id}" class="d-flex gap-1 mt-2"><input class="form-control form-control-sm" name="text" maxlength="200" required placeholder="追問內容" aria-label="追問內容"><button class="btn btn-sm btn-primary text-nowrap">追問</button></form>` : '';
  return `${follow}<button class="btn btn-sm btn-outline-secondary mt-2" data-act="closeOwnConsult" data-id="${c.id}">${c.status === '已回覆' ? '沒有其他問題，結案' : '不用回覆了，結案'}</button>`;
}
/** 藥師端依案件狀態顯示回覆或結案欄位；沒有有效資格時不給任何操作。 */
function proActions(c) {
  if (!qualifiedPro() || c.status === '已結案') return '';
  const form = (act, name, label, button, style) => `<form data-submit="${act}" data-id="${c.id}" class="d-flex gap-1 mt-2"><input class="form-control form-control-sm" name="${name}" maxlength="300" required placeholder="${label}" aria-label="${label}"><button class="btn btn-sm ${style} text-nowrap">${button}</button></form>`;
  return c.status === '待回覆' ? form('replyConsult', 'reply', '回覆內容', '回覆', 'btn-primary') : form('closeConsult', 'reason', '結案原因', '結案', 'btn-outline-secondary');
}
function finishConsult(c, by, reason) {
  c.status = '已結案';
  c.closed = { by, reason, time: nowStr() };
}

route('consult', {
  title: '諮詢回覆', icon: 'chat-square-text', roles: ['pro'], stage: '3', fr: 'FR-86',
  render(el) {
    el.innerHTML = `${qualifiedPro() ? '' : '<div class="alert alert-danger py-2 small">你的專業資格已到期：不能回覆，也不能結案。</div>'}
      ${DB.consults.some(consultFlagged) ? `<div class="alert alert-warning py-2 small">${FLAG_NOTE}</div>` : ''}
      ${card('諮詢案件', `<div class="case-table">${table(['時間', '諮詢者', '對話紀錄', '狀態與操作'], proOrder(DB.consults).map(c => [c.time, c.subject, consultThread(c), sBadge(c.status) + proActions(c)]), '尚無諮詢（以受測者身分在推薦頁送出）')}</div><p class="small text-muted mt-2 mb-0">本人在諮詢時勾選分享的量測，到「社區藥局」頁查看。回覆後若本人沒有追問，可填寫原因結案。回覆內容不得宣稱商品功效。</p>`)}`;
  }
});
Object.assign(ACTIONS, {
  replyConsult: el => {
    const c = consultById(el.dataset.id), reply = new FormData(el).get('reply').trim();
    if (me().role !== 'pro') return deny('僅營養師／藥師可回覆');
    if (!qualifiedPro()) return deny('專業資格已到期');
    if (c.status !== '待回覆') return deny('此諮詢目前不需回覆');
    if (!reply) return;
    c.thread.push({ from: 'pro', name: me().name, time: nowStr(), text: reply });
    c.status = '已回覆'; App.refresh(); toast('已回覆', 'success');
  },
  closeConsult: el => {
    const c = consultById(el.dataset.id), reason = new FormData(el).get('reason').trim();
    if (!qualifiedPro()) return deny('僅資格有效的營養師／藥師可結案');
    if (c.status !== '已回覆') return deny('回覆後才能由藥師／營養師結案');
    if (!reason) return deny('結案必須填寫原因');
    finishConsult(c, me().name, reason); App.refresh(); toast('已結案', 'success');
  },
  followUp: el => {
    const c = consultById(el.dataset.id), text = new FormData(el).get('text').trim();
    if (me().role !== 'subject' || c.subject !== me().subject) return deny('只能追問自己的諮詢');
    if (c.status !== '已回覆') return deny('收到回覆後才能追問；已結案請另送新的諮詢');
    if (!text) return;
    const draft = { kind: '追問', user: me().id, subject: c.subject, text, id: c.id };
    if (redFlagsIn(text).length) return holdForRedFlag(draft);
    commitFollowUp(draft, []);
  },
  sendFlagged: () => {
    const held = heldConsult;
    if (!held || held.draft.user !== me().id) return deny('沒有等待送出的內容');
    heldConsult = null;
    closeModal();
    if (held.draft.kind === '追問' && consultById(held.draft.id)?.status !== '已回覆') return deny('此諮詢目前不能追問');
    held.log.sent = true;
    (held.draft.kind === '追問' ? commitFollowUp : commitConsult)(held.draft, redFlagsIn(held.draft.text));
  },
  closeOwnConsult: el => {
    const c = consultById(el.dataset.id);
    if (me().role !== 'subject' || c.subject !== me().subject) return deny('只能結案自己的諮詢');
    if (c.status === '已結案') return deny('此諮詢已結案');
    finishConsult(c, '本人', ''); App.refresh(); toast('已結案', 'success');
  }
});

/* ---------- 社區藥局（應用場景延伸） ---------- */
/** 可分享給藥師的量測：本人最近一次非職場量測（職場量測不用於商品或通路情境）。 */
const shareableRecord = sid => recordsOf(sid).filter(r => !['上工前', '休息後'].includes(r.context) && !r.site.includes('工地')).at(-1);
/** 分享只用於該次諮詢：本人撤回或結案後就取不到。 */
const sharedRecord = c => c.share && !c.shareRevoked && c.status !== '已結案' ? DB.records.find(r => r.id === c.share) : null;
route('pharmacy', {
  title: '社區藥局', icon: 'capsule', roles: ['pro', 'hadmin'], stage: '延伸', fr: 'FR-85、86',
  render(el) {
    const isPro = me().role === 'pro', qualified = qualifiedPro();
    const shared = c => {
      if (!c.share) return '<span class="text-muted">未分享</span>';
      if (c.shareRevoked) return '<span class="text-muted">本人已撤回</span>';
      if (c.status === '已結案') return '<span class="text-muted">已結案，停止分享</span>';
      if (!isPro) return '<span class="text-muted">已分享（僅藥師可查看）</span>';
      if (!qualified) return '<span class="text-muted">資格到期，無法查看</span>';
      const r = sharedRecord(c);
      logAccess(c.subject, `藥局諮詢 ${c.id}`);
      return `<small class="text-muted">${r.time}｜${esc(r.context)}</small><br>${['SBP', 'DBP', 'HR'].map(code => valueOf(r, code) ? `${esc(metricBy(code).name)} ${valueOf(r, code).value} ${judgeMark(valueOf(r, code).judge)}` : '').filter(Boolean).join('<br>')}`;
    };
    el.innerHTML = `<div class="alert alert-info py-2 small">民眾在藥局量測站的流程與「現場機台模式」相同：刷會員卡、結束自動清畫面，結果畫面不放商品（FR-85）。藥師只看得到本人在諮詢時勾選分享的那一次量測，本人可隨時撤回。個人化推薦只在本人帳號、另外同意後顯示，門市不依量測結果當場推銷。</div>
      ${!isPro ? '<div class="alert alert-secondary py-2 small">健康管理員只能檢視量測站與諮詢狀態；分享的量測只給藥師看，回覆也由藥師處理。</div>' : qualified ? '' : '<div class="alert alert-danger py-2 small">你的專業資格已到期：不能查看分享的量測，也不能回覆。</div>'}
      ${DB.consults.some(consultFlagged) ? `<div class="alert alert-warning py-2 small">${FLAG_NOTE}</div>` : ''}
      ${card('諮詢與分享的量測', `<div class="case-table">${table(['時間', '諮詢者', '對話紀錄', '本人分享的量測', '狀態與操作'], proOrder(DB.consults).map(c => [c.time, c.subject, consultThread(c), shared(c), sBadge(c.status) + proActions(c)]), '尚無諮詢')}</div>`)}
      ${card('藥局量測站', table(['裝置', '場域', '狀態', '最後使用'], DB.devices.filter(d => d.site.includes('藥局')).map(d => [d.id, esc(d.site), d.active ? badge('啟用', 'success') : badge('停用', 'secondary'), d.lastUsed || '—'])))}
      <p class="small text-muted">查看分享的量測會寫入稽核紀錄。回覆內容不得宣稱商品功效。</p>`;
  }
});

/* ---------- 不良反應與客訴（FR-89） ---------- */
/* 案件流程：待受理 → 處理中 → 已結案。回報人只看狀態與結案結果，內部處理紀錄不顯示給回報人。 */
const CLOSE_RESULTS = ['已回覆說明', '換貨或退款', '建議停用並就醫', '下架商品', '查無與商品的關聯', '其他'];
const adverseById = id => DB.adverse.find(x => x.id === id);
const adverseLog = (a, text) => a.history.push({ time: nowStr(), by: me().name, text });
const adverseHandler = () => ROUTES.adverse.roles.includes(me().role) && me().role !== 'subject';
const closedText = a => `${esc(a.result.type)}：${esc(a.result.note)}<div class="small text-muted">${a.result.time}</div>`;
function adverseDetail(a) {
  const p = productById(a.product);
  const body = `<p><strong>${esc(p.draft.name)}</strong>｜${a.kind}｜${sBadge(a.status)}｜回報時間 ${a.time}</p><p>${esc(a.text)}</p>
    ${a.result ? `<div class="alert alert-secondary py-2">結案結果　${closedText(a)}</div>` : ''}
    <h6>處理歷程</h6><ul class="small">${a.history.map(h => `<li>${h.time}　${esc(h.by)}：${esc(h.text)}</li>`).join('')}</ul>
    ${a.status === '待受理' ? '<p class="small text-muted">受理後才能填寫處理紀錄與結案。</p>' : ''}
    ${a.status === '處理中' ? `<form id="adverseForm" data-submit="adverseAction" data-id="${a.id}">
      <label class="form-label" for="advNote">內部處理紀錄（回報人看不到）</label><input class="form-control" id="advNote" name="note" maxlength="300">
      <label class="form-check mt-3"><input class="form-check-input" type="checkbox" name="close"><span class="form-check-label">結案</span></label>
      <div class="row g-2 mt-0"><div class="col-sm-5"><label class="form-label" for="advType">結案結果（結案必填）</label><select class="form-select" id="advType" name="type">${opts([['', '請選擇'], ...CLOSE_RESULTS.map(r => [r, r])])}</select></div>
      <div class="col-sm-7"><label class="form-label" for="advReply">給回報人的說明（結案必填）</label><input class="form-control" id="advReply" name="reply" maxlength="300"></div></div></form>` : ''}`;
  const cancel = '<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>';
  const action = a.status === '待受理' ? `<button class="btn btn-primary" data-act="adverseAccept" data-id="${a.id}">受理</button>` : '<button class="btn btn-primary" form="adverseForm">儲存</button>';
  modal(`案件 ${a.id}`, body, a.status === '已結案' ? undefined : cancel + action);
}

route('adverse', {
  title: '不良反應與客訴', icon: 'exclamation-octagon', roles: ['subject', 'merch', 'pro', 'legal'], stage: '3', fr: 'FR-89',
  render(el) {
    const mine = me().role === 'subject';
    const list = DB.adverse.filter(a => !mine || a.by === me().id);
    const head = ['編號', '時間', '商品', '類型', '描述', '狀態', ...(mine ? ['處理結果'] : ['受理人', '結果／處置', '操作'])];
    const row = a => {
      const base = [a.id, a.time, esc(productById(a.product).draft.name), a.kind, esc(a.text), sBadge(a.status)];
      if (mine) return [...base, a.result ? closedText(a) : '尚未結案'];
      const recallBtn = a.status !== '已結案' && liveProduct(productById(a.product)) ? ` <button class="btn btn-sm btn-danger" data-act="recall" data-id="${a.id}">下架並通知已購者</button>` : '';
      const outcome = [a.result ? closedText(a) : '', a.action ? `<div class="small">${esc(a.action)}</div>` : ''].join('') || '—';
      return [...base, a.handler ? esc(userName(a.handler)) : '—', outcome + recallBtn, `<button class="btn btn-sm btn-primary text-nowrap" data-act="adverseOpen" data-id="${a.id}">${a.status === '已結案' ? '查看' : '處理'}</button>`];
    };
    el.innerHTML = `${mine ? EMERGENCY : '<div class="alert alert-secondary py-2 small">流程：待受理 → 處理中 → 已結案。結案必須填寫結果類別與給回報人的說明。誰有權結案、不良反應是否須對外通報，需法遵確認。</div>'}${card('回報', `<form data-submit="saveAdverse" class="row g-2"><div class="col-md-3"><select class="form-select" name="product" aria-label="商品">${opts(DB.products.filter(p => p.published).map(p => [p.id, p.published.name]))}</select></div><div class="col-md-2"><select class="form-select" name="kind" aria-label="類型">${opts(['不良反應', '客訴'])}</select></div><div class="col-md-5"><input class="form-control" name="text" maxlength="300" placeholder="狀況描述" aria-label="狀況描述" required></div><div class="col-md-2"><button class="btn btn-warning w-100">送出</button></div></form>`)}
      ${card('回報清單', `<div class="case-table">${table(head, list.map(row), '尚無回報')}</div>`)}`;
  }
});
Object.assign(ACTIONS, {
  saveAdverse: el => {
    const f = Object.fromEntries(new FormData(el));
    if (!f.text.trim()) return;
    const a = { id: uid('D'), time: nowStr(), by: me().id, ...f, status: '待受理', handler: '', action: '', result: null, history: [] };
    a.history.push({ time: a.time, by: '回報人', text: '送出回報' });
    DB.adverse.unshift(a); App.refresh(); toast('已送出回報', 'success');
  },
  adverseOpen: el => { if (!adverseHandler()) return deny('沒有處理案件的權限'); adverseDetail(adverseById(el.dataset.id)); },
  adverseAccept: el => {
    const a = adverseById(el.dataset.id);
    if (!adverseHandler()) return deny('沒有處理案件的權限');
    if (a.status !== '待受理') return deny('只有待受理的案件可以受理');
    a.status = '處理中'; a.handler = me().id; adverseLog(a, '受理案件');
    closeModal(); App.refresh(); toast('已受理', 'success');
  },
  adverseAction: el => {
    const a = adverseById(el.dataset.id), f = Object.fromEntries(new FormData(el)), note = f.note.trim(), reply = f.reply.trim();
    if (!adverseHandler()) return deny('沒有處理案件的權限');
    if (a.status !== '處理中') return deny('只有處理中的案件可以填寫');
    if (f.close && (!f.type || !reply)) return deny('結案必須選擇結案結果，並填寫給回報人的說明');
    if (!f.close && !note) return deny('請填寫內部處理紀錄');
    if (note) adverseLog(a, note);
    if (f.close) {
      a.status = '已結案'; a.result = { type: f.type, note: reply, by: me().id, time: nowStr() };
      adverseLog(a, `結案（${f.type}）：${reply}`);
    }
    closeModal(); App.refresh(); toast(f.close ? '已結案' : '已儲存處理紀錄', 'success');
  },
  recall: el => {
    const a = adverseById(el.dataset.id), p = productById(a.product);
    if (!adverseHandler()) return deny('沒有處理案件的權限');
    takeDown(p, `不良反應回報緊急下架（${me().name}）`);
    const buyers = new Set(DB.orders.filter(o => o.items.some(i => i.id === p.id) && o.paid).map(o => o.buyer));
    a.action = `已下架；已通知自建購物購買者 ${buyers.size} 人${p.published.channel === '外部電商' ? '；外部電商購買者需透過平台通知' : ''}`;
    // 下架不等於結案：尚未受理的案件視為由下架者受理，仍須另行結案
    if (a.status === '待受理') { a.status = '處理中'; a.handler = me().id; }
    adverseLog(a, a.action);
    App.refresh();
  }
});

/* ---------- 商品專區與自建購物（FR-87、101～106） ---------- */
route('shop', {
  title: '商品專區與購物車', icon: 'cart3', roles: ['subject'], stage: '4A、4B', fr: 'FR-87、98、101～105',
  render(el) {
    expireProducts();
    const mine = DB.cart.filter(c => c.buyer === me().id);
    const lines = mine.filter(c => liveProduct(productById(c.id)));
    const total = lines.reduce((s, c) => s + liveProduct(productById(c.id)).price * c.qty, 0);
    const orders = DB.orders.filter(o => o.buyer === me().id);
    el.innerHTML = `<div class="alert alert-secondary py-2 small">一般商品展示，不依個人量測值排序。健康數據、推薦依據與問卷不傳給電商、金流、物流或供應商。</div>
      <div class="row">${DB.products.filter(liveProduct).map(p => productCard(p)).join('')}</div>
      ${card('購物車（價格與庫存由伺服器端計算）', `${table(['商品', '單價', '數量', ''], lines.map(c => [esc(liveProduct(productById(c.id)).name), liveProduct(productById(c.id)).price, c.qty, `<button class="btn btn-sm btn-outline-danger" data-act="removeCart" data-id="${c.id}">移除</button>`]), '購物車是空的')}<div class="d-flex justify-content-between mt-2"><strong>合計 NT$ ${total}</strong><button class="btn btn-success" data-act="checkout" ${lines.length ? '' : 'disabled'}>結帳（模擬第三方支付）</button></div><p class="small text-muted mb-0">本系統不儲存卡號。</p>`)}
      ${card('我的訂單', table(['訂單', '時間', '金額', '狀態', '發票', '付款回呼模擬'], orders.map(o => [o.id, o.time, o.total, esc(o.status), o.invoice || '—',
        `<button class="btn btn-sm btn-primary" data-act="pay" data-id="${o.id}" data-sig="ok" ${o.status === '已取消' ? 'disabled' : ''}>${o.paid ? '重送相同通知' : '合法通知'}</button> <button class="btn btn-sm btn-outline-danger" data-act="pay" data-id="${o.id}" data-sig="bad">偽造簽章</button> ${o.status === '待付款' ? `<button class="btn btn-sm btn-outline-secondary" data-act="cancelOrder" data-id="${o.id}">取消</button>` : ''}`]), '尚無訂單') + table(['付款通知紀錄', '訂單', '結果'], DB.payEvents.slice(0, 6).map(e => [e.time, e.order, esc(e.result)]), '尚無付款通知'))}`;
  }
});
Object.assign(ACTIONS, {
  addCart: el => {
    const p = productById(el.dataset.id);
    if (me().role !== 'subject' || !liveProduct(p)) return deny('商品未上架');
    const line = DB.cart.find(c => c.buyer === me().id && c.id === p.id);
    if (line) line.qty++; else DB.cart.push({ buyer: me().id, id: p.id, qty: 1 });
    App.refresh(); toast('已加入購物車', 'success');
  },
  removeCart: el => { DB.cart = DB.cart.filter(c => !(c.buyer === me().id && c.id === el.dataset.id)); App.refresh(); },
  checkout: () => {
    const lines = DB.cart.filter(c => c.buyer === me().id && liveProduct(productById(c.id)));
    const items = [];
    for (const c of lines) {
      const p = productById(c.id), lot = p.lots.find(l => l.qty >= c.qty && l.expiry >= DB.today);
      if (!lot) return deny(`${p.published.name} 庫存不足或批號已過期`);
      items.push({ id: p.id, qty: c.qty, price: p.published.price, lot: lot.lot });
    }
    items.forEach(i => { productById(i.id).lots.find(l => l.lot === i.lot).qty -= i.qty; });
    DB.orders.unshift({ id: uid('O'), buyer: me().id, time: nowStr(), items, total: items.reduce((s, i) => s + i.price * i.qty, 0), status: '待付款', paid: false, invoice: '' });
    DB.cart = DB.cart.filter(c => c.buyer !== me().id);
    App.refresh(); toast('訂單已建立，請模擬付款通知', 'success');
  },
  pay: el => {
    const o = DB.orders.find(x => x.id === el.dataset.id);
    let result;
    if (el.dataset.sig === 'bad') result = '簽章驗證失敗，拒絕';
    else if (o.paid) result = '重複通知，已忽略（不重複入帳）';
    else { o.paid = true; o.status = '已付款・待出貨'; o.invoice = 'AB' + Math.floor(10000000 + Math.random() * 89999999) + '（示範）'; result = '驗證通過，入帳並開立電子發票'; }
    DB.payEvents.unshift({ time: nowStr(), order: o.id, result });
    App.refresh(); toast(result, el.dataset.sig === 'bad' ? 'danger' : 'primary');
  },
  cancelOrder: el => {
    const o = DB.orders.find(x => x.id === el.dataset.id);
    o.status = '已取消'; o.items.forEach(i => { productById(i.id).lots.find(l => l.lot === i.lot).qty += i.qty; });
    App.refresh();
  },
  outLink: el => modal('導購連結內容（FR-98）', `<p>傳給外部電商的連結只含不具健康意義的商品編號：</p><pre class="payload">https://shop.example/item?sku=SKU-${esc(el.dataset.id)}&utm_source=site</pre><p class="small mb-0">不含健康數值、指標名稱、推薦理由或可推知健康狀況的代碼。雛型不會實際開啟外部網站。</p>`)
});

route('orders', {
  title: '訂單、出貨與批號', icon: 'truck', roles: ['merch'], stage: '4B', fr: 'FR-103～106',
  render(el) {
    const lot = (view.lot || '').trim();
    const hit = lot ? DB.orders.filter(o => o.items.some(i => i.lot === lot)) : [];
    el.innerHTML = `<div class="alert alert-secondary py-2 small">客服與訂單後台看不到任何生理數值。鑑賞期與食品類例外由法務確認。</div>
      ${card('訂單後台', table(['訂單', '買家代號', '品項（批號）', '金額', '狀態', '發票', ''], DB.orders.map(o => [o.id, 'B-' + o.buyer.slice(-4), o.items.map(i => `${esc(productById(i.id).draft.name)} ×${i.qty}（${i.lot}）`).join('<br>'), o.total, esc(o.status), o.invoice || '—',
        o.status === '已付款・待出貨' ? `<button class="btn btn-sm btn-primary" data-act="orderStep" data-id="${o.id}" data-to="已出貨">出貨</button>` : o.status === '已出貨' ? `<button class="btn btn-sm btn-outline-warning" data-act="orderStep" data-id="${o.id}" data-to="已退貨退款">退貨退款</button>` : '']), '尚無訂單（以受測者身分到商品專區下單）'))}
      <div class="row"><div class="col-lg-6">${card('庫存與批號', table(['商品', '批號', '庫存', '效期'], DB.products.flatMap(p => p.lots.map(l => [esc(p.draft.name), l.lot, l.qty, l.expiry]))))}</div>
      <div class="col-lg-6">${card('依批號查訂單（回收用）', `<input class="form-control mb-2" placeholder="例如 L2610B，按 Enter" value="${esc(lot)}" data-change="setView" data-key="lot">${table(['訂單', '買家代號', '狀態'], hit.map(o => [o.id, 'B-' + o.buyer.slice(-4), esc(o.status)]), lot ? '此批號沒有訂單' : '請輸入批號')}`)}</div></div>`;
  }
});
ACTIONS.orderStep = el => {
  const o = DB.orders.find(x => x.id === el.dataset.id);
  o.status = el.dataset.to;
  if (el.dataset.to === '已退貨退款') o.invoice += '／已開折讓';
  App.refresh();
};

route('channels', {
  title: '外部電商串接', icon: 'arrow-left-right', roles: ['merch', 'sysadmin'], stage: '4A', fr: 'FR-96～100',
  render(el) {
    const ext = DB.products.filter(p => p.published?.channel === '外部電商');
    const diff = ext.map(p => {
      const remote = DB.platformCopy[p.id], local = liveProduct(p)?.copy;
      const ok = remote === local;
      return [p.id, esc(p.published.name), esc(local ?? '（應下架）'), esc(remote ?? '（平台無此商品）'), ok ? badge('一致', 'success') : badge('不一致，告警', 'danger')];
    });
    const sample = ext.find(liveProduct);
    el.innerHTML = `${card('同步狀態', `<label class="form-check form-switch"><input class="form-check-input" type="checkbox" data-change="syncFail" ${DB.syncFail ? 'checked' : ''}><span class="form-check-label">模擬平台同步失敗（之後緊急下架可看到告警與重試）</span></label>
        ${table(['時間', '商品', '動作', '結果', ''], DB.syncLog.slice(0, 10).map((l, i) => [l.time, l.product, l.action, sBadge(l.result), l.result === '失敗' && !l.retried ? `<button class="btn btn-sm btn-outline-primary" data-act="retrySync" data-i="${i}">重試</button>` : l.retried ? '已重試' : '']))}`)}
      ${card('平台文案核對（FR-99）', table(['編號', '商品', '核准版本文案', '平台端文案', '結果'], diff))}
      ${card('同步資料內容預覽（只含已核准版本，不含任何健康資訊）', sample ? `<pre class="payload">${esc(JSON.stringify({ sku: 'SKU-' + sample.id, name: sample.published.name, category: sample.published.type, price: sample.published.price, copy: sample.published.copy, license: sample.published.license || undefined }, null, 2))}</pre><p class="small text-muted mb-0">一個平台一個串接實作；平台金鑰放設定，不進版本控制。接收端只取訂單狀態與退貨摘要。通知：${DB.notifications.filter(n => n.to === 'u_merch').length} 則。</p>` : '目前沒有上架中的外部電商商品')}`;
  }
});
Object.assign(ACTIONS, {
  syncFail: el => { DB.syncFail = el.checked; App.refresh(); },
  retrySync: el => {
    const log = DB.syncLog[+el.dataset.i]; log.retried = true;
    syncChannel(productById(log.product), log.action); App.refresh();
  }
});

route('sales', {
  title: '銷售分析', icon: 'bar-chart', roles: ['merch', 'manager', 'hadmin'], stage: '4A、4B', fr: 'FR-88、營運指標',
  render(el) {
    const own = DB.orders.filter(o => o.paid);
    const rows = [
      ['瀏覽', '雛型示範值 320', '<span class="text-muted">缺漏（平台未提供）</span>'],
      ['成交訂單', own.length, '雛型示範值 12'], ['退貨', own.filter(o => o.status === '已退貨退款').length, '雛型示範值 1'],
      ['回購', '資料不足', '<span class="text-muted">缺漏（平台未提供）</span>'], ['不良反應回報', DB.adverse.filter(a => a.kind === '不良反應').length, '<span class="text-muted">缺漏（需人工彙整）</span>']
    ];
    const suppressed = DB.recLog.filter(l => !l.ids).length;
    el.innerHTML = `${card('兩管道彙總', table(['項目', '自建購物', '外部電商'], rows))}
      ${card('營運指標（除營收外同時追蹤）', table(['指標', '數值'], [['推薦被安全抑制比例', DB.recLog.length ? `${Math.round(suppressed / DB.recLog.length * 100)}%（${suppressed}/${DB.recLog.length} 次評估）` : '尚無資料'], ['不良反應與客訴件數', DB.adverse.length], ['文案退審次數', DB.products.reduce((s, p) => s + p.reviews.filter(r => r.result === '退回').length, 0)], ['行銷同意撤回數', Object.values(DB.recConsent).filter(c => c.revoked).length]]))}
      <p class="small text-muted">只出彙總，不含個人生理數值；不得以量測值前後差異宣稱商品功效（FR-90）；不把「異常人數」設為業績指標。</p>`;
  }
});
