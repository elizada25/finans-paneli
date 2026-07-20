'use client';

import { useMemo, useState } from 'react';

export default function SkyAI({
  bistStocks = [],
  usStocks = [],
  prices = {},
  bistDailySummary = {},
  usDailySummary = {},
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(
    'Portföyünle ilgili bir soru sorabilirsin.'
  );

  const allStocks = useMemo(
    () => [...bistStocks, ...usStocks],
    [bistStocks, usStocks]
  );

  const stockRows = useMemo(() => {
    return allStocks
      .map((stock) => {
        const priceData = prices?.[stock.symbol] || {};
        const currentPrice = Number(priceData.price || 0);
        const previousClose = Number(priceData.previousClose || 0);

        const dailyChangePercent =
          previousClose > 0
            ? ((currentPrice - previousClose) / previousClose) * 100
            : Number(priceData.changePercent || 0);

        const quantity = Number(stock.quantity || stock.lot || 0);
        const cost = Number(stock.cost || stock.averageCost || 0);
        const value = currentPrice * quantity;
        const profitLoss = (currentPrice - cost) * quantity;
        const profitLossPercent =
          cost > 0 ? ((currentPrice - cost) / cost) * 100 : 0;

        return {
          ...stock,
          currentPrice,
          dailyChangePercent,
          quantity,
          cost,
          value,
          profitLoss,
          profitLossPercent,
        };
      })
      .filter((stock) => stock.currentPrice > 0);
  }, [allStocks, prices]);

  const strongest = useMemo(() => {
    if (!stockRows.length) return null;
    return [...stockRows].sort(
      (a, b) => b.dailyChangePercent - a.dailyChangePercent
    )[0];
  }, [stockRows]);

  const weakest = useMemo(() => {
    if (!stockRows.length) return null;
    return [...stockRows].sort(
      (a, b) => a.dailyChangePercent - b.dailyChangePercent
    )[0];
  }, [stockRows]);

  const biggestPosition = useMemo(() => {
    if (!stockRows.length) return null;
    return [...stockRows].sort((a, b) => b.value - a.value)[0];
  }, [stockRows]);

  const alerts = useMemo(() => {
    const result = [];

    stockRows.forEach((stock) => {
      if (stock.dailyChangePercent >= 4) {
        result.push(
          `${stock.symbol} bugün %${stock.dailyChangePercent.toFixed(
            2
          )} yükseldi.`
        );
      }

      if (stock.dailyChangePercent <= -4) {
        result.push(
          `${stock.symbol} bugün %${Math.abs(
            stock.dailyChangePercent
          ).toFixed(2)} düştü.`
        );
      }

      if (stock.profitLossPercent >= 15) {
        result.push(
          `${stock.symbol}, maliyetinin %${stock.profitLossPercent.toFixed(
            1
          )} üzerinde.`
        );
      }

      if (stock.profitLossPercent <= -15) {
        result.push(
          `${stock.symbol}, maliyetinin %${Math.abs(
            stock.profitLossPercent
          ).toFixed(1)} altında.`
        );
      }
    });

    return result.slice(0, 4);
  }, [stockRows]);

  const totalDailyPercent =
    Number(bistDailySummary?.profitLossPercent || 0) +
    Number(usDailySummary?.profitLossPercent || 0);

  const summaryText =
    totalDailyPercent > 0
      ? 'Portföyün bugün genel olarak pozitif.'
      : totalDailyPercent < 0
        ? 'Portföyün bugün genel olarak negatif.'
        : 'Portföyün bugün yatay seyrediyor.';

  function handleAsk(event) {
    event.preventDefault();

    const normalized = question.trim().toLocaleLowerCase('tr-TR');

    if (!normalized) {
      setAnswer('Önce bir soru yazmalısın.');
      return;
    }

    if (
      normalized.includes('en güçlü') ||
      normalized.includes('en çok yükselen') ||
      normalized.includes('kazandıran')
    ) {
      setAnswer(
        strongest
          ? `Bugünün en güçlü hissesi ${strongest.symbol}. Günlük değişimi %${strongest.dailyChangePercent.toFixed(
              2
            )}.`
          : 'Henüz yeterli canlı fiyat verisi yok.'
      );
      return;
    }

    if (
      normalized.includes('en zayıf') ||
      normalized.includes('en çok düşen') ||
      normalized.includes('kaybettiren')
    ) {
      setAnswer(
        weakest
          ? `Bugünün en zayıf hissesi ${weakest.symbol}. Günlük değişimi %${weakest.dailyChangePercent.toFixed(
              2
            )}.`
          : 'Henüz yeterli canlı fiyat verisi yok.'
      );
      return;
    }

    if (
      normalized.includes('en büyük pozisyon') ||
      normalized.includes('en fazla ağırlık')
    ) {
      setAnswer(
        biggestPosition
          ? `Portföyündeki en büyük pozisyon ${biggestPosition.symbol}.`
          : 'Henüz yeterli portföy verisi yok.'
      );
      return;
    }

    if (
      normalized.includes('bugün nasıl') ||
      normalized.includes('portföyüm nasıl')
    ) {
      setAnswer(summaryText);
      return;
    }

    const matchedStock = stockRows.find((stock) =>
      normalized.includes(String(stock.symbol).toLocaleLowerCase('tr-TR'))
    );

    if (matchedStock) {
      setAnswer(
        `${matchedStock.symbol} şu anda maliyetinin %${Math.abs(
          matchedStock.profitLossPercent
        ).toFixed(2)} ${
          matchedStock.profitLossPercent >= 0 ? 'üzerinde' : 'altında'
        }. Günlük değişimi %${matchedStock.dailyChangePercent.toFixed(2)}.`
      );
      return;
    }

    setAnswer(
      'Bu ilk sürümde portföy performansı, günlük hareketler, maliyet farkı ve pozisyon büyüklüğü sorularını yanıtlayabiliyorum.'
    );
  }

  return (
    <section style={styles.wrapper}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        style={styles.header}
      >
        <div style={styles.headerLeft}>
          <span style={styles.icon}>🧠</span>
          <div>
            <strong style={styles.title}>Sky AI</strong>
            <div style={styles.subtitle}>{summaryText}</div>
          </div>
        </div>

        <div style={styles.headerRight}>
          {alerts.length > 0 ? (
            <span style={styles.badge}>{alerts.length}</span>
          ) : null}
          <span style={styles.arrow}>{isOpen ? '▲' : '▼'}</span>
        </div>
      </button>

      {isOpen ? (
        <div style={styles.content}>
          <div style={styles.grid}>
            <div style={styles.infoCard}>
              <span style={styles.label}>Günün Kazananı</span>
              <strong style={styles.positive}>
                {strongest
                  ? `${strongest.symbol}  %${strongest.dailyChangePercent.toFixed(
                      2
                    )}`
                  : 'Veri bekleniyor'}
              </strong>
            </div>

            <div style={styles.infoCard}>
              <span style={styles.label}>Günün Kaybedeni</span>
              <strong style={styles.negative}>
                {weakest
                  ? `${weakest.symbol}  %${weakest.dailyChangePercent.toFixed(
                      2
                    )}`
                  : 'Veri bekleniyor'}
              </strong>
            </div>
          </div>

          <div style={styles.alertBox}>
            <div style={styles.sectionTitle}>Önemli Gelişmeler</div>

            {alerts.length ? (
              alerts.map((alert, index) => (
                <div key={`${alert}-${index}`} style={styles.alertRow}>
                  <span>•</span>
                  <span>{alert}</span>
                </div>
              ))
            ) : (
              <div style={styles.empty}>
                Şu anda dikkat çeken otomatik uyarı yok.
              </div>
            )}

            <div style={styles.futureNote}>
              Bilanço, temettü, FED ve ekonomik takvim verileri sonraki
              bağlantıda burada gösterilecek.
            </div>
          </div>

          <form onSubmit={handleAsk} style={styles.form}>
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Sky AI'ya sor..."
              style={styles.input}
            />
            <button type="submit" style={styles.askButton}>
              Sor
            </button>
          </form>

          <div style={styles.answer}>{answer}</div>
        </div>
      ) : null}
    </section>
  );
}

const styles = {
  wrapper: {
    width: '100%',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    borderRadius: 16,
    overflow: 'hidden',
    background: 'rgba(15, 23, 42, 0.88)',
    marginBottom: 18,
  },
  header: {
    width: '100%',
    border: 0,
    background: 'transparent',
    padding: '14px 16px',
    color: '#f8fafc',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    textAlign: 'left',
  },
  headerLeft: {
    display: 'flex',
    gap: 11,
    alignItems: 'center',
    minWidth: 0,
  },
  icon: {
    fontSize: 23,
  },
  title: {
    display: 'block',
    fontSize: 16,
    lineHeight: 1.2,
  },
  subtitle: {
    marginTop: 3,
    fontSize: 12,
    color: '#94a3b8',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  badge: {
    minWidth: 22,
    height: 22,
    padding: '0 6px',
    borderRadius: 999,
    background: '#dc2626',
    display: 'inline-flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: 12,
    fontWeight: 800,
  },
  arrow: {
    fontSize: 12,
    color: '#94a3b8',
  },
  content: {
    borderTop: '1px solid rgba(148, 163, 184, 0.14)',
    padding: 14,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 10,
  },
  infoCard: {
    padding: 12,
    borderRadius: 12,
    background: 'rgba(30, 41, 59, 0.72)',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  label: {
    fontSize: 12,
    color: '#94a3b8',
  },
  positive: {
    color: '#22c55e',
    fontSize: 14,
  },
  negative: {
    color: '#ef4444',
    fontSize: 14,
  },
  alertBox: {
    marginTop: 11,
    padding: 12,
    borderRadius: 12,
    background: 'rgba(30, 41, 59, 0.52)',
  },
  sectionTitle: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: 800,
    color: '#f8fafc',
  },
  alertRow: {
    display: 'flex',
    gap: 8,
    marginTop: 6,
    fontSize: 13,
    lineHeight: 1.45,
    color: '#e2e8f0',
  },
  empty: {
    fontSize: 13,
    color: '#94a3b8',
  },
  futureNote: {
    marginTop: 10,
    paddingTop: 9,
    borderTop: '1px solid rgba(148, 163, 184, 0.12)',
    fontSize: 11,
    lineHeight: 1.45,
    color: '#64748b',
  },
  form: {
    display: 'flex',
    gap: 8,
    marginTop: 11,
  },
  input: {
    flex: 1,
    minWidth: 0,
    border: '1px solid rgba(148, 163, 184, 0.24)',
    borderRadius: 10,
    background: 'rgba(15, 23, 42, 0.9)',
    color: '#f8fafc',
    padding: '10px 11px',
    outline: 'none',
    fontSize: 13,
  },
  askButton: {
    border: 0,
    borderRadius: 10,
    padding: '0 16px',
    background: '#2563eb',
    color: '#ffffff',
    fontWeight: 800,
    cursor: 'pointer',
  },
  answer: {
    marginTop: 10,
    padding: 11,
    borderRadius: 10,
    background: 'rgba(37, 99, 235, 0.10)',
    border: '1px solid rgba(37, 99, 235, 0.20)',
    fontSize: 13,
    lineHeight: 1.5,
    color: '#dbeafe',
  },
};
