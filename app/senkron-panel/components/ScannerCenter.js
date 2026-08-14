'use client';

import { useMemo, useState } from 'react';

const QUICK_COMMANDS = [
  {
    label: 'EMA 5 / EMA 22 yukarı kesişim',
    command: 'BIST 100 hisselerinden günlük bazda EMA 5 EMA 22 yi yukarı kesenleri bul',
  },
  {
    label: 'EMA 5 / EMA 22 aşağı kesişim',
    command: 'BIST 100 hisselerinden günlük bazda EMA 5 EMA 22 yi aşağı kesenleri bul',
  },
  {
    label: 'EMA 50 / EMA 200 Golden Cross',
    command: 'BIST 100 hisselerinden günlük bazda EMA 50 EMA 200 ü yukarı kesenleri bul',
  },
  {
    label: 'EMA 50 / EMA 200 Death Cross',
    command: 'BIST 100 hisselerinden günlük bazda EMA 50 EMA 200 ü aşağı kesenleri bul',
  },
  {
    label: 'EMA 200 seviyesine yaklaşan hisseler',
    command: 'BIST 100 hisselerinden günlük bazda EMA 200 seviyesine yaklaşan hisseleri bul',
  },
];

function parseCommand(command) {
  const normalized = String(command || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u');

  const emaMatches = [...normalized.matchAll(/ema\s*(\d+)/g)];

  const periods = emaMatches
    .map((match) => Number(match[1]))
    .filter((value) => Number.isInteger(value) && value >= 2 && value <= 250);

  const isNearMode = /yaklas/.test(normalized);

  if (isNearMode) {
    const period = periods[0] || 200;

    return {
      mode: 'near',
      period,
      fast: null,
      slow: null,
      direction: null,
    };
  }

  let fast = periods[0] || 5;
  let slow = periods[1] || 22;

  if (fast > slow) {
    [fast, slow] = [slow, fast];
  }

  const direction = /asagi|death|dusus|alt/.test(normalized) ? 'down' : 'up';

  return {
    mode: 'cross',
    fast,
    slow,
    direction,
  };
}

function formatNumber(value, digits = 2) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '-';
  }

  return number.toLocaleString('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '-';
  }

  return `${number > 0 ? '+' : ''}${formatNumber(number, 2)}%`;
}

export default function ScannerCenter() {
  const [command, setCommand] = useState(QUICK_COMMANDS[0].command);

  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [scanData, setScanData] = useState(null);

  const parsed = useMemo(() => parseCommand(command), [command]);

  async function runScanner() {
    try {
      setStatus('loading');
      setError('');
      setScanData(null);

      const params =
        parsed.mode === 'near'
          ? new URLSearchParams({
              mode: 'near',
              period: String(parsed.period),
            })
          : new URLSearchParams({
              fast: String(parsed.fast),
              slow: String(parsed.slow),
              direction: parsed.direction,
            });

      const response = await fetch(`/api/scanner?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      });

      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Tarama tamamlanamadı.');
      }

      setScanData(data);
      setStatus('success');
    } catch (scanError) {
      setStatus('error');
      setError(scanError?.message || 'Tarama sırasında hata oluştu.');
    }
  }

  return (
    <section style={styles.section}>
      <div style={styles.headingRow}>
        <div>
          <div style={styles.eyebrow}>SKY SCANNER</div>

          <h2 style={styles.title}>📡 BIST 100 Tarama Merkezi</h2>

          <p style={styles.description}>
            BIST 100 hisselerini günlük grafikte tarar; kesişim veya EMA
            yakınlık taraması yapabilirsiniz.
          </p>
        </div>

        <div style={styles.badge}>Günlük</div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '18px',
          padding: '12px 14px',
          borderRadius: '12px',
          border: '1px solid rgba(212,175,55,0.32)',
          background: 'rgba(212,175,55,0.07)',
        }}
      >
        <strong style={{ color: '#facc15' }}>
          FXU030N1
        </strong>

        <span style={{ opacity: 0.78, fontSize: '13px' }}>
          EMA 5/20 kesişim ve EMA 100/200 %2 yakınlık bildirimleri aktif
        </span>
      </div>

      <div style={styles.quickGrid}>
        {QUICK_COMMANDS.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => setCommand(item.command)}
            style={styles.quickButton}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div style={styles.commandBox}>
        <label style={styles.label}>Tarama komutun</label>

        <textarea
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          rows={3}
          style={styles.textarea}
          placeholder="Örnek: BIST 100 hisselerinden günlük bazda EMA 5 EMA 22 yi yukarı kesenleri bul"
        />

        <div style={styles.detectedRow}>
          {parsed.mode === 'near' ? (
            <span>
              Yakınlık taraması: <strong>EMA {parsed.period}</strong>
            </span>
          ) : (
            <>
              <span>
                Hızlı EMA: <strong>{parsed.fast}</strong>
              </span>

              <span>
                Yavaş EMA: <strong>{parsed.slow}</strong>
              </span>

              <span>
                Yön:
                <strong>
                  {parsed.direction === 'up' ? ' Yukarı ↑' : ' Aşağı ↓'}
                </strong>
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={runScanner}
          disabled={status === 'loading'}
          style={{
            ...styles.scanButton,
            opacity: status === 'loading' ? 0.65 : 1,
          }}
        >
          {status === 'loading' ? 'BIST 100 taranıyor...' : 'Taramayı Başlat'}
        </button>
      </div>

      {status === 'loading' && (
        <div style={styles.infoBox}>
          Yaklaşık 100 hissenin günlük verileri inceleniyor. Bu işlem birkaç
          saniye sürebilir.
        </div>
      )}

      {error && <div style={styles.errorBox}>{error}</div>}

      {scanData && (
        <div style={styles.resultsArea}>
          <div style={styles.summaryGrid}>
            <div style={styles.summaryCard}>
              <span style={styles.summaryLabel}>Taranan</span>
              <strong style={styles.summaryValue}>{scanData.scanned}</strong>
            </div>

            <div style={styles.summaryCard}>
              <span style={styles.summaryLabel}>Veri alınan</span>
              <strong style={styles.summaryValue}>{scanData.dataAvailable}</strong>
            </div>

            <div style={styles.summaryCard}>
              <span style={styles.summaryLabel}>
                {scanData.mode === 'near' ? 'Yakın hisse' : 'Kesişim'}
              </span>
              <strong style={styles.summaryValue}>{scanData.resultCount}</strong>
            </div>
          </div>

          {scanData.results.length === 0 ? (
            <div style={styles.emptyBox}>
              {scanData.mode === 'near'
                ? 'Şu an belirlenen yakınlık eşiğinde EMA seviyesine yakın hisse bulunamadı.'
                : 'Bu taramada yeni kesişim bulunamadı. Bu, sistemin çalışmadığı anlamına gelmez; son tamamlanmış mumda kesişim oluşmamış olabilir.'}
            </div>
          ) : scanData.mode === 'near' ? (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Hisse</th>
                    <th style={styles.th}>Son fiyat</th>
                    <th style={styles.th}>EMA {scanData.emaPeriod}</th>
                    <th style={styles.th}>Fark</th>
                    <th style={styles.th}>Konum</th>
                    <th style={styles.th}>Grafik</th>
                  </tr>
                </thead>

                <tbody>
                  {scanData.results.map((item) => (
                    <tr key={item.symbol}>
                      <td style={styles.td}>
                        <strong>{item.symbol}</strong>
                      </td>

                      <td style={styles.td}>{formatNumber(item.price, 2)} TL</td>

                      <td style={styles.td}>{formatNumber(item.emaValue, 2)} TL</td>

                      <td
                        style={{
                          ...styles.td,
                          color: item.diffPercent >= 0 ? '#22c55e' : '#ef4444',
                        }}
                      >
                        {formatPercent(item.diffPercent)}
                      </td>

                      <td style={styles.td}>
                        {item.position === 'above' ? 'Üstünde' : 'Altında'}
                      </td>

                      <td style={styles.td}>
                        <a
                          href={`https://www.tradingview.com/chart/?symbol=BIST%3A${item.symbol}`}
                          target="_blank"
                          rel="noreferrer"
                          style={styles.link}
                        >
                          Aç
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Hisse</th>
                    <th style={styles.th}>Sinyal</th>
                    <th style={styles.th}>Son fiyat</th>
                    <th style={styles.th}>Günlük</th>
                    <th style={styles.th}>Hacim</th>
                    <th style={styles.th}>Grafik</th>
                  </tr>
                </thead>

                <tbody>
                  {scanData.results.map((item) => (
                    <tr key={item.symbol}>
                      <td style={styles.td}>
                        <strong>{item.symbol}</strong>
                      </td>

                      <td style={styles.td}>
                        EMA {scanData.fastPeriod}{' '}
                        {scanData.direction === 'up' ? '↑' : '↓'}{' '}
                        EMA {scanData.slowPeriod}
                      </td>

                      <td style={styles.td}>{formatNumber(item.price, 2)} TL</td>

                      <td
                        style={{
                          ...styles.td,
                          color: Number(item.dailyChange) >= 0 ? '#22c55e' : '#ef4444',
                        }}
                      >
                        {formatPercent(item.dailyChange)}
                      </td>

                      <td style={styles.td}>
                        {Number.isFinite(Number(item.volumeRatio))
                          ? `${formatNumber(item.volumeRatio, 1)}x`
                          : '-'}
                      </td>

                      <td style={styles.td}>
                        <a
                          href={`https://www.tradingview.com/chart/?symbol=BIST%3A${item.symbol}`}
                          target="_blank"
                          rel="noreferrer"
                          style={styles.link}
                        >
                          Aç
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={styles.footerNote}>
            Liste kaynağı:{' '}
            {scanData.listSource === 'dynamic' ? 'Dinamik BIST 100' : 'Yedek BIST 100 listesi'}
          </div>
        </div>
      )}
    </section>
  );
}

const styles = {
  section: {
    marginTop: '24px',
    marginBottom: '32px',
    padding: '18px',
    borderRadius: '18px',
    background: 'linear-gradient(145deg, rgba(39,79,111,0.97), rgba(32,67,98,0.97))',
    border: '1px solid rgba(125,211,252,0.28)',
    boxShadow: '0 18px 50px rgba(0,0,0,0.24)',
    color: '#f8fafc',
  },
  headingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '14px',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    marginBottom: '16px',
  },
  eyebrow: {
    color: '#d4af37',
    fontSize: '11px',
    fontWeight: 900,
    letterSpacing: '1.6px',
    marginBottom: '5px',
  },
  title: { margin: 0, fontSize: '21px', lineHeight: 1.25 },
  description: { margin: '7px 0 0', color: '#c2d6e8', fontSize: '13px', lineHeight: 1.55 },
  badge: {
    padding: '7px 11px',
    borderRadius: '999px',
    background: 'rgba(212,175,55,0.12)',
    border: '1px solid rgba(212,175,55,0.25)',
    color: '#f4d978',
    fontSize: '12px',
    fontWeight: 800,
  },
  quickGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '8px',
    marginBottom: '14px',
  },
  quickButton: {
    minHeight: '42px',
    padding: '9px 11px',
    borderRadius: '10px',
    border: '1px solid rgba(148,163,184,0.18)',
    background: 'rgba(125,211,252,0.09)',
    color: '#e2e8f0',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'left',
  },
  commandBox: {
    padding: '14px',
    borderRadius: '14px',
    background: 'rgba(16,45,70,0.48)',
    border: '1px solid rgba(148,163,184,0.13)',
  },
  label: { display: 'block', marginBottom: '7px', fontSize: '12px', fontWeight: 800, color: '#cbd5e1' },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid rgba(148,163,184,0.25)',
    background: '#173a57',
    color: '#f8fafc',
    outline: 'none',
    fontSize: '14px',
    lineHeight: 1.45,
  },
  detectedRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px 16px',
    marginTop: '9px',
    color: '#c2d6e8',
    fontSize: '12px',
  },
  scanButton: {
    width: '100%',
    minHeight: '48px',
    marginTop: '12px',
    border: 0,
    borderRadius: '11px',
    background: 'linear-gradient(135deg, #d4af37, #f0d675)',
    color: '#111827',
    fontSize: '14px',
    fontWeight: 900,
    cursor: 'pointer',
  },
  infoBox: {
    marginTop: '14px',
    padding: '13px',
    borderRadius: '11px',
    background: 'rgba(59,130,246,0.1)',
    border: '1px solid rgba(59,130,246,0.22)',
    color: '#bfdbfe',
    fontSize: '13px',
  },
  errorBox: {
    marginTop: '14px',
    padding: '13px',
    borderRadius: '11px',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.22)',
    color: '#fca5a5',
    fontSize: '13px',
  },
  resultsArea: { marginTop: '16px' },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '8px',
    marginBottom: '12px',
  },
  summaryCard: {
    padding: '12px',
    borderRadius: '11px',
    background: 'rgba(125,211,252,0.09)',
    border: '1px solid rgba(148,163,184,0.12)',
  },
  summaryLabel: { display: 'block', color: '#c2d6e8', fontSize: '11px', marginBottom: '4px' },
  summaryValue: { fontSize: '20px', color: '#f8fafc' },
  emptyBox: {
    padding: '16px',
    borderRadius: '12px',
    background: 'rgba(34,197,94,0.08)',
    border: '1px solid rgba(34,197,94,0.18)',
    color: '#bbf7d0',
    fontSize: '13px',
    lineHeight: 1.5,
  },
  tableWrap: {
    width: '100%',
    overflowX: 'auto',
    borderRadius: '12px',
    border: '1px solid rgba(148,163,184,0.13)',
  },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: '680px' },
  th: {
    padding: '11px',
    textAlign: 'left',
    background: 'rgba(125,211,252,0.11)',
    color: '#c2d6e8',
    fontSize: '11px',
    borderBottom: '1px solid rgba(148,163,184,0.13)',
  },
  td: {
    padding: '11px',
    fontSize: '12px',
    borderBottom: '1px solid rgba(148,163,184,0.09)',
    color: '#e2e8f0',
    whiteSpace: 'nowrap',
  },
  link: { color: '#f4d978', fontWeight: 800, textDecoration: 'none' },
  footerNote: { marginTop: '9px', color: '#64748b', fontSize: '10px', textAlign: 'right' },
};
