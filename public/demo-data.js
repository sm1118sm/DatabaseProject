// DB 가 연결되지 않았을 때 화면을 보여주기 위한 샘플 데이터 (실제 카페 정보가 아님)
window.DEMO = (() => {
  const regions = [
    { region_id: 1, sido: '서울특별시', sigungu: '강남구' },
    { region_id: 2, sido: '서울특별시', sigungu: '마포구' },
    { region_id: 3, sido: '충청남도', sigungu: '천안시' },
  ];
  // seat/room = 시간당 요금
  const cafes = [
    { id: 1, r: 1, name: '집중의 정석 강남점', addr: '서울 강남구 테헤란로 101', seat: 2800, room: 8000, rating: 4.7, n: 32, lat: 37.5008, lng: 127.0363 },
    { id: 2, r: 1, name: '몰입공간 역삼', addr: '서울 강남구 역삼로 22', seat: 3500, room: 9500, rating: 4.4, n: 18, lat: 37.4999, lng: 127.0331 },
    { id: 3, r: 1, name: '북적북적 스터디', addr: '서울 강남구 논현로 85', seat: 2200, room: 6500, rating: 4.1, n: 9, lat: 37.5045, lng: 127.0252 },
    { id: 4, r: 1, name: '라운지 포커스', addr: '서울 강남구 선릉로 64', seat: 4000, room: 11000, rating: 4.8, n: 41, lat: 37.5044, lng: 127.0489 },
    { id: 5, r: 2, name: '마포 올데이 스터디', addr: '서울 마포구 월드컵북로 12', seat: 2000, room: 6000, rating: 4.3, n: 14, lat: 37.5563, lng: 126.9236 },
    { id: 6, r: 2, name: '홍대 조용한집', addr: '서울 마포구 와우산로 30', seat: 2600, room: 7000, rating: 4.5, n: 22, lat: 37.5547, lng: 126.9239 },
    { id: 7, r: 2, name: '합정 스터디온', addr: '서울 마포구 양화로 45', seat: 3000, room: 8200, rating: 4.0, n: 7, lat: 37.5495, lng: 126.9139 },
    { id: 8, r: 3, name: '천안 열공카페', addr: '충남 천안시 서북구 불당로 7', seat: 1800, room: 5000, rating: 4.6, n: 11, lat: 36.8151, lng: 127.1139 },
    { id: 9, r: 3, name: '불당 스터디라운지', addr: '충남 천안시 서북구 불당21로 3', seat: 2400, room: 6200, rating: 4.2, n: 6, lat: 36.8196, lng: 127.1087 },
  ];
  const reg = (id) => regions.find((x) => x.region_id === id);
  const price = (c, t) => (t === 'ROOM' ? c.room : c.seat);
  const avg = (r, t) => { const l = cafes.filter((c) => c.r === r); return Math.round(l.reduce((s, c) => s + price(c, t), 0) / l.length); };

  function api(path) {
    const url = new URL(path, location.origin);
    const p = url.pathname, q = url.searchParams;
    if (p === '/api/config') return { kakaoJsKey: '' };
    if (p === '/api/regions') return regions.map((r) => ({ ...r, cafe_count: cafes.filter((c) => c.r === r.region_id).length }));
    if (p === '/api/cafes') {
      const t = q.get('roomType') === 'ROOM' ? 'ROOM' : 'SEAT';
      return cafes.filter((c) => reg(c.r).sido === q.get('sido') && reg(c.r).sigungu === q.get('sigungu')).map((c) => ({
        cafe_id: c.id, name: c.name, sido: reg(c.r).sido, sigungu: reg(c.r).sigungu, room_type: t,
        hourly_price: price(c, t), region_avg_price: avg(c.r, t), diff_from_avg: price(c, t) - avg(c.r, t),
        address: c.addr, latitude: c.lat, longitude: c.lng, avg_rating: c.rating, review_count: c.n,
      }));
    }
    const m = p.match(/^\/api\/cafes\/(\d+)$/);
    if (m) {
      const c = cafes.find((x) => x.id === Number(m[1]));
      return {
        cafe: { cafe_id: c.id, name: c.name, address: c.addr, phone: '02-000-0000', sido: reg(c.r).sido, sigungu: reg(c.r).sigungu },
        rooms: [{ room_id: 1, name: 'A-1 좌석', room_type: 'SEAT', capacity: 1 }, { room_id: 2, name: '스터디룸 1', room_type: 'ROOM', capacity: 4 }],
        plans: [
          { room_type: 'SEAT', plan_type: 'HOURLY', price: c.seat }, { room_type: 'SEAT', plan_type: 'DAILY', price: c.seat * 6 },
          { room_type: 'ROOM', plan_type: 'HOURLY', price: c.room },
        ],
        comparison: ['SEAT', 'ROOM'].map((t) => ({ room_type: t, hourly_price: price(c, t), region_avg_price: avg(c.r, t), diff_from_avg: price(c, t) - avg(c.r, t) })),
        reviews: [{ rating: 5, content: '조용하고 좌석이 넓어서 시험 기간에 자주 와요. (샘플 후기)', created_at: '2026-10-01 10:00:00', member_name: '데모' }],
      };
    }
    if (/^\/api\/rooms\/\d+\/availability$/.test(p)) return { reservedHours: [10, 11, 14] };
    throw new Error('샘플 데이터 모드에서는 지원하지 않는 기능입니다. DB를 연결하면 사용할 수 있어요.');
  }
  return { api };
})();
