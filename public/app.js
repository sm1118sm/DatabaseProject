// 스터디모아 프런트엔드 (샘플 데이터 + 브라우저 저장소로 동작하는 정적 앱)
// 비즈니스 분할도: ① 이용 옵션 선택 ② 지역 설정 ③ 스터디카페 비교·추천 ④ 고객 예약
(() => {
  'use strict';
  const D = window.SC_DATA;
  const { FAC, SEAT, PLAN, DAYS } = D;
  const $ = (s, el = document) => el.querySelector(s);
  const won = (n) => Math.round(n).toLocaleString('ko-KR') + '원';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const hh = (h) => `${pad(h)}:00`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---- 날짜 -------------------------------------------------------------------
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => dstr(new Date());
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return dstr(d); };
  const dayIdx = (s) => { const [y, m, d] = s.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 864e5); };
  const fmtDate = (s) => { const d = parse(s); return `${d.getMonth() + 1}월 ${d.getDate()}일(${WD[d.getDay()]})`; };
  const nowAbs = () => { const n = new Date(); return dayIdx(todayStr()) * 24 + n.getHours() + n.getMinutes() / 60; };

  // ---- 저장소 (로그인·예약·후기). 저장소를 못 쓰는 환경에서는 메모리에만 둔다 ------
  const KEY = 'studymoa:v1';
  const DB = (() => {
    try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch { /* 저장소 사용 불가 */ }
    return { users: [], session: null, reservations: [], reviews: [], seq: 100 };
  })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch { /* 저장소 사용 불가 */ } };
  const me = () => DB.users.find((u) => u.email === DB.session) || null;

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  // 학습용 모의 인증이다. 보안 컨텍스트가 아니면(http 로컬 IP 등) SubtleCrypto 가 없어 단순 해시로 대체한다.
  async function digest(s) {
    try {
      if (window.crypto && crypto.subtle) {
        const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
        return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
      }
    } catch { /* 아래 대체 해시 사용 */ }
    return 'f' + Math.floor(hash(s) * 4294967296).toString(16);
  }

  // ---- 아이콘 / 사진 --------------------------------------------------------------
  const P = {
    calendar: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
    pin: 'M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
    search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.3-4.3',
    chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
    user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
    snack: 'M5 9h11v5a5 5 0 01-5 5h-1a5 5 0 01-5-5V9zM16 10h2a2 2 0 010 4h-2M8 3v3M12 3v3',
    printer: 'M7 9V4h10v5M7 17H5a1 1 0 01-1-1v-5a2 2 0 012-2h12a2 2 0 012 2v5a1 1 0 01-1 1h-2M7 14h10v6H7z',
    locker: 'M5 3h14v18H5zM12 3v18M9 11v2M15 11v2',
    moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
    plug: 'M9 3v5M15 3v5M6 8h12v3a6 6 0 01-12 0V8zM12 17v4',
    shower: 'M5 20V9a4 4 0 018 0M13 9h6M8 15v1M12 15v1M16 13v1M10 18v1M14 18v1',
    sofa: 'M5 11V8a2 2 0 012-2h10a2 2 0 012 2v3M3 13a2 2 0 014 0v2h10v-2a2 2 0 014 0v5H3zM6 18v2M18 18v2',
    train: 'M7 3h10a2 2 0 012 2v10a3 3 0 01-3 3H8a3 3 0 01-3-3V5a2 2 0 012-2zM5 11h14M8 21l2-3M16 21l-2-3',
    school: 'M3 9l9-5 9 5-9 5-9-5zM7 11.5V16c0 1.2 2.2 3 5 3s5-1.8 5-3v-4.5',
    book: 'M4 4h6a3 3 0 013 3v13a2 2 0 00-2-2H4V4zM20 4h-6a3 3 0 00-3 3v13a2 2 0 012-2h7V4z',
    list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    card: 'M3 6h18v12H3zM3 10h18M7 15h3',
    target: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8zM12 12h.01',
    phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z',
  };
  const ico = (n, s = 18) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n]}"/></svg>`;
  const FACICO = { s: 'snack', p: 'printer', l: 'locker', h: 'moon', e: 'plug', w: 'shower', g: 'sofa' };
  const PHOTO_LABEL = ['열람실', '집중석 부스', '스낵바', '스터디룸', '휴게 라운지'];

  // 카카오는 사진을 주지 않아서, 사진 자리에는 카페마다 색만 다른 깔끔한 자리표시를 둔다
  const TINTS = [['#eaf3ff', '#bcd6fb'], ['#e9f7ef', '#bfe3cf'], ['#fff1e5', '#f6d3b3'], ['#f1eefb', '#d4cbef']];
  function photo(c, i) {
    const [bg, fg] = TINTS[(c.id + i) % TINTS.length];
    return `<svg class="photo" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(c.name)} 사진 준비 중"><rect width="400" height="260" fill="${bg}"/><g transform="translate(176 83) scale(2)" fill="none" stroke="${fg}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="${P.book}"/></g></svg>`;
  }

  // ---- 상태 ---------------------------------------------------------------------
  const defStart = () => clamp(new Date().getHours() + 1, 9, 18);
  const freshQuery = () => ({
    mode: 'HOURLY', plan: 'MONTH', date: todayStr(), start: defStart(), end: defStart() + 3,
    seat: 'ANY', people: 1, fac: [], sido: '서울특별시', sigungu: '강남구', radius: 0, geo: null,
    nearStation: false, nearUniv: false, sort: 'price', view: 'map',
  });
  const PAGE = Infinity; // 목록은 나누지 않고 선택한 지역의 카페를 전부 보여준다
  const S = { q: freshQuery(), book: null, hl: null, cancelId: null, resTab: 'UP', pending: null, me: null, locating: false, kakao: false, mapStatus: 'loading', regionDone: new Set(), inflight: new Map(), regionLoading: null, regionError: null, limit: Infinity, adv: false, facMore: false };
  // 실제 데이터로 교체되면서 빠진 샘플 카페도 찾을 수 있게 보관한다 (예약 내역 표시용)
  const archived = [];
  const cafeById = (id) => D.cafes.find((c) => c.id === Number(id)) || archived.find((c) => c.id === Number(id));

  // 이용 형태·좌석 유형의 실제 적용값 (2인 이상은 스터디룸, 룸은 시간제만)
  const effSeat = () => (S.q.people > 1 ? 'ROOM' : S.q.seat === 'ANY' ? 'NORMAL' : S.q.seat);
  function qView() {
    const q = S.q, type = effSeat();
    return { type, mode: type === 'ROOM' ? 'HOURLY' : q.mode, plan: q.plan, date: q.date, start: q.start, end: q.end };
  }

  // ---- 가격 / 평균 -----------------------------------------------------------------
  const price = (c, type, mode, plan) => {
    const p = c.price[type];
    if (!p) return null;
    return mode === 'HOURLY' ? p.hourly : (p[plan] ?? null);
  };
  const avgCache = new Map();
  function regionAvg(c, type, mode, plan) {
    const k = `${c.sido}|${c.sigungu}|${type}|${mode}|${plan}`;
    if (!avgCache.has(k)) {
      const v = D.cafes.filter((x) => x.sido === c.sido && x.sigungu === c.sigungu).map((x) => price(x, type, mode, plan)).filter((x) => x != null);
      avgCache.set(k, v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null);
    }
    return avgCache.get(k);
  }
  const diffTag = (diff) => (diff === 0 ? ['even', '평균 수준'] : diff < 0 ? ['low', `평균보다 ${won(-diff)} 저렴`] : ['high', `평균보다 ${won(diff)} 비쌈`]);

  // ---- 거리 / 영업시간 ---------------------------------------------------------------
  function dist(a, b) {
    const rad = Math.PI / 180, dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(x));
  }
  const km = (d) => (d < 1 ? `${Math.round(d * 100) * 10}m` : `${d.toFixed(1)}km`);
  const regionOf = () => D.regions.find((r) => r.sido === S.q.sido && r.sigungu === S.q.sigungu) || D.regions[0];
  // 거리 기준은 항상 내 현재 위치다. 위치를 못 받았을 때만 선택한 지역의 중심을 쓴다.
  const origin = () => S.me || S.q.geo || regionOf().center;
  const isOpen = (c, o) => o.mode === 'PERIOD' || (c.open <= o.start && c.close >= o.end);
  const hoursText = (c) => (c.real ? '운영 시간은 카카오맵에서 확인해 주세요' : c.open === 0 && c.close === 24 ? '24시간 운영' : `${hh(c.open)} – ${hh(c.close)}`);

  // ---- 좌석 현황 (샘플: 날짜·시간에 따라 일정하게 만든 점유 + 내 예약) ----------------------
  const iv = (o) => {
    const base = dayIdx(o.date) * 24;
    return o.mode === 'HOURLY' ? [base + o.start, base + o.end] : [base, base + DAYS[o.plan] * 24];
  };
  const seatKeys = (c, type) => Array.from({ length: c.seats[type] }, (_, i) => ({ NORMAL: 'N', FOCUS: 'F', ROOM: 'R' }[type] + (i + 1)));
  function blocks(c, key, date) {
    const out = [];
    for (let k = 0; k < 2; k++) {
      if (hash(`${c.id}|${key}|${date}|g${k}`) < 0.8 * c.busy) {
        const s = 8 + Math.floor(hash(`${c.id}|${key}|${date}|s${k}`) * 14);
        out.push([s, s + 2 + Math.floor(hash(`${c.id}|${key}|${date}|l${k}`) * 5)]);
      }
    }
    return out;
  }
  const takenSeed = (c, key, o) => (o.mode === 'HOURLY'
    ? blocks(c, key, o.date).some(([a, b]) => a < o.end && o.start < b)
    : hash(`${c.id}|${key}|${o.date}|P`) < 0.3 * c.busy);
  const takenUser = (c, key, o, skipId) => {
    const [a, b] = iv(o);
    return DB.reservations.some((r) => r.cafeId === c.id && r.seat === key && r.id !== skipId && r.status !== 'CANCELED' && (() => { const [x, y] = iv(r); return a < y && x < b; })());
  };
  function avail(c, type, o, skipId) {
    const keys = seatKeys(c, type);
    const taken = new Set(keys.filter((k) => takenSeed(c, k, o) || takenUser(c, k, o, skipId)));
    return { keys, taken, total: keys.length, free: keys.length - taken.size };
  }
  const seatLabel = (key, type) => (type === 'ROOM' ? `스터디룸 ${key.slice(1)}` : `${SEAT[type]} ${key.slice(1)}번`);

  // ---- 후기 ------------------------------------------------------------------------
  const reviewsOf = (c) => [...DB.reviews.filter((r) => r.cafeId === c.id), ...c.reviews].sort((a, b) => b.date.localeCompare(a.date));
  const ratingOf = (c) => { const l = reviewsOf(c); return { avg: l.length ? l.reduce((s, r) => s + r.rating, 0) / l.length : 0, n: l.length }; };
  const starsHtml = (n) => `<span class="stars" aria-label="별점 ${n}점">${'★'.repeat(Math.round(n))}<span class="off">${'★'.repeat(5 - Math.round(n))}</span></span>`;
  const maskName = (n) => (n.length >= 3 ? n[0] + '*'.repeat(n.length - 2) + n[n.length - 1] : n[0] + '*');

  // ---- 토스트 / 모달 --------------------------------------------------------------------
  let toastTimer;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2800); }
  function openModal(html) {
    $('#modalContent').innerHTML = html; $('#modal').hidden = false; document.body.classList.add('lock');
    const f = $('#modalContent input, #modalContent select, #modalContent textarea'); if (f) f.focus();
  }
  function closeModal() { $('#modal').hidden = true; $('#modalContent').innerHTML = ''; document.body.classList.remove('lock'); }

  const view = $('#view');

  // =====================================================================================
  // 홈: 히어로 + 검색 패널(① 이용 옵션 ② 지역) + 카테고리 + ③ 비교·추천 결과 + 이용 안내
  // =====================================================================================
  const CATS = [
    ['24시간', 'moon', 'fac', 'h'], ['집중석', 'user', 'seat', 'FOCUS'], ['스터디룸', 'sofa', 'seat', 'ROOM'], ['스낵바', 'snack', 'fac', 's'],
    ['프린터', 'printer', 'fac', 'p'], ['역세권', 'train', 'near', 'nearStation'], ['대학가', 'school', 'near', 'nearUniv'], ['사물함', 'locker', 'fac', 'l'],
  ];
  const catOn = (kind, val) => (kind === 'fac' ? S.q.fac.includes(val) : kind === 'seat' ? S.q.seat === val : S.q[val]);
  // 보고 있는 지역(또는 내 위치 모드)에 카카오에서 가져온 실제 카페가 있으면, 카카오가 시설 정보를 주지 않아 시설 필터를 쓸 수 없다
  const realMode = () => D.cafes.some((c) => c.real && (S.q.geo || (c.sido === S.q.sido && c.sigungu === S.q.sigungu)));
  const FAC_OFF = 'disabled title="카카오맵 데이터에는 시설 정보가 없어요"';
  const catsHtml = () => CATS.map(([t, ic, kind, val]) => `<button class="cat" data-act="cat" data-kind="${kind}" data-v="${val}" aria-pressed="${!!catOn(kind, val)}" ${kind === 'fac' && realMode() ? FAC_OFF : ''}><span class="ci">${ico(ic, 18)}</span>${t}</button>`).join('');
  const refreshCats = () => { const e = $('#cats'); if (e) e.innerHTML = catsHtml(); };

  function timeOptions(sel, from, to) {
    let s = '';
    for (let h = from; h <= to; h++) s += `<option value="${h}"${h === sel ? ' selected' : ''}>${hh(h)}</option>`;
    return s;
  }
  // 시간제는 시작·종료 시간, 기간제는 이용 기간을 고른다
  function timeCell() {
    const q = S.q, v = qView();
    if (v.mode === 'HOURLY') {
      return `<span class="sb-lbl">시간</span><div class="sb-pair"><select id="qStart" data-q="start" aria-label="시작 시간">${timeOptions(q.start, 0, 23)}</select><span class="sb-dash">–</span><select id="qEnd" data-q="end" aria-label="종료 시간">${timeOptions(q.end, q.start + 1, 24)}</select></div>`;
    }
    return `<label class="sb-lbl" for="qPlan">이용 기간</label><select id="qPlan" data-q="plan">${Object.entries(PLAN).map(([k, t]) => `<option value="${k}"${q.plan === k ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
  }
  function panelHtml() {
    const q = S.q, v = qView();
    const sidos = [...new Set(D.regions.map((r) => r.sido))];
    const sigs = D.regions.filter((r) => r.sido === q.sido);
    const base = S.me ? '현재 위치' : (/중심$/.test(regionOf().label) ? regionOf().label : `${regionOf().label} (${q.sigungu} 중심)`);
    // 시설 옵션은 앞의 4개만 보여주고 나머지는 '+ 더보기'로 펼친다 (이미 선택한 칩은 항상 보인다)
    const facAll = Object.entries(FAC);
    const facShown = S.facMore ? facAll : facAll.filter(([k], i) => i < 4 || q.fac.includes(k));
    const facHidden = facAll.length - facShown.length;
    const advCount = (q.seat !== 'ANY' ? 1 : 0) + (q.people > 1 ? 1 : 0) + q.fac.length + (q.radius ? 1 : 0) + (q.geo ? 1 : 0) + (q.nearStation ? 1 : 0) + (q.nearUniv ? 1 : 0);
    return `<div class="sbar">
      <div class="sb-cell sb-mode" id="sec-opt"><span class="sb-lbl">이용 형태</span><div class="seg" role="group" aria-label="이용 형태">
        <button data-act="mode" data-v="HOURLY" aria-pressed="${q.mode === 'HOURLY'}">시간제</button>
        <button data-act="mode" data-v="PERIOD" aria-pressed="${q.mode === 'PERIOD'}">기간제</button></div></div>
      <div class="sb-cell" id="sec-area"><span class="sb-lbl">지역</span><div class="sb-pair">
        <select id="qSido" data-q="sido" aria-label="시/도">${sidos.map((x) => `<option${x === q.sido ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
        <select id="qSig" data-q="sigungu" aria-label="구/군">${sigs.map((r) => `<option${r.sigungu === q.sigungu ? ' selected' : ''}>${esc(r.sigungu)}</option>`).join('')}</select></div></div>
      <div class="sb-cell"><label class="sb-lbl" for="qDate">${v.mode === 'HOURLY' ? '날짜' : '시작일'}</label><input id="qDate" type="date" data-q="date" min="${todayStr()}" value="${esc(q.date)}"></div>
      <div class="sb-cell" id="optTime">${timeCell()}</div>
      <button class="btn primary lg sb-go" data-act="search">${ico('search', 18)}검색</button>
    </div>
    ${v.type === 'ROOM' && q.mode === 'PERIOD' ? '<p class="note sb-note">스터디룸은 시간제로만 이용할 수 있어요.</p>' : ''}
    <div class="sb-foot">
      <button class="btn sm" data-act="adv" aria-expanded="${S.adv}">${S.adv ? '상세 조건 닫기' : '상세 조건'}${advCount ? ` (${advCount})` : ''}</button>
      <span class="note">${ico('target', 14)} 거리 기준: ${esc(base)}</span>
      <button class="btn sm" data-act="reset">조건 초기화</button>
    </div>
    <div class="adv" id="sec-adv"${S.adv ? '' : ' hidden'}>
      <div class="panel-grid">
        <div class="pgroup">
          <h3>좌석·시설</h3>
          <div class="field"><span class="lbl">좌석 유형</span><div class="chips">
            ${[['ANY', '전체'], ['NORMAL', '일반석'], ['FOCUS', '집중석'], ['ROOM', '스터디룸']].map(([k, t]) => `<button class="chip" data-act="seat" data-v="${k}" aria-pressed="${(q.people > 1 ? 'ROOM' : q.seat) === k}">${t}</button>`).join('')}</div></div>
          <div class="field"><span class="lbl">인원 수</span><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <div class="stepper"><button data-act="people" data-v="-1" aria-label="인원 줄이기">−</button><span>${q.people}명</span><button data-act="people" data-v="1" aria-label="인원 늘리기">+</button></div>
            ${q.people > 1 ? '<p class="note">2인 이상은 스터디룸만 예약할 수 있어요.</p>' : ''}</div></div>
          <div class="field" style="margin-bottom:0"><span class="lbl">시설 옵션</span><div class="chips">
            ${facShown.map(([k, t]) => `<button class="chip" data-act="fac" data-v="${k}" aria-pressed="${q.fac.includes(k)}" ${realMode() ? FAC_OFF : ''}>${ico(FACICO[k], 15)}${t}</button>`).join('')}${facHidden > 0 ? `<button class="chip more" data-act="facmore">+ 더보기 ${facHidden}</button>` : S.facMore ? '<button class="chip more" data-act="facmore">접기</button>' : ''}</div>
            ${realMode() ? '<p class="note" style="margin-top:8px">카카오맵 데이터에는 시설·좌석 유형·운영 시간 정보가 없어서, 이 항목들은 목록을 걸러내지 못해요. 요금 표시만 바뀌어요.</p>' : ''}</div>
        </div>
        <div class="pgroup">
          <h3>거리·주변</h3>
          <div class="field"><span class="lbl">거리 기준</span><div class="row2">
            <select id="qRadius" data-q="radius" aria-label="반경">${[[0, '반경 제한 없음'], [1, '반경 1km'], [3, '반경 3km'], [5, '반경 5km']].map(([k, t]) => `<option value="${k}"${q.radius === k ? ' selected' : ''}>${t}</option>`).join('')}</select>
            <button class="btn" data-act="geo" aria-pressed="${!!q.geo}">${ico('target', 16)}${q.geo ? '내 위치 해제' : '내 위치로 검색'}</button></div></div>
          <div class="field" style="margin-bottom:0"><span class="lbl">추가 지역 조건</span><div class="chips">
            <button class="chip" data-act="near" data-k="nearStation" aria-pressed="${q.nearStation}">${ico('train', 15)}역 근처</button>
            <button class="chip" data-act="near" data-k="nearUniv" aria-pressed="${q.nearUniv}">${ico('school', 15)}대학교 근처</button></div></div>
        </div>
      </div>
    </div>`;
  }
  const refreshPanel = () => { const p = $('#panel'); if (p) p.innerHTML = panelHtml(); };

  function heroStats() {
    const real = D.cafes.some((c) => c.real);
    return `<div><b>${D.cafes.length}곳</b>등록된 스터디카페</div><div><b>${D.regions.length}개</b>비교 가능한 지역</div>`
      + (real ? '<div><b>카카오맵</b>실제 매장 정보 연동</div>' : '<div><b>샘플</b>예시 데이터로 동작 중</div>');
  }
  function showHome() {
    const realCount = D.cafes.filter((c) => c.real).length;
    const reviewBlock = recentReviews();
    view.innerHTML = `
    <section class="hero"><div class="wrap"><h1>우리 동네 스터디카페, <em>평균보다 얼마나 저렴할까?</em></h1></div></section>
    <div class="wrap"><div class="panel" id="panel">${panelHtml()}</div></div>

    <section class="section section-tight"><div class="wrap"><div class="cats" id="cats">${catsHtml()}</div></div></section>

    <section class="section" id="sec-compare"><div class="wrap">
      <div id="results"></div>
    </div></section>

    <section class="section" id="sec-flow"><div class="wrap">
      <div class="sec-head"><div><h2>이렇게 이용하세요</h2><p>스터디모아의 4단계 이용 흐름</p></div></div>
      ${flowHtml()}
    </div></section>

    ${reviewBlock ? `<section class="section"><div class="wrap">
      <div class="sec-head"><div><h2>최근 이용 후기</h2><p>${realCount ? '이 사이트에서 남긴 후기' : '샘플 후기'}</p></div></div>
      <div class="revgrid">${reviewBlock}</div>
    </div></section>` : ''}`;
    renderResults();
  }

  function flowHtml() {
    const cols = [
      ['calendar', '이용 옵션 선택', [['이용 형태 선택', '시간제 / 기간제'], ['이용 시간·기간 설정', '날짜, 시작·종료 시간, 좌석 유형(일반석·집중석 등)'], ['필터·조건 설정', '인원 수, 시설 옵션(스낵바·프린터 등)']]],
      ['pin', '지역 설정', [['검색 지역 선택', '시/도, 구/군 단위 선택 · 현재 위치 기반 검색(선택)'], ['거리·이동 시간 기준 필터', '반경 1km, 3km, 5km 설정'], ['추가 지역 조건', '역 근처, 대학교 근처 등']]],
      ['chart', '스터디카페 비교 및 추천', [['조건에 맞는 목록 조회', null], ['지역 내 평균 가격 제공', '시간제·기간제별 평균 가격 표시'], ['정렬', '최저가·거리·평점 순'], ['상세 정보 제공', '가격, 위치, 좌석 수, 시설 사진, 이용 후기, 운영 시간']]],
      ['list', '고객 예약', [['선택한 스터디카페 예약', '날짜·시간·좌석 선택 후 예약'], ['실시간 좌석 현황 확인', '예약 가능 좌석 표시'], ['결제 진행', '결제 수단 선택 및 결제 완료'], ['예약 내역 관리', '예약 확인·변경·취소'], ['이용 완료 후 후기 작성', '평점 및 리뷰 등록']]],
    ];
    return `<div class="flow">${cols.map(([ic, t, items], i) => `<div class="flowcard"><div class="fh"><span class="fi">${ico(ic, 22)}</span><div><div class="fn">STEP ${i + 1}</div><h3>${t}</h3></div></div>
      <ul>${items.map(([a, b]) => `<li>${a}${b ? `<small>${b}</small>` : ''}</li>`).join('')}</ul></div>`).join('')}</div>`;
  }
  function recentReviews() {
    const all = D.cafes.flatMap((c) => reviewsOf(c).map((r) => ({ ...r, c }))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    return all.map((r) => `<button class="revcard" data-act="open" data-id="${r.c.id}">${starsHtml(r.rating)}<div>${esc(r.text)}</div><div class="who">${esc(r.name)} · ${esc(r.c.name)} · ${esc(r.date)}</div></button>`).join('');
  }

  // ---- 검색 결과 ---------------------------------------------------------------------
  function results(ignoreRadius = false) {
    const q = S.q, v = qView(), org = origin();
    const list = [];
    for (const c of D.cafes) {
      const p = price(c, v.type, v.mode, v.plan);
      if (p == null) continue;
      if (!q.geo && (c.sido !== q.sido || c.sigungu !== q.sigungu)) continue;
      const d = dist(org, [c.lat, c.lng]);
      // 반경은 '내 주변' 모드에서는 내 위치에서, 지역을 직접 고른 모드에서는 그 지역의 중심에서 잰다
      if (q.radius && !ignoreRadius && (q.geo ? d : dist(regionOf().center, [c.lat, c.lng])) > q.radius) continue;
      if (!c.real && q.fac.some((f) => !c.fac.includes(f))) continue; // 실제 카페는 시설 정보가 없어 시설로 거르지 않는다
      if (q.nearStation && !c.station) continue;
      if (q.nearUniv && !c.univ) continue;
      if (!isOpen(c, v)) continue;
      if (v.type === 'ROOM' && c.roomCap < q.people) continue;
      const avg = regionAvg(c, v.type, v.mode, v.plan);
      list.push({ c, p, d, avg, diff: p - avg, av: avail(c, v.type, v), r: ratingOf(c) });
    }
    const by = { price: (a, b) => a.p - b.p || a.d - b.d, distance: (a, b) => a.d - b.d, rating: (a, b) => b.r.avg - a.r.avg || a.p - b.p, diff: (a, b) => a.diff - b.diff };
    return list.sort(by[q.sort]);
  }

  function avgStrip(list) {
    const v = qView(), q = S.q;
    const pool = q.geo ? list.map((x) => x.c) : D.cafes.filter((c) => c.sido === q.sido && c.sigungu === q.sigungu);
    if (!pool.length) return '';
    const mean = (mode, plan) => { const a = pool.map((c) => price(c, v.type, mode, plan)).filter((x) => x != null); return a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null; };
    const items = [['시간제', mean('HOURLY')]];
    if (v.type !== 'ROOM') Object.entries(PLAN).forEach(([k, t]) => items.push([t, mean('PERIOD', k)]));
    const title = q.geo ? `내 주변 ${q.radius || 5}km 이내` : q.sigungu;
    return `<p class="avgline">${esc(title)} ${SEAT[v.type]} 평균 · ${items.filter(([, x]) => x != null).map(([t, x]) => `${t} <b>${won(x)}</b>`).join(' · ')}</p>`;
  }

  function cardHtml(it, idx) {
    const { c, p, d, avg, diff, av, r } = it, v = qView();
    const [cls, tag] = diffTag(diff);
    const pct = clamp(50 + (avg ? (diff / avg) * 100 : 0), 5, 95);
    const rank = S.q.sort === 'price' && idx < 3 ? `<span class="tag rank">최저가 ${idx + 1}위</span>` : '';
    const seats = av.free === 0 ? '<span class="cseats none">만석 · 다른 시간 확인</span>' : `<span class="cseats${av.free <= 3 ? ' few' : ''}">잔여 ${av.free}/${av.total}석</span>`;
    const where = [c.station ? `<span>${ico('train', 14)}${esc(c.station)}</span>` : '', c.univ ? `<span>${ico('school', 14)}${esc(c.univ)}</span>` : ''].join('');
    return `<li class="card${S.hl === c.id ? ' hl' : ''}" id="card-${c.id}" data-act="open" data-id="${c.id}">
      <div class="thumbbox">${photo(c, 0)}<div class="tags">${rank}${c.fac.includes('h') ? '<span class="tag">24시간</span>' : ''}${c.real ? '<span class="tag">요금 예시</span>' : ''}</div></div>
      <div class="cbody">
        <div class="cname">${esc(c.name)}</div>
        <div class="cloc"><span>${ico('pin', 14)}${esc(c.sigungu)} · ${km(d)}</span>${where}</div>
        <div class="crate">${r.n ? `<span class="star">★</span> ${r.avg.toFixed(1)} <span class="muted">(${r.n})</span>` : '<span class="muted">후기 없음</span>'}</div>
        <div class="cfac">${c.fac.filter((f) => f !== 'h').slice(0, 4).map((f) => `<span>${FAC[f]}</span>`).join('')}</div>
        <div class="cprice"><span class="p">${v.mode === 'HOURLY' ? '시간당' : PLAN[v.plan]}${c.real ? ' (예시)' : ''} <b>${won(p)}</b><small class="cavg">${tag}</small></span>${seats}</div>
      </div></li>`;
  }

  function renderResults() {
    const box = $('#results');
    if (!box) return;
    let list = results();
    const v = qView(), q = S.q;
    // 내 위치 모드에서 반경 안에 카페가 없으면 가장 가까운 카페를 대신 보여준다
    const nearestOnly = q.geo && !list.length;
    if (nearestOnly) list = results(true).sort((a, b) => a.d - b.d); // 반경 안이 비면 6곳으로 자르지 않고 불러온 카페 전체를 가까운 순으로 보여준다
    const where = q.geo ? '내 주변' : `${q.sido} ${q.sigungu}`;
    const when = v.mode === 'HOURLY' ? `${fmtDate(v.date)} ${hh(v.start)}–${hh(v.end)}` : `${PLAN[v.plan]}`;
    const sorts = [['price', '최저가순'], ['distance', '거리순'], ['rating', '평점순'], ['diff', '평균 대비 저렴순']];
    const loading = !!S.regionLoading, noKakao = !S.kakao && !D.cafes.some((c) => c.sido === q.sido && c.sigungu === q.sigungu);
    const empty = loading ? `<li class="empty"><h3>카카오맵에서 ${esc(q.sigungu)} 스터디카페를 불러오는 중이에요</h3><p class="muted">처음 보는 지역은 몇 초 걸려요. 한 번 불러온 지역은 다음부터 바로 보여요.</p></li>`
      : noKakao ? `<li class="empty"><h3>이 지역은 카카오맵 연결이 필요해요</h3><p class="muted">지도를 불러오지 못해 실제 카페 정보를 가져올 수 없어요. 잠시 뒤 다시 시도해 주세요.</p></li>`
      : `<li class="empty"><h3>조건에 맞는 스터디카페가 없어요</h3><p class="muted">${q.geo ? '내 주변에 카페가 없을 수 있어요. 지역을 직접 선택해 보세요.' : S.regionError === `${q.sido}|${q.sigungu}` ? '카카오맵에서 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.' : '이 지역에는 카카오맵에 등록된 스터디카페가 없거나, 조건에 맞는 곳이 없어요.'}</p><button class="btn primary" data-act="reset">조건 초기화</button></li>`;
    const hlIdx = list.findIndex((it) => it.c.id === S.hl);
    if (hlIdx >= S.limit) S.limit = hlIdx + 1; // 지도에서 고른 카페가 목록에 보이도록 목록을 그 위치까지 펼친다
    const shown = list.slice(0, S.limit);
    const realNote = S.regionLoading ? `<p class="note" style="margin-bottom:12px">카카오맵에서 ${esc(q.sigungu)} 스터디카페를 불러오는 중이에요…</p>`
      : '';
    const why = { denied: '위치 권한이 꺼져 있어', unavailable: '현재 위치를 확인하지 못해', abroad: '내 위치 주변에서 지역 정보를 찾지 못해', unsupported: '이 브라우저에서는 위치 기능을 쓸 수 없어' }[S.locFail];
    const locNote = !S.me && why ? `<div class="locnote"><span>${why} <b>${esc(q.sido)} ${esc(q.sigungu)}</b> 기준으로 보여드려요.</span><span class="locbtns">${['denied', 'unavailable'].includes(S.locFail) ? '<button class="btn sm" data-act="locHelp">위치 허용 방법</button>' : ''}${S.locFail !== 'unsupported' ? '<button class="btn sm" data-act="locRetry">다시 시도</button>' : ''}<button class="btn sm" data-act="goArea">지역 직접 선택</button></span></div>` : '';
    const regionChips = `<div class="chips regionchips" role="group" aria-label="지역 바로 선택">${D.quick.map(([sd, sg]) => `<button class="chip" data-act="region" data-s="${esc(sd)}" data-g="${esc(sg)}" aria-pressed="${!q.geo && q.sido === sd && q.sigungu === sg}">${esc(sg)}</button>`).join('')}</div>`;
    const nearNotice = nearestOnly && list.length ? `<div class="note" style="margin-bottom:14px;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><span>내 위치 반경 ${q.radius || 5}km 안에는 카페가 없어요. 반경 밖의 카페 ${list.length}곳을 가까운 순으로 모두 보여드려요. (가장 가까운 곳: ${km(list[0].d)})</span><button class="btn sm" data-act="geo">내 위치 해제</button></div>` : ``;
    box.innerHTML = `${locNote}${realNote}${nearNotice}${nearestOnly ? `` : avgStrip(list)}
      <div class="resbar"><div class="count">${esc(where)} 스터디카페 ${list.length}곳<small>${SEAT[v.type]} · ${esc(when)}</small></div>
        <div class="tabs">${sorts.map(([k, t]) => `<button class="tab" data-act="sort" data-v="${k}" aria-pressed="${q.sort === k}">${t}</button>`).join('')}
          <button class="tab map-toggle" data-act="view" data-v="${q.view === 'map' ? 'list' : 'map'}" aria-pressed="${q.view === 'map'}">${ico('pin', 15)} ${q.view === 'map' ? '목록만 보기' : '지도로 보기'}</button></div></div>
      <div class="reslayout${q.view === 'map' ? ' withmap' : ''}"><div><ul class="grid">${list.length ? shown.map((it, i) => cardHtml(it, i)).join('') : empty}</ul>${list.length > shown.length ? `<div style="text-align:center;margin-top:18px"><button class="btn" data-act="more">더 보기 (${shown.length}/${list.length})</button></div>` : ''}</div>${q.view === 'map' ? '<div class="mapbox" id="mapbox"></div>' : ''}</div>`;
    // 지도에는 조건에 맞는 카페를 모두 표시한다. 내 위치 점은 보고 있는 지역 가까이에 있을 때만 찍는다(멀면 지도가 너무 넓어진다).
    const mapOrg = q.geo || (S.me && dist(S.me, regionOf().center) < 15 ? S.me : null);
    if (q.view === 'map') drawMap($('#mapbox'), list, mapOrg, S.hl);
  }

  function mapNotice(el, message, retry = false) {
    $('.mapnotice', el)?.remove();
    el.insertAdjacentHTML('beforeend', `<div class="mapnotice" role="status"><span>${esc(message)}</span>${retry ? '<button class="btn sm" data-act="retryMap">다시 시도</button>' : ''}</div>`);
  }
  function refreshMaps() {
    const hs = $('.hero-stats');
    if (hs) hs.innerHTML = heroStats();
    renderResults();
    const mini = $('#miniMap');
    if (mini && S.book) {
      const c = cafeById(S.book.cafeId);
      if (c) drawMap(mini, [{ c, p: price(c, 'NORMAL', 'HOURLY'), diff: 0 }], null, c.id, true);
    }
  }
  let mapResizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(mapResizeTimer);
    mapResizeTimer = setTimeout(refreshMaps, 150);
  });

  // ---- 지도: 로딩 상태와 실패 안내를 간이 지도 위에 표시한다. ----------------------------
  function drawMap(el, items, org, hlId, asImage = false) {
    if (!el) return;
    if (S.kakao && window.kakao && kakao.maps && (items.length || org)) {
      try {
        el.innerHTML = '<div class="kmap"></div>';
        $('.kmap', el).addEventListener('error', (event) => {
          if (event.target.tagName === 'IMG') mapNotice(el, '지도 이미지를 불러오지 못했어요. 네트워크 연결을 확인하고 다시 시도해 주세요.', true);
        }, true);
        if (asImage && items.length === 1 && kakao.maps.StaticMap) { // 움직이지 않는 이미지 지도
          const { c, p, diff } = items[0];
          new kakao.maps.StaticMap($('.kmap', el), { center: new kakao.maps.LatLng(c.lat, c.lng), level: 3 });
          el.insertAdjacentHTML('beforeend', `<span class="pin on" style="left:50%;top:50%;z-index:4"><span class="bubble ${diff < 0 ? 'low' : diff > 0 ? 'high' : ''}">${p.toLocaleString('ko-KR')}</span></span>
            <a class="maplink" href="https://map.kakao.com/link/map/${encodeURIComponent(c.name)},${c.lat},${c.lng}" target="_blank" rel="noopener">카카오맵에서 크게 보기 ↗</a>`);
          return;
        }
        // 카페가 한 곳이면 그 카페를 가운데에 둔다 (넓은 군에서는 기준 위치가 화면 밖일 수 있다)
        const ctr = items.length === 1 ? [items[0].c.lat, items[0].c.lng] : (org || [items[0].c.lat, items[0].c.lng]);
        const map = new kakao.maps.Map($('.kmap', el), { center: new kakao.maps.LatLng(ctr[0], ctr[1]), level: 5 });
        const bounds = new kakao.maps.LatLngBounds();
        const many = items.length > 30; // 카페가 많으면 작은 점으로 찍고, 고른 카페만 가격 말풍선으로 보여준다
        items.forEach(({ c, p, diff }) => {
          const pos = new kakao.maps.LatLng(c.lat, c.lng), b = document.createElement('button');
          const bubble = !many || hlId === c.id, tone = diff < 0 ? 'low' : diff > 0 ? 'high' : '';
          b.className = bubble ? 'kpin' : 'kdot'; b.setAttribute('aria-label', c.name); b.title = c.name;
          b.innerHTML = bubble ? `<span class="bubble ${tone}">${p.toLocaleString('ko-KR')}</span>` : `<span class="dotm ${tone}"></span>`;
          b.onclick = () => { if (items.length > 1) { S.hl = c.id; renderResults(); } else location.hash = 'cafe-' + c.id; };
          new kakao.maps.CustomOverlay({ map, position: pos, content: b, xAnchor: 0.5, yAnchor: bubble ? 1 : 0.5, zIndex: hlId === c.id ? 10 : 1 });
          bounds.extend(pos);
        });
        if (org) {
          const dot = document.createElement('span'); dot.className = 'origin'; dot.title = '기준 위치';
          new kakao.maps.CustomOverlay({ map, position: new kakao.maps.LatLng(org[0], org[1]), content: dot, xAnchor: 0.5, yAnchor: 0.5 });
          bounds.extend(new kakao.maps.LatLng(org[0], org[1]));
        }
        if (items.length > 1) map.setBounds(bounds);
        return;
      } catch {
        S.kakao = false;
        S.mapStatus = 'error';
      }
    }
    const pts = items.map((i) => [i.c.lat, i.c.lng]);
    if (org) pts.push(org);
    const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1]);
    const minLa = Math.min(...lats), minLn = Math.min(...lngs);
    const rLa = Math.max(Math.max(...lats) - minLa, 0.012), rLn = Math.max(Math.max(...lngs) - minLn, 0.012);
    const pos = (la, ln) => `left:${8 + 84 * ((ln - minLn) / rLn)}%;top:${16 + 70 * (1 - (la - minLa) / rLa)}%`;
    el.innerHTML = `<div class="fakemap"></div>
      ${items.map(({ c, p, diff }) => { const tone = diff < 0 ? 'low' : diff > 0 ? 'high' : ''; return items.length > 30 && hlId !== c.id
        ? `<button class="pindot" style="${pos(c.lat, c.lng)}" data-act="pin" data-id="${c.id}" aria-label="${esc(c.name)}" title="${esc(c.name)}"><span class="dotm ${tone}"></span></button>`
        : `<button class="pin${hlId === c.id ? ' on' : ''}" style="${pos(c.lat, c.lng)}" data-act="pin" data-id="${c.id}" aria-label="${esc(c.name)}"><span class="bubble ${tone}">${p.toLocaleString('ko-KR')}</span></button>`; }).join('')}
      ${org ? `<span class="origin" style="${pos(org[0], org[1])}" title="기준 위치"></span>` : ''}
      <span class="maplabel">간이 위치도${org ? ' · 파란 점은 기준 위치' : ''}</span>`;
    if (items.length === 1) {
      const c = items[0].c;
      el.insertAdjacentHTML('beforeend', `<a class="maplink" href="https://map.kakao.com/link/map/${encodeURIComponent(c.name)},${c.lat},${c.lng}" target="_blank" rel="noopener">카카오맵에서 크게 보기 ↗</a>`);
    }
    if (S.mapStatus === 'loading') mapNotice(el, '카카오 지도를 불러오는 중이에요.');
    else if (S.mapStatus === 'error') mapNotice(el, '카카오 지도를 불러오지 못해 간이 위치도를 표시해요.', true);
    else if (S.mapStatus === 'unconfigured') mapNotice(el, '현재 간이 위치도를 표시하고 있어요.');
  }
  // 키는 public/config.js 의 window.KAKAO_JS_KEY (정적 배포용), 없으면 서버의 /api/config 에서 받는다.
  // 키가 없거나 SDK 를 불러오지 못하면 간이 지도를 그대로 쓴다.
  function initKakao() {
    S.mapStatus = 'loading';
    // SDK가 이미 준비된 경우 이미지 요청만 다시 시도한다.
    if (S.kakao) { S.mapStatus = 'ready'; refreshMaps(); return; }
    let settled = false;
    let timer;
    const finish = (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      S.mapStatus = status;
      S.kakao = status === 'ready';
      // 지도가 준비되면 카카오 장소 검색으로 실제 스터디카페를 불러온 뒤 화면을 갱신한다
      if (S.kakao) {
        S.regionLoading = regKey(regionOf()); refreshMaps();
        (S.q.geo ? ensureNear(S.q.geo, S.q.radius || 5) : ensureRegion(regionOf())).finally(() => onRealLoaded());
      }
      else refreshMaps();
    };
    timer = setTimeout(() => finish('error'), 12000);
    const load = (key) => {
      document.getElementById('kakao-sdk')?.remove();
      const s = document.createElement('script');
      s.id = 'kakao-sdk';
      s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&libraries=services&autoload=false`;
      s.onerror = () => finish('error');
      s.onload = () => {
        if (!window.kakao?.maps?.load) { finish('error'); return; }
        try { window.kakao.maps.load(() => finish('ready')); }
        catch { finish('error'); }
      };
      document.head.appendChild(s);
    };
    if (window.KAKAO_JS_KEY) { load(window.KAKAO_JS_KEY); return; }
    if (window.DEMO_ONLY) { finish('unconfigured'); return; }
    fetch('/api/config').then((r) => (r.ok ? r.json() : {})).then((cfg) => {
      if (settled) return;
      if (cfg.kakaoJsKey) load(cfg.kakaoJsKey); else finish('unconfigured');
    }).catch(() => finish('unconfigured'));
  }

  // ---- 카카오 장소 검색(Places API)으로 가져온 실제 스터디카페 ---------------------------------
  // 이름·주소·전화번호·좌표·카카오맵 링크·가까운 역/대학은 카카오 정보다.
  // 카카오는 요금·좌석 수·시설·사진·후기를 주지 않으므로 요금과 좌석 수는 예시 값(c.real 로 표시)이다.
  // 전국 시·군·구를 한꺼번에 가져오면 호출이 너무 많아서, 사용자가 고른 시·군·구만 그때 검색하고 24시간 저장한다.
  const regKey = (r) => `${r.sido}|${r.sigungu}`;
  const REGION_MEMO = 'studymoa:lastRegion';
  const rememberRegion = () => { try { localStorage.setItem(REGION_MEMO, JSON.stringify([S.q.sido, S.q.sigungu])); } catch { /* 저장소 사용 불가 */ } };
  function restoreRegion() { // 위치를 못 받았을 때를 위해, 마지막에 직접 고른 지역으로 시작한다
    try { const m = JSON.parse(localStorage.getItem(REGION_MEMO) || 'null'); if (m && D.regions.some((r) => r.sido === m[0] && r.sigungu === m[1])) { S.q.sido = m[0]; S.q.sigungu = m[1]; } } catch { /* 저장된 지역 없음 */ }
  }
  const regCacheKey = (r) => `studymoa:r:v1:${regKey(r)}`;
  // 카카오 주소(예: '서울 강남구 역삼동', '충남 천안시 서북구 ...')가 이 시·군·구에 속하는지
  // 시·도는 전체 이름('세종특별자치시', '강원특별자치도')이나 줄임말('충북', '경기') 어느 쪽으로 시작해도 인정한다. 세종은 시·군·구가 없다.
  const addrOk = (addr, r) => [r.sido, ...(D.ALIAS[r.sido] || [])].some((a) => addr.startsWith(a)) && (r.sigungu === r.sido || new RegExp(`(^| )${r.sigungu}( |$)`).test(addr));
  function fromPlace(p, region) {
    const id = Number(p.id), r = (k) => hash(`${id}|${k}`);
    return {
      id, real: true, name: p.place_name, sido: region.sido, sigungu: region.sigungu,
      addr: p.road_address_name || p.address_name, lat: Number(p.y), lng: Number(p.x), phone: p.phone || '', url: p.place_url || '',
      open: 0, close: 24, busy: 0.6 + r('b') * 0.4, roomCap: r('c') < 0.5 ? 4 : 6,
      seats: { NORMAL: 30 + Math.floor(r('a') * 40), FOCUS: 8 + Math.floor(r('f') * 16), ROOM: 2 + Math.floor(r('r') * 3) },
      fac: [], station: null, univ: null, reviews: [],
      price: D.makePrice(Math.round((1700 + r('n') * 2300) / 100) * 100),
    };
  }
  function applyRegion(reg, real) { // 이 지역의 샘플 카페는 빼서 보관하고, 실제 카페를 넣는다
    for (let i = D.cafes.length - 1; i >= 0; i--) {
      const c = D.cafes[i];
      if (!c.real && c.sido === reg.sido && c.sigungu === reg.sigungu) archived.push(...D.cafes.splice(i, 1));
    }
    real.forEach((c) => { if (!D.cafes.some((x) => x.id === c.id)) D.cafes.push(c); });
    // 경계 상자의 한가운데는 산이나 바다일 수 있어서, 대표 역이 정해지지 않은 지역은 카페가 모인 곳의 중심을 거리 기준으로 쓴다
    if (real.length && /중심$/.test(reg.label)) {
      reg.center = [real.reduce((s, c) => s + c.lat, 0) / real.length, real.reduce((s, c) => s + c.lng, 0) / real.length];
      reg.label = `${reg.sigungu} 카페 중심`;
    }
    avgCache.clear();
  }
  function readRegionCache(reg) {
    try {
      const o = JSON.parse(localStorage.getItem(regCacheKey(reg)) || 'null');
      if (o && Date.now() - o.t < 864e5 && Array.isArray(o.cafes)) return o.cafes;
    } catch { /* 저장된 데이터 없음 */ }
    return null;
  }
  async function scanRegion(reg) {
    const svc = window.kakao && kakao.maps && kakao.maps.services;
    if (!svc) throw new Error('카카오 장소 검색 라이브러리를 불러오지 못했어요.');
    const ps = new svc.Places();
    // 카카오 함수의 인자 순서는 (검색어 또는 분류 코드, 콜백, 옵션) 이다
    const ask = (fn, first, opt) => new Promise((res) => fn.call(ps, first, (d, st) => res(st === svc.Status.OK ? d : []), opt));
    const found = new Map(), stations = new Map(), univs = new Map();
    // 시·군·구 전체를 빠짐없이 가져오려고 경계 상자를 격자로 나눠 검색한다. (한 번에 최대 45건만 주기 때문)
    // 한 칸의 결과가 45건을 넘으면 그 칸을 4등분해서 다시 검색한다.
    const rectOf = (x0, y0, x1, y1) => [x0, y0, x1, y1].map((v) => v.toFixed(6)).join(',');
    const scanCell = async (x0, y0, x1, y1, depth) => {
      let capped = false;
      for (let page = 1; page <= 3; page++) {
        const d = await ask(ps.keywordSearch, '스터디카페', { rect: rectOf(x0, y0, x1, y1), page });
        d.forEach((p) => { if (/스터디카페/.test(p.category_name) && addrOk(p.address_name, reg)) found.set(p.id, p); }); // 분류가 '스터디카페'이고 이 구에 속한 곳만
        if (d.length < 15) break;
        if (page === 3) capped = true;
      }
      if (capped && depth < 3) {
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        await Promise.all([[x0, y0, mx, my], [mx, y0, x1, my], [x0, my, mx, y1], [mx, my, x1, y1]].map((c) => scanCell(...c, depth + 1)));
      }
    };
    const [x0, y0, x1, y1] = reg.box;
    const nx = Math.min(8, Math.max(1, Math.ceil(((x1 - x0) * 88) / 2.5))), ny = Math.min(8, Math.max(1, Math.ceil(((y1 - y0) * 111) / 2.5)));
    const dx = (x1 - x0) / nx, dy = (y1 - y0) / ny, cells = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) cells.push([x0 + i * dx, y0 + j * dy, x0 + (i + 1) * dx, y0 + (j + 1) * dy]);
    for (let k = 0; k < cells.length; k += 4) await Promise.all(cells.slice(k, k + 4).map((c) => scanCell(...c, 0))); // 한 번에 4칸씩
    const rect = rectOf(x0 - 0.01, y0 - 0.01, x1 + 0.01, y1 + 0.01);
    if (found.size) { // 카페가 있는 구에서만 가까운 역·대학교를 찾는다
      for (let page = 1; page <= 3; page++) {
        const d = await ask(ps.categorySearch, 'SW8', { rect, page });
        d.forEach((p) => { const n = p.place_name.split(' ')[0]; stations.set(n, { name: n, lat: Number(p.y), lng: Number(p.x) }); });
        if (d.length < 15) break;
      }
      for (let page = 1; page <= 2; page++) {
        const u = await ask(ps.keywordSearch, '대학교', { rect, page });
        u.forEach((p) => { if (/대학교/.test(p.category_name) && /대학교$/.test(p.place_name)) univs.set(p.place_name, { name: p.place_name, lat: Number(p.y), lng: Number(p.x) }); });
        if (u.length < 15) break;
      }
    }
    const nearest = (c, map, maxKm) => {
      let best = null, bd = Infinity;
      map.forEach((s) => { const d = dist([c.lat, c.lng], [s.lat, s.lng]); if (d < bd) { bd = d; best = s; } });
      return best && bd <= maxKm ? { name: best.name, km: bd } : null;
    };
    const list = [];
    found.forEach((p) => {
      const c = fromPlace(p, reg);
      const st = nearest(c, stations, 0.8), un = nearest(c, univs, 1.2);
      if (st) c.station = `${st.name} 도보 ${Math.max(1, Math.round((st.km * 1000) / 70))}분`;
      if (un) c.univ = `${un.name} 인근`;
      list.push(c);
    });
    return list;
  }
  // 고른 시·군·구의 실제 카페를 불러온다. 이미 본 구는 저장된 결과를 쓴다. (같은 구를 동시에 두 번 검색하지 않는다)
  function ensureRegion(reg) {
    const key = regKey(reg);
    if (S.regionDone.has(key)) return Promise.resolve();
    const cached = readRegionCache(reg);
    if (cached) { applyRegion(reg, cached); S.regionDone.add(key); return Promise.resolve(); }
    if (!S.kakao) return Promise.resolve(); // 카카오 연결이 없으면 샘플 지역만 볼 수 있다
    if (!S.inflight.has(key)) {
      S.regionLoading = key;
      S.inflight.set(key, scanRegion(reg).then((list) => {
        applyRegion(reg, list);
        try { localStorage.setItem(regCacheKey(reg), JSON.stringify({ t: Date.now(), cafes: list })); } catch { /* 저장소 사용 불가 */ }
      }).catch(() => { S.regionError = key; }).finally(() => {
        S.regionDone.add(key); S.inflight.delete(key);
        if (S.regionLoading === key) S.regionLoading = null;
      }));
    }
    return S.inflight.get(key);
  }
  // 현재 위치를 받아 거리 기준과 '내 주변' 모드로 설정한다. 한국 안(가장 가까운 시·군·구가 40km 이내)이 아니면 쓰지 않는다.
  function locate() {
    if (!navigator.geolocation) { S.locFail = 'unsupported'; return Promise.resolve(false); }
    S.locating = true;
    return new Promise((resolve) => navigator.geolocation.getCurrentPosition((p) => {
      S.locating = false;
      const pt = [p.coords.latitude, p.coords.longitude];
      const near = D.regions.map((r) => ({ r, d: dist(pt, r.center) })).sort((a, b) => a.d - b.d)[0];
      if (!near || near.d > 40) { S.locFail = 'abroad'; resolve(false); return; }
      S.locFail = null; S.me = pt;
      S.q.sido = near.r.sido; S.q.sigungu = near.r.sigungu; // 지역 선택도 지금 있는 곳으로 맞춘다
      resolve(true);
    }, (err) => {
      S.locating = false;
      S.locFail = err && err.code === 1 ? 'denied' : 'unavailable'; // 1 = 사용자가 거부
      resolve(false);
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }));
  }
  // 현재 위치를 받아 지역 선택(시/도·구/군)과 결과를 그 위치로 바꾼다. 성공하면 true.
  function applyLocation(announce) {
    if (S.locating) return Promise.resolve(false);
    return locate().then((ok) => {
      if (!ok) { renderResults(); return false; }
      refreshPanel(); refreshCats();
      const pr = ensureRegion(regionOf()); renderResults(); pr.finally(() => onRealLoaded()); // 지금 있는 시·군·구의 카페 전체를 불러온다
      if (announce) toast(`현재 위치를 반영했어요: ${S.q.sido} ${S.q.sigungu}`);
      return true;
    });
  }
  // 위치 권한이 나중에 '허용'으로 바뀌면(주소창에서 바꾸거나 설정을 다녀온 뒤) 버튼을 누르지 않아도 자동으로 반영한다
  function watchLocationPermission() {
    const retry = () => { if (!S.me && !S.locating) applyLocation(true); };
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((st) => { st.onchange = () => { if (st.state === 'granted') retry(); }; }).catch(() => { /* 지원하지 않는 브라우저 */ });
    }
    // 권한 변경 신호를 못 받는 브라우저를 위해, 사이트로 돌아왔을 때도 한 번 확인한다
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !S.me && S.locFail === 'denied' && navigator.permissions) navigator.permissions.query({ name: 'geolocation' }).then((st) => { if (st.state === 'granted') retry(); }).catch(() => {}); });
  }
  // 내 위치 모드: 내 위치 주변(반경 안)에 걸친 시·군·구를 모두 불러온다 (너무 많으면 가까운 3곳)
  function ensureNear(pt, km) {
    const near = D.regions.map((r) => {
      const [x0, y0, x1, y1] = r.box, pad = km / 88;
      return { r, d: dist(pt, r.center), hit: pt[1] >= x0 - pad && pt[1] <= x1 + pad && pt[0] >= y0 - km / 111 && pt[0] <= y1 + km / 111 };
    }).filter((x) => x.hit).sort((a, b) => a.d - b.d).slice(0, 3);
    return Promise.all(near.map((x) => ensureRegion(x.r)));
  }

  // =====================================================================================
  // 카페 상세 + ④ 예약
  // =====================================================================================
  function initBook(c) {
    const v = qView();
    const type = c.price[v.type] ? v.type : 'NORMAL';
    const b = { cafeId: c.id, type, mode: type === 'ROOM' ? 'HOURLY' : v.mode, plan: v.plan, date: v.date < todayStr() ? todayStr() : v.date, start: v.start, end: v.end, seat: null, method: 'CARD' };
    b.start = clamp(b.start, c.open, c.close - 1);
    b.end = clamp(b.end, b.start + 1, c.close);
    S.book = b;
  }
  const bookTotal = () => { const b = S.book, p = price(cafeById(b.cafeId), b.type, b.mode, b.plan); return b.mode === 'HOURLY' ? p * (b.end - b.start) : p; };
  function timeError(c, o) {
    if (o.date < todayStr()) return '지난 날짜는 예약할 수 없어요.';
    if (o.mode === 'HOURLY') {
      if (o.end <= o.start) return '종료 시간이 시작 시간보다 늦어야 해요.';
      if (!isOpen(c, o)) return `운영 시간(${hoursText(c)})을 벗어났어요.`;
      if (o.date === todayStr() && o.start < new Date().getHours()) return '이미 지난 시간이에요.';
    }
    return '';
  }

  function showCafe(id) {
    const c = cafeById(id);
    if (!c) { location.hash = 'home'; return; }
    initBook(c);
    const r = ratingOf(c);
    const q = S.q;
    view.innerHTML = `<div class="wrap">
      <div class="crumbs"><button data-act="goto" data-hash="home">홈</button> › <span>${esc(c.sido)} ${esc(c.sigungu)}</span> › <span>${esc(c.name)}</span></div>
      <div class="dhead"><div><h1>${esc(c.name)}</h1>
        <div class="meta"><span>${ico('pin', 16)}${esc(c.addr)}</span>${c.station ? `<span>${ico('train', 16)}${esc(c.station)}</span>` : ''}<span>${ico('clock', 16)}${hoursText(c)}</span><span><b style="color:var(--gold)">★</b> ${r.n ? r.avg.toFixed(1) : '-'} (${r.n})</span></div></div>
        <div class="chips">${c.fac.map((f) => `<span class="chip">${ico(FACICO[f], 15)}${FAC[f]}</span>`).join('')}</div></div>
      <div class="gallery gallery-one"><figure>${photo(c, 0)}</figure></div>
      <p class="photonote">${c.real && c.url ? `사진은 <a href="${esc(c.url)}" target="_blank" rel="noopener">카카오맵에서 보기 ↗</a>` : '사진은 준비 중이에요.'}</p>
      ${c.real ? `<p class="note" style="margin:12px 0 0">이 카페의 <b>이름·주소·전화번호·위치</b>는 카카오맵 정보이고, <b>요금·좌석 수는 예시</b>예요. 실제 정보는 ${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">카카오맵에서 확인</a>` : '카카오맵에서 확인'}해 주세요.</p>` : ''}
      <div class="dlayout"><div class="dmain">
        <nav class="subnav" aria-label="상세 메뉴">${[['sec-price', '가격'], ['sec-seats', '좌석 현황'], ['sec-fac', '시설'], ['sec-loc', '위치·운영'], ['sec-rev', `후기 ${r.n}`]].map(([i, t]) => `<button data-act="nav" data-to="${i}">${t}</button>`).join('')}</nav>
        <section class="dsec" id="sec-price"><h2>${ico('chart', 20)}가격 정보${c.real ? ' <small class="muted" style="font-size:13px;font-weight:400">(예시 요금)</small>' : ''}</h2>${priceTable(c)}</section>
        <section class="dsec" id="sec-seats"><h2>${ico('user', 20)}실시간 좌석 현황</h2><div id="seatbox"></div></section>
        <section class="dsec" id="sec-fac"><h2>${ico('sofa', 20)}시설 안내</h2>${c.real ? '<p class="muted" style="margin:0">시설 정보는 카카오맵이 제공하지 않아 표시하지 않아요. 카카오맵 링크에서 확인해 주세요.</p>' : ''}<div class="facgrid"${c.real ? ' hidden' : ''}>${Object.entries(FAC).map(([k, t]) => `<div class="facitem${c.fac.includes(k) ? '' : ' off'}"><span class="ci">${ico(FACICO[k], 20)}</span>${t}${c.fac.includes(k) ? '' : ' (없음)'}</div>`).join('')}</div></section>
        <section class="dsec" id="sec-loc"><h2>${ico('pin', 20)}위치·운영 정보</h2><div class="locgrid">
          <ul class="infolist">
            <li>${ico('pin', 18)}<span>${esc(c.addr)}</span></li>
            ${c.station ? `<li>${ico('train', 18)}<span>${esc(c.station)}</span></li>` : ''}
            ${c.univ ? `<li>${ico('school', 18)}<span>${esc(c.univ)}</span></li>` : ''}
            ${c.phone ? `<li>${ico('phone', 18)}<span>${esc(c.phone)}</span></li>` : ''}
            <li>${ico('clock', 18)}<span>${hoursText(c)}</span></li>
            <li>${ico('user', 18)}<span>${c.real ? '(예시) ' : ''}총 ${c.seats.NORMAL + c.seats.FOCUS + c.seats.ROOM}석 · 일반석 ${c.seats.NORMAL} · 집중석 ${c.seats.FOCUS} · 스터디룸 ${c.seats.ROOM}개(최대 ${c.roomCap}인)</span></li>
            <li>${ico('target', 18)}<span>${S.me ? '내 위치' : esc(regionOf().label)}에서 ${km(dist(origin(), [c.lat, c.lng]))}</span></li>
          </ul><div class="mini mapbox" id="miniMap" style="position:relative;top:0;height:220px;min-height:0"></div></div></section>
        <section class="dsec" id="sec-rev"><h2>${ico('book', 20)}이용 후기</h2>${reviewBlock(c)}</section>
      </div>
      <aside><div class="bookcard" id="bookbox"></div></aside></div></div>`;
    drawMap($('#miniMap'), [{ c, p: price(c, 'NORMAL', 'HOURLY'), diff: 0 }], null, c.id, true);
    refreshBook();
    window.scrollTo(0, 0);
    void q;
  }

  function priceTable(c) {
    const cell = (type, mode, plan) => {
      const p = price(c, type, mode, plan);
      if (p == null) return '<td class="muted">–</td>';
      const [cls, t] = diffTag(p - regionAvg(c, type, mode, plan));
      return `<td><span class="pv">${won(p)}</span>${mode === 'HOURLY' ? `<small class="diff">${t}</small>` : ''}</td>`;
    };
    return `<div class="tablewrap"><table class="price"><thead><tr><th>구분</th><th>시간제 (1시간)</th><th>1일권</th><th>주간권 (7일)</th><th>월간권 (30일)</th></tr></thead><tbody>
      ${['NORMAL', 'FOCUS', 'ROOM'].map((t) => `<tr><td>${SEAT[t]}${t === 'ROOM' ? `<small class="muted">최대 ${c.roomCap}인</small>` : ''}</td>${cell(t, 'HOURLY')}${cell(t, 'PERIOD', 'DAY')}${cell(t, 'PERIOD', 'WEEK')}${cell(t, 'PERIOD', 'MONTH')}</tr>`).join('')}
      </tbody></table></div><p class="muted" style="font-size:12.5px;margin:8px 0 0">시간제 금액 아래 작은 글씨는 ${esc(c.sigungu)} 안의 같은 좌석 유형 평균과 비교한 금액이에요.</p>`;
  }
  function reviewBlock(c) {
    const l = reviewsOf(c), r = ratingOf(c);
    const dist5 = [5, 4, 3, 2, 1].map((n) => [n, l.filter((x) => x.rating === n).length]);
    return `<div class="revhead"><div><div class="num">${r.n ? r.avg.toFixed(1) : '-'}</div>${starsHtml(r.avg)}<div class="muted" style="font-size:13px">후기 ${r.n}개</div></div>
      <div style="flex:1;min-width:180px;display:grid;gap:3px;font-size:12.5px">${dist5.map(([n, k]) => `<div style="display:flex;align-items:center;gap:8px"><span style="width:24px">${n}점</span><span style="flex:1;height:6px;border-radius:9px;background:var(--line);overflow:hidden"><span style="display:block;height:100%;width:${l.length ? (k / l.length) * 100 : 0}%;background:var(--gold)"></span></span><span style="width:20px;text-align:right" class="muted">${k}</span></div>`).join('')}</div></div>
      ${l.map((x) => `<div class="revitem"><div class="top">${starsHtml(x.rating)}<span>${esc(x.name)}</span><span>${esc(x.date)}</span></div><div>${esc(x.text)}</div></div>`).join('')}`;
  }

  function refreshBook() { renderSeats(); renderBook(); }

  function renderSeats() {
    const b = S.book, box = $('#seatbox'), c = cafeById(b.cafeId);
    if (!box) return;
    const av = avail(c, b.type, b);
    if (b.seat && av.taken.has(b.seat)) b.seat = null;
    const when = `${fmtDate(b.date)} ${b.mode === 'HOURLY' ? `${hh(b.start)}–${hh(b.end)}` : `${PLAN[b.plan]} 시작`}`;
    box.innerHTML = `<div class="seatstat"><div><div class="big">${SEAT[b.type]} ${av.free}/${av.total}석 이용 가능</div><div class="muted" style="font-size:13px">${esc(when)} 기준</div></div>
      <div class="legend"><span><i class="f"></i>예약 가능</span><span><i class="t"></i>사용 중</span><span><i class="s"></i>선택</span></div></div>
      <div class="seatmap"><div class="screen">${b.type === 'ROOM' ? 'ROOMS' : 'ENTRANCE'}</div>
        <div class="seats${b.type === 'ROOM' ? ' rooms' : ''}">${av.keys.map((k) => `<button class="seat${b.seat === k ? ' sel' : ''}" data-act="bseat" data-k="${k}" ${av.taken.has(k) ? 'disabled' : ''} aria-label="${seatLabel(k, b.type)}${av.taken.has(k) ? ' (사용 중)' : ''}">${b.type === 'ROOM' ? `룸 ${k.slice(1)}<br><small>최대 ${c.roomCap}인</small>` : k.slice(1)}</button>`).join('')}</div></div>`;
  }

  function renderBook() {
    const b = S.book, box = $('#bookbox'), c = cafeById(b.cafeId);
    if (!box) return;
    const err = timeError(c, b);
    const total = bookTotal(), unit = price(c, b.type, b.mode, b.plan);
    const label = err ? '시간을 확인해 주세요' : !b.seat ? '좌석을 선택해 주세요' : `${won(total)} 결제하기`;
    box.innerHTML = `<h3>예약하기</h3>
      <div class="field"><span class="lbl">이용 형태</span><div class="seg"><button data-act="bmode" data-v="HOURLY" aria-pressed="${b.mode === 'HOURLY'}">시간제</button><button data-act="bmode" data-v="PERIOD" aria-pressed="${b.mode === 'PERIOD'}" ${b.type === 'ROOM' ? 'disabled title="스터디룸은 시간제만 가능해요"' : ''}>기간제</button></div></div>
      <div class="field"><span class="lbl">좌석 유형</span><div class="seg">${['NORMAL', 'FOCUS', 'ROOM'].map((t) => `<button data-act="btype" data-v="${t}" aria-pressed="${b.type === t}">${SEAT[t]}</button>`).join('')}</div></div>
      ${b.mode === 'HOURLY' ? `<div class="row3">
          <div class="field"><label for="bDate">날짜</label><input id="bDate" type="date" data-b="date" min="${todayStr()}" value="${esc(b.date)}"></div>
          <div class="field"><label for="bStart">시작</label><select id="bStart" data-b="start">${timeOptions(b.start, c.open, c.close - 1)}</select></div>
          <div class="field"><label for="bEnd">종료</label><select id="bEnd" data-b="end">${timeOptions(b.end, b.start + 1, c.close)}</select></div></div>`
    : `<div class="field"><label for="bDate">시작일</label><input id="bDate" type="date" data-b="date" min="${todayStr()}" value="${esc(b.date)}"></div>
          <div class="field"><span class="lbl">이용 기간</span><div class="chips">${Object.entries(PLAN).map(([k, t]) => `<button class="chip" data-act="bplan" data-v="${k}" aria-pressed="${b.plan === k}">${t}</button>`).join('')}</div></div>`}
      ${b.seat ? `<div class="sumrows">
        <div><span class="muted">좌석</span><span>${seatLabel(b.seat, b.type)}</span></div>
        <div><span class="muted">${b.mode === 'HOURLY' ? '시간당 요금' : `${PLAN[b.plan]} 요금`}</span><span>${won(unit)}</span></div>
        ${b.mode === 'HOURLY' ? `<div><span class="muted">이용 시간</span><span>${Math.max(0, b.end - b.start)}시간</span></div>` : `<div><span class="muted">이용 기간</span><span>${fmtDate(b.date)} ~ ${fmtDate(addDays(b.date, DAYS[b.plan] - 1))}</span></div>`}
        ${err ? '' : `<div class="total"><span>결제 금액</span><span>${won(total)}</span></div>`}</div>`
      : '<p class="seathint">아래 좌석 현황에서 원하는 좌석을 선택하면 요금이 표시돼요. 선택한 좌석을 다시 누르면 해제돼요.</p>'}
      ${err ? `<p class="err">${esc(err)}</p>` : ''}
      <button class="btn primary lg block" style="margin-top:14px" data-act="pay" ${err || !b.seat ? 'disabled' : ''}>${label}</button>
      <p class="refund">이용 1시간 전까지 취소하면 100% 환불, 이후에는 50% 환불돼요. (기간제는 시작 전 100%)</p>`;
  }

  // ---- 결제 ----------------------------------------------------------------------------
  function openPay() {
    const u = me(), b = S.book, c = cafeById(b.cafeId);
    if (!u) { openAuth('login', openPay); return; }
    const err = timeError(c, b);
    if (err || !b.seat) { toast(err || '좌석을 선택해 주세요.'); return; }
    openModal(`<div class="stepdots"><i class="on"></i><i></i></div><h2>결제</h2><p class="muted" style="margin:0 0 12px">모의 결제예요. 실제로 돈이 빠져나가지 않아요.</p>
      <div class="sumrows" style="border:none;margin:0 0 14px;padding:0">
        <div><span class="muted">스터디카페</span><b>${esc(c.name)}</b></div>
        <div><span class="muted">좌석</span><span>${seatLabel(b.seat, b.type)}</span></div>
        <div><span class="muted">이용 일시</span><span>${fmtDate(b.date)} ${b.mode === 'HOURLY' ? `${hh(b.start)}–${hh(b.end)}` : `${PLAN[b.plan]}`}</span></div>
        <div class="total"><span>결제 금액</span><span>${won(bookTotal())}</span></div></div>
      <div class="radios" id="methods">${[['CARD', '신용·체크카드'], ['TRANSFER', '계좌이체'], ['KAKAO', '카카오페이'], ['POINT', `포인트 (보유 ${u.points.toLocaleString('ko-KR')}P)`]].map(([k, t], i) => `<label><input type="radio" name="method" value="${k}"${i === 0 ? ' checked' : ''}>${t}</label>`).join('')}</div>
      <p class="err" id="payErr"></p>
      <button class="btn primary lg block" id="payBtn" data-act="payGo">${won(bookTotal())} 결제하기</button>`);
  }
  const METHOD = { CARD: '카드', TRANSFER: '계좌이체', KAKAO: '카카오페이', POINT: '포인트' };
  function payGo() {
    const u = me(), b = S.book, c = cafeById(b.cafeId), total = bookTotal();
    const method = ($('input[name=method]:checked') || {}).value || 'CARD';
    if (method === 'POINT' && u.points < total) { $('#payErr').textContent = '포인트가 부족해요. 다른 결제 수단을 선택해 주세요.'; return; }
    const btn = $('#payBtn'); btn.disabled = true; btn.textContent = '결제 처리 중…';
    setTimeout(() => {
      if (takenSeed(c, b.seat, b) || takenUser(c, b.seat, b)) {
        $('#payErr').textContent = '방금 다른 분이 이 좌석을 예약했어요. 좌석을 다시 선택해 주세요.';
        btn.disabled = false; btn.textContent = `${won(total)} 결제하기`; return;
      }
      const r = { id: DB.seq++, email: u.email, cafeId: c.id, type: b.type, seat: b.seat, mode: b.mode, plan: b.mode === 'PERIOD' ? b.plan : null,
        date: b.date, start: b.mode === 'HOURLY' ? b.start : 0, end: b.mode === 'HOURLY' ? b.end : 0, price: total, method, status: 'CONFIRMED', created: Date.now(), reviewed: false };
      DB.reservations.push(r);
      if (method === 'POINT') u.points -= total; else u.points += Math.floor(total * 0.01);
      save(); renderUser(); S.book.seat = null;
      openModal(`<div class="stepdots"><i class="on"></i><i class="on"></i></div><div class="receipt"><div class="big-check">${ico('check', 34)}</div><h2>예약이 완료됐어요</h2>
        <p class="muted">예약번호 SM-${String(r.id).padStart(6, '0')}</p>
        <div class="sumrows" style="text-align:left"><div><span class="muted">스터디카페</span><b>${esc(c.name)}</b></div><div><span class="muted">좌석</span><span>${seatLabel(r.seat, r.type)}</span></div>
          <div><span class="muted">이용 일시</span><span>${fmtDate(r.date)} ${r.mode === 'HOURLY' ? `${hh(r.start)}–${hh(r.end)}` : PLAN[r.plan]}</span></div><div><span class="muted">결제 수단</span><span>${METHOD[method]}</span></div>
          <div class="total"><span>결제 금액</span><span>${won(total)}</span></div></div>
        <div style="display:flex;gap:8px;margin-top:16px;justify-content:center"><button class="btn" data-act="closeModal">계속 둘러보기</button><button class="btn primary" data-act="toRes">내 예약 보기</button></div></div>`);
      refreshBook();
    }, 700);
  }

  // =====================================================================================
  // 로그인 / 회원가입
  // =====================================================================================
  function renderUser() {
    const u = me(), box = $('#userbox');
    box.innerHTML = u
      ? `<span class="hello">${esc(u.name)}님</span><span class="pts">${u.points.toLocaleString('ko-KR')}P</span><button class="btn sm" data-act="logout">로그아웃</button>`
      : '<button class="btn sm" data-act="login">로그인</button><button class="btn sm primary" data-act="signup">회원가입</button>';
  }
  function openAuth(mode, after) {
    S.pending = after || null;
    const signup = mode === 'signup';
    openModal(`<h2>${signup ? '회원가입' : '로그인'}</h2><p class="muted" style="margin:0">${signup ? '가입하면 10,000P를 드려요.' : '로그인하고 예약과 후기를 남겨 보세요.'}</p>
      <form class="form" data-form="${mode}">
        <input id="aEmail" type="email" placeholder="이메일" autocomplete="email" required>
        <input id="aPw" type="password" placeholder="비밀번호 (6자 이상)" autocomplete="${signup ? 'new-password' : 'current-password'}" required minlength="6">
        ${signup ? '<input id="aName" type="text" placeholder="이름" required>' : '<p class="muted" style="margin:0;font-size:13px">데모 계정: demo@example.com / demo1234 <button type="button" class="btn sm" data-act="fillDemo">입력하기</button></p>'}
        <p class="err" id="authErr"></p>
        <button class="btn primary lg block">${signup ? '가입하기' : '로그인'}</button>
        <p class="muted" style="margin:0;text-align:center;font-size:13px">${signup ? '이미 계정이 있나요?' : '아직 계정이 없나요?'} <button type="button" class="btn sm" data-act="${signup ? 'login' : 'signup'}">${signup ? '로그인' : '회원가입'}</button></p>
      </form>`);
  }
  async function submitAuth(mode) {
    const email = $('#aEmail').value.trim().toLowerCase(), pw = $('#aPw').value, err = $('#authErr');
    if (mode === 'signup') {
      const name = $('#aName').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = '이메일 형식을 확인해 주세요.'; return; }
      if (pw.length < 6) { err.textContent = '비밀번호는 6자 이상이어야 해요.'; return; }
      if (DB.users.some((u) => u.email === email)) { err.textContent = '이미 가입된 이메일이에요.'; return; }
      DB.users.push({ email, name, pwh: await digest(pw), points: 10000 });
    } else {
      const u = DB.users.find((x) => x.email === email);
      if (!u || u.pwh !== await digest(pw)) { err.textContent = '이메일 또는 비밀번호가 올바르지 않아요.'; return; }
    }
    DB.session = email; save(); renderUser(); closeModal();
    toast(mode === 'signup' ? '가입이 완료됐어요. 10,000P가 적립됐어요.' : `${me().name}님, 환영해요.`);
    const next = S.pending; S.pending = null;
    if (next) next(); else route();
  }
  async function seedDemo() {
    if (DB.users.some((u) => u.email === 'demo@example.com')) return;
    DB.users.push({ email: 'demo@example.com', name: '데모', pwh: await digest('demo1234'), points: 30000 });
    const t = todayStr();
    const mk = (cafeId, type, seat, date, start, end) => ({ id: DB.seq++, email: 'demo@example.com', cafeId, type, seat, mode: 'HOURLY', plan: null, date, start, end,
      price: price(cafeById(cafeId), type, 'HOURLY') * (end - start), method: 'CARD', status: 'CONFIRMED', created: Date.now(), reviewed: false });
    DB.reservations.push(mk(7, 'NORMAL', 'N12', addDays(t, -6), 14, 18), mk(1, 'FOCUS', 'F5', addDays(t, 2), 10, 14));
    save();
  }

  // =====================================================================================
  // 내 예약 (확인·변경·취소·후기)
  // =====================================================================================
  function statusOf(r) {
    if (r.status === 'CANCELED' || r.status === 'COMPLETED') return r.status;
    const [a, b] = iv(r), n = nowAbs();
    return n >= b ? 'COMPLETED' : n >= a ? 'ACTIVE' : 'UPCOMING';
  }
  const STATUS = { UPCOMING: '예정', ACTIVE: '이용 중', COMPLETED: '이용 완료', CANCELED: '취소됨' };
  function refundOf(r) {
    const before = iv(r)[0] - nowAbs();
    const pct = r.mode === 'PERIOD' ? 1 : before >= 1 ? 1 : 0.5;
    return { pct, amount: Math.round(r.price * pct) };
  }
  const when = (r) => `${fmtDate(r.date)} ${r.mode === 'HOURLY' ? `${hh(r.start)}–${hh(r.end)}` : `${PLAN[r.plan]} (${fmtDate(addDays(r.date, DAYS[r.plan] - 1))}까지)`}`;

  function showReservations() {
    const u = me();
    const head = '<div class="wrap"><div class="pagehead"><h1>내 예약</h1><p class="muted" style="margin:4px 0 0">예약 내역을 확인하고 변경·취소하거나 후기를 남길 수 있어요.</p></div>';
    if (!u) {
      view.innerHTML = `${head}<div class="empty" style="margin-bottom:40px"><h3>로그인이 필요해요</h3><p class="muted">로그인하면 예약 내역을 볼 수 있어요.</p><button class="btn primary" data-act="login">로그인</button></div></div>`;
      S.pending = showReservations; window.scrollTo(0, 0); return;
    }
    const all = DB.reservations.filter((r) => r.email === u.email).map((r) => ({ r, s: statusOf(r) }));
    const tabs = [['UP', '예정·이용 중', (x) => x.s === 'UPCOMING' || x.s === 'ACTIVE'], ['DONE', '이용 완료', (x) => x.s === 'COMPLETED'], ['CANC', '취소', (x) => x.s === 'CANCELED']];
    const cur = tabs.find((t) => t[0] === S.resTab) || tabs[0];
    const list = all.filter(cur[2]).sort((a, b) => (cur[0] === 'UP' ? iv(a.r)[0] - iv(b.r)[0] : iv(b.r)[0] - iv(a.r)[0]));
    view.innerHTML = `${head}
      <div class="tabs" style="margin-bottom:16px">${tabs.map(([k, t, f]) => `<button class="tab" data-act="resTab" data-v="${k}" aria-pressed="${cur[0] === k}">${t} ${all.filter(f).length}</button>`).join('')}</div>
      <div class="reslist">${list.length ? list.map(({ r, s }) => resCard(r, s)).join('') : '<div class="empty"><h3>해당하는 예약이 없어요</h3><button class="btn primary" data-act="goto" data-hash="home">스터디카페 찾아보기</button></div>'}</div></div>`;
    window.scrollTo(0, 0);
  }
  function resCard(r, s) {
    const c = cafeById(r.cafeId), f = refundOf(r);
    const acts = [];
    if (s === 'UPCOMING') acts.push(`<button class="btn sm" data-act="change" data-id="${r.id}">예약 변경</button>`, `<button class="btn sm danger" data-act="cancelAsk" data-id="${r.id}">예약 취소</button>`);
    if (s === 'UPCOMING' || s === 'ACTIVE') acts.push(`<button class="btn sm" data-act="complete" data-id="${r.id}" title="데모용: 이용을 마친 것으로 바꿔 후기를 써볼 수 있어요">이용 완료로 표시 (데모)</button>`);
    if (s === 'COMPLETED') acts.push(r.reviewed ? '<span class="muted" style="font-size:13px;text-align:center">후기 작성 완료</span>' : `<button class="btn sm primary" data-act="review" data-id="${r.id}">후기 작성</button>`);
    acts.push(`<button class="btn sm" data-act="open" data-id="${c.id}">${s === 'COMPLETED' || s === 'CANCELED' ? '다시 예약' : '카페 보기'}</button>`);
    return `<div class="rescard"><div class="rthumb">${photo(c, 0)}</div>
      <div><h3>${esc(c.name)}<span class="status ${s}">${STATUS[s]}</span></h3><div class="rinfo">
        <span>${seatLabel(r.seat, r.type)} · ${esc(when(r))}</span><span>${won(r.price)} · ${METHOD[r.method]} · 예약번호 SM-${String(r.id).padStart(6, '0')}</span>
        ${s === 'CANCELED' ? `<span>환불 ${won(r.refund || 0)}</span>` : ''}</div></div>
      <div class="ractions">${acts.join('')}</div>
      ${S.cancelId === r.id ? `<div class="cancelbox"><span>취소하면 <b>${won(f.amount)}</b>(${Math.round(f.pct * 100)}%)이 환불돼요.</span><span style="display:flex;gap:6px"><button class="btn sm" data-act="cancelNo">유지하기</button><button class="btn sm danger" data-act="cancelGo" data-id="${r.id}">예약 취소하기</button></span></div>` : ''}</div>`;
  }
  const resById = (id) => DB.reservations.find((r) => r.id === Number(id));

  function openChange(r) {
    const c = cafeById(r.cafeId);
    openModal(`<h2>예약 변경</h2><p class="muted" style="margin:0">${esc(c.name)} · ${seatLabel(r.seat, r.type)} · 같은 좌석으로 날짜와 시간을 바꿀 수 있어요.</p>
      <form class="form" data-form="change" data-id="${r.id}">
        <div class="field"><label for="cDate">${r.mode === 'HOURLY' ? '날짜' : '시작일'}</label><input id="cDate" type="date" min="${todayStr()}" value="${esc(r.date)}"></div>
        ${r.mode === 'HOURLY' ? `<div class="row2"><div class="field"><label for="cStart">시작</label><select id="cStart">${timeOptions(r.start, c.open, c.close - 1)}</select></div>
          <div class="field"><label for="cEnd">종료</label><select id="cEnd">${timeOptions(r.end, c.open + 1, c.close)}</select></div></div>` : ''}
        <p class="err" id="chErr"></p><button class="btn primary lg block">변경하기</button></form>`);
  }
  function submitChange(id) {
    const r = resById(id), c = cafeById(r.cafeId);
    const o = { ...r, date: $('#cDate').value };
    if (r.mode === 'HOURLY') { o.start = Number($('#cStart').value); o.end = Number($('#cEnd').value); }
    const err = timeError(c, o) || ((takenSeed(c, r.seat, o) || takenUser(c, r.seat, o, r.id)) ? '그 시간에는 이미 사용 중인 좌석이에요. 다른 시간을 선택해 주세요.' : '');
    if (err) { $('#chErr').textContent = err; return; }
    const newPrice = r.mode === 'HOURLY' ? price(c, r.type, 'HOURLY') * (o.end - o.start) : r.price, diff = newPrice - r.price;
    Object.assign(r, { date: o.date, start: o.start, end: o.end, price: newPrice }); save(); closeModal(); showReservations();
    toast(diff === 0 ? '예약을 변경했어요.' : `예약을 변경했어요. 차액 ${won(Math.abs(diff))}${diff > 0 ? ' 추가 결제' : ' 환불'} 예정이에요.`);
  }
  function openReview(r) {
    const c = cafeById(r.cafeId);
    S.star = 5;
    openModal(`<h2>후기 작성</h2><p class="muted" style="margin:0">${esc(c.name)} · ${esc(when(r))}</p>
      <form class="form" data-form="review" data-id="${r.id}"><div class="starpick" id="starpick">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="on" data-act="star" data-v="${n}" aria-label="${n}점">★</button>`).join('')}</div>
        <textarea id="rText" rows="4" maxlength="300" placeholder="좌석, 소음, 시설 등 이용 경험을 알려 주세요." required></textarea>
        <p class="err" id="rErr"></p><button class="btn primary lg block">후기 등록</button></form>`);
  }
  function submitReview(id) {
    const r = resById(id), u = me(), text = $('#rText').value.trim();
    if (text.length < 5) { $('#rErr').textContent = '후기를 5자 이상 적어 주세요.'; return; }
    DB.reviews.push({ id: DB.seq++, cafeId: r.cafeId, email: u.email, name: maskName(u.name), rating: S.star, text, date: todayStr() });
    r.reviewed = true; save(); closeModal(); showReservations(); toast('후기를 등록했어요. 감사합니다.');
  }

  // =====================================================================================
  // 이벤트
  // =====================================================================================
  const resetSearch = () => { const keep = S.q.view; S.q = freshQuery(); S.q.view = keep; };
  const afterQuery = () => { if (realMode()) S.q.fac = []; S.limit = PAGE; refreshPanel(); refreshCats(); renderResults(); };
  const onRealLoaded = () => { if (realMode()) S.q.fac = []; refreshPanel(); refreshCats(); refreshMaps(); };
  const ACT = {
    home: (t, e) => { e.preventDefault(); location.hash = 'home'; if (!$('#panel')) return; window.scrollTo(0, 0); },
    goto: (t) => { const h = t.dataset.hash; if (location.hash === '#' + h) route(); else location.hash = h; },
    nav: (t) => {
      const go = () => { // 부드럽게 이동한 뒤 도착한 영역을 잠깐 강조한다
        const el = document.getElementById(t.dataset.to);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const mark = el.querySelector('h2, h3') || el;
        mark.classList.remove('sec-flash'); void mark.offsetWidth; mark.classList.add('sec-flash');
        setTimeout(() => mark.classList.remove('sec-flash'), 1600);
      };
      if (!document.getElementById(t.dataset.to)) { location.hash = 'home'; setTimeout(go, 60); } else go();
    },
    soon: () => toast('준비 중인 페이지예요.'),
    closeModal,
    open: (t) => { location.hash = 'cafe-' + t.dataset.id; },
    // ① 이용 옵션
    adv: () => { S.adv = !S.adv; refreshPanel(); },
    facmore: () => { S.facMore = !S.facMore; refreshPanel(); },
    goArea: () => { const el = $('#sec-area'); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); const sel = $('#qSido'); if (sel) setTimeout(() => sel.focus(), 400); } },
    locRetry: () => { S.locFail = null; toast('위치를 확인하는 중이에요…'); applyLocation(); },
    locHelp: () => openModal(`<h2>내 위치 허용하기</h2><p class="muted" style="margin:0 0 14px">한 번 거부하면 사이트가 다시 물어볼 수 없어서, 브라우저에서 직접 바꿔야 해요.</p>
      <ol style="margin:0;padding-left:20px;display:grid;gap:10px;font-size:14px">
        <li><b>Chrome·Edge</b>: 주소창 왼쪽의 자물쇠(또는 설정) 아이콘 → <b>사이트 설정</b> → 위치를 <b>허용</b>으로 바꿔요.</li>
        <li><b>Safari(아이폰)</b>: 설정 → Safari → 위치 → 이 사이트를 <b>허용</b>으로 바꿔요.</li>
        <li>바꾼 뒤 <b>다시 시도</b>를 누르거나 페이지를 새로고침해요.</li></ol>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px"><button class="btn" data-act="closeModal">닫기</button><button class="btn primary" data-act="locRetryClose">다시 시도</button></div>`),
    locRetryClose: () => { closeModal(); ACT.locRetry(); },
    mode: (t) => { S.q.mode = t.dataset.v; afterQuery(); },
    plan: (t) => { S.q.plan = t.dataset.v; afterQuery(); },
    seat: (t) => { S.q.seat = t.dataset.v; if (S.q.seat !== 'ROOM' && S.q.people > 1) S.q.people = 1; if (S.q.seat === 'ROOM' && S.q.people < 2) S.q.people = 1; afterQuery(); },
    people: (t) => { S.q.people = clamp(S.q.people + Number(t.dataset.v), 1, 8); if (S.q.people > 1) S.q.seat = 'ROOM'; afterQuery(); },
    fac: (t) => { const f = t.dataset.v, i = S.q.fac.indexOf(f); if (i < 0) S.q.fac.push(f); else S.q.fac.splice(i, 1); afterQuery(); },
    // ② 지역
    near: (t) => { S.q[t.dataset.k] = !S.q[t.dataset.k]; afterQuery(); },
    // '내 주변' 모드를 켜고 끈다. 끄면 고른 지역만 보여주되, 거리는 계속 현재 위치에서 잰다.
    geo: () => {
      if (S.q.geo) { S.q.geo = null; afterQuery(); return; }
      const on = () => { S.q.geo = S.me; if (!S.q.radius) S.q.radius = 5; afterQuery(); ensureNear(S.me, S.q.radius).finally(() => onRealLoaded()); };
      if (S.me) { on(); return; }
      toast('위치를 확인하는 중이에요…');
      applyLocation().then((ok) => { if (ok) on(); });
    },
    cat: (t) => {
      const { kind, v } = t.dataset;
      if (kind === 'fac') ACT.fac({ dataset: { v } });
      else if (kind === 'seat') { S.q.seat = S.q.seat === v ? 'ANY' : v; S.q.people = 1; } else S.q[v] = !S.q[v];
      document.querySelectorAll('.cat').forEach((b) => { b.setAttribute('aria-pressed', String(!!catOn(b.dataset.kind, b.dataset.v))); });
      afterQuery();
    },
    search: () => { const el = $('#sec-compare'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    reset: () => { resetSearch(); document.querySelectorAll('.cat').forEach((b) => b.setAttribute('aria-pressed', 'false')); afterQuery(); },
    // ③ 비교·추천
    region: (t) => {
      S.q.sido = t.dataset.s; S.q.sigungu = t.dataset.g; S.q.geo = null; rememberRegion(); afterQuery();
      const pr = ensureRegion(regionOf()); renderResults(); pr.finally(() => onRealLoaded()); // 고른 구를 불러온다
    },
    sort: (t) => { S.q.sort = t.dataset.v; S.limit = PAGE; renderResults(); },
    more: () => { S.limit += 12; renderResults(); },
    retryMap: () => { initKakao(); refreshMaps(); },
    view: (t) => { S.q.view = t.dataset.v; renderResults(); },
    pin: (t) => {
      S.hl = Number(t.dataset.id); renderResults();
      const el = document.getElementById('card-' + S.hl); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    // ④ 예약
    bmode: (t) => { S.book.mode = t.dataset.v; refreshBook(); },
    btype: (t) => { S.book.type = t.dataset.v; if (S.book.type === 'ROOM') S.book.mode = 'HOURLY'; S.book.seat = null; refreshBook(); },
    bplan: (t) => { S.book.plan = t.dataset.v; refreshBook(); },
    bseat: (t) => { S.book.seat = S.book.seat === t.dataset.k ? null : t.dataset.k; refreshBook(); }, // 선택한 좌석을 다시 누르면 해제
    pay: openPay, payGo,
    toRes: () => { closeModal(); location.hash = 'reservations'; },
    login: () => openAuth('login', S.pending), signup: () => openAuth('signup', S.pending),
    fillDemo: () => { $('#aEmail').value = 'demo@example.com'; $('#aPw').value = 'demo1234'; },
    logout: () => { DB.session = null; save(); renderUser(); route(); toast('로그아웃했어요.'); },
    resTab: (t) => { S.resTab = t.dataset.v; S.cancelId = null; showReservations(); },
    change: (t) => openChange(resById(t.dataset.id)),
    cancelAsk: (t) => { S.cancelId = Number(t.dataset.id); showReservations(); },
    cancelNo: () => { S.cancelId = null; showReservations(); },
    cancelGo: (t) => {
      const r = resById(t.dataset.id), f = refundOf(r), u = me();
      r.status = 'CANCELED'; r.refund = f.amount; if (r.method === 'POINT') u.points += f.amount;
      S.cancelId = null; save(); renderUser(); showReservations(); toast(`예약을 취소했어요. ${won(f.amount)}이 환불돼요.`);
    },
    complete: (t) => { resById(t.dataset.id).status = 'COMPLETED'; save(); S.resTab = 'DONE'; showReservations(); toast('이용 완료로 표시했어요. 후기를 남겨 보세요.'); },
    review: (t) => openReview(resById(t.dataset.id)),
    star: (t) => { S.star = Number(t.dataset.v); document.querySelectorAll('#starpick button').forEach((b, i) => b.classList.toggle('on', i < S.star)); },
  };
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) { if (e.target.id === 'modal') closeModal(); return; }
    const fn = ACT[t.dataset.act];
    if (fn) fn(t, e);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    const k = f.dataset.form;
    if (k === 'login' || k === 'signup') submitAuth(k);
    else if (k === 'change') submitChange(f.dataset.id);
    else if (k === 'review') submitReview(f.dataset.id);
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.q) { // 검색 패널 입력
      const k = t.dataset.q, q = S.q;
      if (k === 'date') q.date = t.value || todayStr();
      else if (k === 'sido') { q.sido = t.value; q.sigungu = D.regions.find((r) => r.sido === t.value).sigungu; q.geo = null; }
      else if (k === 'sigungu') { q.sigungu = t.value; q.geo = null; }
      else if (k === 'radius') q.radius = Number(t.value);
      else if (k === 'start') { q.start = Number(t.value); if (q.end <= q.start) q.end = q.start + 1; }
      else if (k === 'end') q.end = Number(t.value);
      else if (k === 'plan') q.plan = t.value;
      if (['sido', 'sigungu', 'start', 'radius'].includes(k)) refreshPanel(); else if (k === 'date') { const p = $('#panel .panel-foot .muted'); if (p) refreshPanel(); }
      S.limit = PAGE;
      renderResults();
      if (k === 'sido' || k === 'sigungu') { rememberRegion(); const pr = ensureRegion(regionOf()); renderResults(); pr.finally(() => onRealLoaded()); } // 고른 구를 불러온다
      else if (k === 'radius' && q.geo) ensureNear(q.geo, q.radius || 5).finally(() => onRealLoaded());
    } else if (t.dataset.b) { // 예약 카드 입력
      const k = t.dataset.b, b = S.book, c = cafeById(b.cafeId);
      if (k === 'date') b.date = t.value || todayStr();
      else if (k === 'start') { b.start = Number(t.value); if (b.end <= b.start) b.end = Math.min(b.start + 1, c.close); }
      else if (k === 'end') b.end = Number(t.value);
      refreshBook();
    }
  });

  // ---- 라우팅: #home / #cafe-번호 / #reservations ------------------------------------------
  function route() {
    const h = location.hash.replace('#', '');
    view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); // 화면이 바뀔 때 부드럽게 나타난다
    if (h.startsWith('cafe-')) showCafe(Number(h.slice(5)));
    else if (h === 'reservations') showReservations();
    else { showHome(); window.scrollTo(0, 0); }
  }
  window.addEventListener('hashchange', () => { closeModal(); route(); });

  async function init() {
    $('#logoMark').innerHTML = ico('book', 20);
    $('#logoMark2').innerHTML = ico('book', 20);
    await seedDemo();
    renderUser();
    restoreRegion();
    ensureRegion(regionOf()); // 이전에 불러온 실제 카페가 저장돼 있으면 처음부터 실제 이름으로 보여준다
    // 웹사이트를 켤 때마다 현재 위치를 받아 내 주변 기준으로 바꾼다 (거부하면 선택한 지역 기준)
    applyLocation();
    watchLocationPermission();
    initKakao();
    route();
  }
  init().catch((e) => { view.innerHTML = `<div class="wrap"><p class="err">화면을 불러오지 못했어요: ${esc(e.message)}</p></div>`; });
})();
