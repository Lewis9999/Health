/* 知識助理（雛型以關鍵字比對模擬檢索，未接 LLM）、衛教問答、審核輔助、知識文件管理 */
'use strict';

const isLive = d => d.status === '已核准' && d.expiry >= DB.today;
const RED_FLAGS = ['胸痛', '胸悶', '呼吸困難', '喘不過氣', '昏厥', '昏倒', '暈倒', '意識不清', '抽搐', '中風', '大量出血', '自殺'];
/** 紅旗詞比對，知識助理與專業諮詢共用同一份清單。只是關鍵字比對，沒比到不代表不緊急。 */
const redFlagsIn = text => RED_FLAGS.filter(w => text.includes(w));
const FORBIDDEN = ['診斷', '我是不是', '什麼病', '吃什麼藥', '用藥', '藥量', '停藥', '劑量', '能不能吃', '可以吃', '適合吃', '推薦哪', '哪個商品', '產品'];
const STOP = /[\s，。？！、：；,.?!:;「」（）()的了嗎呢要和與在是有我你請問如何怎麼什麼做]/g;

const bigrams = s => { const t = s.replace(STOP, ''); const out = new Set(); for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2)); return out; };
/** 先依角色與效期過濾，再檢索（FR-111、112）。 */
function retrieve(question, role) {
  const q = bigrams(question);
  if (!q.size) return [];
  return DB.kbDocs.filter(d => isLive(d) && d.roles.includes(role))
    .flatMap(d => d.chunks.map((c, i) => {
      const t = bigrams(d.title + c.sec + c.text);
      const hit = [...q].filter(x => t.has(x)).length;
      return { d, c, i, hit, score: hit / q.size };
    }))
    .filter(x => x.hit >= 2 && x.score >= 0.2).sort((a, b) => b.score - a.score).slice(0, 3);
}
const stripPii = s => DB.subjects.reduce((t, p) => t.split(p.name).join('［姓名］'), s)
  .replace(/[A-Z][12]\d{8}/g, '［身分證號］').replace(/09\d{2}-?\d{3}-?\d{3}/g, '［電話］').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '［電子郵件］');

function ask(mode, question) {
  const role = me().role;
  let type, hits = [];
  if (redFlagsIn(question).length) type = '紅旗分流';
  else if (mode === 'edu' && FORBIDDEN.some(w => question.includes(w))) type = '禁答引導';
  else {
    hits = retrieve(question, role);
    if (mode === 'edu') hits = hits.filter(h => h.d.cat === '衛教' && h.score >= 0.35).slice(0, 1);
    type = hits.length ? '已回答' : '查不到';
  }
  const log = { id: uid('L'), time: nowStr(), user: me().id, mode, q: question, type, cites: hits.map(h => `${h.d.id} v${h.d.version} §${h.c.sec}`), model: '雛型關鍵字檢索（未接模型）', feedback: '' };
  DB.aiLog.unshift(log);
  if (type === '查不到') DB.unanswered.unshift({ time: nowStr(), mode, q: stripPii(question) });
  save();
  return { log, hits };
}

function answerHtml(mode, a) {
  const { log, hits } = a;
  if (log.type === '紅旗分流') return '<div class="alert alert-danger"><h5><i class="bi bi-telephone-fill me-1"></i>請立即尋求協助</h5>您描述的狀況可能需要緊急處理。請<strong>立即撥打 119</strong>，或請身邊的人協助就醫；現場可聯絡急救人員（分機 0000，示範）。本問題不進入一般問答。</div>';
  if (log.type === '禁答引導') return '<div class="alert alert-warning">這類問題（診斷、用藥、個別商品適用）不在衛教問答範圍。請向營養師／藥師諮詢，或就醫由醫療人員判斷。' + (me().role === 'subject' ? ' <a href="#/recommend">前往諮詢</a>' : '') + '</div>';
  if (log.type === '查不到') return `<div class="alert alert-secondary">查不到相關的已核准內容。${mode === 'edu' ? '已轉由專業人員補寫（移除個資後彙整）。' : '請改用其他關鍵詞，或洽文件維護人。'}</div>`;
  const feedback = `<div class="mt-2"><button class="btn btn-sm btn-outline-success" data-act="aiFeedback" data-id="${log.id}" data-v="有幫助">有幫助</button> <button class="btn btn-sm btn-outline-danger" data-act="aiFeedback" data-id="${log.id}" data-v="回報錯誤">回報錯誤</button></div>`;
  if (mode === 'edu') {
    const h = hits[0];
    return `<div class="small text-muted mb-1">以下為已審核原文（逐字顯示，不改寫、不摘要）｜${esc(h.d.title)} v${h.d.version}</div><div class="cite"><strong>${esc(h.c.sec)}</strong>\n${esc(h.c.text)}</div>${feedback}`;
  }
  return `<div class="small text-muted mb-2">依下列已核准文件段落回答（雛型直接列出原文；正式版由地端模型依引用生成）：</div>${hits.map((h, n) => `<div class="cite mb-2">${esc(h.c.text)}\n<a href="#" data-act="openCite" data-doc="${h.d.id}" data-i="${h.i}">[${n + 1}] ${esc(h.d.title)} v${h.d.version} §${esc(h.c.sec)}</a></div>`).join('')}${feedback}`;
}

function chatPage(el, mode, examples) {
  const key = 'ans_' + mode;
  if (!DB.settings.assistantOn) { el.innerHTML = card('', '<div class="alert alert-secondary mb-0">知識助理目前已停用。量測與歷史查詢不受影響（FR-123、124）。</div>'); return; }
  const a = view[key];
  el.innerHTML = `${EMERGENCY}<div class="alert alert-info py-2 small">雛型以關鍵字比對模擬檢索，<strong>沒有連接任何語言模型</strong>。正式版全部地端執行，資料不送雲端。回答畫面不放商品。</div>
    ${card('提問', `<form data-submit="askSubmit" data-mode="${mode}" class="d-flex gap-2"><input class="form-control" name="q" maxlength="200" placeholder="請輸入問題（請勿輸入真實個資）" required><button class="btn btn-primary text-nowrap">送出</button></form>
      <div class="mt-2 small">試試：${examples.map(x => `<button class="btn btn-sm btn-outline-secondary me-1 mb-1" data-act="askExample" data-mode="${mode}" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>`)}
    ${a ? card('問：' + esc(a.log.q), answerHtml(mode, a)) : ''}`;
}
function doAsk(mode, q) {
  if (!q) return;
  const result = ask(mode, q);
  view['ans_' + mode] = result;
  App.render();
}
Object.assign(ACTIONS, {
  askSubmit: el => doAsk(el.dataset.mode, new FormData(el).get('q').trim()),
  askExample: el => doAsk(el.dataset.mode, el.dataset.q),
  openCite: (el, e) => {
    e.preventDefault();
    const d = DB.kbDocs.find(x => x.id === el.dataset.doc);
    if (!isLive(d) || !d.roles.includes(me().role)) return deny('文件已失效或無權查閱');
    modal(`${d.title} v${d.version}`, d.chunks.map((c, i) => `<h6>${esc(c.sec)}</h6><p class="${i === +el.dataset.i ? 'cite' : ''}">${esc(c.text)}</p>`).join(''));
  },
  aiFeedback: el => { DB.aiLog.find(l => l.id === el.dataset.id).feedback = el.dataset.v; save(); toast('已記錄回饋', 'success'); }
});

route('assistant', {
  title: '作業知識助理', icon: 'robot', roles: ['operator', 'care', 'ohs', 'hadmin', 'pro', 'legal', 'sysadmin'], stage: 'R1', fr: 'FR-112～115、120～124',
  render: el => chatPage(el, 'ops', ['量測失敗怎麼處理', '收到警示通知後怎麼做', '量測環境光線要求', '公司年假有幾天', '作業員胸痛怎麼辦'])
});
route('eduqa', {
  title: '衛教問答', icon: 'question-circle', roles: ['subject'], stage: 'R3', fr: 'FR-115～117、119',
  render: el => chatPage(el, 'edu', ['量血壓前要注意什麼', '飲食減鈉怎麼做', '運動後如何恢復', '我血壓高要吃什麼藥', '我突然胸悶喘不過氣', '晚上睡不好怎麼辦'])
});

route('reviewassist', {
  title: '審核輔助', icon: 'search', roles: ['pro', 'legal'], stage: 'R2', fr: '6.10 順序 2、FR-81、93',
  render(el) {
    view.rap ??= 'P005';
    const p = productById(view.rap), c = p.draft, hits = copyCheck(c);
    let marked = esc(c.copy);
    hits.forEach(w => { marked = marked.split(w).join(`<mark>${w}</mark>`); });
    const fields = [['name', '名稱'], ['copy', '文案'], ['ingredients', '成分'], ['claim', '功效原文'], ['license', '許可字號']];
    const diffs = p.published ? fields.filter(([k]) => c[k] !== p.published[k]) : [];
    const INTERACTIONS = [['魚油', '抗凝血劑'], ['納豆激酶', '抗凝血劑'], ['Q10', '抗凝血劑'], ['紅麴', '降血脂藥'], ['鉀', '降壓藥／利尿劑、腎臟病']];
    const inter = INTERACTIONS.filter(([k]) => c.ingredients.includes(k) || c.name.includes(k));
    el.innerHTML = `<div class="alert alert-warning py-2 small">輔助結果僅供參考，<strong>不取代任何一關人工審核</strong>。交互作用清單為示範，完整清單由藥師維護。</div>
      ${card('選擇商品', `<select class="form-select" data-change="setView" data-key="rap">${opts(DB.products.map(x => [x.id, `${x.id} ${x.draft.name}（${x.status}）`]), view.rap)}</select>`)}
      <div class="row"><div class="col-lg-6">${card('文案疑慮', `<p>${marked || '（無文案）'}</p>${hits.length ? `<div class="text-danger small">疑似禁用詞：${hits.join('、')}</div>` : '<div class="small text-muted">關鍵詞比對未發現（不代表合規）</div>'}`)}
      ${card('交互作用查詢', table(['成分', '需注意'], inter, '示範清單中沒有比對到'))}</div>
      <div class="col-lg-6">${card('與前台核准版本比對', p.published ? table(['欄位', '核准版', '草稿'], diffs.map(([k, l]) => [l, esc(p.published[k]), esc(c[k])]), '沒有差異') : '尚無核准版本')}</div></div>`;
  }
});

route('kb', {
  title: '知識文件管理', icon: 'journals', roles: ['legal', 'pro', 'hadmin'], stage: 'R0～R1', fr: 'FR-110～113、117、118、124',
  render(el) {
    const role = me().role;
    el.innerHTML = `<div class="alert alert-info py-2 small">由法遵維護與審核，維護人不得審核自己送審的內容（法遵至少兩人）。只有已核准且在效期內的版本可被檢索。健康類文件是否另需專業審核待確認（Q17）；本雛型的知識文件僅做法遵一關。廠商簡報等未驗證宣稱、個人量測紀錄不得放入知識庫。</div>
      ${card('文件', table(['編號', '標題', '類別', '版本', '效期', '可查閱角色', '維護人', '狀態', '可檢索', ''], DB.kbDocs.map(d => [d.id, esc(d.title), d.cat, 'v' + d.version, d.expiry, `<small>${d.roles.map(r => ROLE_NAMES[r]).join('、')}</small>`, esc(userName(d.maintainer)), sBadge(d.status), isLive(d) ? '<i class="bi bi-check-circle text-success" aria-hidden="true"></i><span class="visually-hidden">可檢索</span>' : '—',
        role !== 'legal' ? '' : d.status === '待法遵審核' ? `<button class="btn btn-sm btn-success" data-act="kbApprove" data-id="${d.id}">核准</button> <button class="btn btn-sm btn-outline-danger" data-act="kbReturn" data-id="${d.id}">退回</button>` : d.status === '已核准' ? `<button class="btn btn-sm btn-outline-danger" data-act="kbRevoke" data-id="${d.id}">撤銷</button>` : `<button class="btn btn-sm btn-outline-primary" data-act="kbSubmit" data-id="${d.id}">送審</button>`])))}
      ${card('沒有答案的提問（已移除個資，FR-117）', table(['時間', '來源', '提問'], DB.unanswered.map(u => [u.time, u.mode === 'edu' ? '衛教問答' : '作業助理', esc(u.q)])))}
      ${card('問答紀錄（含引用版本與回饋，FR-122）', table(['時間', '使用者', '提問', '結果', '引用', '回饋'], DB.aiLog.slice(0, 20).map(l => [l.time, esc(userName(l.user)), esc(stripPii(l.q)), l.type, `<small>${l.cites.map(esc).join('<br>') || '—'}</small>`, esc(l.feedback || '—')]), '尚無紀錄'),
        role === 'legal' || role === 'hadmin' ? `<button class="btn btn-sm ${DB.settings.assistantOn ? 'btn-danger' : 'btn-success'}" data-act="toggleAssistant">${DB.settings.assistantOn ? '立即停用整個助理' : '重新啟用助理'}</button>` : '')}`;
  }
});
const kbById = id => DB.kbDocs.find(d => d.id === id);
/* 文件失效時，已快取的回答一併清除（FR-111） */
const clearAnswers = () => Object.keys(view).filter(k => k.startsWith('ans_')).forEach(k => delete view[k]);
Object.assign(ACTIONS, {
  kbApprove: el => {
    const d = kbById(el.dataset.id);
    if (me().id === d.maintainer) return deny('維護人不得審核自己送審的內容');
    if (d.expiry < DB.today) return deny('文件效期已過');
    d.status = '已核准'; d.approver = me().id; App.refresh(); toast('已核准並進入索引', 'success');
  },
  kbReturn: el => { const d = kbById(el.dataset.id); if (me().id === d.maintainer) return deny('維護人不得審核自己送審的內容'); d.status = '已退回'; App.refresh(); },
  kbRevoke: el => { kbById(el.dataset.id).status = '已撤銷'; clearAnswers(); App.refresh(); toast('已撤銷，同步移出索引'); },
  kbSubmit: el => { const d = kbById(el.dataset.id); if (d.status !== '已退回') { d.version++; d.expiry = '2027-11-24'; } d.status = '待法遵審核'; d.maintainer = me().id; App.refresh(); toast('已送審，需由另一位法遵核准'); },
  toggleAssistant: () => { DB.settings.assistantOn = !DB.settings.assistantOn; clearAnswers(); App.refresh(); }
});
