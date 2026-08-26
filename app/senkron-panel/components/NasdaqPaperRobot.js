'use client';

import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { firestoreDb } from '../../../lib-firebase';

const ROBOT_ID = 'nasdaq4h30Day';
const STARTING_CAPITAL = 10000;

function money(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  }).format(parsed);
}

function percent(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed >= 0 ? '+' : ''}${parsed.toFixed(2)}%` : '—';
}

function dateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

export default function NasdaqPaperRobot({ userId, marketItems = [] }) {
  const [robot, setRobot] = useState(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  const robotRef = useMemo(
    () => userId ? doc(firestoreDb, 'users', userId, 'paperTrading', ROBOT_ID) : null,
    [userId]
  );

  useEffect(() => {
    if (!robotRef) return undefined;
    return onSnapshot(robotRef, (snapshot) => {
      setRobot(snapshot.exists() ? snapshot.data() : null);
      setReady(true);
    }, () => setReady(true));
  }, [robotRef]);

  const priceMap = useMemo(
    () => new Map(marketItems.map((item) => [item.symbol, Number(item.price)])),
    [marketItems]
  );
  const positions = robot?.positions || [];
  const trades = robot?.trades || [];
  const openValue = positions.reduce(
    (total, position) => total + Number(position.quantity || 0) * Number(priceMap.get(position.symbol) || position.lastPrice || position.entryPrice || 0), 0
  );
  const openCost = positions.reduce(
    (total, position) => total + Number(position.cost || 0) + Number(position.buyCommission || 0), 0
  );
  const openPnl = openValue - openCost;
  const realizedPnl = trades.reduce((total, trade) => total + Number(trade.pnl || 0), 0);
  const equity = Number(robot?.cash || 0) + openValue;
  const winners = trades.filter((trade) => Number(trade.pnl) > 0).length;

  async function start() {
    if (!robotRef || saving) return;
    if (robot?.active) {
      window.alert('NASDAQ sanal robot zaten aktif.');
      return;
    }
    const continuing = robot && (positions.length || trades.length);
    if (continuing && !window.confirm('Mevcut sonuçlar korunarak robot yeniden başlatılsın mı?')) return;
    setSaving(true);
    try {
      const now = new Date();
      const endsAt = new Date(now.getTime() + 30 * 86400000).toISOString();
      await setDoc(robotRef, {
        active: true,
        startingCapital: Number(robot?.startingCapital || STARTING_CAPITAL),
        cash: Number(robot?.cash ?? STARTING_CAPITAL),
        positions, trades,
        dailyEntries: robot?.dailyEntries || {},
        startedAt: continuing && robot?.startedAt ? robot.startedAt : now.toISOString(),
        endsAt: continuing && robot?.endsAt && new Date(robot.endsAt) > now ? robot.endsAt : endsAt,
        version: 'nasdaq-4h-strict-v1', updatedAt: now.toISOString(),
      }, { merge: true });
    } catch (error) {
      window.alert(`Robot başlatılamadı: ${error?.message || 'Bilinmeyen hata'}`);
    } finally {
      setSaving(false);
    }
  }

  async function stop() {
    if (!robotRef || saving || !window.confirm('Robot durdurulsun mu? Açık sanal pozisyonlar korunur.')) return;
    setSaving(true);
    try {
      await setDoc(robotRef, { active: false, stoppedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!robotRef || saving || !window.confirm('Tüm NASDAQ sanal işlem geçmişi silinip 10.000 USD ile sıfırlansın mı?')) return;
    setSaving(true);
    try {
      await setDoc(robotRef, {
        active: false, startingCapital: STARTING_CAPITAL, cash: STARTING_CAPITAL,
        positions: [], trades: [], dailyEntries: {}, startedAt: null, endsAt: null,
        completedAt: null, lastProcessedDataTime: null, resetAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(), version: 'nasdaq-4h-strict-v1',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="paperRobot">
      <style jsx>{`
        .paperRobot { margin-top: 18px; padding: 18px; border: 1px solid rgba(56,189,248,.32); border-radius: 16px; background: #0b1420; }
        .head { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
        h3,h4 { margin:0; } .muted { color:#94a3b8; font-size:12px; }
        .active { color:#4ade80; font-weight:900; } .inactive { color:#fbbf24; font-weight:900; }
        .buttons { display:flex; gap:8px; flex-wrap:wrap; margin:14px 0; }
        button { min-height:38px; padding:0 14px; border:1px solid rgba(148,163,184,.25); border-radius:9px; background:#111c2e; color:#f8fafc; font-weight:900; cursor:pointer; }
        button.primary { border-color:rgba(34,197,94,.55); background:rgba(34,197,94,.13); color:#86efac; }
        button.danger { border-color:rgba(239,68,68,.5); background:rgba(127,29,29,.32); color:#fca5a5; }
        button:disabled { opacity:.5; cursor:default; }
        .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:9px; margin:12px 0; }
        .stat { padding:12px; border:1px solid rgba(148,163,184,.14); border-radius:11px; background:#101827; }
        .stat span { display:block; color:#94a3b8; font-size:11px; margin-bottom:6px; } .stat strong { font-size:17px; }
        .rules { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:6px 15px; margin:14px 0; padding:12px; border-radius:11px; background:rgba(15,23,42,.75); color:#cbd5e1; font-size:12px; }
        .tableWrap { overflow-x:auto; margin-top:14px; } table { width:100%; border-collapse:collapse; min-width:760px; }
        th,td { padding:9px; border-bottom:1px solid rgba(148,163,184,.12); text-align:left; font-size:12px; white-space:nowrap; }
        th { color:#94a3b8; background:#101827; }
        @media(max-width:700px){ .paperRobot{padding:13px}.stats{grid-template-columns:repeat(2,1fr)} }
      `}</style>

      <div className="head">
        <div>
          <h3>🤖 30 Günlük NASDAQ 4H Sanal Robot</h3>
          <div className="muted">Yalnızca kapanmış 4 saatlik mum • Gerçek emir göndermez</div>
        </div>
        <span className={robot?.active ? 'active' : 'inactive'}>
          ● {robot?.active ? 'Robot aktif' : ready ? 'Robot kapalı' : 'Yükleniyor'}
        </span>
      </div>

      <div className="buttons">
        {!robot?.active ? <button className="primary" onClick={start} disabled={saving}>30 günlük testi başlat</button> : <button className="danger" onClick={stop} disabled={saving}>Robotu durdur</button>}
        <button onClick={reset} disabled={saving}>Sonuçları sıfırla</button>
      </div>

      <div className="stats">
        <div className="stat"><span>Başlangıç</span><strong>{money(robot?.startingCapital ?? STARTING_CAPITAL)}</strong></div>
        <div className="stat"><span>Nakit</span><strong>{money(robot?.cash ?? STARTING_CAPITAL)}</strong></div>
        <div className="stat"><span>Toplam değer</span><strong>{money(robot ? equity : STARTING_CAPITAL)}</strong></div>
        <div className="stat"><span>Açık K/Z</span><strong style={{color:openPnl>=0?'#4ade80':'#f87171'}}>{money(openPnl)}</strong></div>
        <div className="stat"><span>Gerçekleşen K/Z</span><strong style={{color:realizedPnl>=0?'#4ade80':'#f87171'}}>{money(realizedPnl)}</strong></div>
        <div className="stat"><span>Başarı</span><strong>{trades.length ? `%${((winners/trades.length)*100).toFixed(1)}` : '—'}</strong></div>
      </div>

      <div className="rules">
        <span>✓ En az 85/100 puan</span><span>✓ Fiyat en az 3 USD</span>
        <span>✓ QQQ + günlük + 4H trend olumlu</span><span>✓ Kırılım ve pozitif/güçlenen MACD</span>
        <span>✓ Hacim ≥ 1,20x; RSI 48–68</span><span>✓ İşlem riski sermayenin %0,75'i</span>
        <span>✓ En fazla 3 açık pozisyon, günde 2 alış</span><span>✓ %20 nakit korunur; 5 gün tekrar giriş yok</span>
      </div>

      <div className="muted">Başlangıç: {dateTime(robot?.startedAt)} • Test bitişi: {dateTime(robot?.endsAt)} • Son işlenen 4H mum: {dateTime(robot?.lastProcessedDataTime)}</div>

      <div className="tableWrap">
        <h4>Açık sanal pozisyonlar ({positions.length}/3)</h4>
        <table><thead><tr><th>Hisse</th><th>Adet</th><th>Giriş</th><th>Son</th><th>Stop</th><th>Hedef</th><th>Açık K/Z</th></tr></thead>
          <tbody>{positions.length ? positions.map((position) => {
            const last = Number(priceMap.get(position.symbol) || position.lastPrice || position.entryPrice);
            const pnl = last * Number(position.quantity) - Number(position.cost || 0) - Number(position.buyCommission || 0);
            return <tr key={position.symbol}><td><strong>{position.symbol}</strong></td><td>{position.quantity}</td><td>{money(position.entryPrice)}</td><td>{money(last)}</td><td>{money(position.stop)}</td><td>{money(position.target2)}</td><td style={{color:pnl>=0?'#4ade80':'#f87171'}}>{money(pnl)} ({percent((pnl/Math.max(1,Number(position.cost)))*100)})</td></tr>;
          }) : <tr><td colSpan="7" className="muted">Katı koşulları geçen açık sanal pozisyon yok.</td></tr>}</tbody>
        </table>
      </div>

      <div className="tableWrap">
        <h4>Sonuçlanan işlemler</h4>
        <table><thead><tr><th>Hisse</th><th>Açılış</th><th>Kapanış</th><th>Giriş</th><th>Çıkış</th><th>Neden</th><th>Sonuç</th></tr></thead>
          <tbody>{trades.length ? trades.slice(0,30).map((trade) => <tr key={trade.id}><td>{trade.symbol}</td><td>{dateTime(trade.openedAt)}</td><td>{dateTime(trade.closedAt)}</td><td>{money(trade.entryPrice)}</td><td>{money(trade.exitPrice)}</td><td>{trade.reason}</td><td style={{color:Number(trade.pnl)>=0?'#4ade80':'#f87171'}}>{money(trade.pnl)} ({percent(trade.returnPercent)})</td></tr>) : <tr><td colSpan="7" className="muted">Henüz sonuçlanan sanal işlem yok.</td></tr>}</tbody>
        </table>
      </div>
    </section>
  );
}
