'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BistPaperRobot from './BistPaperRobot';

const ROBOT_STORAGE_KEY = 'sky-bist-paper-robot-v1';
const TRADE_KEY_PREFIX = 'sky-bist-gunluk-islem';
const SIGNAL_KEY_PREFIX = 'sky-bist-sinyal';

export default function BistTradeCenter({ user }) {
  const [riskAmount, setRiskAmount] = useState('500');
  const [maxTrades, setMaxTrades] = useState('2');
  const [dailyTradeCount, setDailyTradeCount] = useState(0);
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState('');
  const [robotScan, setRobotScan] = useState(null);
  const scanInFlight = useRef(false);
  const lastAutoSlot = useRef('');

  const numericRisk = useMemo(() => positiveNumber(riskAmount), [riskAmount]);
  const numericMaxTrades = useMemo(
    () => Math.max(1, Math.min(5, Math.floor(positiveNumber(maxTrades) || 2))),
    [maxTrades]
  );
  const remainingTrades = Math.max(0, numericMaxTrades - dailyTradeCount);

  const notifyNewSignals = useCallback(async (nextItems) => {
    if (
      typeof window === 'undefined' ||
      !('Notification' in window) ||
      Notification.permission !== 'granted' ||
      !('serviceWorker' in navigator)
    ) return;

    const registration = await navigator.serviceWorker.ready;
    for (const item of nextItems) {
      if (item.setup !== 'İŞLEM SİNYALİ') continue;
      const notificationKey = `${SIGNAL_KEY_PREFIX}-${item.sessionDate}-${item.symbol}`;
      if (localStorage.getItem(notificationKey) === 'sent') continue;

      await registration.showNotification(`⚡ ${item.symbol} işlem sinyali`, {
        body:
          `Giriş ${formatTry(item.entry)} • Stop ${formatTry(item.stop)} ` +
          `• İlk hedef ${formatTry(item.target1)}`,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: notificationKey,
        renotify: false,
        data: { url: '/senkron-panel' },
      });
      localStorage.setItem(notificationKey, 'sent');
    }
  }, []);

  const scanMarket = useCallback(async () => {
    if (scanInFlight.current) return;
    try {
      scanInFlight.current = true;
      setLoading(true);
      setError('');
      setStatus('Likit BIST hisseleri ve tamamlanmış mumlar taranıyor…');

      let openSymbols = [];

      try {
        const savedRobot = JSON.parse(
          localStorage.getItem(ROBOT_STORAGE_KEY)
        );

        openSymbols = Array.isArray(savedRobot?.positions)
          ? savedRobot.positions
              .map((position) => position.symbol)
              .filter(Boolean)
              .slice(0, 3)
          : [];
      } catch {
        openSymbols = [];
      }

      const query = openSymbols.length
        ? `?positions=${encodeURIComponent(openSymbols.join(','))}`
        : '';

      const response = await fetch(
        `/api/bist-daytrade${query}`,
        { cache: 'no-store' }
      );
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Günlük trade taraması tamamlanamadı.');
      }

      const nextItems = Array.isArray(payload.items) ? payload.items : [];
      setItems(nextItems);
      setRobotScan({
        generatedAt: payload.generatedAt,
        items: nextItems,
        positionChecks: Array.isArray(payload.positionChecks)
          ? payload.positionChecks
          : [],
      });
      setSummary({
        generatedAt: payload.generatedAt,
        scanned: payload.scanned,
        analyzed: payload.analyzed,
        durationMs: payload.durationMs,
        marketRegime: payload.marketRegime,
      });

      const signalCount = nextItems.filter(
        (item) => item.setup === 'İŞLEM SİNYALİ'
      ).length;
      setStatus(
        signalCount
          ? `${signalCount} güçlü işlem sinyali bulundu.`
          : nextItems.length
            ? 'En iyi adaylar listelendi; henüz kesin işlem sinyali yok.'
            : payload.message || 'Uygun aday bulunamadı.'
      );
      await notifyNewSignals(nextItems);
    } catch (scanError) {
      setError(scanError?.message || 'BIST taraması sırasında hata oluştu.');
    } finally {
      scanInFlight.current = false;
      setLoading(false);
    }
  }, [notifyNewSignals]);

  useEffect(() => {
    const key = `${TRADE_KEY_PREFIX}-${istanbulDateKey()}`;
    setDailyTradeCount(Number(localStorage.getItem(key) || 0));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = new Date();
      const secondsToNext = 300 - (Math.floor(now.getTime() / 1000) % 300);
      setCountdown(formatCountdown(secondsToNext));
      if (!autoRefresh || !isBistSessionOpen(now)) return;

      const slot = Math.floor(now.getTime() / 300000);
      if (
        secondsToNext <= 292 &&
        secondsToNext >= 270 &&
        lastAutoSlot.current !== slot
      ) {
        lastAutoSlot.current = slot;
        scanMarket();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, scanMarket]);

  function recordTrade(item) {
    if (item.setup !== 'İŞLEM SİNYALİ' || remainingTrades <= 0) return;
    const accepted = window.confirm(
      `${item.symbol} deneme işlemini kaydedelim mi?\n\n` +
        `Giriş: ${formatTry(item.entry)}\nStop: ${formatTry(item.stop)}\n` +
        `1. hedef: ${formatTry(item.target1)}`
    );
    if (!accepted) return;

    const nextCount = dailyTradeCount + 1;
    localStorage.setItem(
      `${TRADE_KEY_PREFIX}-${istanbulDateKey()}`,
      String(nextCount)
    );
    setDailyTradeCount(nextCount);
  }

  return (
    <section style={styles.section}>
      <div style={styles.header}>
        <div>
          <p style={styles.eyebrow}>SKY TRADE • DENEME MODU</p>
          <h2 style={styles.title}>⚡ BIST Günlük Trade Merkezi</h2>
          <p style={styles.description}>
            Sadece en iyi 3 adayı gösterir. İşlem sinyali için günlük, 15 dk ve
            5 dk yönün birlikte onaylanması gerekir.
          </p>
        </div>
        <span style={styles.badge}>5 dk + 15 dk</span>
      </div>

      <div style={styles.controls}>
        <NumberControl label="İşlem başına azami risk" value={riskAmount} onChange={setRiskAmount} suffix="TL" />
        <NumberControl label="Günlük en fazla işlem" value={maxTrades} onChange={setMaxTrades} suffix="adet" />
        <div style={styles.limitBox}>
          <span>Bugünkü kullanım</span>
          <strong>{dailyTradeCount}/{numericMaxTrades} işlem</strong>
          <small>Azami günlük risk: {formatTry(numericRisk * numericMaxTrades)}</small>
        </div>
        <button type="button" onClick={scanMarket} disabled={loading} style={{ ...styles.scanButton, opacity: loading ? 0.65 : 1 }}>
          {loading ? 'Taranıyor…' : 'Şimdi Tara'}
        </button>
      </div>

      <div style={styles.autoLine}>
        <button type="button" onClick={() => setAutoRefresh((current) => !current)} style={styles.autoButton}>
          {autoRefresh ? '● Otomatik tarama açık' : '○ Otomatik tarama kapalı'}
        </button>
        <span>Sonraki 5 dk kontrolü: {countdown || '--:--'}</span>
        <span>Kalan işlem hakkı: {remainingTrades}</span>
      </div>

      <div style={styles.ruleGrid}>
        <Rule label="Piyasa" value="Ek puan, zorunlu değil" />
        <Rule label="15 dk" value="EMA 9 > EMA 20" />
        <Rule label="5 dk" value="EMA 9 > EMA 20" />
        <Rule label="Hacim" value="En az 1,2 kat" />
        <Rule label="Puan" value="En az 65/100" />
      </div>

      {summary?.marketRegime ? (
        <div style={{ ...styles.marketBox, borderColor: summary.marketRegime.positive ? 'rgba(34,197,94,0.35)' : 'rgba(248,113,113,0.28)' }}>
          <strong>BIST 100 filtresi:</strong> {summary.marketRegime.message}
        </div>
      ) : null}
      {status ? <div style={styles.statusBox}>{status}</div> : null}
      {error ? <div style={styles.errorBox}>{error}</div> : null}

      {summary ? (
        <div style={styles.summaryLine}>
          <span>{summary.scanned || 0} likit hisse tarandı</span>
          <span>{summary.analyzed || 0} hisse hesaplandı</span>
          <span>Yalnızca en iyi 3 aday gösteriliyor</span>
        </div>
      ) : null}

      {items.length ? (
        <div style={styles.results}>
          {items.map((item) => (
            <TradeCard key={item.symbol} item={item} riskAmount={numericRisk} tradeLocked={remainingTrades <= 0} onRecordTrade={() => recordTrade(item)} />
          ))}
        </div>
      ) : null}

      <BistPaperRobot user={user} />

      <p style={styles.disclaimer}>
        Bu ekran emir vermez ve yatırım tavsiyesi değildir. Bildirim yalnızca
        ekran veya ana ekrana eklenen uygulama çalışırken üretilir. İlk aşamada
        gerçek para yerine deneme işlemiyle sonuçları ölçün.
      </p>
    </section>
  );
}

function NumberControl({ label, value, onChange, suffix }) {
  return (
    <label style={styles.riskLabel}>
      <span>{label}</span>
      <div style={styles.riskInputWrap}>
        <input type="text" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} style={styles.riskInput} />
        <strong>{suffix}</strong>
      </div>
    </label>
  );
}

function Rule({ label, value }) {
  return <div style={styles.ruleCard}><strong style={styles.ruleLabel}>{label}</strong><span style={styles.ruleValue}>{value}</span></div>;
}

function TradeCard({ item, riskAmount, tradeLocked, onRecordTrade }) {
  const lot = riskAmount > 0 && Number(item.riskPerShare) > 0 ? Math.floor(riskAmount / Number(item.riskPerShare)) : 0;
  const positionValue = lot * Number(item.entry || 0);
  const isSignal = item.setup === 'İŞLEM SİNYALİ';
  const isWaiting = item.setup === 'ONAY BEKLİYOR';
  const color = isSignal ? '#86efac' : isWaiting ? '#f0d98a' : '#cbd5e1';
  const borderColor = isSignal ? 'rgba(34,197,94,0.48)' : isWaiting ? 'rgba(212,175,55,0.34)' : 'rgba(148,163,184,0.22)';
  const reasons = [
    item.marketPositive ? 'BIST 100 olumlu' : 'BIST 100 onayı yok',
    item.dailyTrend ? 'Günlük trend olumlu' : 'Günlük trend onayı yok',
    item.fifteenTrend ? '15 dk yön olumlu' : '15 dk yön bekliyor',
    item.priceConfirmation ? '5 dk kapanış onaylı' : '5 dk kapanış bekliyor',
    item.aboveVwap ? 'VWAP üzerinde' : 'VWAP altında',
    item.strongVolume ? `Hacim ${formatRatio(item.volumeRatio)}` : 'Hacim 1,2 katın altında',
    item.hasResistanceRoom ? 'Hedefe alan var' : 'Yakın direnç var',
  ];

  return (
    <article style={{ ...styles.tradeCard, borderColor }}>
      <div style={styles.tradeHeader}>
        <div>
          <a href={`https://www.tradingview.com/chart/?symbol=BIST%3A${encodeURIComponent(item.symbol)}`} target="_blank" rel="noreferrer" style={styles.symbol}>{item.symbol}</a>
          <span style={styles.sessionDate}>{item.sessionDate}</span>
        </div>
        <div style={styles.scoreArea}><span style={{ ...styles.setupBadge, color }}>{item.setup}</span><strong style={styles.score}>{item.score}/100</strong></div>
      </div>
      <div style={styles.levelGrid}>
        <Level label="Giriş adayı" value={formatTry(item.entry)} />
        <Level label="Stop" value={formatTry(item.stop)} tone="red" />
        <Level label="1. hedef" value={formatTry(item.target1)} tone="green" />
        <Level label="2. hedef" value={formatTry(item.target2)} tone="green" />
      </div>
      <div style={styles.signalList}>{reasons.map((reason) => <span key={reason} style={styles.signalItem}>{reason}</span>)}</div>
      <div style={styles.riskBox}>
        <RiskValue label="Azami lot" value={lot || '-'} />
        <RiskValue label="Yaklaşık pozisyon" value={lot ? formatTry(positionValue) : '-'} />
        <RiskValue label="Hisse başı risk" value={formatTry(item.riskPerShare)} />
      </div>
      <button type="button" onClick={onRecordTrade} disabled={!isSignal || tradeLocked} style={{ ...styles.recordButton, opacity: !isSignal || tradeLocked ? 0.45 : 1, cursor: !isSignal || tradeLocked ? 'default' : 'pointer' }}>
        {tradeLocked ? 'Günlük işlem sınırı doldu' : isSignal ? 'Deneme İşlemine Aldım' : 'İşlem sinyali bekleniyor'}
      </button>
      <p style={styles.cardNote}>Giriş yalnızca tamamlanmış 5 dakikalık mumdan sonra değerlendirilir.</p>
    </article>
  );
}

function RiskValue({ label, value }) {
  return <div><span style={styles.riskBoxLabel}>{label}</span><strong style={styles.riskBoxValue}>{value}</strong></div>;
}

function Level({ label, value, tone }) {
  const color = tone === 'red' ? '#f87171' : tone === 'green' ? '#4ade80' : '#f8fafc';
  return <div style={styles.levelCard}><span style={styles.levelLabel}>{label}</span><strong style={{ ...styles.levelValue, color }}>{value}</strong></div>;
}

function positiveNumber(value) {
  const parsed = Number(String(value || '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function istanbulDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function isBistSessionOpen(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return minutes >= 600 && minutes <= 1080;
}

function formatCountdown(seconds) {
  const minute = Math.floor(seconds / 60);
  const second = seconds % 60;
  return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function formatTry(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return `${number.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
}

function formatRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return `${number.toFixed(1)}x`;
}

const styles = {
  section: { width: '100%', maxWidth: '1600px', margin: '0 auto 28px', padding: '18px', borderRadius: '18px', background: 'linear-gradient(145deg, rgba(18,25,36,0.98), rgba(25,32,44,0.98))', border: '1px solid rgba(212,175,55,0.30)', boxShadow: '0 18px 50px rgba(0,0,0,0.24)', color: '#f8fafc', boxSizing: 'border-box' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap', marginBottom: '16px' },
  eyebrow: { margin: '0 0 5px', color: '#d4af37', fontSize: '11px', fontWeight: 900, letterSpacing: '1.5px' },
  title: { margin: 0, fontSize: '22px' },
  description: { margin: '7px 0 0', color: '#94a3b8', fontSize: '13px', lineHeight: 1.5 },
  badge: { padding: '7px 11px', borderRadius: '999px', color: '#f0d98a', border: '1px solid rgba(212,175,55,0.28)', background: 'rgba(212,175,55,0.10)', fontSize: '12px', fontWeight: 800 },
  controls: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', alignItems: 'end', padding: '14px', borderRadius: '14px', background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(148,163,184,0.14)' },
  riskLabel: { display: 'flex', flexDirection: 'column', gap: '7px', color: '#cbd5e1', fontSize: '12px', fontWeight: 800 },
  riskInputWrap: { height: '44px', display: 'flex', alignItems: 'center', padding: '0 12px', borderRadius: '10px', border: '1px solid rgba(148,163,184,0.25)', background: '#0a101a' },
  riskInput: { flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', color: '#f8fafc', fontSize: '16px', fontWeight: 800 },
  limitBox: { minHeight: '44px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2px', color: '#94a3b8', fontSize: '10px' },
  scanButton: { minHeight: '46px', border: 0, borderRadius: '11px', background: 'linear-gradient(135deg, #d4af37, #f0d675)', color: '#111827', fontSize: '14px', fontWeight: 900, cursor: 'pointer' },
  autoLine: { display: 'flex', gap: '10px 18px', flexWrap: 'wrap', alignItems: 'center', marginTop: '10px', color: '#94a3b8', fontSize: '11px' },
  autoButton: { border: 0, borderRadius: '999px', padding: '6px 9px', background: 'rgba(34,197,94,0.10)', color: '#86efac', fontSize: '10px', fontWeight: 800, cursor: 'pointer' },
  ruleGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginTop: '12px' },
  ruleCard: { padding: '10px', borderRadius: '10px', border: '1px solid rgba(148,163,184,0.14)', background: 'rgba(255,255,255,0.035)' },
  ruleLabel: { display: 'block', marginBottom: '3px', color: '#e6c65c', fontSize: '11px' },
  ruleValue: { color: '#cbd5e1', fontSize: '11px' },
  marketBox: { marginTop: '12px', padding: '11px', borderRadius: '10px', color: '#cbd5e1', background: 'rgba(255,255,255,0.03)', border: '1px solid', fontSize: '12px' },
  statusBox: { marginTop: '10px', padding: '12px', borderRadius: '10px', color: '#bfdbfe', background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.22)', fontSize: '13px' },
  errorBox: { marginTop: '12px', padding: '12px', borderRadius: '10px', color: '#fecaca', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.24)', fontSize: '13px' },
  summaryLine: { display: 'flex', gap: '8px 18px', flexWrap: 'wrap', marginTop: '12px', color: '#94a3b8', fontSize: '11px' },
  results: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '12px', marginTop: '14px' },
  tradeCard: { padding: '15px', borderRadius: '14px', background: 'rgba(15,23,42,0.72)', border: '1px solid' },
  tradeHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' },
  symbol: { display: 'block', color: '#e6c65c', fontSize: '21px', fontWeight: 900, textDecoration: 'none' },
  sessionDate: { display: 'block', marginTop: '3px', color: '#64748b', fontSize: '10px' },
  scoreArea: { display: 'flex', alignItems: 'center', gap: '7px' },
  setupBadge: { padding: '5px 7px', borderRadius: '999px', background: 'rgba(255,255,255,0.05)', fontSize: '10px', fontWeight: 900 },
  score: { color: '#f8fafc', fontSize: '12px' },
  levelGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '7px', marginTop: '12px' },
  levelCard: { padding: '9px', borderRadius: '9px', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(148,163,184,0.11)' },
  levelLabel: { display: 'block', marginBottom: '4px', color: '#94a3b8', fontSize: '10px' },
  levelValue: { fontSize: '13px' },
  signalList: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '11px' },
  signalItem: { padding: '5px 7px', borderRadius: '999px', color: '#cbd5e1', background: 'rgba(148,163,184,0.09)', fontSize: '10px' },
  riskBox: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '7px', marginTop: '12px', padding: '10px', borderRadius: '10px', background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.15)' },
  riskBoxLabel: { display: 'block', marginBottom: '4px', color: '#94a3b8', fontSize: '9px' },
  riskBoxValue: { display: 'block', color: '#f8fafc', fontSize: '12px', wordBreak: 'break-word' },
  recordButton: { width: '100%', minHeight: '38px', marginTop: '11px', border: 0, borderRadius: '9px', background: '#d4af37', color: '#111827', fontSize: '11px', fontWeight: 900 },
  cardNote: { margin: '9px 0 0', color: '#64748b', fontSize: '10px', lineHeight: 1.45 },
  disclaimer: { margin: '14px 2px 0', color: '#64748b', fontSize: '10px', lineHeight: 1.5 },
};
