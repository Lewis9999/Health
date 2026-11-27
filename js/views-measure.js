/* 同意、量測、結果、列表、個人趨勢、生活紀錄、機台模式 */
'use strict';

const MODES = { 快速: 10, 完整: 300 }; // 完整模式秒數須依廠商清單 V3 決定，300 秒為示範值
const SCENARIOS = {
  normal: '正常結果', high: '血壓偏高（超出警示門檻）', lowo2: '血氧偏低（超出警示門檻）',
  poor: '訊號品質不足', down: '量測服務中斷', host: '量測網址被改成未核准主機'
};
const CHECKS = [['pos', '臉部位於框內'], ['dist', '距離適當（1 公尺內）'], ['light', '光線充足且不直射'], ['still', '保持靜止']];
let measureTimer = null;

function subjectSelect(key, list, label = '受測者') {
  if (!list.find(s => s.id === view[key])) view[key] = list[0]?.id;
  return `<label class="form-label">${label}</label><select class="form-select" data-change="setView" data-key="${key}">${opts(list.map(s => [s.id, `${s.name}（${DB.depts[s.dept]}）`]), view[key])}</select>`;
}
const camSvg = () => `<svg viewBox="0 0 400 300" aria-hidden="true"><ellipse cx="200" cy="140" rx="62" ry="80" fill="#475569"/><path d="M90 300c10-60 60-72 110-72s100 12 110 72z" fill="#334155"/><circle cx="178" cy="125" r="6" fill="#94a3b8"/><circle cx="222" cy="125" r="6" fill="#94a3b8"/><path d="M180 175q20 12 40 0" stroke="#94a3b8" stroke-width="4" fill="none"/><rect class="frame" x="118" y="42" width="164" height="196" rx="18"/></svg>`;

/* 模擬伺服器端：任何量測請求都先在此檢查（FR-03、FR-131） */
function serverCheck(sid, scenario) {
  if (!activeConsent(sid)) return '受測者沒有有效同意，拒絕量測（FR-03）';
  const host = scenario === 'host' ? 'https://api.vendor-cloud.example' : DB.settings.measureHost;
  if (host !== DB.settings.approvedHost) return `量測服務位址「${host}」不在核准清單，拒絕量測並記錄（FR-131）`;
  return '';
}

function runMeasurement(sid, form) {
  const subject = subjectById(sid), b = subject.base, mode = form.mode, jitter = (v, s, d = 0) => +(v + (Math.random() - .5) * s).toFixed(d);
  const device = DB.devices.find(d => d.id === form.device);
  const record = {
    id: uid('M'), subject: sid, time: nowStr(), context: form.context, mode, site: device.site, device: device.id, algo: 'sim-1.1',
    operator: me().name, consent: activeConsent(sid).id, quality: form.scenario === 'poor' ? 38 : Math.round(80 + Math.random() * 15), ok: true,
    raw: { HR: jitter(b[0], 6), SBP: jitter(b[1], 8), DBP: jitter(b[2], 6), SPO2: Math.min(100, jitter(b[3], 2)), LAC: jitter(b[4], .3, 2) }
  };
  DB.metrics.filter(m => m.enabled && record.raw[m.code] === undefined && m.code === 'RR').forEach(() => { record.raw.RR = jitter(14, 4); });
  if (form.scenario === 'high') { record.raw.SBP = 188; record.raw.DBP = 112; }
  if (form.scenario === 'lowo2') record.raw.SPO2 = 85;
  buildValues(record, MODES[mode]);
  DB.records.push(record);
  device.lastUsed = record.time;
  const alert = record.quality >= DB.settings.minQuality ? evaluateAlerts(record) : null;
  save();
  return { record, alert };
}

/* 結果畫面：不放任何商品或廣告（FR-85） */
function resultHtml(record, alert) {
  const shown = visibleMetrics().filter(m => record.values[m.code]);
  const cards = shown.map(m => {
    const v = record.values[m.code];
    const cls = v.value == null ? 'j-na' : v.judge === '警示' ? 'j-alert' : v.judge === '注意' ? 'j-watch' : '';
    return `<div class="col-sm-6 col-lg-4"><div class="metric-card ${cls}"><div class="d-flex justify-content-between"><strong>${esc(m.name)}</strong>${sBadge(v.status)}</div>
      <div class="val">${v.value == null ? '<span class="fs-5 text-muted">無法估測</span>' : `${v.value} <small class="fs-6">${m.unit}</small>`}</div>
      <div>${v.value == null ? `<small class="text-muted">${esc(v.reason)}</small>` : judgeMark(v.judge)}</div></div></div>`;
  }).join('');
  const poor = record.quality < DB.settings.minQuality;
  return `${DISCLAIMER}
    ${poor ? '<div class="alert alert-warning"><i class="bi bi-arrow-repeat me-1"></i>本次訊號品質不足，不產生數值也不產生警示。請確認光線、保持靜止後重測。</div>' : ''}
    ${alert ? `<div class="alert alert-danger"><h5><i class="bi bi-exclamation-triangle-fill me-1"></i>${alert.status === '待複測' ? '請休息後再量一次（複測）' : '已通知負責人員'}</h5>
      <p class="mb-2">${alert.status === '待複測' ? '部分結果超出警示門檻。請坐下休息數分鐘後複測；若身體不適，不要等待複測。' : '部分結果超出警示門檻，請依現場人員指示處理。'}</p>
      <p class="mb-0"><strong>可立即聯絡：</strong>${esc(ownersOf(record.subject).map(o => o.name).join('、') || '健康管理員')}（分機 0000，示範）<br><strong>緊急狀況請撥 119。</strong>本系統不能當作唯一的安全監控手段。</p></div>` : ''}
    <div class="row g-2 mb-3">${cards}</div>
    <div class="small text-muted">量測編號 ${record.id}｜${record.time}｜情境 ${esc(record.context)}｜模式 ${record.mode}｜整體品質 ${record.quality}｜演算法 ${record.algo}｜裝置 ${record.device}｜場域 ${esc(record.site)}｜操作者 ${esc(record.operator)}｜同意紀錄 ${record.consent}<br>影片：模擬量測，量測結束即刪除（NFR-03）。</div>`;
}

route('measure', {
  title: '健康量測', icon: 'camera-video', roles: ['subject', 'operator', 'care', 'ohs', 'hadmin'], stage: '1～2', fr: 'FR-03、10～15',
  render(el) {
    const list = measurableSubjects();
    const selector = subjectSelect('msid', list);
    const sid = view.msid, consent = activeConsent(sid);
    view.checks ??= { pos: true, dist: true, light: true, still: true };
    const allOk = CHECKS.every(([k]) => view.checks[k]);
    view.mode ??= '快速';
    const seconds = MODES[view.mode];
    const outputs = visibleMetrics().filter(m => seconds >= m.minSec).map(m => m.name).join('、') || '無';
    el.innerHTML = `<div class="row">
      <div class="col-lg-7">${card('量測畫面', `
        <div class="cam ${allOk ? '' : 'bad'}">${camSvg()}<div class="count d-none badge text-bg-danger fs-3" id="countdown"></div><div class="note">模擬鏡頭畫面（雛型不啟用攝影機）</div></div>
        <div class="mt-3"><strong>錄影前即時引導</strong> <small class="text-muted">取消勾選可模擬不合格（FR-10）</small>
        <div class="row mt-1">${CHECKS.map(([k, t]) => `<div class="col-sm-6"><label class="form-check"><input class="form-check-input" type="checkbox" data-change="camCheck" data-check="${k}" ${view.checks[k] ? 'checked' : ''}><span class="form-check-label">${view.checks[k] ? '' : '<i class="bi bi-exclamation-triangle-fill text-warning me-1" aria-hidden="true"></i>未達：'}${t}</span></label></div>`).join('')}</div></div>`)}</div>
      <div class="col-lg-5">${card('量測設定', `
        <div class="mb-2">${selector}</div>
        ${consent ? `<div class="alert alert-success py-2 small">有效同意 ${consent.version}（${consent.time}，${consent.method}）</div>`
          : '<div class="alert alert-danger py-2 small">尚無有效同意（未簽署或已撤回）。<a href="#/consent">前往同意管理</a></div>'}
        <form data-submit="startMeasure" id="measureForm">
          <div class="row g-2">
            <div class="col-6"><label class="form-label">情境</label><select class="form-select" name="context">${opts(['靜止', '運動前', '運動中', '運動後', '上工前', '休息後'], view.context || '靜止')}</select></div>
            <div class="col-6"><label class="form-label">量測模式</label><select class="form-select" name="mode" data-change="setView" data-key="mode">${opts(Object.keys(MODES).map(k => [k, `${k}（${MODES[k]} 秒）`]), view.mode)}</select></div>
            <div class="col-12"><label class="form-label">裝置／場域</label><select class="form-select" name="device">${opts(DB.devices.filter(d => d.active).map(d => [d.id, `${d.id}｜${d.site}`]), view.device)}</select></div>
            <div class="col-12"><label class="form-label">模擬情況 <span class="badge text-bg-warning">雛型專用</span></label><select class="form-select" name="scenario">${opts(Object.entries(SCENARIOS))}</select></div>
          </div>
          <div class="small text-muted mt-2">本模式可輸出：${esc(outputs)}</div>
          <button class="btn btn-primary btn-lg w-100 mt-3" ${allOk ? '' : 'disabled'}><i class="bi bi-record-circle me-1"></i>${allOk ? '開始量測' : '引導未合格，無法開始'}</button>
        </form>
        <button class="btn btn-link btn-sm px-0 mt-2" data-act="bypassApi">模擬「略過畫面直接呼叫上傳 API」</button>`)}</div></div>`;
  }
});

Object.assign(ACTIONS, {
  camCheck: el => { view.checks[el.dataset.check] = el.checked; App.render(); },
  bypassApi: () => {
    const reason = serverCheck(view.msid, 'normal');
    if (reason) { DB.blocked.unshift({ time: nowStr(), user: me().id, reason }); save(); deny(reason); }
    else toast('此受測者有有效同意，伺服器端檢查通過', 'success');
  },
  startMeasure: formEl => {
    if (measureTimer) return;
    const form = Object.fromEntries(new FormData(formEl)), sid = view.msid;
    view.context = form.context; view.device = form.device;
    const reason = serverCheck(sid, form.scenario);
    if (reason) { DB.blocked.unshift({ time: nowStr(), user: me().id, reason }); save(); deny(reason); return; }
    const badge_ = $('#countdown');
    let n = 5;
    badge_.classList.remove('d-none');
    badge_.textContent = n;
    $('button', formEl).disabled = true;
    measureTimer = setInterval(() => {
      if (!badge_.isConnected) { clearInterval(measureTimer); measureTimer = null; return; } // 離開頁面即取消
      if (--n > 0) { badge_.textContent = n; return; }
      clearInterval(measureTimer); measureTimer = null;
      if (form.scenario === 'down') {
        DB.records.push({ id: uid('M'), subject: sid, time: nowStr(), context: form.context, ok: false, error: '量測服務中斷' });
        App.refresh();
        modal('量測失敗', '<div class="alert alert-danger">量測服務暫時無法使用。請稍後再試，或通知健康管理員確認地端量測主機。</div><p class="mb-0">歷史紀錄查詢不受影響（NFR-08）。本次失敗已留紀錄（不含影片，FR-14）。</p>');
        return;
      }
      const { record, alert } = runMeasurement(sid, form);
      App.render();
      modal('檢測結果（示範倒數已縮短為 5 秒）', resultHtml(record, alert));
    }, 700);
  }
});

/* ---------- 同意管理 ---------- */
route('consent', {
  title: '同意管理', icon: 'file-earmark-check', roles: ['subject', 'operator', 'hadmin'], stage: '1', fr: 'FR-01～05、82',
  render(el) {
    const list = measurableSubjects();
    const selector = subjectSelect('csid', list);
    const sid = view.csid, c = activeConsent(sid), form = DB.consentForms[DB.consentForms.length - 1];
    const history = DB.consents.filter(x => x.subject === sid);
    el.innerHTML = `${card('', `<div class="row g-2 align-items-end"><div class="col-md-5">${selector}</div>
        ${me().role !== 'subject' ? '<div class="col-md-7 text-md-end"><button class="btn btn-success" data-act="newSubject"><i class="bi bi-person-plus me-1"></i>建立無登入帳號的受測者</button></div>' : ''}</div>`)}
      <div class="row"><div class="col-lg-7">${c ? card('目前有效同意', `
          <p>版本 ${c.version}｜${c.time}｜${c.method}${c.proxy ? `｜代簽人 ${esc(c.proxy)}` : ''}<br>量測與儲存：<i class="bi bi-check-circle me-1" aria-hidden="true"></i>同意　研究用途：${c.research ? '<i class="bi bi-check-circle me-1" aria-hidden="true"></i>同意' : '<i class="bi bi-x-circle me-1" aria-hidden="true"></i>未同意'}</p>
          <button class="btn btn-outline-danger" data-act="revoke">撤回同意</button>
          <p class="small text-muted mt-2 mb-0">撤回後停止量測；既有資料依保存政策處理（保存期限待訂，NFR-07）。</p>`) :
        card(`知情同意書 ${form.version}`, `<div class="cite mb-3">${esc(form.text)}</div>
          <form data-submit="signConsent">
            <label class="form-check mb-1"><input class="form-check-input" type="checkbox" name="measure"><span class="form-check-label">我同意<strong>量測與儲存</strong>（必要，未勾選無法量測）</span></label>
            <label class="form-check mb-3"><input class="form-check-input" type="checkbox" name="research"><span class="form-check-label">我同意作為<strong>研究用途</strong>（選填，預設不勾）</span></label>
            <div class="row g-2 mb-3"><div class="col-sm-6"><label class="form-label">同意方式</label><select class="form-select" name="method">${opts(['線上勾選', '紙本簽署', '紙本代簽'])}</select></div>
            <div class="col-sm-6"><label class="form-label">代簽人（代簽時必填）</label><input class="form-control" name="proxy" maxlength="50"></div></div>
            <button class="btn btn-primary">確認簽署</button>
          </form>
          <p class="small text-muted mt-2 mb-0">個人化推薦是另一個蒐集目的，另外取得同意，不與量測綁在一起（<a href="#/recommend">推薦設定</a>）。</p>`)}</div>
      <div class="col-lg-5">${card('同意紀錄', table(['編號', '版本', '簽署時間', '撤回時間'], history.map(h => [h.id, h.version, h.time, h.revoked || '—'])))}</div></div>`;
  }
});

Object.assign(ACTIONS, {
  signConsent: el => {
    const f = new FormData(el);
    if (!f.get('measure')) return deny('未勾選「量測與儲存」');
    if (f.get('method') === '紙本代簽' && !f.get('proxy').trim()) return deny('代簽必須填寫代簽人');
    DB.consents.push({ id: uid('C'), subject: view.csid, version: DB.consentForms.slice(-1)[0].version, time: nowStr(), method: f.get('method'), proxy: f.get('proxy').trim(), measure: true, research: !!f.get('research'), revoked: '' });
    App.refresh(); toast('已記錄同意', 'success');
  },
  revoke: () => modal('撤回同意', '<p class="mb-0">撤回後將無法再量測。確定撤回？</p>', '<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button><button class="btn btn-danger" data-act="revokeConfirm">撤回</button>'),
  revokeConfirm: () => { activeConsent(view.csid).revoked = nowStr(); closeModal(); App.refresh(); toast('已撤回同意'); },
  newSubject: () => {
    const u = me(), depts = Object.entries(DB.depts).filter(([k]) => u.role !== 'operator' || u.depts.includes(k));
    modal('建立受測者（無登入帳號）', `<form id="newSubjectForm" data-submit="saveSubject">
      <label class="form-label">姓名</label><input class="form-control mb-2" name="name" maxlength="50" required placeholder="可輸入「王示範」測試重複提示">
      <div class="row g-2"><div class="col-4"><label class="form-label">性別</label><select class="form-select" name="sex">${opts(['男', '女'])}</select></div>
      <div class="col-4"><label class="form-label">年齡</label><input class="form-control" type="number" name="age" min="0" max="120" value="40" required></div>
      <div class="col-4"><label class="form-label">單位</label><select class="form-select" name="dept">${opts(depts)}</select></div></div>
      <div id="dupWarn" class="alert alert-warning mt-3 d-none"></div></form>`,
      '<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button><button class="btn btn-primary" form="newSubjectForm">建立</button>');
  },
  saveSubject: el => {
    const f = Object.fromEntries(new FormData(el)), name = f.name.trim();
    if (!name) return deny('請輸入姓名');
    const warn = $('#dupWarn');
    if (DB.subjects.some(s => s.name === name) && warn.dataset.name !== name) {
      warn.dataset.name = name; warn.classList.remove('d-none');
      warn.textContent = `已有同名受測者「${name}」，可能重複。若確認是不同人，請再按一次「建立」。（FR-05）`;
      return;
    }
    const id = uid('S');
    DB.subjects.push({ id, name, sex: f.sex, age: +f.age, dept: f.dept, program: 'office', base: [75, 120, 78, 97, 1], symptoms: false, hasLogin: false });
    view.csid = id; closeModal(); App.refresh(); toast('已建立受測者，請先完成同意', 'success');
  }
});

/* ---------- 量測列表 ---------- */
route('list', {
  title: '健康量測列表', icon: 'list-ul', roles: ['care', 'ohs', 'hadmin'], stage: '1', fr: 'FR-12、13、NFR-05',
  render(el) {
    const subjects = visibleSubjects();
    const kw = (view.kw || '').trim();
    const cols = visibleMetrics();
    const rows = subjects.filter(s => !kw || s.name.includes(kw)).map(s => {
      const r = recordsOf(s.id).slice(-1)[0];
      return [
        `<button class="btn btn-primary btn-sm" data-act="toMeasure" data-id="${s.id}">量測</button> <button class="btn btn-info btn-sm" data-act="toHistory" data-id="${s.id}">歷史</button>`,
        esc(s.name), esc(DB.depts[s.dept]), activeConsent(s.id) ? badge('有效', 'success') : badge('無', 'danger'),
        ...cols.map(m => r ? valueCell(r, m.code) : '—'),
        r ? r.time : '尚未量測', openAlert(s.id) ? sBadge(openAlert(s.id).status) : ''
      ];
    });
    el.innerHTML = card('最近一次量測', `<div class="row mb-3"><div class="col-md-4"><input class="form-control" placeholder="姓名查詢（輸入後按 Enter）" value="${esc(kw)}" data-change="setView" data-key="kw"></div></div>
      ${table(['', '姓名', '單位', '同意', ...cols.map(m => esc(m.name)), '量測時間', '警示'], rows)}
      <p class="small text-muted mt-2 mb-0">只列出目前身分資料範圍內的對象；查看他人資料會寫入查閱紀錄。</p>`);
    subjects.forEach(s => logAccess(s.id, '量測列表'));
  }
});
Object.assign(ACTIONS, {
  toMeasure: el => { view.msid = el.dataset.id; location.hash = '#/measure'; },
  toHistory: el => { view.hsid = el.dataset.id; location.hash = '#/history'; }
});

/* ---------- 個人趨勢 ---------- */
route('history', {
  title: '個人趨勢與基準線', icon: 'graph-up', roles: ['subject', 'care', 'ohs', 'hadmin'], stage: '2～3', fr: 'FR-30～32、34、70～72',
  render(el) {
    const selector = subjectSelect('hsid', visibleSubjects());
    const sid = view.hsid, s = subjectById(sid);
    if (!s) { el.innerHTML = card('', '沒有可查看的對象'); return; }
    logAccess(sid, '個人趨勢');
    const metrics = visibleMetrics();
    if (!metrics.find(m => m.code === view.hm)) view.hm = metrics[0]?.code;
    view.days ??= 30; view.ctx ??= '全部'; view.lowq ??= true; view.period ??= '週'; view.algo ??= 'sim-1.1';
    const m = metricBy(view.hm);
    const inRange = recordsOf(sid).filter(r => dayDiff(DB.today, r.time) < +view.days && (view.ctx === '全部' || r.context === view.ctx) && (view.algo === '全部' || r.algo === view.algo));
    const usable = inRange.filter(r => valueOf(r, view.hm) && (!view.lowq || r.quality >= DB.settings.minQuality));
    const all = stats(usable.map(r => valueOf(r, view.hm).value));
    const enough = enoughForTrend(usable);
    const over = usable.filter(r => ['注意', '警示'].includes(valueOf(r, view.hm).judge)).length;

    // 基準線與趨勢提示須同情境
    let baseline = '<span class="text-muted">請先選定單一情境才能計算基準線。</span>';
    if (view.ctx !== '全部') {
      const recent = usable.slice(-DB.settings.baselineN);
      if (!enoughForTrend(recent)) baseline = '<span class="text-muted">資料不足，不計算基準線。</span>';
      else {
        const st = stats(recent.map(r => valueOf(r, view.hm).value));
        const last3 = stats(usable.slice(-3).map(r => valueOf(r, view.hm).value));
        const diff = Math.round((last3.median - st.median) * 100) / 100;
        baseline = `最近 ${st.n} 次「${esc(view.ctx)}」有效量測：中位數 <strong>${st.median}</strong> ${m.unit}，波動（標準差）${st.sd}。<br>最近 3 次中位數比個人基準${diff === 0 ? '相同' : diff > 0 ? `高 ${diff}` : `低 ${-diff}`}（比較期間 ${usable.slice(-3)[0].time.slice(0, 10)}～${usable.slice(-1)[0].time.slice(0, 10)}，樣本 3 次）。`;
      }
    }

    const key = r => view.period === '日' ? r.time.slice(0, 10) : view.period === '月' ? r.time.slice(0, 7) : (() => { const d = new Date(r.time.slice(0, 10) + 'T00:00:00'); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return `${d.getMonth() + 1}/${d.getDate()} 當週`; })();
    const groups = {};
    usable.forEach(r => (groups[key(r)] ??= []).push(r));
    const summary = Object.entries(groups).reverse().map(([k, rs]) => {
      const st = stats(rs.map(r => valueOf(r, view.hm).value));
      const o = rs.filter(r => ['注意', '警示'].includes(valueOf(r, view.hm).judge)).length;
      return [k, st.n, st.mean, st.median, st.min, st.max, st.sd, Math.round(o / st.n * 100) + '%'];
    });

    // 運動前→中→後（FR-32）：同一天依序配對
    const phases = ['運動前', '運動中', '運動後'];
    const exercise = phases.map(p => stats(recordsOf(sid).filter(r => r.context === p && valueOf(r, view.hm) && r.quality >= DB.settings.minQuality).map(r => valueOf(r, view.hm).value)));

    el.innerHTML = `${DISCLAIMER}${card('', `<div class="row g-2 align-items-end">
        <div class="col-md-3">${selector}</div>
        <div class="col-md-2"><label class="form-label">指標</label><select class="form-select" data-change="setView" data-key="hm">${opts(metrics.map(x => [x.code, x.name]), view.hm)}</select></div>
        <div class="col-md-2"><label class="form-label">期間</label><select class="form-select" data-change="setView" data-key="days">${opts([[7, '近 7 天'], [30, '近 30 天'], [90, '近 90 天']], view.days)}</select></div>
        <div class="col-md-2"><label class="form-label">情境</label><select class="form-select" data-change="setView" data-key="ctx">${opts(['全部', ...new Set(recordsOf(sid).map(r => r.context))], view.ctx)}</select></div>
        <div class="col-md-2"><label class="form-label">演算法版本</label><select class="form-select" data-change="setView" data-key="algo">${opts(['sim-1.1', 'sim-1.0', '全部'], view.algo)}</select></div>
        <div class="col-md-1"><label class="form-check"><input type="checkbox" class="form-check-input" data-change="setView" data-key="lowq" ${view.lowq ? 'checked' : ''}><span class="form-check-label small">排除低品質</span></label></div></div>
        ${view.algo === '全部' ? '<div class="alert alert-warning py-2 small mt-2 mb-0">不同演算法版本的數值分開畫線，不串成同一條趨勢。</div>' : ''}`)}
      <div class="row">
        <div class="col-lg-8">${card(`${esc(m?.name)} 趨勢（${m?.unit}）`, usable.length ? '<div class="chart-box"><canvas id="trend"></canvas></div><div class="small text-muted mt-1">虛線為各次量測當時適用的門檻（橘＝注意、紅＝警示）。</div>' : '<div class="text-muted">此條件沒有可用資料</div>')}</div>
        <div class="col-lg-4">${card('期間摘要', all ? `<div class="stat">${all.median} <small class="fs-6">中位數</small></div><div>有效樣本 ${all.n} 次｜平均 ${all.mean}｜${all.min}～${all.max}｜超出門檻 ${Math.round(over / all.n * 100)}%</div>
          ${enough ? '' : `<div class="alert alert-warning py-2 small mt-2 mb-0"><strong>資料不足</strong>：需至少 ${DB.settings.trendMinDays} 天、${DB.settings.trendMinCount} 次有效量測，不做趨勢結論。</div>`}` : '<span class="text-muted">資料不足</span>')}${card('個人基準線', baseline)}</div>
      </div>
      ${card(`彙總（${view.period}）`, table(['期間', '有效樣本', '平均', '中位數', '最小', '最大', '標準差', '超出門檻'], summary),
        ['日', '週', '月'].map(p => `<button class="btn btn-sm ${view.period === p ? 'btn-primary' : 'btn-outline-primary'}" data-act="setView" data-key="period" data-value="${p}">${p}</button>`).join(' '))}
      ${exercise.some(Boolean) ? card('運動前／中／後比較（FR-32）', table(['階段', '有效樣本', '中位數', '最小～最大'], phases.map((p, i) => exercise[i] ? [p, exercise[i].n, exercise[i].median, `${exercise[i].min}～${exercise[i].max}`] : [p, 0, '資料不足', '—'])) + '<p class="small text-muted mb-0 mt-2">僅描述差異；沒有記錄運動強度的數值無法互相比較。</p>') : ''}
      ${card('量測紀錄', table(['時間', '情境', ...metrics.map(x => esc(x.name)), '品質', '版本', '判定使用門檻'], [...inRange].reverse().slice(0, 15).map(r => [r.time, r.context, ...metrics.map(x => valueCell(r, x.code)), r.quality < DB.settings.minQuality ? badge(r.quality + ' 低', 'warning') : r.quality, r.algo, `<small>${r.values[view.hm]?.thr ?? '—'}</small>`])),
        '<button class="btn btn-sm btn-outline-success no-print" data-act="exportPersonal"><i class="bi bi-file-earmark-spreadsheet me-1"></i>匯出 CSV</button> <button class="btn btn-sm btn-outline-secondary no-print" data-act="printPage">列印／PDF</button>')}`;

    if (usable.length) {
      const labels = usable.map(r => r.time.slice(5, 16));
      const line = (label, color, data, extra = {}) => Object.assign({ label, data, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 3, tension: .2 }, extra);
      const algos = [...new Set(usable.map(r => r.algo))];
      const sets = algos.map((a, i) => line(`量測值（${a}）`, [moduleById('health').color, '#31607a'][i % 2], usable.map(r => r.algo === a ? valueOf(r, view.hm).value : null), { spanGaps: false }));
      const ths = usable.map(r => findThreshold(view.hm, s, r.context, r.site, r.time.slice(0, 10)));
      [['watchHi', '注意上限', '#d97706'], ['watchLo', '注意下限', '#d97706'], ['alertHi', '警示上限', '#dc2626'], ['alertLo', '警示下限', '#dc2626']].forEach(([k, label, color]) => {
        const data = ths.map(t => t?.[k] ?? null);
        const values = usable.map(r => valueOf(r, view.hm).value), lo = Math.min(...values), hi = Math.max(...values), pad = (hi - lo || 1) * 1.5;
        if (data.some(v => v != null && v >= lo - pad && v <= hi + pad)) sets.push(line(label, color, data, { borderDash: [6, 4], pointRadius: 0, borderWidth: 1 }));
      });
      // 圖例畫成線段，虛線門檻在圖例中也呈現虛線
      // 使用線段圖例時，Chart.js 取的是資料點樣式，虛線設定要自己帶入
      const legendLabels = c => Chart.defaults.plugins.legend.labels.generateLabels(c).map(item => Object.assign(item, { lineDash: c.data.datasets[item.datasetIndex].borderDash || [], lineWidth: 2 }));
      chart('trend', { type: 'line', data: { labels, datasets: sets }, options: { plugins: { legend: { labels: { usePointStyle: true, pointStyle: 'line', pointStyleWidth: 32, generateLabels: legendLabels } } } } });
    }
  }
});
Object.assign(ACTIONS, {
  printPage: () => window.print(),
  exportPersonal: () => {
    const sid = view.hsid, cols = visibleMetrics().filter(m => m.level !== '實驗中');
    exportCsv(`個人報表_${sid}`, [['量測編號', '時間', '情境', ...cols.map(m => m.name), '品質', '演算法版本', '裝置', '操作者', '同意紀錄', '備註'],
      ...recordsOf(sid).map(r => [r.id, r.time, r.context, ...cols.map(m => valueOf(r, m.code)?.value ?? '無法估測'), r.quality, r.algo, r.device, r.operator, r.consent, '估測值，僅供健康管理參考，非醫療診斷'])]);
  }
});

/* ---------- 生活紀錄（FR-73） ---------- */
route('lifelog', {
  title: '生活紀錄', icon: 'journal-text', roles: ['subject'], stage: '3', fr: 'FR-73',
  render(el) {
    const sid = me().subject, s = subjectById(sid);
    el.innerHTML = `<div class="row"><div class="col-lg-5">${card('今日自填（自願填寫）', `<form data-submit="saveLife">
        <div class="row g-2"><div class="col-6"><label class="form-label">睡眠時數</label><input class="form-control" type="number" min="0" max="24" step="0.5" name="sleep" value="7"></div>
        <div class="col-6"><label class="form-label">咖啡因（杯）</label><input class="form-control" type="number" min="0" max="20" name="caffeine" value="1"></div>
        <div class="col-12"><label class="form-label">運動</label><input class="form-control" name="exercise" maxlength="50"></div>
        <div class="col-12"><label class="form-label">用藥</label><input class="form-control" name="med" maxlength="50"></div>
        <div class="col-12"><label class="form-label">身體不適</label><input class="form-control" name="discomfort" maxlength="100" placeholder="沒有則留空"></div></div>
        <button class="btn btn-primary mt-3">儲存</button></form>`)}
      ${card('目前不適狀態', `<label class="form-check form-switch"><input class="form-check-input" type="checkbox" data-change="symptom" ${s.symptoms ? 'checked' : ''}><span class="form-check-label">我目前有身體不適（開啟後停止商品推薦）</span></label>${s.symptoms ? EMERGENCY : ''}`)}</div>
      <div class="col-lg-7">${card('我的紀錄', table(['日期', '睡眠', '咖啡因', '運動', '用藥', '不適'], DB.lifelogs.filter(l => l.subject === sid).map(l => [l.date, l.sleep, l.caffeine, esc(l.exercise || '—'), esc(l.med || '—'), esc(l.discomfort || '無')])) + '<p class="small text-muted mt-2 mb-0">僅用於與趨勢對照；關聯不等於因果。</p>')}</div></div>`;
  }
});
Object.assign(ACTIONS, {
  saveLife: el => {
    const f = Object.fromEntries(new FormData(el));
    DB.lifelogs.unshift(Object.assign(f, { subject: me().subject, date: DB.today }));
    if (f.discomfort.trim() && f.discomfort.trim() !== '無') subjectById(me().subject).symptoms = true;
    App.refresh(); toast('已儲存', 'success');
  },
  symptom: el => { subjectById(me().subject).symptoms = el.checked; App.refresh(); }
});

/* ---------- 現場機台模式（FR-53） ---------- */
let kioskTimer = null;
const KIOSK_IDLE_SEC = 30;   // 確認畫面無人操作的清除秒數（示範值，待確認）
const KIOSK_RESULT_SEC = 15; // 結果畫面的清除秒數
function kioskCountdown(seconds) {
  let left = seconds;
  kioskTimer = setInterval(() => {
    const t = $('#kioskLeft');
    if (!t) return clearInterval(kioskTimer);
    t.textContent = --left;
    if (left <= 0) ACTIONS.kioskClear();
  }, 1000);
}
/** 識別畫面：輸入後沒按確認就走開時清空，下一位看不到。每次輸入重新計時。 */
function kioskWatchInput(input) {
  input.addEventListener('input', () => {
    clearTimeout(kioskTimer);
    kioskTimer = setTimeout(() => { input.value = ''; }, KIOSK_IDLE_SEC * 1000);
  });
}
/** 不論用什麼方式離開機台頁，都不保留前一人的狀態（共用機台）。由 App.render 呼叫。 */
function kioskReset() { clearInterval(kioskTimer); delete view.kiosk; }
route('kiosk', {
  title: '現場機台模式', icon: 'display', roles: ['operator', 'hadmin'], stage: '3', fr: 'FR-53',
  render(el) {
    clearInterval(kioskTimer);
    const k = view.kiosk ??= { step: 'id' };
    let body = '';
    if (k.step === 'id') {
      body = `<h2>請刷員工證或掃 QR Code</h2><p class="text-muted fs-6">不使用臉部辨識認人。示範：輸入 S01、S03、S15（未同意）</p>
        <form data-submit="kioskId"><input class="form-control form-control-lg text-center mb-3" name="code" maxlength="10" autocomplete="off" autofocus><button class="btn btn-primary w-100">確認</button></form><p class="text-muted fs-6 mt-3 mb-0">輸入後 ${KIOSK_IDLE_SEC} 秒內未按確認，自動清除輸入內容</p>`;
    } else if (k.step === 'ready') {
      body = `<h2>${esc(subjectById(k.sid).name)}，您好</h2><div class="cam my-3">${camSvg()}</div><p>請坐正，臉部對準框內，保持不動</p><button class="btn btn-primary w-100" data-act="kioskRun">開始量測</button><p class="text-muted fs-6 mt-3 mb-0"><span id="kioskLeft">${KIOSK_IDLE_SEC}</span> 秒內未開始，自動清除畫面</p>`;
    } else {
      const r = DB.records.find(x => x.id === k.rid), a = k.aid ? DB.alerts.find(x => x.id === k.aid) : null;
      body = `<div class="text-start">${resultHtml(r, a)}</div><p><span id="kioskLeft">${KIOSK_RESULT_SEC}</span> 秒後自動清除畫面</p><button class="btn btn-secondary w-100" data-act="kioskClear">完成，清除畫面</button>`;
    }
    el.innerHTML = `<div class="kiosk-box">${card('', body)}<a href="#/home" class="small" data-act="kioskExit">離開機台模式</a><div class="mt-3"><span class="proto-tag">雛型，虛構資料</span></div></div>`;
    if (k.step === 'id') kioskWatchInput($('[name=code]', el));
    else kioskCountdown(k.step === 'ready' ? KIOSK_IDLE_SEC : KIOSK_RESULT_SEC);
  }
});
Object.assign(ACTIONS, {
  kioskId: el => {
    const sid = new FormData(el).get('code').trim().toUpperCase();
    if (!measurableSubjects().some(s => s.id === sid)) return deny('查無此識別碼，或不在本場域');
    const reason = serverCheck(sid, 'normal');
    if (reason) return deny(reason);
    view.kiosk = { step: 'ready', sid }; App.render();
  },
  kioskRun: () => {
    const { record, alert } = runMeasurement(view.kiosk.sid, { context: '上工前', mode: '快速', device: 'CAM-A01', scenario: 'normal' });
    view.kiosk = { step: 'result', rid: record.id, aid: alert?.id }; App.render();
  },
  kioskClear: () => { clearInterval(kioskTimer); view.kiosk = { step: 'id' }; App.render(); },
  kioskExit: kioskReset
});
