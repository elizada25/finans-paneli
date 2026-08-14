'use client';

import { useEffect, useMemo, useState } from 'react';

export default function OptionsPressureModal({ stock, onClose }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  const symbol = String(stock?.code || stock?.symbol || '')
    .trim()
    .toUpperCase();
  const currentPrice = Number(stock?.currentPrice || 0);

  useEffect(() => {
    if (!symbol) return;

    const controller = new AbortController();

    async function loadData() {
      try {
        setStatus('loading');
        setError('');

        const params = new URLSearchParams({ symbol });
        if (currentPrice > 0) {
          params.set('price', String(currentPrice));
        }

        const response = await fetch(
          `/api/options-pressure?${params.toString()}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          }
        );
        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result?.error || 'Opsiyon ve short verileri alınamadı.'
          );
        }

        setData(result);
        setStatus('ready');
      } catch (loadError) {
        if (loadError?.name === 'AbortError') return;
        setError(loadError?.message || 'Veri alınamadı.');
        setStatus('error');
      }
    }

    loadData();
    return () => controller.abort();
  }, [symbol, currentPrice]);

  const maxOpenInterest = useMemo(() => {
    const rows = data?.options?.rows || [];
    return Math.max(
      1,
      ...rows.flatMap((row) => [
        Number(row.callOpenInterest || 0),
        Number(row.putOpenInterest || 0),
      ])
    );
  }, [data]);

  if (!stock) return null;

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={`${symbol} opsiyon ve short analizi`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div style={styles.modal}>
        <div style={styles.header}>
          <div>
            <p style={styles.label}>SKY OPSİYON & SHORT</p>
            <h2 style={styles.title}>{symbol}</h2>
            <p style={styles.subtitle}>
              Açık pozisyon yoğunluğu ve short baskısı
            </p>
          </div>
          <button type="button" onClick={onClose} style={styles.closeButton}>
            ×
          </button>
        </div>

        {status === 'loading' && (
          <div style={styles.message}>Veriler hazırlanıyor…</div>
        )}

        {status === 'error' && (
          <div style={styles.errorBox}>
            <strong>Veri alınamadı</strong>
            <span>{error}</span>
          </div>
        )}

        {status === 'ready' && data && (
          <>
            <div style={styles.cards}>
              <MetricCard
                label="Call duvarı"
                value={formatPrice(data.options.callWall)}
                tone="green"
              />
              <MetricCard
                label="Put duvarı"
                value={formatPrice(data.options.putWall)}
                tone="red"
              />
              <MetricCard
                label="Max Pain"
                value={formatPrice(data.options.maxPain)}
              />
              <MetricCard
                label="Put / Call"
                value={formatRatio(data.options.putCallRatio)}
              />
            </div>

            <section style={styles.section}>
              <div style={styles.sectionHeader}>
                <div>
                  <h3 style={styles.sectionTitle}>Opsiyon Basınç Haritası</h3>
                  <p style={styles.sectionNote}>
                    Yeşil: Call açık pozisyonu • Kırmızı: Put açık pozisyonu
                  </p>
                </div>
                <span style={styles.sourceTag}>
                  {data.options.source || 'Veri yok'}
                </span>
              </div>

              {data.options.rows?.length ? (
                <div style={styles.pressureList}>
                  {data.options.rows.map((row) => (
                    <div key={row.strike} style={styles.pressureRow}>
                      <div style={styles.callSide}>
                        <span style={styles.oiText}>
                          {formatCompact(row.callOpenInterest)}
                        </span>
                        <div style={styles.track}>
                          <div
                            style={{
                              ...styles.callBar,
                              width: `${Math.max(
                                2,
                                (Number(row.callOpenInterest || 0) /
                                  maxOpenInterest) *
                                  100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>

                      <strong style={styles.strike}>
                        ${formatNumber(row.strike)}
                      </strong>

                      <div style={styles.putSide}>
                        <div style={styles.track}>
                          <div
                            style={{
                              ...styles.putBar,
                              width: `${Math.max(
                                2,
                                (Number(row.putOpenInterest || 0) /
                                  maxOpenInterest) *
                                  100
                              )}%`,
                            }}
                          />
                        </div>
                        <span style={styles.oiText}>
                          {formatCompact(row.putOpenInterest)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={styles.emptyBox}>
                  Bu hissede kullanılabilir opsiyon açık pozisyonu bulunamadı.
                </div>
              )}
            </section>

            <section style={styles.section}>
              <div style={styles.sectionHeader}>
                <div>
                  <h3 style={styles.sectionTitle}>Short Pozisyon</h3>
                  <p style={styles.sectionNote}>
                    Son yayımlanan resmi uzlaşma dönemi
                  </p>
                </div>
                <span style={styles.sourceTag}>
                  {data.short.source || 'Veri yok'}
                </span>
              </div>

              <div style={styles.shortGrid}>
                <MetricCard
                  label="Short hisse"
                  value={formatCompact(data.short.shortInterest)}
                />
                <MetricCard
                  label="Short / Float"
                  value={formatPercent(data.short.shortPercentOfFloat)}
                />
                <MetricCard
                  label="Kapanma süresi"
                  value={formatDays(data.short.daysToCover)}
                />
                <MetricCard
                  label="Veri tarihi"
                  value={data.short.settlementDate || '—'}
                />
              </div>
            </section>

            {data.warnings?.length > 0 && (
              <div style={styles.warning}>{data.warnings.join(' ')}</div>
            )}

            <p style={styles.disclaimer}>
              Veriler gecikmeli olabilir. “Call/Put duvarı” açık pozisyon
              yoğunluğunu gösterir; kesin destek, direnç veya yatırım tavsiyesi
              değildir.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone }) {
  const color =
    tone === 'green' ? '#4ade80' : tone === 'red' ? '#fb7185' : '#f8fafc';

  return (
    <div style={styles.metricCard}>
      <span style={styles.metricLabel}>{label}</span>
      <strong style={{ ...styles.metricValue, color }}>{value}</strong>
    </div>
  );
}

function formatNumber(value) {
  return Number.isFinite(Number(value))
    ? Number(value).toLocaleString('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '—';
}

function formatPrice(value) {
  return Number.isFinite(Number(value)) ? `$${formatNumber(value)}` : '—';
}

function formatRatio(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '—';
}

function formatPercent(value) {
  return Number.isFinite(Number(value))
    ? `%${Number(value).toFixed(2)}`
    : '—';
}

function formatDays(value) {
  return Number.isFinite(Number(value))
    ? `${Number(value).toFixed(2)} gün`
    : '—';
}

function formatCompact(value) {
  if (!Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('tr-TR', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(Number(value));
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 10000,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '24px 12px',
    overflowY: 'auto',
    background: 'rgba(2,6,23,0.88)',
    backdropFilter: 'blur(8px)',
  },
  modal: {
    width: '100%',
    maxWidth: '1050px',
    borderRadius: '22px',
    border: '1px solid rgba(212,175,55,0.42)',
    background: 'linear-gradient(180deg, #111827 0%, #0b0f17 100%)',
    color: '#f8fafc',
    padding: '22px',
    boxShadow: '0 30px 90px rgba(0,0,0,0.55)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '16px',
    alignItems: 'flex-start',
    marginBottom: '18px',
  },
  label: {
    margin: '0 0 5px',
    color: '#e6c65c',
    fontSize: '12px',
    fontWeight: 900,
    letterSpacing: '0.16em',
  },
  title: { margin: 0, fontSize: '34px' },
  subtitle: { margin: '6px 0 0', color: '#94a3b8', fontSize: '13px' },
  closeButton: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    border: '1px solid rgba(212,175,55,0.45)',
    background: 'rgba(212,175,55,0.08)',
    color: '#f8fafc',
    fontSize: '30px',
    cursor: 'pointer',
  },
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '10px',
    marginBottom: '16px',
  },
  metricCard: {
    minWidth: 0,
    padding: '14px',
    borderRadius: '14px',
    border: '1px solid rgba(148,163,184,0.18)',
    background: 'rgba(255,255,255,0.04)',
  },
  metricLabel: {
    display: 'block',
    color: '#94a3b8',
    fontSize: '11px',
    fontWeight: 700,
    marginBottom: '7px',
  },
  metricValue: { display: 'block', fontSize: '19px' },
  section: {
    marginTop: '14px',
    padding: '16px',
    borderRadius: '16px',
    border: '1px solid rgba(212,175,55,0.20)',
    background: 'rgba(0,0,0,0.18)',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '14px',
  },
  sectionTitle: { margin: 0, fontSize: '17px' },
  sectionNote: { margin: '4px 0 0', color: '#94a3b8', fontSize: '11px' },
  sourceTag: {
    flexShrink: 0,
    padding: '5px 8px',
    borderRadius: '999px',
    background: 'rgba(212,175,55,0.10)',
    color: '#e6c65c',
    fontSize: '10px',
    fontWeight: 800,
  },
  pressureList: { display: 'flex', flexDirection: 'column', gap: '7px' },
  pressureRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 72px 1fr',
    alignItems: 'center',
    gap: '9px',
  },
  callSide: { display: 'grid', gridTemplateColumns: '56px 1fr', gap: '7px' },
  putSide: { display: 'grid', gridTemplateColumns: '1fr 56px', gap: '7px' },
  oiText: { color: '#cbd5e1', fontSize: '11px', textAlign: 'center' },
  track: {
    height: '10px',
    borderRadius: '999px',
    overflow: 'hidden',
    background: 'rgba(148,163,184,0.12)',
  },
  callBar: {
    height: '100%',
    marginLeft: 'auto',
    borderRadius: '999px',
    background: '#22c55e',
  },
  putBar: { height: '100%', borderRadius: '999px', background: '#ef4444' },
  strike: { textAlign: 'center', color: '#f8fafc', fontSize: '12px' },
  shortGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '10px',
  },
  message: {
    padding: '50px 20px',
    textAlign: 'center',
    color: '#cbd5e1',
  },
  errorBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '20px',
    borderRadius: '14px',
    border: '1px solid rgba(239,68,68,0.45)',
    background: 'rgba(239,68,68,0.08)',
    color: '#fecaca',
  },
  emptyBox: {
    padding: '22px',
    textAlign: 'center',
    color: '#94a3b8',
  },
  warning: {
    marginTop: '12px',
    color: '#fbbf24',
    fontSize: '12px',
  },
  disclaimer: {
    margin: '14px 2px 0',
    color: '#64748b',
    fontSize: '11px',
    lineHeight: 1.5,
  },
};
