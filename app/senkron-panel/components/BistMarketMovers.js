'use client';

import { useCallback, useEffect, useState } from 'react';

function money(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? `₺${number.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';
}

function percent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number > 0 ? '+' : ''}${number.toFixed(2)}%` : '—';
}

function time(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(value));
}

export default function BistMarketMovers() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/bist-movers', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
      setData(payload);
      setError('');
    } catch (loadError) {
      setError(loadError?.message || 'Liste alınamadı.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [load]);

  function table(title, items, color) {
    return (
      <div className="moverPane">
        <h3 style={{ color }}>{title}</h3>
        <div className="moverHeader moverRow"><span>Hisse</span><span>Son</span><span>Düşük</span><span>Yüksek</span><span>%</span></div>
        {(items || []).map((item) => (
          <div className="moverRow" key={item.symbol}>
            <strong>{item.symbol}</strong>
            <span>{money(item.price)}</span>
            <span>{money(item.dayLow)}</span>
            <span>{money(item.dayHigh)}</span>
            <strong style={{ color }}>{percent(item.changePercent)}</strong>
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className="movers">
      <style jsx>{`
        .movers { width:100%; max-width:1600px; margin:0 0 28px; padding:12px; border:1px solid rgba(212,175,55,.22); border-radius:16px; background:#17130c; box-sizing:border-box; }
        .moverTop { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:8px; }
        h2,h3 { margin:0; } h2 { font-size:18px; } h3 { padding:5px 6px 8px; font-size:15px; }
        .muted { color:#94a3b8; font-size:12px; }
        button { min-height:30px; padding:0 10px; border:1px solid rgba(212,175,55,.4); border-radius:7px; color:#f0d675; background:#151109; font-weight:850; }
        .moverGrid { display:grid; grid-template-columns:repeat(2,minmax(520px,1fr)); gap:18px; overflow-x:auto; }
        .moverPane { min-width:520px; }
        .moverRow { display:grid; grid-template-columns:minmax(85px,1.2fr) 92px 78px 78px 72px; gap:6px; align-items:center; min-height:29px; padding:2px 6px; border-bottom:1px solid rgba(212,175,55,.11); box-sizing:border-box; font-size:12px; white-space:nowrap; }
        .moverHeader { min-height:25px; color:#94a3b8; font-size:10px; font-weight:900; border-color:rgba(148,163,184,.25); }
        @media(max-width:760px){ .moverGrid{grid-template-columns:1fr;gap:14px}.moverPane{min-width:500px}.movers{overflow-x:auto}.moverRow{font-size:11px} }
      `}</style>
      <div className="moverTop">
        <div><h2>BIST Günün Hareketlileri</h2><span className="muted">Yaklaşık/gecikmeli veri • Son tarama: {time(data?.generatedAt)}</span></div>
        <button type="button" onClick={load} disabled={loading}>{loading ? 'Taranıyor…' : '↻ Yenile'}</button>
      </div>
      {error ? <div style={{ color:'#fca5a5', padding:'10px 6px' }}>{error}</div> : null}
      <div className="moverGrid">
        {table('▲ En Çok Yükselenler', data?.gainers, '#22c55e')}
        {table('▼ En Çok Düşenler', data?.losers, '#ef4444')}
      </div>
    </section>
  );
}
