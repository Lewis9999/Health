/* 警示與處置、群體統計、管理儀表板、工地熱危害、高齡運動復健 */
'use strict';

route('alerts', {
  title: '警示與處置', icon: 'bell', roles: ['care', 'ohs', 'hadmin'], stage: '2', fr: 'FR-40～44',
  render(el) {
    const ids = visibleSubjects().map(s => s.id);
    const list = DB.alerts.filter(a => ids.includes(a.subject));
    const mine = DB.notifications.filter(n => n.to === me().id && openAlertById(n.alert));
    const overdue = a => a.status !== '已結案' && a.notified && Date.now() - a.createdAt > DB.settings.overdueHours * 3600000;
    const q = workQueue('alerts', list, WORK.alert);
    el.innerHTML = `<div class="alert alert-danger py-2"><i class="bi bi-telephone-fill me-1"></i>當事人身體不適時直接啟動緊急應變（119、現場急救人員分機 0000 示範），<strong>系統不能當作唯一的安全監控手段</strong>。</div>
      ${card('我的站內通知', mine.length ? `<ul class="mb-0">${mine.map(n => `<li>${n.time}　${esc(n.text)}</li>`).join('')}</ul>` : '<span class="text-muted">沒有待處理通知</span>')}
      ${card('警示事件', q.wrap(`<div class="sticky-action">${table(['編號', '狀態', '時間', '對象', '指標', ''], q.items.map(a => [a.id + q.tag(a), sBadge(a.status) + (overdue(a) || a.reminded ? ' ' + badge('逾時', 'danger') : ''), a.time, esc(subjectById(a.subject).name), a.metrics.map(c => esc(metricBy(c).name)).join('、'), openButton('openAlertDetail', a.id, WORK.alert(a))]), '目前沒有警示')}</div>`),
        q.tools + '<button class="btn btn-sm btn-outline-secondary" data-act="remind">模擬逾時提醒</button>')}
      ${mailCard()}
      <p class="small text-muted">警示與處置畫面不放任何商品或廣告（FR-85）。品質不合格的量測只提示重測，不產生警示。</p>`;
  }
});

/** 電子郵件為可選管道（FR-42）。雛型只列出寄送內容，不寄出任何郵件；內容同站內通知，不含生理數值。 */
function mailCard() {
  const admin = me().role === 'hadmin';
  const mails = DB.mails.filter(m => admin || m.to === me().id);
  const toggle = admin ? `<label class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" data-change="emailNotify" ${DB.settings.emailNotify ? 'checked' : ''}><span class="form-check-label">警示通知同時寄送電子郵件（只影響之後的通知）</span></label>` : '';
  return card('電子郵件寄送紀錄（模擬，不會寄出）', `${toggle}<p class="small text-muted">目前${DB.settings.emailNotify ? '已啟用' : '未啟用，由健康管理員開啟'}。</p>${table(['時間', '收件人', '主旨', '內容'], mails.slice(0, 10).map(m => [m.time, esc(userName(m.to)), esc(m.subject), esc(m.text)]), '尚無寄送紀錄')}`);
}

Object.assign(ACTIONS, {
  emailNotify: el => { DB.settings.emailNotify = el.checked; App.refresh(); },
  remind: () => {
    const ids = visibleSubjects().map(s => s.id);
    const targets = DB.alerts.filter(a => ids.includes(a.subject) && a.status !== '已結案' && a.notified);
    targets.forEach(a => { a.reminded = true; a.history.push({ time: nowStr(), by: '系統', text: `超過 ${DB.settings.overdueHours} 小時未結案，再次提醒負責人` }); notifyAlert(a); });
    App.refresh(); toast(targets.length ? `已對 ${targets.length} 件再次提醒` : '沒有逾時案件');
  },
  openAlertDetail: el => {
    const a = DB.alerts.find(x => x.id === el.dataset.id), s = subjectById(a.subject), r = DB.records.find(x => x.id === a.record);
    logAccess(s.id, `警示 ${a.id}`);
    const body = `<p><strong>${esc(s.name)}</strong>（${esc(DB.depts[s.dept])}）｜${sBadge(a.status)}｜量測 ${r.id} ${r.time} ${esc(r.context)}</p>
      ${table(['指標', '值', '判定', '當時門檻'], a.metrics.map(c => { const v = r.values[c]; return v ? [esc(metricBy(c).name), v.value, judgeMark(v.judge), v.thr] : [esc(metricBy(c).name), '見複測紀錄', '—', '—']; }))}
      <h6 class="mt-3">處理歷程</h6><ul class="small">${a.history.map(h => `<li>${h.time}　${esc(h.by)}：${esc(h.text)}</li>`).join('')}</ul>
      ${a.status !== '已結案' ? `<form id="alertForm" data-submit="alertAction" data-id="${a.id}">
        <div class="row g-2"><div class="col-sm-5"><label class="form-label">處理方式</label><select class="form-select" name="way">${opts(['已確認當事人狀況', '安排休息並複測', '建議就醫', '啟動緊急應變', '判定為量測干擾'])}</select></div>
        <div class="col-sm-7"><label class="form-label">備註（結案必填）</label><input class="form-control" name="note" maxlength="200"></div></div>
        <label class="form-check mt-2"><input class="form-check-input" type="checkbox" name="close"><span class="form-check-label">結案</span></label></form>` : ''}`;
    modal(`警示 ${a.id}`, body, a.status !== '已結案' ? '<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button><button class="btn btn-primary" form="alertForm">儲存處置</button>' : undefined);
  },
  alertAction: el => {
    const a = DB.alerts.find(x => x.id === el.dataset.id), f = Object.fromEntries(new FormData(el));
    if (f.close && !f.note.trim()) return deny('結案必須填寫備註');
    a.history.push({ time: nowStr(), by: me().name, text: f.way + (f.note.trim() ? `：${f.note.trim()}` : '') + (f.close ? '（結案）' : '') });
    a.status = f.close ? '已結案' : '處理中';
    closeModal(); App.refresh(); toast('已儲存處置紀錄', 'success');
  }
});

/* ---------- 群體統計（FR-33） ---------- */
function groupFilter(f, deptScope) {
  return DB.subjects.filter(s => deptScope.includes(s.dept) && (f.dept === '全部' || s.dept === f.dept) && (f.age === '全部' || ageGroup(s.age) === f.age) && (f.sex === '全部' || s.sex === f.sex));
}
/** 小群組不顯示；若「上層範圍扣掉本次篩選」剩 1～4 人也不顯示，避免相減推出個人（FR-74）。 */
function suppression(f, scope) {
  const min = DB.settings.smallGroup;
  const withData = list => list.filter(s => recordsOf(s.id).some(r => dayDiff(DB.today, r.time) < 30)).length;
  const n = withData(groupFilter(f, scope));
  if (n < min) return `符合條件且有資料的人數少於 ${min} 人，不顯示以避免推知個人。`;
  const active = ['dept', 'age', 'sex'].filter(k => f[k] !== '全部');
  for (const k of active) {
    const diff = withData(groupFilter({ ...f, [k]: '全部' }, scope)) - n;
    if (diff > 0 && diff < min) return `此篩選與上層範圍相減只剩 ${diff} 人，可能推出個人，不顯示。`;
  }
  return '';
}

route('group', {
  title: '群體統計（去識別）', icon: 'people', roles: ['manager', 'ohs', 'hadmin'], stage: '2', fr: 'FR-33、34',
  render(el) {
    const u = me(), scope = u.depts || Object.keys(DB.depts);
    const f = { dept: view.gdept ?? '全部', age: view.gage ?? '全部', sex: view.gsex ?? '全部' };
    view.gm ??= 'SBP';
    const metrics = visibleMetrics().filter(m => m.level !== '實驗中');
    if (!metrics.find(m => m.code === view.gm)) view.gm = metrics[0]?.code;
    const filters = card('', `<div class="row g-2"><div class="col-md-3"><label class="form-label">單位</label><select class="form-select" data-change="setView" data-key="gdept">${opts([['全部', '全部（可視範圍）'], ...scope.map(d => [d, DB.depts[d]])], f.dept)}</select></div>
      <div class="col-md-3"><label class="form-label">年齡層</label><select class="form-select" data-change="setView" data-key="gage">${opts(['全部', '39歲以下', '40–64歲', '65歲以上'], f.age)}</select></div>
      <div class="col-md-3"><label class="form-label">性別</label><select class="form-select" data-change="setView" data-key="gsex">${opts(['全部', '男', '女'], f.sex)}</select></div>
      <div class="col-md-3"><label class="form-label">指標</label><select class="form-select" data-change="setView" data-key="gm">${opts(metrics.map(m => [m.code, m.name]), view.gm)}</select></div></div>`);
    const reason = suppression(f, scope);
    if (reason) { el.innerHTML = filters + card('', `<div class="alert alert-warning mb-0"><i class="bi bi-eye-slash me-1"></i>${reason}</div>`) + '<p class="small text-muted">可試：單位選「行政部」（少於 5 人）。</p>'; return; }

    const people = groupFilter(f, scope);
    const recs = people.flatMap(s => recordsOf(s.id)).filter(r => dayDiff(DB.today, r.time) < 30);
    const measured = new Set(recs.map(r => r.subject)).size;
    // 以「每人中位數」做分布，避免量測次數多的人權重過大
    const perPerson = people.map(s => stats(recs.filter(r => r.subject === s.id && valueOf(r, view.gm) && r.quality >= DB.settings.minQuality).map(r => valueOf(r, view.gm).value))?.median).filter(v => v != null);
    const st = stats(perPerson);
    const alertCount = DB.alerts.filter(a => people.some(s => s.id === a.subject)).length;
    const hide = c => c > 0 && c < DB.settings.smallGroup ? `<${DB.settings.smallGroup}` : c;
    // 依通用門檻分三類；不用實際最小、最大值當區間端點，避免露出個人數值
    const thr = DB.thresholds.filter(t => t.metric === view.gm && t.ageGroup === '全部' && t.sex === '全部' && t.context === '全部' && t.site === '全部').sort((a, b) => b.version - a.version)[0];
    const labels = ['低於注意下限', '注意範圍內', '高於注意上限'];
    const hist = [0, 0, 0];
    perPerson.forEach(v => hist[thr?.watchLo != null && v < thr.watchLo ? 0 : thr?.watchHi != null && v > thr.watchHi ? 2 : 1]++);
    // 次級抑制：只要有一格人數過少，就整組不列人數，避免用總數相減推回
    const small = hist.some(c => c > 0 && c < DB.settings.smallGroup);
    const shown = hist.map(c => small ? (c === 0 || c >= DB.settings.smallGroup ? '不顯示' : hide(c)) : c);
    el.innerHTML = `${filters}<div class="row">
      ${[['量測率（近30天）', Math.round(measured / people.length * 100) + '%'], ['有量測人數', measured], ['每人中位數之中位數', st ? st.median : '資料不足'], ['警示件數', hide(alertCount)]].map(([t, v]) => `<div class="col-6 col-md-3">${card('', `<div class="small text-muted">${t}</div><div class="stat">${v}</div>`)}</div>`).join('')}</div>
      ${card(`${esc(metricBy(view.gm).name)} 分布（以每人中位數計，依門檻 ${thrText(thr)} 分類）`, `${small ? `<div class="alert alert-warning py-2 small">有分類人數少於 ${DB.settings.smallGroup} 人，不繪圖；其他非零分類一併不顯示，避免用總數相減推回。</div>` : '<div class="chart-box"><canvas id="dist"></canvas></div>'}${table(['分類', '人數'], labels.map((l, i) => [l, esc(shown[i])]))}<p class="small text-muted mt-2 mb-0">不提供個人下鑽。</p>`,
        '<button class="btn btn-sm btn-outline-success no-print" data-act="exportGroup">匯出彙總 CSV</button> <button class="btn btn-sm btn-outline-secondary no-print" data-act="printPage">列印／PDF</button>')}`;
    view.groupExport = { name: view.gm, rows: [['分類', '人數'], ...labels.map((l, i) => [l, shown[i]])] };
    if (!small) chart('dist', { type: 'bar', data: { labels, datasets: [{ label: '人數', data: hist, backgroundColor: moduleById('health').color }] }, options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
  }
});
ACTIONS.exportGroup = () => exportCsv(`群體彙總_${view.groupExport.name}`, view.groupExport.rows);

/* ---------- 管理儀表板（FR-74） ---------- */
route('dashboard', {
  title: '管理儀表板', icon: 'speedometer2', roles: ['manager', 'hadmin'], stage: '3', fr: 'FR-74',
  render(el) {
    const scope = me().depts || Object.keys(DB.depts);
    const recs = DB.records.filter(r => r.ok && scope.includes(subjectById(r.subject).dept) && dayDiff(DB.today, r.time) < 56);
    const weeks = Array.from({ length: 8 }, (_, i) => 7 - i);
    const inWeek = w => recs.filter(r => Math.floor(dayDiff(DB.today, r.time) / 7) === w);
    const active = w => new Set(inWeek(w).map(r => r.subject));
    const retained = [...active(1)].filter(x => active(0).has(x)).length;
    const mask = n => n > 0 && n < DB.settings.smallGroup ? null : n;
    el.innerHTML = `<div class="row">${[['近 7 天活躍人數', mask(active(0).size) ?? '<5'], ['近 7 天量測次數', inWeek(0).length], ['人均每週量測', active(0).size >= DB.settings.smallGroup ? (inWeek(0).length / active(0).size).toFixed(1) : '—'], ['週留存', active(1).size >= DB.settings.smallGroup ? Math.round(retained / active(1).size * 100) + '%' : '—']].map(([t, v]) => `<div class="col-6 col-md-3">${card('', `<div class="small text-muted">${t}</div><div class="stat">${v}</div>`)}</div>`).join('')}</div>
      <div class="row"><div class="col-lg-6">${card('每週活躍人數', '<div class="chart-box"><canvas id="d1"></canvas></div>')}</div><div class="col-lg-6">${card('每週量測次數', '<div class="chart-box"><canvas id="d2"></canvas></div>')}</div></div>
      <p class="small text-muted">僅彙總。人數少於 ${DB.settings.smallGroup} 的資料點不顯示。營運指標另見「銷售分析」；不把「異常人數」設為業績指標。</p>`;
    const labels = weeks.map(w => w === 0 ? '本週' : `${w} 週前`);
    chart('d1', { type: 'line', data: { labels, datasets: [{ label: '活躍人數', data: weeks.map(w => mask(active(w).size)), borderColor: moduleById('health').color }] }, options: { scales: { y: { beginAtZero: true } } } });
    chart('d2', { type: 'bar', data: { labels, datasets: [{ label: '量測次數', data: weeks.map(w => inWeek(w).length), backgroundColor: moduleById('health').color }] } });
  }
});

/* ---------- 工地熱危害（FR-50、51） ---------- */
function wbgtLevel(v) {
  // 示範分級；公式與分級須依現行職安規定，上線前由職安人員確認
  if (v >= 32) return ['danger', '第三級（示範）', '評估暫停戶外高強度作業；增加休息、陰涼處待命並加強巡視。'];
  if (v >= 30) return ['warning', '第二級（示範）', '縮短連續作業時間、安排輪休與定時補水。'];
  if (v >= 28) return ['info', '第一級（示範）', '提醒補水，注意新進與未熱適應人員。'];
  return ['success', '一般（示範）', '維持例行提醒。'];
}
route('worksite', {
  title: '職場／工地健康', icon: 'cone-striped', roles: ['ohs', 'hadmin'], stage: '3', fr: 'FR-50、51',
  render(el) {
    const people = visibleSubjects().filter(s => s.program === 'worksite');
    const latest = DB.wbgt[0], [color, level, advice] = wbgtLevel(latest.wbgt);
    const done = (sid, ctx) => recordsOf(sid).find(r => r.time.startsWith(DB.today) && r.context === ctx);
    const missing = people.filter(s => !done(s.id, '上工前'));
    people.forEach(s => logAccess(s.id, '工地排程'));
    el.innerHTML = `${pageNote('分級與建議為示範值；<strong>未完成場域驗證前不用於停工等安全決定，數值不得用於考核或人事決定</strong>。', 'WBGT 分級與處置建議為示範值，公式與分級須依現行職安規定並由職安人員確認。血壓、血氧、乳酸完成場域驗證前，不用於停工等安全決定。數值不得用於考核或人事決定。')}
      <div class="row"><div class="col-lg-5">${card('環境與熱危害', `<div class="stat">WBGT ${latest.wbgt} °C <span class="badge text-bg-${color} fs-6">${level}</span></div><div>氣溫 ${latest.temp} °C｜濕度 ${latest.rh}%｜${esc(latest.site)}｜${latest.time}（${latest.source}）</div><div class="cite mt-2">${advice}</div>
        <form data-submit="saveWbgt" class="row g-2 mt-2"><div class="col-4"><input class="form-control" type="number" step="0.1" min="0" max="50" name="wbgt" placeholder="WBGT" required></div><div class="col-3"><input class="form-control" type="number" step="0.1" name="temp" placeholder="氣溫" required></div><div class="col-3"><input class="form-control" type="number" min="0" max="100" name="rh" placeholder="濕度%" required></div><div class="col-2"><button class="btn btn-primary w-100">記錄</button></div></form>`)}
        ${card('環境讀數紀錄', table(['時間', 'WBGT', '氣溫', '濕度', '來源'], DB.wbgt.slice(0, 6).map(w => [w.time, w.wbgt, w.temp, w.rh + '%', w.source])))}</div>
      <div class="col-lg-7">${card('今日班別量測狀況（日班）', table(['人員', '上工前 07:30', '休息後 13:00', '警示'], people.map(s => [esc(s.name), done(s.id, '上工前') ? badge('已量測', 'success') : badge('未量測', 'warning'), done(s.id, '休息後') ? badge('已量測', 'success') : badge('未量測', 'secondary'), openAlert(s.id) ? sBadge(openAlert(s.id).status) : '—'])))}
        ${card(`上工前未量測名單（${missing.length} 人）`, `${missing.map(s => badge(s.name + (activeConsent(s.id) ? '' : '（未同意）'), activeConsent(s.id) ? 'light' : 'secondary')).join(' ') || '全部完成'}<p class="small text-muted mt-2 mb-0">未同意者無法量測，應提供替代方式，不得因此不利對待。</p>`)}</div></div>`;
  }
});
ACTIONS.saveWbgt = el => {
  const f = Object.fromEntries(new FormData(el));
  DB.wbgt.unshift({ time: nowStr(), site: '橋梁工地 A 區', wbgt: +f.wbgt, temp: +f.temp, rh: +f.rh, source: '手動輸入' });
  App.refresh(); toast('已記錄環境讀數', 'success');
};

/* ---------- 長照據點（應用場景延伸；FR-53、54） ---------- */
const lastRecord = sid => recordsOf(sid).at(-1);
function worstJudge(r) {
  const js = Object.values(r?.values || {}).map(v => v.judge);
  return js.includes('警示') ? '警示' : js.includes('注意') ? '注意' : js.includes('正常') ? '正常' : '—';
}
/** 關懷提示：只回答「今天先關心誰」，不做照護或醫療判斷。 */
function careReasons(s) {
  const r = lastRecord(s.id), reasons = [];
  const days = r ? dayDiff(DB.today, r.time) : null;
  if (days == null) reasons.push('尚無量測紀錄');
  else if (days > DB.settings.daycareAbsentDays) reasons.push(`${days} 天未報到`);
  if (openAlert(s.id)) reasons.push('有未結案警示');
  if (s.symptoms) reasons.push('填報身體不適');
  const flagged = recordsOf(s.id).slice(-3).filter(x => ['注意', '警示'].includes(worstJudge(x))).length;
  if (flagged >= 2) reasons.push(`近 3 次有 ${flagged} 次「注意」以上`);
  return reasons;
}
route('daycare', {
  title: '長照據點', icon: 'house-heart', roles: ['care', 'hadmin'], stage: '延伸', fr: 'FR-53、54',
  render(el) {
    const people = visibleSubjects().filter(s => s.program === 'daycare');
    if (!people.length) { el.innerHTML = card('', '<span class="text-muted">你沒有被指派據點長輩。可切換成「據點社工小安」。</span>'); return; }
    people.forEach(s => logAccess(s.id, '據點報到'));
    const watch = people.map(s => [s, careReasons(s)]).filter(([, r]) => r.length);
    const families = people.filter(s => DB.family[s.id]);
    const msgs = DB.familyMsgs.filter(m => people.some(s => s.id === m.subject));
    el.innerHTML = `${pageNote('關懷提示只決定先關心誰，<strong>不是照護或醫療判斷</strong>。', '關懷提示只用來決定「今天先關心誰」，不是照護或醫療判斷。數值為估測值，完成場域驗證前不作為照護決定。家屬通知不含任何生理數值。')}
      <div class="row"><div class="col-lg-5">${card(`今日關懷名單（${watch.length} 人）`, watch.length ? `<ul class="list-unstyled mb-0">${watch.map(([s, r]) => `<li class="mb-2"><strong>${esc(s.name)}</strong><div>${r.map(x => badge(x, 'warning')).join(' ')}</div></li>`).join('')}</ul>` : '<span class="text-muted">目前沒有需要優先關心的長輩</span>')}
        ${card('家屬通知（FR-54，模擬）', `${table(['長輩', '家屬', '檢視授權', ''], families.map(s => { const f = DB.family[s.id]; return [esc(s.name), esc(f.name), `<label class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" data-change="familyView" data-sid="${s.id}" ${f.view ? 'checked' : ''}><span class="form-check-label small">${f.view ? '已授權' : '未授權'}</span></label>`, `<button class="btn btn-sm btn-outline-primary text-nowrap" data-act="familyNotify" data-sid="${s.id}">通知家屬</button>`]; }))}
          <p class="small text-muted mt-2">授權依本人或代簽人的書面授權登錄。通知只有本週報到次數。</p>${table(['時間', '收件家屬', '內容'], msgs.slice(0, 6).map(m => [m.time, esc(m.to), esc(m.text)]), '尚無通知紀錄')}`)}</div>
      <div class="col-lg-7">${card('報到與量測', table(['長輩', '最近量測', '最近判定', ''], people.map(s => { const r = lastRecord(s.id); return [esc(s.name) + (activeConsent(s.id)?.proxy ? ' <small class="text-muted">（家屬代簽）</small>' : ''), r ? `${r.time.slice(0, 10)}（${dayDiff(DB.today, r.time)} 天前）` : '—', judgeMark(worstJudge(r)), `<button class="btn btn-sm btn-primary text-nowrap" data-act="daycareMeasure" data-sid="${s.id}">量測</button>`]; })) + '<p class="small text-muted mt-2 mb-0">家屬代簽的長輩沒有個人帳號，也不開放個人化商品推薦。</p>')}</div></div>`;
  }
});
Object.assign(ACTIONS, {
  daycareMeasure: el => { view.msid = el.dataset.sid; view.context = '靜止'; view.device = 'CAM-D01'; location.hash = '#/measure'; },
  familyView: el => { DB.family[el.dataset.sid].view = el.checked; App.refresh(); toast('已更新家屬檢視授權', 'success'); },
  familyNotify: el => {
    const s = subjectById(el.dataset.sid), f = DB.family[s.id];
    if (!f?.view) return deny('家屬未獲檢視授權，不能通知');
    const n = recordsOf(s.id).filter(r => dayDiff(DB.today, r.time) < 7).length;
    DB.familyMsgs.unshift({ time: nowStr(), subject: s.id, to: f.name, text: `${s.name}本週到據點量測 ${n} 次。想了解近況，請與據點聯絡。` });
    App.refresh(); toast('已通知家屬（模擬，不會寄出）', 'success');
  }
});

/* ---------- 高齡運動復健（FR-52） ---------- */
route('rehab', {
  title: '高齡運動復健', icon: 'heart-pulse', roles: ['care', 'hadmin'], stage: '3', fr: 'FR-52',
  render(el) {
    const people = visibleSubjects().filter(s => s.program === 'rehab');
    const selector = subjectSelect('rsid', people, '個案');
    const sid = view.rsid;
    logAccess(sid, '復健個案');
    const today = ctx => recordsOf(sid).find(r => r.time.startsWith(DB.today) && r.context === ctx);
    const steps = ['運動前', '運動中', '運動後'];
    const report = ['HR', 'LAC', 'SBP'].map(c => {
      const m = metricBy(c);
      const part = (ctx, from, to) => stats(recordsOf(sid).filter(r => r.context === ctx && dayDiff(DB.today, r.time) >= from && dayDiff(DB.today, r.time) < to && valueOf(r, c) && r.quality >= DB.settings.minQuality).map(r => valueOf(r, c).value));
      const show = st => st && st.n >= 3 ? `${st.median}（n=${st.n}）` : '資料不足';
      return [esc(m.name), show(part('運動前', 28, 56)), show(part('運動前', 0, 28)), show(part('運動後', 28, 56)), show(part('運動後', 0, 28))];
    });
    el.innerHTML = `${DISCLAIMER}<div class="row"><div class="col-lg-4">${card('課程與場次', table(['課程', '時間', '人數'], [['肌力與平衡（示範）', '週一 09:30', 5], ['有氧健走（示範）', '週三 14:00', 4]]))}${card('指派個案', selector)}</div>
      <div class="col-lg-8">${card('本場次流程', `<div class="row g-2">${steps.map((p, i) => { const r = today(p); return `<div class="col-md-4"><div class="metric-card ${r ? '' : 'j-na'}"><strong>${i + 1}. ${p}量測</strong><div class="my-2">${r ? `心率 ${valueCell(r, 'HR')}<br>乳酸 ${valueCell(r, 'LAC')}` : '尚未量測'}</div><button class="btn btn-sm btn-primary" data-act="rehabMeasure" data-ctx="${p}">前往量測</button></div></div>`; }).join('')}</div>`)}
        ${card('成效報告：前 4 週與近 4 週中位數', table(['指標', '運動前（前期）', '運動前（近期）', '運動後（前期）', '運動後（近期）'], report) + '<p class="small text-muted mt-2 mb-0">僅描述數值變化，不代表課程療效；自願參加者不代表全體。</p>', '<button class="btn btn-sm btn-outline-secondary no-print" data-act="printPage">列印／PDF</button>')}</div></div>`;
  }
});
ACTIONS.rehabMeasure = el => { view.msid = view.rsid; view.context = el.dataset.ctx; location.hash = '#/measure'; };
