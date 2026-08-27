'use client';

import { useState } from 'react';

const MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function initialMonth() {
  const nextMonth = new Date().getMonth() + 2;
  return nextMonth > 12 ? 1 : nextMonth;
}

function percent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';

  return `${number > 0 ? '+' : ''}${number.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function returnColor(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '#94a3b8';
  return number > 0 ? '#4ade80' : number < 0 ? '#f87171' : '#facc15';
}

export default function BistSeasonality() {
  const [open, setOpen] = useState(true);
  const [month, setMonth] = useState(initialMonth);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  async function scan() {
    try {
      setLoading(true);
      setError('');

      const response = await fetch(
        `/api/bist-seasonality?month=${month}`,
        { cache: 'no-store' }
      );
      const payload = await response.json();

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.error || 'Mevsimsellik taraması tamamlanamadı.'
        );
      }

      setResult(payload);
    } catch (scanError) {
      setResult(null);
      setError(
        scanError?.message || 'Mevsimsellik verileri alınamadı.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={styles.section}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        style={styles.headerButton}
      >
        <div style={styles.headerText}>
          <span style={styles.eyebrow}>BIST 100 • SON 5 TAM YIL</span>
          <strong style={styles.title}>Aylık Mevsimsellik Taraması</strong>
          <span style={styles.description}>
            Seçilen ayda 5/5 veya 4/5 yükselen hisseleri bulur.
          </span>
        </div>
        <span style={styles.toggle}>{open ? '▲' : '▼'}</span>
      </button>

      {open ? (
        <div style={styles.body}>
          <div style={styles.controls}>
            <label style={styles.label}>
              <span>İncelenecek ay</span>
              <select
                value={month}
                onChange={(event) => {
                  setMonth(Number(event.target.value));
                  setResult(null);
                  setError('');
                }}
                style={styles.select}
              >
                {MONTHS.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={scan}
              disabled={loading}
              style={{
                ...styles.scanButton,
                opacity: loading ? 0.65 : 1,
                cursor: loading ? 'wait' : 'pointer',
              }}
            >
              {loading ? 'BIST 100 taranıyor…' : 'Taramayı Başlat'}
            </button>
          </div>

          {loading ? (
            <div style={styles.status}>
              100 hissenin beş yıllık aylık verileri inceleniyor. İlk tarama biraz sürebilir…
            </div>
          ) : null}

          {error ? <div style={styles.error}>{error}</div> : null}

          {result ? (
            <>
              <div style={styles.summary}>
                <SummaryBox
                  label="İncelenen dönem"
                  value={`${result.years?.[0]}–${result.years?.at(-1)} ${result.monthName}`}
                />
                <SummaryBox
                  label="5 yılın 5'i"
                  value={result.perfectCount}
                  color="#4ade80"
                />
                <SummaryBox
                  label="5 yılın 4'ü"
                  value={result.fourOfFiveCount}
                  color="#facc15"
                />
                <SummaryBox
                  label="Tam verisi olan"
                  value={`${result.completeHistory}/${result.scanned}`}
                />
              </div>

              {result.items?.length ? (
                <div style={styles.tableWrap}>
                  <div style={styles.table}>
                    <div style={styles.tableHeader}>
                      <span>Hisse</span>
                      <span>Başarı</span>
                      <span>Ortalama</span>
                      <span>Medyan</span>
                      <span>En iyi</span>
                      <span>En kötü</span>
                      <span>Yıllara göre sonuç</span>
                    </div>

                    {result.items.map((item) => (
                      <div key={item.symbol} style={styles.row}>
                        <strong style={styles.symbol}>{item.symbol}</strong>

                        <span
                          style={{
                            ...styles.consistency,
                            color: item.winCount === 5 ? '#4ade80' : '#facc15',
                            borderColor:
                              item.winCount === 5
                                ? 'rgba(74,222,128,0.35)'
                                : 'rgba(250,204,21,0.35)',
                            background:
                              item.winCount === 5
                                ? 'rgba(34,197,94,0.10)'
                                : 'rgba(250,204,21,0.09)',
                          }}
                        >
                          {item.consistency}
                        </span>

                        <strong style={{ color: returnColor(item.averageReturn) }}>
                          {percent(item.averageReturn)}
                        </strong>
                        <strong style={{ color: returnColor(item.medianReturn) }}>
                          {percent(item.medianReturn)}
                        </strong>
                        <span style={{ color: returnColor(item.bestReturn) }}>
                          {percent(item.bestReturn)}
                        </span>
                        <span style={{ color: returnColor(item.worstReturn) }}>
                          {percent(item.worstReturn)}
                        </span>

                        <div style={styles.yearList}>
                          {item.years.map((year) => (
                            <span
                              key={year.year}
                              title={`${year.year} ${result.monthName}: ${percent(year.returnPercent)}`}
                              style={{
                                ...styles.yearBadge,
                                color: returnColor(year.returnPercent),
                                borderColor:
                                  year.returnPercent > 0
                                    ? 'rgba(74,222,128,0.24)'
                                    : 'rgba(248,113,113,0.28)',
                              }}
                            >
                              {year.year} {percent(year.returnPercent)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={styles.empty}>
                  {result.monthName} ayında 5/5 veya 4/5 koşulunu sağlayan hisse bulunamadı.
                </div>
              )}

              <div style={styles.notes}>
                <span>
                  Düzeltilmiş aylık kapanışlar kullanılır. Beş tam yıllık verisi olmayan hisseler listelenmez.
                </span>
                <span>
                  Bu çalışma geçmiş istatistiktir; gelecek dönem için kesin yükseliş garantisi değildir.
                </span>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SummaryBox({ label, value, color = '#f8fafc' }) {
  return (
    <div style={styles.summaryBox}>
      <span>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  );
}

const styles = {
  section: {
    width: '100%',
    maxWidth: '1600px',
    margin: '0 0 28px',
    border: '1px solid rgba(56,189,248,0.24)',
    borderRadius: '16px',
    background: 'linear-gradient(145deg,rgba(12,22,35,0.98),rgba(20,28,40,0.98))',
    color: '#f8fafc',
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  headerButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    padding: '15px 17px',
    border: 0,
    background: 'transparent',
    color: '#f8fafc',
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  headerText: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 },
  eyebrow: { color: '#7dd3fc', fontSize: '10px', fontWeight: 900, letterSpacing: '1px' },
  title: { fontSize: '18px' },
  description: { color: '#94a3b8', fontSize: '12px' },
  toggle: { color: '#7dd3fc', fontSize: '11px', fontWeight: 900 },
  body: { padding: '0 15px 15px' },
  controls: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit,minmax(190px,260px))',
    gap: '10px',
    alignItems: 'end',
    padding: '13px',
    borderRadius: '12px',
    border: '1px solid rgba(148,163,184,0.14)',
    background: 'rgba(0,0,0,0.16)',
  },
  label: { display: 'flex', flexDirection: 'column', gap: '6px', color: '#cbd5e1', fontSize: '11px', fontWeight: 800 },
  select: { height: '42px', padding: '0 11px', borderRadius: '9px', border: '1px solid rgba(56,189,248,0.30)', background: '#0b1220', color: '#f8fafc', fontFamily: 'inherit', fontSize: '13px' },
  scanButton: { height: '42px', padding: '0 15px', border: 0, borderRadius: '9px', background: 'linear-gradient(135deg,#38bdf8,#7dd3fc)', color: '#082f49', fontFamily: 'inherit', fontSize: '13px', fontWeight: 900 },
  status: { marginTop: '11px', padding: '11px', borderRadius: '9px', background: 'rgba(56,189,248,0.08)', color: '#bae6fd', fontSize: '12px' },
  error: { marginTop: '11px', padding: '11px', borderRadius: '9px', border: '1px solid rgba(248,113,113,0.28)', background: 'rgba(127,29,29,0.20)', color: '#fecaca', fontSize: '12px' },
  summary: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: '8px', marginTop: '12px' },
  summaryBox: { display: 'flex', flexDirection: 'column', gap: '5px', padding: '10px', borderRadius: '9px', border: '1px solid rgba(148,163,184,0.14)', background: 'rgba(255,255,255,0.03)', color: '#94a3b8', fontSize: '10px' },
  tableWrap: { marginTop: '12px', overflowX: 'auto' },
  table: { minWidth: '1030px' },
  tableHeader: { display: 'grid', gridTemplateColumns: '90px 78px 90px 90px 82px 82px minmax(420px,1fr)', gap: '10px', padding: '9px 10px', borderBottom: '1px solid rgba(148,163,184,0.20)', color: '#64748b', fontSize: '10px', fontWeight: 900 },
  row: { display: 'grid', gridTemplateColumns: '90px 78px 90px 90px 82px 82px minmax(420px,1fr)', gap: '10px', alignItems: 'center', minHeight: '47px', padding: '7px 10px', borderBottom: '1px solid rgba(148,163,184,0.10)', color: '#cbd5e1', fontSize: '11px' },
  symbol: { color: '#f8fafc', fontSize: '14px' },
  consistency: { width: '52px', padding: '5px 7px', border: '1px solid', borderRadius: '999px', textAlign: 'center', fontWeight: 900 },
  yearList: { display: 'flex', gap: '5px', flexWrap: 'wrap' },
  yearBadge: { padding: '4px 6px', border: '1px solid', borderRadius: '6px', background: 'rgba(255,255,255,0.025)', fontSize: '9px', whiteSpace: 'nowrap' },
  empty: { marginTop: '12px', padding: '22px', borderRadius: '10px', background: 'rgba(255,255,255,0.025)', color: '#94a3b8', textAlign: 'center', fontSize: '12px' },
  notes: { display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '11px', color: '#64748b', fontSize: '10px', lineHeight: 1.45 },
};
