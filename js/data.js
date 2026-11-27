/* 示範資料：全部虛構。數值、門檻、文件內容僅供操作流程展示，未經醫護、營養或法務審核。 */
'use strict';

const ROLE_NAMES = {
  subject: '受測者', operator: '現場操作員', care: '照護者／教練', ohs: '職安人員', manager: '單位主管',
  hadmin: '健康管理員', pro: '營養師／藥師', merch: '商品／行銷人員', legal: '法遵人員', sysadmin: '系統管理者'
};

function buildSeed() {
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = new Date(2026, 10, 25);
  const daysAgo = n => { const d = new Date(today); d.setDate(d.getDate() - n); return fmt(d); };

  let seed = 20261125;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const around = (base, span, dec = 0) => +(base + (rnd() - 0.5) * 2 * span).toFixed(dec);

  const depts = { eng: '工程部（工地）', adm: '行政部', rehab: '高齡運動健身中心', day: '社區照顧據點（示範）' };

  // [編號, 姓名, 部門, 性別, 年齡, 情境類型, 基準值{HR,SBP,DBP,SPO2,LAC}]
  const people = [
    ['S01', '王示範', 'eng', '男', 45, 'worksite', [74, 128, 82, 97, 1.1]],
    ['S02', '林長青', 'rehab', '女', 72, 'rehab', [70, 134, 80, 96, 1.4]],
    ['S03', '陳測試', 'eng', '男', 38, 'worksite', [80, 122, 78, 98, 1.0]],
    ['S04', '張虛構', 'eng', '男', 52, 'worksite', [78, 138, 88, 96, 1.2]],
    ['S05', '李樣本', 'eng', '女', 29, 'worksite', [72, 112, 70, 98, 0.9]],
    ['S06', '黃假名', 'eng', '男', 41, 'worksite', [76, 126, 80, 97, 1.1]],
    ['S07', '吳模擬', 'eng', '男', 57, 'worksite', [82, 142, 90, 95, 1.3]],
    ['S08', '趙範例', 'adm', '女', 34, 'office', [71, 115, 74, 98, 0.9]],
    ['S09', '周演示', 'adm', '男', 48, 'office', [77, 130, 84, 97, 1.0]],
    ['S10', '徐虛擬', 'adm', '女', 26, 'office', [69, 108, 68, 99, 0.8]],
    ['S11', '高樂活', 'rehab', '男', 68, 'rehab', [68, 136, 82, 96, 1.5]],
    ['S12', '葉安康', 'rehab', '女', 76, 'rehab', [73, 140, 78, 95, 1.6]],
    ['S13', '蔡健走', 'rehab', '女', 66, 'rehab', [75, 124, 76, 97, 1.3]],
    ['S14', '鄭活力', 'rehab', '男', 70, 'rehab', [72, 130, 80, 96, 1.4]],
    ['S15', '許新進', 'eng', '男', 23, 'worksite', [70, 118, 74, 98, 0.9]],
    // 增加工程部人數，讓主管的群體分布每一類都達小群組門檻；接在最後，不影響前面人員的示範數值
    ['S16', '何虛一', 'eng', '男', 24, 'worksite', [70, 142, 89, 96, 0.9]],
    ['S17', '呂虛二', 'eng', '男', 31, 'worksite', [75, 144, 91, 97, 1.0]],
    ['S18', '施虛三', 'eng', '男', 38, 'worksite', [80, 141, 90, 98, 1.1]],
    ['S19', '沈虛四', 'eng', '女', 45, 'worksite', [72, 147, 92, 96, 1.2]],
    ['S20', '余虛五', 'eng', '男', 52, 'worksite', [77, 143, 89, 97, 1.3]],
    ['S21', '盧虛六', 'eng', '男', 59, 'worksite', [82, 145, 90, 98, 0.9]],
    ['S22', '梁虛七', 'eng', '男', 30, 'worksite', [74, 142, 91, 96, 1.0]],
    ['S23', '姜虛八', 'eng', '女', 37, 'worksite', [79, 146, 92, 97, 1.1]],
    ['S24', '范例甲', 'eng', '男', 44, 'worksite', [71, 114, 70, 98, 1.2]],
    ['S25', '方例乙', 'eng', '男', 51, 'worksite', [76, 118, 74, 96, 1.3]],
    ['S26', '石例丙', 'eng', '男', 58, 'worksite', [81, 122, 76, 97, 0.9]],
    ['S27', '姚例丁', 'eng', '女', 29, 'worksite', [73, 126, 80, 98, 1.0]],
    ['S28', '譚例戊', 'eng', '男', 36, 'worksite', [78, 116, 72, 96, 1.1]],
    ['S29', '廖例己', 'eng', '男', 43, 'worksite', [70, 120, 75, 97, 1.2]],
    ['S30', '鄒例庚', 'eng', '男', 50, 'worksite', [75, 124, 78, 98, 1.3]],
    ['S31', '熊例辛', 'eng', '女', 57, 'worksite', [80, 128, 79, 96, 0.9]],
    // 長照據點（應用場景延伸）：S35 近一週未報到、S36 血壓長期偏高，供關懷名單示範
    ['S32', '孫長壽', 'day', '男', 78, 'daycare', [70, 124, 76, 96, 1.1]],
    ['S33', '杜春花', 'day', '女', 84, 'daycare', [74, 126, 74, 96, 1.2]],
    ['S34', '韋金水', 'day', '男', 73, 'daycare', [72, 122, 76, 97, 1.1]],
    ['S35', '魏玉蘭', 'day', '女', 80, 'daycare', [75, 125, 75, 96, 1.2]],
    ['S36', '童添丁', 'day', '男', 76, 'daycare', [76, 152, 92, 96, 1.2]],
    ['S37', '季秋月', 'day', '女', 71, 'daycare', [71, 120, 74, 97, 1.0]]
  ];
  // 家屬代簽的對象沒有個人帳號，也不開放個人化推薦
  const proxies = { S12: '葉家屬（子女）', S33: '杜家屬（女兒）', S36: '童家屬（兒子）' };
  const subjects = people.map(p => ({ id: p[0], name: p[1], dept: p[2], sex: p[3], age: p[4], program: p[5], base: p[6], symptoms: false, hasLogin: !proxies[p[0]] }));

  const consentForms = [
    { version: 'v1.0', date: '2026-08-01', text: '影片僅在地端處理，量測完成後立即刪除；量測結果供本人健康管理參考，非醫療診斷。' }
  ];
  // S15 未同意、S10 已撤回：用於示範伺服器端拒絕量測
  const consents = subjects.filter(s => s.id !== 'S15').map((s, i) => ({
    id: 'C' + (1000 + i), subject: s.id, version: 'v1.0', time: daysAgo(70) + ' 09:00', method: proxies[s.id] ? '紙本代簽' : '線上勾選',
    proxy: proxies[s.id] || '', measure: true, research: i % 4 === 0, revoked: s.id === 'S10' ? daysAgo(3) + ' 14:20' : ''
  }));

  const metrics = [
    ['HR', '心率', 'bpm', '基礎生理', '有', 10], ['SBP', '收縮壓', 'mmHg', '基礎生理', '有', 10], ['DBP', '舒張壓', 'mmHg', '基礎生理', '有', 10],
    ['SPO2', '血氧', '%', '基礎生理', '有', 10], ['LAC', '血乳酸', 'mmol/L', '運動代謝', '有', 10],
    ['RR', '呼吸頻率', '次/分', '基礎生理', '無', 60], ['PI', '灌流指標', '%', '基礎生理', '無', 10],
    ['RMSSD', 'HRV-RMSSD', 'ms', '心率變異', '無', 300], ['SDNN', 'HRV-SDNN', 'ms', '心率變異', '無', 300], ['PNN50', 'pNN50', '%', '心率變異', '無', 300],
    ['VO2MAX', '最大攝氧量', 'mL/kg/min', '運動代謝', '無', 60], ['LFHF', 'LF/HF', '比值', '運動代謝', '無', 300],
    ['BLINK', '眨眼次數', '次/分', '風險與行為', '無', 60], ['EYECLOSE', '閉眼時間率（名稱待確認）', '%', '風險與行為', '無', 60],
    ['IDX14', '第14項指數（名稱待確認）', '%', '風險與行為', '無', 60], ['STRESS', '壓力指數', '%', '風險與行為', '無', 60],
    ['FATIGUE', '疲勞度', '%', '綜合評估', '無', 60], ['SLEEP', '睡眠分數', '%', '綜合評估', '無', 60], ['VITALITY', '活力度', '%', '綜合評估', '無', 60]
  ].map((m, i) => ({
    code: m[0], name: m[1], unit: m[2], cat: m[3], vendorNow: m[4], minSec: m[5], order: i + 1,
    enabled: m[4] === '有', level: m[4] === '有' ? '參考' : '實驗中'
  }));

  // 警示級沿用現行程式寫死的範圍（未經醫護審核）；注意級為雛型示範值。
  const legacy = '沿用舊系統範圍，未經醫護審核；注意級為示範值';
  const thresholds = [
    ['HR', 50, 90, 30, 100], ['SBP', 90, 135, 45, 180], ['DBP', 55, 85, 30, 170],
    ['SPO2', 94, null, 88, null], ['LAC', 0.5, 2.0, 0.2, 2.3]
  ].map((t, i) => ({
    id: 'T' + (i + 1), metric: t[0], ageGroup: '全部', sex: '全部', context: '全部', site: '全部',
    watchLo: t[1], watchHi: t[2], alertLo: t[3], alertHi: t[4], version: 1, effective: '2026-08-01', setBy: '健康管理員', note: legacy
  }));

  // 近 60 天量測紀錄
  const records = [];
  let rid = 1;
  for (const s of subjects) {
    if (s.id === 'S15') continue;
    const count = s.id === 'S09' ? 3 : s.program === 'rehab' ? 24 : s.program === 'daycare' ? 20 : 18;
    for (let i = count - 1; i >= 0; i--) {
      const day = Math.round(i * (s.id === 'S09' ? 4 : 56 / count) + rnd() * 1.5) + 1 + (s.id === 'S35' ? 5 : 0);
      const context = s.program === 'rehab' ? ['靜止', '運動前', '運動中', '運動後'][i % 4]
        : s.program === 'worksite' ? ['上工前', '休息後'][i % 2] : '靜止';
      const quality = rnd() < 0.08 ? Math.round(30 + rnd() * 25) : Math.round(72 + rnd() * 26);
      const boost = context === '運動中' ? [32, 12, 3, -1, 0.7] : context === '運動後' ? [16, 8, 2, 0, 0.5] : [0, 0, 0, 0, 0];
      const b = s.base;
      records.push({
        id: 'M' + String(rid++).padStart(5, '0'), subject: s.id,
        time: daysAgo(day) + ' ' + pad(8 + (i % 9)) + ':' + pad(Math.floor(rnd() * 60)),
        context, mode: '快速', site: s.dept === 'eng' ? '橋梁工地 A 區' : s.dept === 'rehab' ? '健身中心 1F' : s.dept === 'day' ? '社區照顧據點' : '總公司健康角',
        device: s.dept === 'eng' ? 'CAM-A01' : s.dept === 'rehab' ? 'CAM-R01' : s.dept === 'day' ? 'CAM-D01' : 'CAM-H01',
        algo: day > 30 ? 'sim-1.0' : 'sim-1.1', operator: '操作員小周', consent: (consents.find(c => c.subject === s.id) || {}).id,
        quality, ok: true,
        raw: {
          HR: around(b[0] + boost[0], 6), SBP: around(b[1] + boost[1], 7), DBP: around(b[2] + boost[2], 5),
          SPO2: Math.min(100, around(b[3] + boost[3], 1)), LAC: around(b[4] + boost[4], 0.25, 2)
        }
      });
    }
  }
  records.sort((a, b) => a.time.localeCompare(b.time));

  const users = [
    { id: 'u_sub1', name: '王示範', role: 'subject', subject: 'S01' },
    { id: 'u_sub2', name: '林長青', role: 'subject', subject: 'S02' },
    { id: 'u_sub3', name: '許新進', role: 'subject', subject: 'S15' },
    { id: 'u_op', name: '操作員小周', role: 'operator', depts: ['eng'] },
    { id: 'u_care', name: '何教練', role: 'care', assigned: ['S02', 'S11', 'S12', 'S13', 'S14'] },
    { id: 'u_day', name: '據點社工小安', role: 'care', assigned: ['S32', 'S33', 'S34', 'S35', 'S36', 'S37'] },
    { id: 'u_ohs', name: '職安劉專員', role: 'ohs', depts: ['eng'] },
    { id: 'u_mgr', name: '許主管', role: 'manager', depts: ['eng', 'adm'] },
    { id: 'u_admin', name: '健康管理員阿德', role: 'hadmin' },
    { id: 'u_pharm', name: '藥師方方', role: 'pro', title: '藥師', qualUntil: '2027-12-31' },
    { id: 'u_nutri', name: '營養師小菁（資格已到期）', role: 'pro', title: '營養師', qualUntil: '2026-10-31' },
    { id: 'u_merch', name: '行銷阿宏', role: 'merch' },
    { id: 'u_legal1', name: '法遵甲', role: 'legal' },
    { id: 'u_legal2', name: '法遵乙', role: 'legal' },
    { id: 'u_sys', name: '系統管理者', role: 'sysadmin' }
  ];

  const content = o => Object.assign({ ingredients: '', allergens: '無', contra: [], expiry: '2028-06-30', channel: '自建', license: '', licenseExpiry: '', claim: '', copy: '', price: 0 }, o);
  const product = (id, c, status, extra) => Object.assign({
    id, draft: c, status, published: status === '已發布' ? JSON.parse(JSON.stringify(c)) : null,
    version: 1, creator: 'u_merch', reviews: [], offline: false, nextReview: '2027-05-31', lots: []
  }, extra);

  const products = [
    product('P001', content({ name: '示範紅麴膠囊', type: '健康食品', topic: '血壓', ingredients: '紅麴萃取物 600 mg／日', contra: ['使用降血脂藥', '肝臟疾病', '孕期或哺乳'], license: '示範字第 A00001 號', licenseExpiry: '2028-12-31', claim: '（示範核可原文）本產品經實驗證實，有助於調節血壓。', copy: '取得許可之健康食品，核可功效以許可原文為準。', price: 880, channel: '自建' }), '已發布', { nextReview: '2026-12-15', lots: [{ lot: 'L2609A', qty: 40, expiry: '2028-06-30' }] }),
    product('P002', content({ name: '示範抗疲勞飲', type: '健康食品', topic: '乳酸', ingredients: '示範配方 50 mL／瓶', contra: ['孕期或哺乳', '腎臟疾病'], license: '示範字第 A00002 號', licenseExpiry: '2028-03-31', claim: '（示範核可原文）本產品經動物實驗證實，有助於延緩疲勞。', copy: '取得許可之健康食品，核可功效以許可原文為準。', price: 720, channel: '外部電商' }), '已發布'),
    product('P003', content({ name: '示範乳清蛋白', type: '一般食品', topic: '乳酸', ingredients: '乳清蛋白 20 g／份、鈉 60 mg', allergens: '牛奶', contra: ['腎臟疾病', '食物過敏'], copy: '運動後的蛋白質補充選擇。', price: 960, channel: '自建' }), '已發布', { nextReview: '2026-11-20', lots: [{ lot: 'L2610B', qty: 25, expiry: '2027-10-31' }] }),
    product('P004', content({ name: '示範鎂鉀膳食纖維包', type: '一般食品', topic: '血壓', ingredients: '鎂 100 mg、鉀 200 mg、膳食纖維 5 g／包', contra: ['腎臟疾病', '使用降壓藥或利尿劑'], copy: '日常飲食營養補充。', price: 450, channel: '自建' }), '待專業審核'),
    product('P005', content({ name: '示範元氣錠', type: '一般食品', topic: '血壓', ingredients: '示範配方', copy: '保證有效，幫助降血壓，治療疲勞！', price: 590, channel: '自建' }), '草稿'),
    product('P006', content({ name: '示範魚油（許可已過期）', type: '健康食品', topic: '血壓', ingredients: '魚油 1000 mg', contra: ['使用抗凝血劑', '近期手術'], license: '示範字第 A00009 號', licenseExpiry: '2026-09-30', claim: '（示範核可原文）', copy: '取得許可之健康食品。', price: 650, channel: '外部電商' }), '已發布')
  ];

  // 預置「待專業審核」商品：補上送審者與送審快照
  Object.assign(products[3], { submitter: 'u_merch', round: 1, snapshot: JSON.parse(JSON.stringify(products[3].draft)) });

  const rules = [
    { id: 'R1', metric: 'SBP', topic: '血壓', name: '血壓關注 → 衛教與相關類別', productIds: ['P001'], version: 2, status: '已發布', creator: 'u_merch', reviews: [] },
    { id: 'R2', metric: 'LAC', topic: '乳酸', name: '運動恢復關注 → 衛教與運動營養', productIds: ['P002', 'P003'], version: 1, status: '已發布', creator: 'u_merch', reviews: [] }
  ];

  const kbDocs = [
    { id: 'K01', title: '量測注意事項（示範）', cat: '作業知識', version: 3, status: '已核准', expiry: '2027-06-30', roles: ['operator', 'care', 'ohs', 'hadmin', 'sysadmin', 'pro', 'legal'], maintainer: 'u_legal1', approver: 'u_legal2', chunks: [
      { sec: '1 量測環境', text: '量測前請確認室內光線均勻，避免強光直射臉部或鏡頭。鏡頭置於正面一公尺內，臉部位於引導框中。' },
      { sec: '2 受測者準備', text: '運動、快走、進食或洗澡後請先休息十至十五分鐘（運動情境量測除外）。臉部保持清潔乾燥，量測前勿塗抹防曬或化妝水。' },
      { sec: '3 量測失敗處理', text: '品質不足時系統不產生數值。請依畫面原因調整後重測，連續三次失敗請記錄並通知健康管理員。' }] },
    { id: 'K02', title: '警示處置 SOP（示範）', cat: '作業知識', version: 2, status: '已核准', expiry: '2027-03-31', roles: ['care', 'ohs', 'hadmin', 'sysadmin'], maintainer: 'u_legal1', approver: 'u_legal2', chunks: [
      { sec: '1 收到警示', text: '收到警示通知後先確認當事人狀況，引導休息並複測。系統不能當作唯一的安全監控手段，當事人有不適時直接啟動緊急應變，不需等待系統。' },
      { sec: '2 結案', text: '處置紀錄需填寫處理方式與備註後才能結案。逾時未處理時系統再次提醒指定負責人。' }] },
    { id: 'K03', title: '規律量血壓衛教（示範）', cat: '衛教', version: 1, status: '已核准', expiry: '2027-01-31', roles: ['subject', 'operator', 'care', 'ohs', 'hadmin', 'pro', 'legal', 'sysadmin'], maintainer: 'u_legal1', approver: 'u_legal2', chunks: [
      { sec: '量血壓前要注意什麼', text: '量血壓前先靜坐休息五分鐘，避免剛喝完咖啡或剛運動完。固定時間、固定姿勢量測，較能看出自己的變化。' },
      { sec: '飲食減鈉怎麼做', text: '減鈉可以從少喝湯、少用沾醬、少吃加工食品開始。閱讀營養標示時留意鈉含量。' }] },
    { id: 'K04', title: '運動恢復衛教（示範）', cat: '衛教', version: 2, status: '已核准', expiry: '2027-08-31', roles: ['subject', 'operator', 'care', 'ohs', 'hadmin', 'pro', 'legal', 'sysadmin'], maintainer: 'u_legal2', approver: 'u_legal1', chunks: [
      { sec: '運動後如何恢復', text: '運動後安排緩和活動、適量補充水分並確保睡眠。訓練強度請循序增加，感到不適時停止運動。' },
      { sec: '運動時如何補充水分', text: '運動前、中、後分次少量補充水分。高溫環境或流汗多時，可依專業人員建議補充電解質。' }] },
    { id: 'K05', title: '舊版量測 SOP（已撤銷，示範）', cat: '作業知識', version: 1, status: '已撤銷', expiry: '2026-09-30', roles: ['operator', 'care', 'ohs', 'hadmin', 'sysadmin'], maintainer: 'u_legal1', approver: 'u_legal2', chunks: [
      { sec: '舊版', text: '舊版規定量測失敗連續五次才需通知。此版本已撤銷。' }] },
    { id: 'K06', title: '熱危害預防衛教（示範，送審中）', cat: '衛教', version: 1, status: '待法遵審核', expiry: '2027-05-31', roles: ['subject', 'ohs', 'hadmin', 'legal'], maintainer: 'u_legal1', approver: '', chunks: [
      { sec: '高溫作業注意事項', text: '高溫作業時定時休息、補充水分，出現頭暈或停止流汗等情形立即停止作業並通報。' }] }
  ];

  return {
    today: fmt(today), depts, subjects, consentForms, consents, metrics, thresholds, records, users,
    currentUser: 'u_admin',
    settings: { smallGroup: 5, trendMinDays: 3, trendMinCount: 5, minQuality: 60, retestRequired: true, approvedHost: 'https://measure.intra.local', measureHost: 'https://measure.intra.local', baselineN: 10, overdueHours: 4, assistantOn: true, reviewRemindDays: 30, emailNotify: false, daycareAbsentDays: 3 },
    alerts: [], notifications: [], mails: [], accessLog: [], exportLog: [], blocked: [],
    references: [
      { record: records.filter(r => r.subject === 'S01').slice(-1)[0].id, metric: 'HR', ref: 76, device: '指夾式脈搏血氧儀（示範）' },
      { record: records.filter(r => r.subject === 'S01').slice(-1)[0].id, metric: 'SBP', ref: 124, device: '上臂式血壓計（示範）' },
      { record: records.filter(r => r.subject === 'S02').slice(-1)[0].id, metric: 'HR', ref: 69, device: '指夾式脈搏血氧儀（示範）' }
    ],
    sites: ['橋梁工地 A 區', '健身中心 1F', '總公司健康角', '社區照顧據點', '社區藥局（示範）'],
    devices: [
      { id: 'CAM-A01', site: '橋梁工地 A 區', model: 'USB 攝影機（示範）', active: true },
      { id: 'CAM-R01', site: '健身中心 1F', model: 'IP 攝影機（示範）', active: true },
      { id: 'CAM-H01', site: '總公司健康角', model: 'USB 攝影機（示範）', active: true },
      { id: 'CAM-D01', site: '社區照顧據點', model: 'USB 攝影機（示範）', active: true },
      { id: 'CAM-P01', site: '社區藥局（示範）', model: '一體式量測站（示範）', active: true }
    ],
    // 家屬檢視授權（FR-54）：依本人或代簽人的書面授權登錄
    family: { S32: { name: '孫家屬（兒子）', view: true }, S33: { name: '杜家屬（女兒）', view: true }, S35: { name: '魏家屬（孫女）', view: true }, S36: { name: '童家屬（兒子）', view: false } },
    familyMsgs: [],
    wbgt: [{ time: '2026-11-25 10:00', site: '橋梁工地 A 區', wbgt: 28.6, temp: 31.2, rh: 68, source: '手動輸入' }],
    lifelogs: [{ subject: 'S01', date: daysAgo(1), sleep: 6, exercise: '無', caffeine: 2, med: '無', discomfort: '無' }],
    recConsent: { S01: { on: false, topics: [] }, S02: { on: true, topics: ['血壓', '乳酸'], time: daysAgo(20) } },
    screening: { S02: { date: daysAgo(20), flags: [] } },
    recLog: [], products, rules,
    consults: [{ id: 'Q001', time: daysAgo(1) + ' 10:20', subject: 'S02', q: '最近血壓好像偏高，飲食上要注意什麼？', status: '待回覆', thread: [], closed: null, share: records.filter(r => r.subject === 'S02').slice(-1)[0].id, shareRevoked: '' }],
    redFlagLog: [],
    adverse: [{ id: 'D001', time: daysAgo(1) + ' 15:40', by: 'u_sub2', product: 'P002', kind: '客訴', text: '外盒壓傷，想詢問能否更換（示範）', status: '待受理', handler: '', action: '', result: null, history: [{ time: daysAgo(1) + ' 15:40', by: '回報人', text: '送出回報' }] }],
    syncLog: [{ time: daysAgo(2) + ' 10:00', product: 'P002', action: '同步上架', result: '成功' }],
    platformCopy: { P002: '取得許可之健康食品，核可功效以許可原文為準。', P006: '取得許可之健康食品。限時優惠！' },
    syncFail: false,
    cart: [], orders: [], payEvents: [],
    kbDocs, aiLog: [], unanswered: [],
    approvedQA: [{ q: '量血壓前要注意什麼', doc: 'K03', sec: 0 }, { q: '飲食減鈉怎麼做', doc: 'K03', sec: 1 }, { q: '運動後如何恢復', doc: 'K04', sec: 0 }, { q: '運動時如何補充水分', doc: 'K04', sec: 1 }]
  };
}
