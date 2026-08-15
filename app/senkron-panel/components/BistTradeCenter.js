'use client';

import { useMemo, useState } from 'react';

export default function BistTradeCenter() {
  const [riskAmount, setRiskAmount] = useState('500');
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const numericRisk = useMemo(() => {
    const normalized = String(riskAmount || '')
      .replace(/\s/g, '')
      .replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [riskAmount]);

  async function scanMarket() {
    try {
      setLoading(true);
      setError('');
      setStatus('Likit BIST hisseleri ve tamamlanmış mumlar taranıyor…');

      const response = await fetch('/api/bist-daytrade', {
        cache: 'no-store',
      });

      const payload = await response.json();

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.error || 'Günlük trade taraması tamamlanamadı.'
        );
      }

      const nextItems = Array.isArray(payload.items) ? payload.items : [];
      setItems(nextItems);
      setSummary({
        generatedAt: payload.generatedAt,
        scanned: payload.scanned,
        analyzed: payload.analyzed,
        durationMs: payload.durationMs,
      });
      setStatus(
        nextItems.length
          ? `${nextItems.length} izlenebilir aday bulundu.`
          : payload.message || 'Uygun aday bulunamadı.'
      );
    } catch (scanError) {
      setItems([]);
      setSummary(null);
      setStatus('');
      setError(
        scanError?.message || 'BIST taraması sırasında hata oluştu.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={styles.section}>
      <div style={styles.header}>
        <div>
          <p style={styles.eyebrow}>SKY TRADE • DENEME MODU</p>
          <h2 style={styles.title}>⚡ BIST Günlük Trade Merkezi</h2>
          <p style={styles.description}>
            15 dakikada yönü, 5 dakikada giriş onayını arar. Yalnızca
            tamamlanmış mumlar kullanılır.
          </p>
        </div>

        <span style={styles.badge}>5 dk + 15 dk</span>
      </div>

      <div style={styles.controls}>
        <label style={styles.riskLabel}>
          <span>İşlem başına en fazla risk</span>
          <div style={styles.riskInputWrap}>
            <input
              type="text"
              inputMode="decimal"
              value={riskAmount}
              onChange={(event) => setRiskAmount(event.target.value)}
              style={styles.riskInput}
              aria-label="İşlem başına risk tutarı"
            />
            <strong>TL</strong>
          </div>
        </label>

        <button
          type="button"
          onClick={scanMarket}
          disabled={loading}
          style={{
            ...styles.scanButton,
            opacity: loading ? 0.65 : 1,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Taranıyor…' : 'BIST Fırsatlarını Tara'}
        </button>
      </div>

      <div style={styles.ruleGrid}>
        <Rule label="15 dk" value="EMA 9 > EMA 20" />
        <Rule label="5 dk" value="EMA 9 > EMA 20" />
        <Rule label="Fiyat" value="VWAP üzerinde" />
        <Rule label="Hacim" value="Ortalamaya göre güçlü" />
        <Rule label="Hedef" value="En az 1:2" />
      </div>

      {status ? <div style={styles.statusBox}>{status}</div> : null}
      {error ? <div style={styles.errorBox}>{error}</div> : null}

      {summary ? (
        <div style={styles.summaryLine}>
          <span>{summary.scanned || 0} likit hisse seçildi</span>
          <span>{summary.analyzed || 0} hisse hesaplandı</span>
          <span>
            {summary.durationMs
              ? `${(summary.durationMs / 1000).toFixed(1)} saniye`
              : '-'}
          </span>
        </div>
      ) : null}

      {items.length ? (
        <div style={styles.results}>
          {items.map((item) => (
            <TradeCard
              key={item.symbol}
              item={item}
              riskAmount={numericRisk}
            />
          ))}
        </div>
      ) : null}

      <p style={styles.disclaimer}>
        Bu ekran yatırım tavsiyesi veya otomatik AL emri değildir. İlk aşamada
        yalnızca deneme işlemlerini kaydetmek için kullanılmalıdır. Stop fiyatı
        hızlı piyasada garanti edilen gerçekleşme fiyatı değildir.
      </p>
    </section>
  );
}

function Rule({ label, value }) {
  return (
    <div style={styles.ruleCard}>
      <strong style={styles.ruleLabel}>{label}</strong>
      <span style={styles.ruleValue}>{value}</span>
    </div>
  );
}

function TradeCard({ item, riskAmount }) {
  const lot =
    riskAmount > 0 && Number(item.riskPerShare) > 0
      ? Math.floor(riskAmount / Number(item.riskPerShare))
      : 0;
  const positionValue = lot * Number(item.entry || 0);
  const setupReady = item.setup === 'HAZIRLIK';

  const reasons = [
    item.fifteenTrend ? '15 dk yön olumlu' : '15 dk yön bekliyor',
    item.fiveTrend ? '5 dk onay olumlu' : '5 dk onay bekliyor',
    item.aboveVwap ? 'VWAP üzerinde' : 'VWAP altında',
    Number(item.volumeRatio) >= 1.1
      ? `Hacim ${formatRatio(item.volumeRatio)}`
      : 'Hacim zayıf',
  ];

  return (
    <article
      style={{
        ...styles.tradeCard,
        borderColor: setupReady
          ? 'rgba(34,197,94,0.48)'
          : 'rgba(212,175,55,0.30)',
      }}
    >
      <div style={styles.tradeHeader}>
        <div>
          <a
            href={`https://www.tradingview.com/chart/?symbol=BIST%3A${encodeURIComponent(
              item.symbol
            )}`}
            target="_blank"
            rel="noreferrer"
            style={styles.symbol}
          >
            {item.symbol}
          </a>
          <span style={styles.sessionDate}>{item.sessionDate}</span>
        </div>

        <div style={styles.scoreArea}>
          <span
            style={{
              ...styles.setupBadge,
              background: setupReady
                ? 'rgba(34,197,94,0.16)'
                : 'rgba(212,175,55,0.12)',
              color: setupReady ? '#86efac' : '#f0d98a',
            }}
          >
            {item.setup}
          </span>
          <strong style={styles.score}>{item.score}/100</strong>
        </div>
      </div>

      <div style={styles.levelGrid}>
        <Level label="Giriş adayı" value={formatTry(item.entry)} />
        <Level label="Stop" value={formatTry(item.stop)} tone="red" />
        <Level label="1. hedef" value={formatTry(item.target1)} tone="green" />
        <Level label="2. hedef" value={formatTry(item.target2)} tone="green" />
      </div>

      <div style={styles.signalList}>
        {reasons.map((reason) => (
          <span key={reason} style={styles.signalItem}>
            {reason.includes('olumlu') ||
            reason.includes('üzerinde') ||
            (Number(item.volumeRatio) >= 1.1 && reason.startsWith('Hacim'))
              ? '✓'
              : '•'}{' '}
            {reason}
          </span>
        ))}
      </div>

      <div style={styles.riskBox}>
        <div>
          <span style={styles.riskBoxLabel}>Hesaplanan azami lot</span>
          <strong style={styles.riskBoxValue}>{lot || '-'}</strong>
        </div>
        <div>
          <span style={styles.riskBoxLabel}>Yaklaşık pozisyon</span>
          <strong style={styles.riskBoxValue}>
            {lot ? formatTry(positionValue) : '-'}
          </strong>
        </div>
        <div>
          <span style={styles.riskBoxLabel}>Hisse başı risk</span>
          <strong style={styles.riskBoxValue}>
            {formatTry(item.riskPerShare)}
          </strong>
        </div>
      </div>

      <p style={styles.cardNote}>
        Giriş ancak 5 dakikalık mum kapandıktan sonra tekrar kontrol edilmelidir.
      </p>
    </article>
  );
}

function Level({ label, value, tone }) {
  const color =
    tone === 'red' ? '#f87171' : tone === 'green' ? '#4ade80' : '#f8fafc';

  return (
    <div style={styles.levelCard}>
      <span style={styles.levelLabel}>{label}</span>
      <strong style={{ ...styles.levelValue, color }}>{value}</strong>
    </div>
  );
}

function formatTry(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';

  return `${number.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TL`;
}

function formatRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return `${number.toFixed(1)}x`;
}

const styles = {
  section: {
    width: '100%',
    maxWidth: '1600px',
    margin: '0 auto 28px',
    padding: '18px',
    borderRadius: '18px',
    background:
      'linear-gradient(145deg, rgba(18,25,36,0.98), rgba(25,32,44,0.98))',
    border: '1px solid rgba(212,175,55,0.30)',
    boxShadow: '0 18px 50px rgba(0,0,0,0.24)',
    color: '#f8fafc',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '14px',
    flexWrap: 'wrap',
    marginBottom: '16px',
  },
  eyebrow: {
    margin: '0 0 5px',
    color: '#d4af37',
    fontSize: '11px',
    fontWeight: 900,
    letterSpacing: '1.5px',
  },
  title: { margin: 0, fontSize: '22px' },
  description: {
    margin: '7px 0 0',
    color: '#94a3b8',
    fontSize: '13px',
    lineHeight: 1.5,
  },
  badge: {
    padding: '7px 11px',
    borderRadius: '999px',
    color: '#f0d98a',
    border: '1px solid rgba(212,175,55,0.28)',
    background: 'rgba(212,175,55,0.10)',
    fontSize: '12px',
    fontWeight: 800,
  },
  controls: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '12px',
    alignItems: 'end',
    padding: '14px',
    borderRadius: '14px',
    background: 'rgba(0,0,0,0.18)',
    border: '1px solid rgba(148,163,184,0.14)',
  },
  riskLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
    color: '#cbd5e1',
    fontSize: '12px',
    fontWeight: 800,
  },
  riskInputWrap: {
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    borderRadius: '10px',
    border: '1px solid rgba(148,163,184,0.25)',
    background: '#0a101a',
  },
  riskInput: {
    flex: 1,
    minWidth: 0,
    border: 0,
    outline: 'none',
    background: 'transparent',
    color: '#f8fafc',
    fontSize: '16px',
    fontWeight: 800,
  },
  scanButton: {
    minHeight: '46px',
    border: 0,
    borderRadius: '11px',
    background: 'linear-gradient(135deg, #d4af37, #f0d675)',
    color: '#111827',
    fontSize: '14px',
    fontWeight: 900,
  },
  ruleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: '8px',
    marginTop: '12px',
  },
  ruleCard: {
    padding: '10px',
    borderRadius: '10px',
    border: '1px solid rgba(148,163,184,0.14)',
    background: 'rgba(255,255,255,0.035)',
  },
  ruleLabel: {
    display: 'block',
    marginBottom: '3px',
    color: '#e6c65c',
    fontSize: '11px',
  },
  ruleValue: { color: '#cbd5e1', fontSize: '11px' },
  statusBox: {
    marginTop: '12px',
    padding: '12px',
    borderRadius: '10px',
    color: '#bfdbfe',
    background: 'rgba(59,130,246,0.10)',
    border: '1px solid rgba(59,130,246,0.22)',
    fontSize: '13px',
  },
  errorBox: {
    marginTop: '12px',
    padding: '12px',
    borderRadius: '10px',
    color: '#fecaca',
    background: 'rgba(239,68,68,0.10)',
    border: '1px solid rgba(239,68,68,0.24)',
    fontSize: '13px',
  },
  summaryLine: {
    display: 'flex',
    gap: '8px 18px',
    flexWrap: 'wrap',
    marginTop: '12px',
    color: '#94a3b8',
    fontSize: '11px',
  },
  results: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
    gap: '12px',
    marginTop: '14px',
  },
  tradeCard: {
    padding: '15px',
    borderRadius: '14px',
    background: 'rgba(15,23,42,0.72)',
    border: '1px solid',
  },
  tradeHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
  },
  symbol: {
    display: 'block',
    color: '#e6c65c',
    fontSize: '21px',
    fontWeight: 900,
    textDecoration: 'none',
  },
  sessionDate: {
    display: 'block',
    marginTop: '3px',
    color: '#64748b',
    fontSize: '10px',
  },
  scoreArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
  },
  setupBadge: {
    padding: '5px 7px',
    borderRadius: '999px',
    fontSize: '10px',
    fontWeight: 900,
  },
  score: { color: '#f8fafc', fontSize: '12px' },
  levelGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '7px',
    marginTop: '12px',
  },
  levelCard: {
    padding: '9px',
    borderRadius: '9px',
    background: 'rgba(255,255,255,0.035)',
    border: '1px solid rgba(148,163,184,0.11)',
  },
  levelLabel: {
    display: 'block',
    marginBottom: '4px',
    color: '#94a3b8',
    fontSize: '10px',
  },
  levelValue: { fontSize: '13px' },
  signalList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '11px',
  },
  signalItem: {
    padding: '5px 7px',
    borderRadius: '999px',
    color: '#cbd5e1',
    background: 'rgba(148,163,184,0.09)',
    fontSize: '10px',
  },
  riskBox: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '7px',
    marginTop: '12px',
    padding: '10px',
    borderRadius: '10px',
    background: 'rgba(212,175,55,0.07)',
    border: '1px solid rgba(212,175,55,0.15)',
  },
  riskBoxLabel: {
    display: 'block',
    marginBottom: '4px',
    color: '#94a3b8',
    fontSize: '9px',
  },
  riskBoxValue: {
    display: 'block',
    color: '#f8fafc',
    fontSize: '12px',
    wordBreak: 'break-word',
  },
  cardNote: {
    margin: '10px 0 0',
    color: '#64748b',
    fontSize: '10px',
    lineHeight: 1.45,
  },
  disclaimer: {
    margin: '14px 2px 0',
    color: '#64748b',
    fontSize: '10px',
    lineHeight: 1.5,
  },
};
