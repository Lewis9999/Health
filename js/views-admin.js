/* 指標、門檻、裝置、參考值配對、稽核、地端部署與待決事項 */
'use strict';

route('metrics', {
  title: '指標主檔', icon: 'sliders', roles: ['hadmin'], stage: '1', fr: 'FR-20、21',
  render(el) {
    el.innerHTML = `<div class="alert alert-info py-2 small">規格建議：階段 0 沒有結論前只上線現有 5 項並標示「參考」。「實驗中」只有健康管理員看得到，且不觸發警示。要示範個人化推薦，需把收縮壓或血乳酸改為「已驗證」（僅雛型示範，實際須依場域驗證結論）。</div>
      ${card('指標清單', table(['順序', '代碼', '名稱', '單位', '類別', '廠商現況', '最短秒數（示範，待 V3）', '啟用', '驗證等級'], [...DB.metrics].sort((a, b) => a.order - b.order).map(m => [
        m.order, m.code, esc(m.name), m.unit, m.cat, m.vendorNow, m.minSec,
        `<div class="form-check form-switch"><input class="form-check-input" type="checkbox" data-change="metricEnable" data-code="${m.code}" ${m.enabled ? 'checked' : ''} aria-label="啟用 ${esc(m.name)}"></div>`,
        `<select class="form-select form-select-sm" data-change="metricLevel" data-code="${m.code}" aria-label="驗證等級">${opts(['已驗證', '參考', '實驗中'], m.level)}</select>`])))}`;
  }
});
Object.assign(ACTIONS, {
  metricEnable: el => { metricBy(el.dataset.code).enabled = el.checked; App.refresh(); },
  metricLevel: el => { metricBy(el.dataset.code).level = el.value; App.refresh(); toast('已更新驗證等級；既有量測紀錄的狀態與判定不改寫'); }
});

const range = (lo, hi) => lo != null && hi != null ? `<${lo} 或 >${hi}` : lo != null ? `<${lo}` : hi != null ? `>${hi}` : '—';
route('thresholds', {
  title: '門檻與版本', icon: 'rulers', roles: ['hadmin'], stage: '1', fr: 'FR-22、23',
  render(el) {
    const rows = [...DB.thresholds].reverse().map(t => {
      const used = DB.records.filter(r => r.ok && Object.values(r.values || {}).some(v => v.thr === thrText(t))).length;
      return [thrText(t), esc(metricBy(t.metric).name), `${t.ageGroup}／${t.sex}／${t.context}／${esc(t.site)}`, range(t.watchLo, t.watchHi), range(t.alertLo, t.alertHi), t.effective, esc(t.setBy), used, `<small>${esc(t.note)}</small>`, `<button class="btn btn-sm btn-outline-primary" data-act="editThr" data-id="${t.id}" data-ver="${t.version}">建立新版</button>`];
    });
    el.innerHTML = `<div class="alert alert-warning py-2 small">現行範圍沿用舊系統，<strong>未經醫護審核</strong>（例如舒張壓上限 170 幾乎不會警示）。審核者待確認（Q4）。門檻不覆寫，一律新增版本；歷史判定保留當時版本。</div>
      ${card('門檻清單（新到舊）', table(['版本', '指標', '年齡層／性別／情境／場域', '注意', '警示', '生效日', '設定者', '引用紀錄數', '說明', ''], rows), '<button class="btn btn-sm btn-success" data-act="editThr">新增門檻</button>')}`;
  }
});
Object.assign(ACTIONS, {
  editThr: el => {
    const base = DB.thresholds.find(t => t.id === el.dataset.id && t.version === +el.dataset.ver);
    const t = base || { metric: 'SBP', ageGroup: '65歲以上', sex: '全部', context: '全部', site: '全部', watchLo: 90, watchHi: 135, alertLo: 45, alertHi: 180 };
    const num = (k, label) => `<div class="col-3"><label class="form-label">${label}</label><input class="form-control" type="number" step="0.01" name="${k}" value="${t[k] ?? ''}"></div>`;
    const sel = (k, label, list) => `<div class="col-3"><label class="form-label">${label}</label><select class="form-select" name="${k}">${opts(list, t[k])}</select></div>`;
    modal(base ? `建立 ${base.id} 新版本` : '新增門檻', `<form id="thrForm" data-submit="saveThr" data-id="${base?.id || ''}"><div class="row g-2">
      <div class="col-12"><label class="form-label">指標</label><select class="form-select" name="metric" ${base ? 'disabled' : ''}>${opts(DB.metrics.filter(m => m.enabled).map(m => [m.code, m.name]), t.metric)}</select></div>
      ${sel('ageGroup', '年齡層', ['全部', '39歲以下', '40–64歲', '65歲以上'])}${sel('sex', '性別', ['全部', '男', '女'])}${sel('context', '情境', ['全部', '靜止', '運動前', '運動中', '運動後', '上工前', '休息後'])}${sel('site', '場域', ['全部', ...DB.sites])}
      ${num('watchLo', '注意下限')}${num('watchHi', '注意上限')}${num('alertLo', '警示下限')}${num('alertHi', '警示上限')}
      <div class="col-4"><label class="form-label">生效日</label><input class="form-control" type="date" name="effective" value="${DB.today}" min="${DB.today}" required></div>
      <div class="col-8"><label class="form-label">理由／審核依據</label><input class="form-control" name="note" maxlength="200" required></div></div></form>`,
      '<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button><button class="btn btn-primary" form="thrForm">儲存新版本</button>');
  },
  saveThr: el => {
    const f = Object.fromEntries(new FormData(el)), id = el.dataset.id;
    const prev = id ? DB.thresholds.filter(t => t.id === id) : [];
    const t = { id: id || uid('T'), metric: f.metric || prev[0].metric, version: prev.length ? Math.max(...prev.map(x => x.version)) + 1 : 1, setBy: me().name };
    ['ageGroup', 'sex', 'context', 'site', 'effective', 'note'].forEach(k => { t[k] = f[k]; });
    ['watchLo', 'watchHi', 'alertLo', 'alertHi'].forEach(k => { t[k] = f[k] === '' ? null : +f[k]; });
    if (!f.effective || f.effective < DB.today) return deny('生效日不可早於今天');
    if (!f.note.trim()) return deny('請填寫理由');
    if ((t.watchLo != null && t.watchHi != null && t.watchLo >= t.watchHi) || (t.alertLo != null && t.alertHi != null && t.alertLo >= t.alertHi)) return deny('下限必須小於上限');
    DB.thresholds.push(t); closeModal(); App.refresh(); toast('已新增版本；歷史判定不變', 'success');
  }
});

route('devices', {
  title: '裝置管理', icon: 'webcam', roles: ['hadmin', 'sysadmin'], stage: '3', fr: 'FR-62',
  render(el) {
    el.innerHTML = card('量測裝置', table(['編號', '場域', '型號', '啟用', '最後使用'], DB.devices.map(d => {
      const last = d.lastUsed || DB.records.filter(r => r.ok && r.device === d.id).map(r => r.time).sort().slice(-1)[0] || '—';
      return [d.id, esc(d.site), esc(d.model), `<div class="form-check form-switch"><input class="form-check-input" type="checkbox" data-change="deviceToggle" data-id="${d.id}" ${d.active ? 'checked' : ''} aria-label="啟用"></div>`, last];
    })));
  }
});
ACTIONS.deviceToggle = el => {
  if (!el.checked && DB.devices.filter(d => d.active).length === 1) { deny('至少保留一台啟用裝置'); return App.render(); }
  DB.devices.find(d => d.id === el.dataset.id).active = el.checked; App.refresh();
};

route('reference', {
  title: '參考儀器配對（場域驗證）', icon: 'clipboard2-data', roles: ['hadmin'], stage: '1', fr: 'FR-16、NFR-10',
  render(el) {
    const pairs = DB.references.map(p => {
      const r = DB.records.find(x => x.id === p.record), v = r && valueOf(r, p.metric);
      return v ? { ...p, r, value: v.value, diff: v.value - p.ref } : null;
    }).filter(Boolean);
    const summary = [...new Set(pairs.map(p => p.metric))].map(c => {
      const d = pairs.filter(p => p.metric === c).map(p => p.diff), st = stats(d);
      const mae = (d.reduce((a, b) => a + Math.abs(b), 0) / d.length).toFixed(2);
      return [esc(metricBy(c).name), st.n, mae, st.mean, st.n >= 2 ? `${(st.mean - 1.96 * st.sd).toFixed(2)} ～ ${(st.mean + 1.96 * st.sd).toFixed(2)}` : '樣本不足'];
    });
    const recent = DB.records.filter(r => r.ok).slice(-30).reverse();
    el.innerHTML = `<div class="alert alert-info py-2 small">驗收誤差標準須在驗證<strong>前</strong>訂好；樣本須涵蓋目標年齡層與膚色分組。雛型資料量不足以做任何結論。</div>
      ${card('新增配對', `<form data-submit="saveRef" class="row g-2 align-items-end"><div class="col-md-4"><label class="form-label">量測紀錄</label><select class="form-select" name="record">${opts(recent.map(r => [r.id, `${r.id}｜${subjectById(r.subject).name}｜${r.time}`]))}</select></div>
        <div class="col-md-2"><label class="form-label">指標</label><select class="form-select" name="metric">${opts(DB.metrics.filter(m => m.vendorNow === '有').map(m => [m.code, m.name]))}</select></div>
        <div class="col-md-2"><label class="form-label">參考值</label><input class="form-control" type="number" step="0.01" min="0" name="ref" required></div><div class="col-md-3"><label class="form-label">參考儀器</label><input class="form-control" name="device" maxlength="50" required></div><div class="col-md-1"><button class="btn btn-primary w-100">新增</button></div></form>`)}
      ${card('誤差摘要（估測 − 參考）', table(['指標', '配對數', 'MAE', 'Bias', '95% 一致性界限'], summary))}
      ${card('配對明細', table(['量測', '受測者', '指標', '估測', '參考', '差值', '儀器'], pairs.map(p => [p.record, esc(subjectById(p.r.subject).name), p.metric, p.value, p.ref, p.diff.toFixed(2), esc(p.device)])), '<button class="btn btn-sm btn-outline-success" data-act="exportRef">匯出 CSV</button>')}`;
    view.refExport = [['量測', '指標', '估測', '參考', '差值', '儀器'], ...pairs.map(p => [p.record, p.metric, p.value, p.ref, p.diff.toFixed(2), p.device])];
  }
});
Object.assign(ACTIONS, {
  saveRef: el => {
    const f = Object.fromEntries(new FormData(el));
    const r = DB.records.find(x => x.id === f.record);
    if (!valueOf(r, f.metric)) return deny('該次量測此指標無法估測，無法配對');
    if (f.ref === '' || !f.device.trim()) return deny('請填寫參考值與儀器');
    DB.references.unshift({ record: f.record, metric: f.metric, ref: +f.ref, device: f.device.trim() });
    App.refresh(); toast('已新增配對', 'success');
  },
  exportRef: () => exportCsv('參考值配對', view.refExport)
});

route('audit', {
  title: '稽核紀錄', icon: 'shield-check', roles: ['sysadmin', 'hadmin'], stage: '1～2', fr: 'NFR-05、06、FR-34',
  render(el) {
    const failed = DB.records.filter(r => !r.ok);
    el.innerHTML = `${card('查閱他人健康資料', table(['時間', '查閱人', '對象編號', '內容'], DB.accessLog.slice(0, 50).map(a => [a.time, esc(userName(a.user)), a.subject, esc(a.what)]), '尚無紀錄（以照護者身分查看個案後再回來看）'))}
      ${card('諮詢紅旗提示紀錄', table(['時間', '對象編號', '步驟', '看到提示後'], DB.redFlagLog.map(a => [a.time, a.subject, a.stage, a.sent ? '仍送出' : '未送出']), '尚無紀錄') + '<p class="small text-muted mt-2 mb-0">只記時間、對象、步驟與是否送出，不記諮詢內容與命中的詞。</p>')}
      ${card('匯出紀錄', table(['時間', '匯出人', '名稱', '筆數'], DB.exportLog.map(a => [a.time, esc(userName(a.user)), esc(a.name), a.rows])))}
      ${card('被拒絕的量測請求', table(['時間', '使用者', '原因'], DB.blocked.map(a => [a.time, esc(userName(a.user)), esc(a.reason)])))}
      ${card('失敗的量測（不含影片）', table(['時間', '對象編號', '情境', '原因'], failed.map(r => [r.time, r.subject, r.context, esc(r.error)])))}
      <p class="small text-muted">稽核紀錄本身限制可查閱人員；系統管理者看不到生理數值。</p>`;
  }
});

route('deploy', {
  title: '地端部署與待決事項', icon: 'hdd-network', roles: ['sysadmin', 'hadmin'], stage: '0～1', fr: 'FR-125～132、第 12 節',
  render(el) {
    const s = DB.settings, ok = s.measureHost === s.approvedHost;
    const vendor = [['V1', 'API／SDK 規格、品質分數、演算法版本'], ['V2', '各指標驗證報告（參考儀器、樣本、MAE／Bias／LoA）'], ['V3', '最短量測秒數、解析度、幀率、光線與距離'], ['V4', '環境限制：強光、安全帽、口罩、眼鏡、流汗、晃動'], ['V5', '【必要條件】可地端安裝、可斷網運作、無對外回傳'], ['V6', '影片留存、訓練使用、資料所在地、加密、刪除'], ['V7', '地端 HTTPS、併發、離線更新、維護費用'], ['V8', '論文原文、合作案引用範圍、法規認證現況']];
    const qs = [['Q1', '首要場景：高齡復健、工地或遠距照護？'], ['Q2', '維持健康管理，或走醫療器材？'], ['Q4', '誰審核門檻與處置建議？'], ['Q5', '單一單位或多客戶（租戶隔離）？須在階段 1 前決定'], ['Q6', '是否需要 App、離線量測？'], ['Q7', '人數、場域數、尖峰量測量？'], ['Q8', '自有品牌、代銷或兩者？'], ['Q9', '審核的營養師／藥師與法遵由誰擔任？'], ['Q10', '串接哪個電商平台？有哪些 API？'], ['Q11', '金流、電子發票、物流與賣方法人？'], ['Q15', '（暫緩）知識助理規模與硬體預算'], ['Q16', '公有雲虛擬主機自行安裝是否可接受？'], ['Q17', '健康類知識文件是否保留專業審核？']];
    el.innerHTML = `<div class="row"><div class="col-lg-6">${card('量測服務位址（模擬）', `<form data-submit="saveHost"><label class="form-label">量測服務網址</label><input class="form-control" name="host" value="${esc(s.measureHost)}" maxlength="200"><div class="small mt-1">核准清單：<code>${esc(s.approvedHost)}</code></div><div class="alert alert-${ok ? 'success' : 'danger'} py-2 small mt-2">${ok ? '位址在核准清單內' : '位址不在核准清單，所有量測將被拒絕（FR-131）'}</div><button class="btn btn-primary" ${me().role === 'sysadmin' ? '' : 'disabled'}>儲存（限系統管理者）</button></form>`)}
      ${card('部署檢查（需實機驗證，雛型僅列項目）', `<ul class="small mb-0"><li>臉部影片與衍生影像不送雲端或廠商主機（FR-130）</li><li>量測主機、模型主機封鎖對外連線；關閉遙測與自動更新（FR-126、132）</li><li>廠商遠端維護需申請、限時、留紀錄</li><li>模型伺服器只接受本系統呼叫且需驗證身分（FR-125）</li><li>模型離線匯入、檢查雜湊與授權（FR-127）；更新前重跑評測（FR-128）</li><li>斷網測試（驗收 23、26）</li></ul>`)}</div>
      <div class="col-lg-6">${card('向廠商索取清單（階段 0）', table(['編號', '項目'], vendor))}</div></div>
      ${card('待決事項', table(['編號', '問題'], qs))}`;
  }
});
ACTIONS.saveHost = el => {
  if (me().role !== 'sysadmin') return deny('僅系統管理者可修改');
  DB.settings.measureHost = new FormData(el).get('host').trim(); App.refresh();
};
