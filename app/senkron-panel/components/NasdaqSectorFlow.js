'use client';

import { useCallback, useEffect, useState } from 'react';

const initialRange = getInitialRange();

export default function NasdaqSectorFlow() {
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedSector, setSelectedSector] = useState(null);
  const [sectorStocks, setSectorStocks] = useState([]);
  const [stocksLoading, setStocksLoading] = useState(false);
  const [stocksError, setStocksError] = useState('');

  const loadFlow = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch(
        `/api/nasdaq-sector-flow?start=${encodeURIComponent(startDate)}` +
          `&end=${encodeURIComponent(endDate)}`,
        { cache: 'no-store' }
      );
      const payload = await response.json();

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Sektör akışı hesaplanamadı.');
      }

      setItems(Array.isArray(payload.items) ? payload.items : []);
      setSummary(payload);
      setSelectedSector(null);
      setSectorStocks([]);
    } catch (flowError) {
      setItems([]);
      setSummary(null);
      setError(flowError?.message || 'Sektör verileri alınamadı.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    loadFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leader = summary?.leader;

  async function openSector(item) {
    if (selectedSector?.symbol === item.symbol) {
      setSelectedSector(null);
      setSectorStocks([]);
      setStocksError('');
      return;
    }

    try {
      setSelectedSector(item);
      setSectorStocks([]);
      setStocksError('');
      setStocksLoading(true);

      const response = await fetch(
        `/api/nasdaq-sector-stocks?sector=${encodeURIComponent(item.symbol)}` +
          `&start=${encodeURIComponent(startDate)}` +
          `&end=${encodeURIComponent(endDate)}`,
        { cache: 'no-store' }
      );
      const payload = await response.json();

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Sektör hisseleri hesaplanamadı.');
      }

      setSectorStocks(Array.isArray(payload.items) ? payload.items : []);
    } catch (stockError) {
      setStocksError(stockError?.message || 'Sektör hisseleri alınamadı.');
    } finally {
      setStocksLoading(false);
    }
  }

  return (
    <section style={styles.section}>
      <div style={styles.header}>
        <div>
          <p style={styles.eyebrow}>SKY ROTASYON</p>
          <h2 style={styles.title}>🌊 NASDAQ Sektör Akışı</h2>
          <p style={styles.description}>
            Seçilen dönemde sektörlerin getiri, QQQ&apos;ya göre güç ve hacim
            değişimini birlikte karşılaştırır. Hisseleri görmek için sektör
            kutusuna dokunun.
          </p>
        </div>
        <span style={styles.badge}>Günlük veri</span>
      </div>

      <div style={styles.controls}>
        <DateInput label="Başlangıç" value={startDate} onChange={setStartDate} />
        <DateInput label="Bitiş" value={endDate} onChange={setEndDate} />
        <button
          type="button"
          onClick={loadFlow}
          disabled={loading}
          style={{ ...styles.button, opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Hesaplanıyor…' : 'Sektörleri Karşılaştır'}
        </button>
      </div>

      {leader ? (
        <div style={styles.leaderBox}>
          <span>🏆 Dönemin en güçlü sektörü</span>
          <strong>{leader.name}</strong>
          <small>
            {formatDate(summary.actualStart)} – {formatDate(summary.actualEnd)} •
            {' '}{signedPercent(leader.returnPercent)} getiri • QQQ&apos;ya göre{' '}
            {signedPercent(leader.relativeStrength)}
          </small>
        </div>
      ) : null}

      {error ? <div style={styles.error}>{error}</div> : null}

      {items.length ? (
        <div style={styles.grid}>
          {items.map((item, index) => (
            <SectorCard
              key={item.symbol}
              item={item}
              rank={index + 1}
              selected={selectedSector?.symbol === item.symbol}
              onOpen={() => openSector(item)}
            />
          ))}
        </div>
      ) : null}

      {selectedSector ? (
        <SectorStocksPanel
          sector={selectedSector}
          items={sectorStocks}
          loading={stocksLoading}
          error={stocksError}
          onClose={() => {
            setSelectedSector(null);
            setSectorStocks([]);
            setStocksError('');
          }}
        />
      ) : null}

      <div style={styles.legend}>
        <span>Yeşil: giriş eğilimi</span>
        <span>Sarı: nötr</span>
        <span>Kırmızı: çıkış eğilimi</span>
        {summary?.benchmark ? (
          <span>QQQ dönem getirisi: {signedPercent(summary.benchmark.returnPercent)}</span>
        ) : null}
      </div>

      <p style={styles.disclaimer}>
        Bu gösterge kesin fon giriş-çıkışı değildir. Ücretsiz günlük ETF fiyatı,
        işlem hacmi ve QQQ göreceli gücünden üretilen sektör rotasyonu
        göstergesidir; tek başına alım-satım kararı için kullanılmamalıdır.
      </p>
    </section>
  );
}

function DateInput({ label, value, onChange }) {
  return (
    <label style={styles.dateLabel}>
      <span>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={styles.dateInput}
      />
    </label>
  );
}

function SectorCard({ item, rank, selected, onOpen }) {
  const tone = getTone(item.flow);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onOpen();
      }}
      style={{
        ...styles.card,
        borderColor: selected ? '#e6c65c' : tone.border,
        background: tone.background,
      }}
    >
      <div style={styles.cardHeader}>
        <span style={styles.rank}>#{rank}</span>
        <span style={{ ...styles.flowBadge, color: tone.color }}>
          {item.flow}
        </span>
      </div>

      <strong style={styles.sectorName}>{item.name}</strong>
      <span style={styles.symbol}>{item.symbol} • {item.group}</span>

      <div style={styles.metrics}>
        <Metric label="Dönem getirisi" value={signedPercent(item.returnPercent)} color={item.returnPercent >= 0 ? '#4ade80' : '#f87171'} />
        <Metric label="QQQ'ya göre" value={signedPercent(item.relativeStrength)} color={item.relativeStrength >= 0 ? '#4ade80' : '#f87171'} />
        <Metric label="Hacim değişimi" value={formatRatio(item.volumeRatio)} />
        <Metric label="Ort. işlem hacmi" value={formatDollarVolume(item.averageDollarVolume)} />
      </div>
      <span style={styles.openHint}>
        {selected ? 'Detayı kapat ▲' : 'Hisseleri göster ▼'}
      </span>
    </article>
  );
}

function SectorStocksPanel({ sector, items, loading, error, onClose }) {
  return (
    <div style={styles.stockPanel}>
      <div style={styles.stockPanelHeader}>
        <div>
          <span style={styles.stockPanelEyebrow}>{sector.symbol} SEKTÖR DETAYI</span>
          <h3 style={styles.stockPanelTitle}>{sector.name} Hisseleri</h3>
          <p style={styles.stockPanelDescription}>
            Seçilen dönemde en çok yükselenden en çok düşene sıralanmıştır.
          </p>
        </div>
        <button type="button" onClick={onClose} style={styles.closeButton}>✕</button>
      </div>

      {loading ? <div style={styles.stockStatus}>Hisseler hesaplanıyor…</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}

      {items.length ? (
        <div style={styles.stockList}>
          <div style={styles.stockListHeader}>
            <span>Sıra / Hisse</span>
            <span>Dönem getirisi</span>
            <span>Son fiyat</span>
            <span>Hacim değişimi</span>
          </div>
          {items.map((stock, index) => (
            <a
              key={stock.symbol}
              href={`https://finance.yahoo.com/quote/${encodeURIComponent(stock.symbol)}`}
              target="_blank"
              rel="noreferrer"
              style={styles.stockRow}
            >
              <strong>#{index + 1} {stock.symbol}</strong>
              <strong style={{ color: stock.returnPercent >= 0 ? '#4ade80' : '#f87171' }}>
                {signedPercent(stock.returnPercent)}
              </strong>
              <span>{formatUsd(stock.price)}</span>
              <span>{formatRatio(stock.volumeRatio)}</span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, color = '#f8fafc' }) {
  return (
    <div style={styles.metric}>
      <span>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  );
}

function getTone(flow) {
  if (flow.includes('GİRİŞ')) {
    return {
      color: '#86efac',
      border: 'rgba(34,197,94,0.38)',
      background: 'linear-gradient(145deg, rgba(20,51,39,0.52), rgba(15,23,42,0.82))',
    };
  }
  if (flow.includes('ÇIKIŞ')) {
    return {
      color: '#fca5a5',
      border: 'rgba(248,113,113,0.34)',
      background: 'linear-gradient(145deg, rgba(60,28,32,0.48), rgba(15,23,42,0.82))',
    };
  }
  return {
    color: '#f0d98a',
    border: 'rgba(212,175,55,0.30)',
    background: 'rgba(15,23,42,0.78)',
  };
}

function getInitialRange() {
  const end = new Date();
  while (end.getDay() === 0 || end.getDay() === 6) {
    end.setDate(end.getDate() - 1);
  }
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { start: localDate(start), end: localDate(end) };
}

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function signedPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return `${number > 0 ? '+' : ''}${number.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return `${number.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}x`;
}

function formatDollarVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  if (number >= 1e9) return `$${(number / 1e9).toFixed(2)} Mr`;
  if (number >= 1e6) return `$${(number / 1e6).toFixed(1)} Mn`;
  return `$${number.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
}

function formatUsd(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return `$${number.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

const styles = {
  section: { width: '100%', maxWidth: '1600px', margin: '0 auto 28px', padding: '18px', borderRadius: '18px', background: 'linear-gradient(145deg, rgba(18,25,36,0.98), rgba(25,32,44,0.98))', border: '1px solid rgba(212,175,55,0.30)', boxShadow: '0 18px 50px rgba(0,0,0,0.24)', color: '#f8fafc', boxSizing: 'border-box' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap' },
  eyebrow: { margin: '0 0 5px', color: '#d4af37', fontSize: '11px', fontWeight: 900, letterSpacing: '1.5px' },
  title: { margin: 0, fontSize: '22px' },
  description: { margin: '7px 0 0', color: '#94a3b8', fontSize: '13px', lineHeight: 1.5 },
  badge: { padding: '7px 11px', borderRadius: '999px', color: '#f0d98a', border: '1px solid rgba(212,175,55,0.28)', background: 'rgba(212,175,55,0.10)', fontSize: '12px', fontWeight: 800 },
  controls: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px', alignItems: 'end', marginTop: '15px', padding: '13px', borderRadius: '13px', background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(148,163,184,0.14)' },
  dateLabel: { display: 'flex', flexDirection: 'column', gap: '6px', color: '#cbd5e1', fontSize: '11px', fontWeight: 800 },
  dateInput: { minHeight: '42px', boxSizing: 'border-box', padding: '0 10px', borderRadius: '9px', border: '1px solid rgba(148,163,184,0.24)', background: '#0a101a', color: '#f8fafc', colorScheme: 'dark', fontSize: '13px' },
  button: { minHeight: '43px', border: 0, borderRadius: '10px', background: 'linear-gradient(135deg, #d4af37, #f0d675)', color: '#111827', fontSize: '13px', fontWeight: 900, cursor: 'pointer' },
  leaderBox: { display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '13px', padding: '13px', borderRadius: '12px', background: 'rgba(34,197,94,0.09)', border: '1px solid rgba(34,197,94,0.24)', color: '#cbd5e1', fontSize: '11px' },
  error: { marginTop: '12px', padding: '12px', borderRadius: '10px', color: '#fecaca', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.24)', fontSize: '12px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '10px', marginTop: '13px' },
  card: { width: '100%', minWidth: 0, padding: '13px', borderRadius: '13px', border: '1px solid', color: '#f8fafc', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' },
  rank: { color: '#64748b', fontSize: '10px', fontWeight: 900 },
  flowBadge: { padding: '4px 7px', borderRadius: '999px', background: 'rgba(255,255,255,0.05)', fontSize: '9px', fontWeight: 900 },
  sectorName: { display: 'block', marginTop: '9px', color: '#f8fafc', fontSize: '17px' },
  symbol: { display: 'block', marginTop: '3px', color: '#94a3b8', fontSize: '9px' },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '7px', marginTop: '11px' },
  metric: { minWidth: 0, padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.035)', color: '#94a3b8', fontSize: '9px' },
  openHint: { display: 'block', marginTop: '10px', color: '#e6c65c', fontSize: '9px', fontWeight: 800 },
  stockPanel: { marginTop: '14px', padding: '15px', borderRadius: '14px', background: 'rgba(8,13,22,0.68)', border: '1px solid rgba(212,175,55,0.28)' },
  stockPanelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' },
  stockPanelEyebrow: { color: '#d4af37', fontSize: '9px', fontWeight: 900, letterSpacing: '1px' },
  stockPanelTitle: { margin: '4px 0 0', color: '#f8fafc', fontSize: '18px' },
  stockPanelDescription: { margin: '5px 0 0', color: '#94a3b8', fontSize: '10px' },
  closeButton: { width: '34px', height: '34px', borderRadius: '9px', border: '1px solid rgba(212,175,55,0.30)', background: 'rgba(212,175,55,0.08)', color: '#f8fafc', cursor: 'pointer' },
  stockStatus: { marginTop: '12px', padding: '12px', color: '#bfdbfe', fontSize: '11px' },
  stockList: { marginTop: '12px', overflowX: 'auto' },
  stockListHeader: { minWidth: '560px', display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: '10px', padding: '8px 10px', color: '#64748b', borderBottom: '1px solid rgba(148,163,184,0.14)', fontSize: '9px' },
  stockRow: { minWidth: '560px', display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: '10px', padding: '11px 10px', color: '#cbd5e1', borderBottom: '1px solid rgba(148,163,184,0.10)', textDecoration: 'none', fontSize: '11px' },
  legend: { display: 'flex', gap: '8px 16px', flexWrap: 'wrap', marginTop: '12px', color: '#94a3b8', fontSize: '10px' },
  disclaimer: { margin: '12px 1px 0', color: '#64748b', fontSize: '10px', lineHeight: 1.5 },
};
