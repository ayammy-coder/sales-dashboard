exports.handler = async function(event, context) {
  const stores = [
    { id: 'koukyo',     name: '香酵味食堂',           emoji: '', token: process.env.TOKEN_KOUKYO,     locationId: process.env.LOCID_KOUKYO },
    { id: 'shishitora', name: '獅子虎',              emoji: '', token: process.env.TOKEN_SHISHITORA, locationId: process.env.LOCID_SHISHITORA },
    { id: 'livibossa',  name: 'LiviBossa',           emoji: '', token: process.env.TOKEN_LIVIBOSSA,  locationId: process.env.LOCID_LIVIBOSSA },
    { id: 'kinky',      name: 'KINKY FLOWER STAND',  emoji: '', token: process.env.TOKEN_KINKY,      locationId: process.env.LOCID_KINKY || 'LX79VENYCHVHP' },
  ];

  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const todayJST = new Date(now.getTime() + jstOffset);
  const y = todayJST.getUTCFullYear();
  const m = String(todayJST.getUTCMonth() + 1).padStart(2, '0');
  const d = String(todayJST.getUTCDate()).padStart(2, '0');
  const startAt = `${y}-${m}-${d}T00:00:00+09:00`;
  const endAt   = `${y}-${m}-${d}T23:59:59+09:00`;

  const results = await Promise.all(stores.map(async store => {
    if (!store.token || !store.locationId) {
      return { id: store.id, name: store.name, emoji: store.emoji, error: 'not_configured', total: 0, count: 0, hourly: {}, recentOrders: [] };
    }
    try {
      const body = {
        location_ids: [store.locationId],
        query: {
          filter: {
            state_filter: { states: ['COMPLETED'] },
            date_time_filter: { closed_at: { start_at: startAt, end_at: endAt } }
          },
          sort: { sort_field: 'CLOSED_AT', sort_order: 'DESC' }
        },
        limit: 500
      };
      const res = await fetch('https://connect.squareup.com/v2/orders/search', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + store.token,
          'Content-Type': 'application/json',
          'Square-Version': '2024-01-18'
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        return { id: store.id, name: store.name, emoji: store.emoji, error: data.errors?.[0]?.detail || 'APIエラー ' + res.status, total: 0, count: 0, hourly: {}, recentOrders: [] };
      }
      const orders = data.orders || [];
      const total = orders.reduce((sum, o) => sum + (o.total_money?.amount || 0), 0);
      const count = orders.length;
      const hourly = {};
      orders.forEach(o => {
        const t = new Date(o.closed_at);
        const h = (t.getUTCHours() + 9) % 24;
        hourly[h] = (hourly[h] || 0) + (o.total_money?.amount || 0);
      });
      const recentOrders = orders.slice(0, 20).map(o => ({
        time: o.closed_at,
        amount: o.total_money?.amount || 0,
        method: o.tenders?.[0]?.type || '不明',
        items: o.line_items?.map(li => li.name).join(', ') || ''
      }));
      return { id: store.id, name: store.name, emoji: store.emoji, total, count, hourly, recentOrders };
    } catch(e) {
      return { id: store.id, name: store.name, emoji: store.emoji, error: e.message, total: 0, count: 0, hourly: {}, recentOrders: [] };
    }
  }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ stores: results, updatedAt: new Date().toISOString() })
  };
};
