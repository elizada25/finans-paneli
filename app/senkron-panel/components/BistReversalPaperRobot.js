'use client';

import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { firestoreDb } from '../../../lib-firebase';

const ROBOT_ID = 'bistReversal30Day';

function n(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function money(value) { return `₺${n(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function dateTime(value) { if (!value) return '—'; return new Intl.DateTimeFormat('tr-TR', { timeZone:'Europe/Istanbul', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(value)); }

export default function BistReversalPaperRobot({ userId, marketItems = [] }) {
  const [robot, setRobot] = useState(null);
  const [saving, setSaving] = useState(false);

  const ref = useMemo(
    () => userId ? doc(firestoreDb, 'users', userId, 'paperTrading', ROBOT_ID) : null,
    [userId]
  );

  useEffect(() => {
    if (!ref) return undefined;
    return onSnapshot(ref, (snapshot) => setRobot(snapshot.exists() ? snapshot.data() : null));
  }, [ref]);

  const positions = robot?.positions || [];
  const trades = robot?.trades || [];
  const priceMap = useMemo(() => new Map(marketItems.map((item) => [item.symbol, n(item.price)])), [marketItems]);
  const openValue = positions.reduce((sum, position) => sum + n(position.quantity) * (priceMap.get(position.symbol) || n(position.lastPrice || position.entryPrice)), 0);
  const openCost = positions.reduce((sum, position) => sum + n(position.cost) + n(position.buyCommission), 0);
  const openPnl = openValue - openCost;
  const closedPnl = trades.reduce((sum, trade) => sum + n(trade.pnl), 0);
  const equity = n(robot?.cash) + openValue;
  const winners = trades.filter((trade) => n(trade.pnl) > 0).length;

  async function start() {
    if (!ref) return;
    if (!window.confirm('100.000 TL sanal sermaye ile katı kurallı 30 günlük dönüş testi başlatılsın mı?')) return;
    setSaving(true);
    try {
      const now = new Date();
      const ends = new Date(now.getTime() + 30 * 86400000);
      await setDoc(ref, {
        active: true, version: 'bist-reversal-strict-v1', startingCapital: 100000,
        cash: 100000, positions: [], trades: [], dailyEntries: {},
        startedAt: now.toISOString(), endsAt: ends.toISOString(), createdAt: now.toISOString(),
        updatedAt: now.toISOString(), lastProcessedDataTime: null,
      });
    } finally { setSaving(false); }
  }

  async function toggle() {
    if (!ref || !robot) return;
    setSaving(true);
    try { await setDoc(ref, { active: robot.active !== true, updatedAt: new Date().toISOString() }, { merge: true }); }
    finally { setSaving(false); }
  }

  return (
    <section className="paperRobot">
      <style jsx>{`
        .paperRobot{margin-top:18px;padding:18px;border:1px solid rgba(56,189,248,.32);border-radius:16px;background:linear-gradient(135deg,rgba(8,47,73,.28),#111827)}
        .top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.top h2{margin:0;color:#7dd3fc;font-size:21px}.status{color:${robot?.active ? '#86efac' : '#94a3b8'};font-weight:900}
        .metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin:14px 0}.metric,.position{padding:12px;border:1px solid rgba(148,163,184,.16);border-radius:11px;background:rgba(15,23,42,.75)}
        .metric span,.muted{display:block;color:#94a3b8;font-size:11px}.metric strong{display:block;margin-top:6px;font-size:17px}
        button{min-height:38px;padding:0 13px;border:1px solid rgba(52,211,153,.4);border-radius:9px;color:#f8fafc;background:#111827;font-weight:900;cursor:pointer}.start{color:#111827;background:linear-gradient(135deg,#34d399,#6ee7b7)}
        .rules{display:flex;gap:12px;flex-wrap:wrap;color:#94a3b8;font-size:12px;margin:10px 0 15px}.positionGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:9px}.position strong{font-size:15px}
        .table{overflow-x:auto;margin-top:14px}table{width:100%;min-width:760px;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid rgba(148,163,184,.12);font-size:11px;text-align:left;white-space:nowrap}th{color:#94a3b8}
        @media(max-width:760px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.paperRobot{padding:13px}.top h2{font-size:18px}}
      `}</style>
      <div className="top">
        <div><h2>🤖 30 Günlük Dönüş Sanal Robotu</h2><span className="muted">Yalnızca kapanmış günlük mum ve katı dönüş teyidi</span></div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <span className="status">● {robot?.active ? 'Robot aktif' : robot ? 'Robot durdu' : 'Test başlatılmadı'}</span>
          {!robot ? <button className="start" onClick={start} disabled={saving}>30 günlük testi başlat</button> : <button onClick={toggle} disabled={saving}>{robot.active ? 'Robotu durdur' : 'Robotu sürdür'}</button>}
        </div>
      </div>
      <div className="metrics">
        <div className="metric"><span>Toplam değer</span><strong>{money(equity)}</strong></div>
        <div className="metric"><span>Nakit</span><strong>{money(robot?.cash)}</strong></div>
        <div className="metric"><span>Açık K/Z</span><strong style={{color:openPnl >= 0 ? '#22c55e':'#ef4444'}}>{money(openPnl)}</strong></div>
        <div className="metric"><span>Gerçekleşen K/Z</span><strong style={{color:closedPnl >= 0 ? '#22c55e':'#ef4444'}}>{money(closedPnl)}</strong></div>
        <div className="metric"><span>Başarı / Açık</span><strong>{trades.length ? `%${((winners/trades.length)*100).toFixed(1)}`:'—'} • {positions.length}/3</strong></div>
      </div>
      <div className="rules"><span>85+ puan</span><span>Fiyat + kısa trend teyidi</span><span>MACD + güçlü hacim</span><span>İşlem riski %0,75</span><span>Günde en fazla 2 giriş</span><span>Gerçek emir göndermez</span></div>
      <div className="muted">Başlangıç: {dateTime(robot?.startedAt)} • Test bitişi: {dateTime(robot?.endsAt)} • Son robot kontrolü: {dateTime(robot?.lastRunAt)}</div>
      <h3>Açık sanal pozisyonlar</h3>
      <div className="positionGrid">
        {positions.length ? positions.map((position) => {
          const current = priceMap.get(position.symbol) || n(position.lastPrice || position.entryPrice);
          const pnl = n(position.quantity) * current - n(position.cost) - n(position.buyCommission);
          return <div className="position" key={position.symbol}><strong>{position.symbol}</strong><span className="muted">{position.quantity} lot • Giriş {money(position.entryPrice)}</span><span className="muted">Son {money(current)} • Stop {money(position.stop)} • Hedef {money(position.target2)}</span><strong style={{color:pnl >= 0 ? '#22c55e':'#ef4444'}}>Açık K/Z {money(pnl)}</strong></div>;
        }) : <span className="muted">Katı koşulları geçen teyitli dönüş sinyali bekleniyor.</span>}
      </div>
      <div className="table"><table><thead><tr><th>Hisse</th><th>Açılış</th><th>Giriş</th><th>Çıkış</th><th>Neden</th><th>Sonuç</th></tr></thead><tbody>
        {trades.slice(0,20).map((trade) => <tr key={trade.id}><td>{trade.symbol}</td><td>{dateTime(trade.openedAt)}</td><td>{money(trade.entryPrice)}</td><td>{money(trade.exitPrice)}</td><td>{trade.reason}</td><td style={{color:n(trade.pnl)>=0?'#22c55e':'#ef4444'}}>{money(trade.pnl)}</td></tr>)}
        {!trades.length ? <tr><td colSpan="6">Henüz kapanan sanal işlem yok.</td></tr> : null}
      </tbody></table></div>
    </section>
  );
}
