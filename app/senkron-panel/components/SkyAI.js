'use client';

import { useEffect, useMemo, useState } from 'react';

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

  const [skyEvents, setSkyEvents] = useState([]);
  const [skyEventsLoading, setSkyEventsLoading] = useState(false);

  const [earningsItems, setEarningsItems] = useState([]);
  const [earningsLoading, setEarningsLoading] = useState(false);

  const [financialModal, setFinancialModal] = useState(null);
  const [financialModalLoading, setFinancialModalLoading] = useState(false);

  const allStocks = useMemo(
    () => [...bistStocks, ...usStocks],
    [bistStocks, usStocks]
  );

  const stockRows = useMemo(() => {
    return allStocks
      .map((stock) => {
        const code = String(stock.code || stock.symbol || '').trim().toUpperCase();
        const market = String(stock.market || '').trim().toLowerCase();
        const priceData =
          prices?.[`${market}:${code}`] ||
          prices?.[code] ||
          {};
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
          `${stock.code || stock.symbol} bugün %${stock.dailyChangePercent.toFixed(
            2
          )} yükseldi.`
        );
      }

      if (stock.dailyChangePercent <= -4) {
        result.push(
          `${stock.code || stock.symbol} bugün %${Math.abs(
            stock.dailyChangePercent
          ).toFixed(2)} düştü.`
        );
      }

      if (stock.profitLossPercent >= 15) {
        result.push(
          `${stock.code || stock.symbol}, maliyetinin %${stock.profitLossPercent.toFixed(
            1
          )} üzerinde.`
        );
      }

      if (stock.profitLossPercent <= -15) {
        result.push(
          `${stock.code || stock.symbol}, maliyetinin %${Math.abs(
            stock.profitLossPercent
          ).toFixed(1)} altında.`
        );
      }
    });

    return result.slice(0, 4);
  }, [stockRows]);

  useEffect(() => {
    const symbols = [...new Set(
      allStocks
        .map((stock) =>
          String(stock.code || stock.symbol || '')
            .trim()
            .toUpperCase()
        )
        .filter(Boolean)
    )];

    if (!symbols.length) {
      setSkyEvents([]);
      return;
    }

    const controller = new AbortController();

    async function loadSkyEvents() {
      try {
        setSkyEventsLoading(true);

        const params = new URLSearchParams({
          symbols: symbols.join(','),
        });

        const response = await fetch(
          `/api/sky-events?${params.toString()}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error || 'Takvim servisi yanıt vermedi.'
          );
        }

        setSkyEvents(
          Array.isArray(data?.events)
            ? data.events
            : []
        );
      } catch (error) {
        if (error?.name !== 'AbortError') {
          console.error('Sky Events hatası:', error);
          setSkyEvents([]);
        }
      } finally {
        setSkyEventsLoading(false);
      }
    }

    loadSkyEvents();

    const timer = setInterval(
      loadSkyEvents,
      30 * 60 * 1000
    );

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [allStocks]);

  useEffect(() => {
    const symbols = [
      ...new Set(
        allStocks
          .filter((stock) => {
            const market = String(
              stock.market || ''
            )
              .trim()
              .toLowerCase();

            const symbol = String(
              stock.code || stock.symbol || ''
            )
              .trim()
              .toUpperCase();

            if (!symbol) return false;

            // BIST açıkça belirtilmişse alma.
            if (
              market === 'bist' ||
              market === 'turkey' ||
              market === 'tr'
            ) {
              return false;
            }

            /*
              Diğer bütün hisseleri ABD adayı kabul ediyoruz.
              Böylece market alanı boş/US/NASDAQ/america olsa da
              EOSE, ONDS, MU vb. kaybolmaz.
            */
            return true;
          })
          .map((stock) =>
            String(stock.code || stock.symbol || '')
              .trim()
              .toUpperCase()
          )
          .filter(Boolean)
      ),
    ];

    if (!symbols.length) {
      setEarningsItems([]);
      return;
    }

    const controller = new AbortController();

    async function loadEarningsCalendar() {
      try {
        setEarningsLoading(true);

        const params = new URLSearchParams({
          symbols: symbols.join(','),
        });

        const response = await fetch(
          `/api/sky-earnings?${params.toString()}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error || 'Bilanço takvimi alınamadı.'
          );
        }

        setEarningsItems(
          Array.isArray(data?.items)
            ? data.items
            : []
        );
      } catch (error) {
        if (error?.name !== 'AbortError') {
          console.error('Sky earnings:', error);
        }
      } finally {
        setEarningsLoading(false);
      }
    }

    loadEarningsCalendar();

    const timer = setInterval(
      loadEarningsCalendar,
      60 * 60 * 1000
    );

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [allStocks]);

  const totalDailyPercent =
    Number(bistDailySummary?.profitLossPercent || 0) +
    Number(usDailySummary?.profitLossPercent || 0);

  const summaryText =
    totalDailyPercent > 0
      ? 'Portföyün bugün genel olarak pozitif.'
      : totalDailyPercent < 0
        ? 'Portföyün bugün genel olarak negatif.'
        : 'Portföyün bugün yatay seyrediyor.';

  async function analyzeFinancials(symbol) {
    try {
      setFinancialModal({
        symbol,
        loading: true,
      });

      setFinancialModalLoading(true);

      const response = await fetch(
        `/api/sky-financials?symbol=${encodeURIComponent(symbol)}`,
        {
          cache: 'no-store',
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || 'Bilanço analizi alınamadı.'
        );
      }

      setFinancialModal({
        ...data,
        symbol,
        loading: false,
      });
    } catch (error) {
      setFinancialModal({
        symbol,
        loading: false,
        error:
          error?.message ||
          'Bilanço analizi yapılamadı.',
      });
    } finally {
      setFinancialModalLoading(false);
    }
  }

  async function handleAsk(event) {
    event.preventDefault();

    const normalized = question
      .trim()
      .toLocaleLowerCase('tr-TR');

    if (!normalized) {
      setAnswer('Önce bir soru yazmalısın.');
      return;
    }

    /*
      Hisse kodunu artık stockRows yerine doğrudan tüm portföyden
      yakalıyoruz. Böylece BIST hisseleri de garanti şekilde bulunur.
    */
    /*
      Portföyde olmayan ABD hissesinin bilançosunu
      da doğrudan analiz edebiliriz.

      Örnek:
      MU bilançosunu analiz et
      NVDA bilançosu nasıl?
      PLTR son bilanço
    */
    const financialIntent =
      normalized.includes('bilanço') ||
      normalized.includes('bilanco') ||
      normalized.includes('financial');

    const firstTickerMatch =
      question
        .trim()
        .toUpperCase()
        .match(/^([A-Z][A-Z0-9.-]{0,9})\b/);

    const externalFinancialSymbol =
      financialIntent &&
      firstTickerMatch
        ? firstTickerMatch[1]
        : null;

    if (externalFinancialSymbol) {
      const alreadyInPortfolio = allStocks.some(
        (stock) =>
          String(
            stock.code || stock.symbol || ''
          )
            .trim()
            .toUpperCase() ===
          externalFinancialSymbol
      );

      if (!alreadyInPortfolio) {
        await analyzeFinancials(
          externalFinancialSymbol
        );
        return;
      }
    }

    const matchedRawStock = allStocks.find((stock) => {
      const code = String(
        stock.code || stock.symbol || ''
      )
        .trim()
        .toLocaleLowerCase('tr-TR');

      if (!code) return false;

      const escaped = code.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      );

      const tickerRegex = new RegExp(
        `(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`,
        'i'
      );

      return tickerRegex.test(normalized);
    });

    if (financialIntent && matchedRawStock) {
      const financialSymbol = String(
        matchedRawStock.code ||
        matchedRawStock.symbol ||
        ''
      )
        .trim()
        .toUpperCase();

      await analyzeFinancials(financialSymbol);
      return;
    }

    if (matchedRawStock) {
      const symbol = String(
        matchedRawStock.code ||
        matchedRawStock.symbol ||
        ''
      )
        .trim()
        .toUpperCase();

      const market =
        String(matchedRawStock.market || '')
          .trim()
          .toLowerCase() === 'bist'
          ? 'bist'
          : 'us';

      const priceData =
        prices?.[`${market}:${symbol}`] ||
        prices?.[symbol] ||
        {};

      const currentPrice =
        Number(priceData?.price || 0);

      const quantity =
        Number(
          matchedRawStock.quantity ||
          matchedRawStock.lot ||
          0
        );

      const cost =
        Number(
          matchedRawStock.cost ||
          matchedRawStock.averageCost ||
          matchedRawStock.costPrice ||
          0
        );

      try {
        setAnswer(
          `${symbol} için teknik göstergeler, haberler ve portföy pozisyonun analiz ediliyor…`
        );

        const params = new URLSearchParams({
          symbol,
          market,
          cost: String(cost),
          quantity: String(quantity),
          current: String(currentPrice),
        });

        const response = await fetch(
          `/api/sky-ai?${params.toString()}`,
          {
            cache: 'no-store',
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error ||
            'Sky AI analiz servisi yanıt vermedi.'
          );
        }

        setAnswer(data.answer);
        return;
      } catch (error) {
        console.error(
          `${symbol} Sky AI analiz hatası:`,
          error
        );

        setAnswer(
          `${symbol} için gelişmiş analiz şu anda alınamadı. ` +
          `Hata: ${error?.message || 'Bilinmeyen hata'}`
        );

        return;
      }
    }

    if (
      normalized.includes('en güçlü') ||
      normalized.includes('en çok yükselen') ||
      normalized.includes('kazandıran')
    ) {
      setAnswer(
        strongest
          ? `Bugünün en güçlü hissesi ${
              strongest.code || strongest.symbol
            }. Günlük değişimi %${strongest.dailyChangePercent.toFixed(2)}.`
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
          ? `Bugünün en zayıf hissesi ${
              weakest.code || weakest.symbol
            }. Günlük değişimi %${weakest.dailyChangePercent.toFixed(2)}.`
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
          ? `Portföyündeki en büyük pozisyon ${
              biggestPosition.code ||
              biggestPosition.symbol
            }.`
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

    setAnswer(
      'Portföyündeki hisse kodunu soruda kullan. Örnek: "AKBNK satmalı mıyım?", "PGSUS ekleme için uygun mu?" veya "EOSE beklemeli miyim?"'
    );
  }

  return (
    <>
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
                  ? `${strongest.code || strongest.symbol}  %${strongest.dailyChangePercent.toFixed(
                      2
                    )}`
                  : 'Veri bekleniyor'}
              </strong>
            </div>

            <div style={styles.infoCard}>
              <span style={styles.label}>Günün Kaybedeni</span>
              <strong style={styles.negative}>
                {weakest
                  ? `${weakest.code || weakest.symbol}  %${weakest.dailyChangePercent.toFixed(
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
              <strong style={{ color: '#d4af37' }}>
                Bilanço • FED • ABD Ekonomik Takvim
              </strong>

              {skyEventsLoading && !skyEvents.length ? (
                <div style={{ marginTop: 8 }}>
                  Takvim ve bilanço verileri yükleniyor…
                </div>
              ) : skyEvents.length ? (
                <div style={{ marginTop: 7 }}>
                  {skyEvents.filter((event) => event.type !== 'EARNINGS').slice(0, 8).map((event, index) => (
                    <div
                      key={`${event.type}-${event.title}-${index}`}
                      style={{
                        marginTop: 6,
                        color:
                          event.level === 'critical'
                            ? '#fbbf24'
                            : '#cbd5e1',
                      }}
                    >
                      •{' '}
                      {event.url ? (
                        <a
                          href={event.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: '#d4af37',
                            fontWeight: 800,
                            textDecoration: 'underline',
                            textUnderlineOffset: 3,
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {event.title}
                        </a>
                      ) : (
                        <strong>{event.title}</strong>
                      )}
                      : {event.text}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ marginTop: 8 }}>
                  Yaklaşan kritik veri bulunamadı.
                </div>
              )}
            </div>
          </div>

          <div style={styles.alertBox}>
            <div
              style={{
                ...styles.sectionTitle,
                color: '#d4af37',
              }}
            >
              Yaklaşan Bilançolar • Otomatik Portföy Takibi
            </div>

            {earningsLoading && !earningsItems.length ? (
              <div style={styles.empty}>
                Portföy bilanço takvimi taranıyor…
              </div>
            ) : earningsItems.length ? (
              earningsItems.map((item) => {
                const upcoming = item.upcoming;
                const lastReport = item.lastReport;

                return (
                  <div
                    key={`earnings-${item.symbol}`}
                    style={{
                      marginTop: 9,
                      paddingTop: 9,
                      borderTop:
                        '1px solid rgba(148,163,184,0.12)',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        color: '#f8fafc',
                      }}
                    >
                      {item.symbol}
                    </div>

                    {upcoming ? (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 13,
                          color: '#fbbf24',
                        }}
                      >
                        Yaklaşan bilanço: {upcoming.date}
                        {' • '}
                        {upcoming.time}
                        {upcoming.epsForecast
                          ? ` • EPS tahmini ${upcoming.epsForecast}`
                          : ''}
                      </div>
                    ) : (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 12,
                          color: '#94a3b8',
                        }}
                      >
                        Nasdaq takviminde önümüzdeki 45 gün için
                        bilanço tarihi bulunamadı.
                      </div>
                    )}

                    {lastReport ? (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 12,
                          color: '#94a3b8',
                        }}
                      >
                        Son SEC raporu: {lastReport.form} •{' '}
                        {lastReport.date}
                      </div>
                    ) : null}

                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        flexWrap: 'wrap',
                        marginTop: 7,
                      }}
                    >
                      {upcoming?.yahooUrl ? (
                        <a
                          href={upcoming.yahooUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: '#d4af37',
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                        >
                          Bilanço Takvimi ↗
                        </a>
                      ) : null}

                      <button
                        type="button"
                        onClick={() =>
                          analyzeFinancials(item.symbol)
                        }
                        style={{
                          border:
                            '1px solid rgba(212,175,55,0.35)',
                          borderRadius: 8,
                          padding: '5px 9px',
                          background:
                            'rgba(212,175,55,0.08)',
                          color: '#e6c65c',
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        Son Bilançoyu İncele
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={styles.empty}>
                Bilanço takibi için uygun ABD hissesi bulunamadı.
              </div>
            )}
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

      {financialModal && (
        <div
          style={styles.modalOverlay}
          onClick={() => setFinancialModal(null)}
        >
          <div
            style={styles.modalCard}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={styles.modalHeader}>
              <div>
                <div style={styles.modalEyebrow}>
                  SKY AI • BİLANÇO ANALİZİ
                </div>

                <h2 style={styles.modalTitle}>
                  {financialModal.symbol}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setFinancialModal(null)}
                style={styles.modalClose}
                aria-label="Kapat"
              >
                ×
              </button>
            </div>

            {financialModalLoading ||
            financialModal.loading ? (
              <div style={styles.modalLoading}>
                {financialModal.symbol} bilançosu SEC
                verileriyle inceleniyor…
              </div>
            ) : financialModal.error ? (
              <div style={styles.modalError}>
                {financialModal.error}
              </div>
            ) : (
              <>
                <div
                  style={{
                    ...styles.verdictBox,
                    borderColor:
                      financialModal.verdict === 'OLUMLU'
                        ? 'rgba(34,197,94,.45)'
                        : financialModal.verdict === 'RİSKLİ'
                          ? 'rgba(239,68,68,.45)'
                          : 'rgba(212,175,55,.45)',
                  }}
                >
                  <div style={styles.verdictLabel}>
                    GENEL SONUÇ
                  </div>

                  <strong
                    style={{
                      ...styles.verdictText,
                      color:
                        financialModal.verdict === 'OLUMLU'
                          ? '#22c55e'
                          : financialModal.verdict === 'RİSKLİ'
                            ? '#ef4444'
                            : '#e6c65c',
                    }}
                  >
                    {financialModal.verdict || 'NÖTR'}
                  </strong>

                  <span style={styles.scoreBadge}>
                    Puan: {financialModal.score ?? '—'}
                  </span>
                </div>

                <div style={styles.financialGrid}>
                  <FinancialMetric
                    title="Gelir"
                    value={formatFinancialMoney(
                      financialModal.metrics?.revenue?.current
                    )}
                  />

                  <FinancialMetric
                    title="Net Kâr / Zarar"
                    value={formatFinancialMoney(
                      financialModal.metrics?.netIncome?.current
                    )}
                  />

                  <FinancialMetric
                    title="EPS"
                    value={formatFinancialNumber(
                      financialModal.metrics?.eps?.current
                    )}
                  />

                  <FinancialMetric
                    title="Nakit"
                    value={formatFinancialMoney(
                      financialModal.metrics?.cash?.current
                    )}
                  />

                  <FinancialMetric
                    title="Operasyonel Nakit Akışı"
                    value={formatFinancialMoney(
                      financialModal.metrics
                        ?.operatingCashFlow?.current
                    )}
                  />

                  <FinancialMetric
                    title="Toplam Varlıklar"
                    value={formatFinancialMoney(
                      financialModal.metrics?.assets?.current
                    )}
                  />

                  <FinancialMetric
                    title="Toplam Yükümlülükler"
                    value={formatFinancialMoney(
                      financialModal.metrics
                        ?.liabilities?.current
                    )}
                  />

                  <FinancialMetric
                    title="Son Rapor"
                    value={
                      financialModal.filing
                        ? `${financialModal.filing.form} • ${
                            financialModal.filing.date || '—'
                          }`
                        : '—'
                    }
                  />
                </div>

                <div style={styles.aiCommentBox}>
                  <div style={styles.aiCommentTitle}>
                    📊 1 Yıllık Karşılaştırma
                  </div>

                  {financialModal.yoyAvailable ? (
                    <>
                      <div style={styles.yoyGrid}>
                        <YoYMetric
                          title="Gelir"
                          current={
                            financialModal.metrics
                              ?.revenue?.current
                          }
                          previous={
                            financialModal.metrics
                              ?.revenue?.previous
                          }
                          percent={
                            financialModal.metrics
                              ?.revenue?.yoyPercent
                          }
                          money
                        />

                        <YoYMetric
                          title="Net Kâr / Zarar"
                          current={
                            financialModal.metrics
                              ?.netIncome?.current
                          }
                          previous={
                            financialModal.metrics
                              ?.netIncome?.previous
                          }
                          percent={
                            financialModal.metrics
                              ?.netIncome?.yoyPercent
                          }
                          money
                        />

                        <YoYMetric
                          title="EPS"
                          current={
                            financialModal.metrics
                              ?.eps?.current
                          }
                          previous={
                            financialModal.metrics
                              ?.eps?.previous
                          }
                          percent={
                            financialModal.metrics
                              ?.eps?.yoyPercent
                          }
                        />

                        <YoYMetric
                          title="Nakit"
                          current={
                            financialModal.metrics
                              ?.cash?.current
                          }
                          previous={
                            financialModal.metrics
                              ?.cash?.previous
                          }
                          percent={
                            financialModal.metrics
                              ?.cash?.yoyPercent
                          }
                          money
                        />

                        <YoYMetric
                          title="Operasyonel Nakit"
                          current={
                            financialModal.metrics
                              ?.operatingCashFlow?.current
                          }
                          previous={
                            financialModal.metrics
                              ?.operatingCashFlow?.previous
                          }
                          percent={
                            financialModal.metrics
                              ?.operatingCashFlow?.yoyPercent
                          }
                          money
                        />

                        <YoYMetric
                          title="Yükümlülükler"
                          current={
                            financialModal.metrics
                              ?.liabilities?.current
                          }
                          previous={
                            financialModal.metrics
                              ?.liabilities?.previous
                          }
                          percent={
                            financialModal.metrics
                              ?.liabilities?.yoyPercent
                          }
                          money
                        />
                      </div>

                      <div
                        style={{
                          ...styles.aiCommentBody,
                          marginTop: 12,
                        }}
                      >
                        {(financialModal.yoyComments || [])
                          .map((comment, index) => (
                            <div
                              key={`yoy-${index}`}
                              style={styles.commentRow}
                            >
                              <span
                                style={
                                  styles.commentBullet
                                }
                              >
                                •
                              </span>

                              <span>{comment}</span>
                            </div>
                          ))}
                      </div>
                    </>
                  ) : (
                    <div style={styles.empty}>
                      Aynı dönem geçen yıl için yeterli
                      SEC verisi bulunamadı.
                    </div>
                  )}
                </div>

                <div style={styles.aiCommentBox}>
                  <div style={styles.aiCommentTitle}>
                    🧠 Sky AI Yorumu
                  </div>

                  <div style={styles.aiCommentBody}>
                    {extractFinancialComments(
                      financialModal.answer
                    ).map((comment, index) => (
                      <div
                        key={`${comment}-${index}`}
                        style={styles.commentRow}
                      >
                        <span style={styles.commentBullet}>
                          •
                        </span>
                        <span>{comment}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={styles.modalNote}>
                  Bu analiz SEC finansal verilerinden
                  otomatik oluşturulur. Şirketlerin raporlama
                  dönemleri farklı olabilir ve sonuç yatırım
                  tavsiyesi değildir.
                </div>

                <button
                  type="button"
                  onClick={() => setFinancialModal(null)}
                  style={styles.modalDoneButton}
                >
                  Kapat
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function YoYMetric({
  title,
  current,
  previous,
  percent,
  money = false,
}) {
  const formatValue = money
    ? formatFinancialMoney
    : formatFinancialNumber;

  const hasPercent =
    Number.isFinite(Number(percent));

  const percentNumber =
    Number(percent);

  return (
    <div style={styles.yoyMetric}>
      <span style={styles.financialMetricTitle}>
        {title}
      </span>

      <div style={styles.yoyValues}>
        <div>
          <span style={styles.yoySmallLabel}>
            Şimdi
          </span>
          <strong style={styles.yoyValue}>
            {formatValue(current)}
          </strong>
        </div>

        <div>
          <span style={styles.yoySmallLabel}>
            Geçen yıl
          </span>
          <strong style={styles.yoyValueOld}>
            {formatValue(previous)}
          </strong>
        </div>
      </div>

      <div
        style={{
          ...styles.yoyPercent,
          color: hasPercent
            ? percentNumber > 0
              ? '#22c55e'
              : percentNumber < 0
                ? '#ef4444'
                : '#94a3b8'
            : '#64748b',
        }}
      >
        {hasPercent
          ? `${percentNumber >= 0 ? '+' : ''}${percentNumber.toLocaleString(
              'tr-TR',
              {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              }
            )}%`
          : 'YoY veri yok'}
      </div>
    </div>
  );
}

function FinancialMetric({ title, value }) {
  return (
    <div style={styles.financialMetric}>
      <span style={styles.financialMetricTitle}>
        {title}
      </span>

      <strong style={styles.financialMetricValue}>
        {value}
      </strong>
    </div>
  );
}

function formatFinancialMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return '—';

  const abs = Math.abs(number);

  if (abs >= 1_000_000_000) {
    return `$${(number / 1_000_000_000).toLocaleString(
      'tr-TR',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    )} milyar`;
  }

  if (abs >= 1_000_000) {
    return `$${(number / 1_000_000).toLocaleString(
      'tr-TR',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    )} milyon`;
  }

  return `$${number.toLocaleString('tr-TR', {
    maximumFractionDigits: 0,
  })}`;
}

function formatFinancialNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number.toLocaleString('tr-TR', {
        maximumFractionDigits: 3,
      })
    : '—';
}

function extractFinancialComments(answer) {
  const text = String(answer || '');

  const section =
    text.split('Sky bilanço değerlendirmesi:')[1] || '';

  const beforeScore =
    section.split('Bilanço puanı:')[0] || '';

  const comments = beforeScore
    .split('•')
    .map((item) => item.trim())
    .filter(Boolean);

  return comments.length
    ? comments
    : ['Bilanço için ek yorum bulunamadı.'];
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
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    background: 'rgba(0,0,0,0.78)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },

  modalCard: {
    width: 'min(920px, 100%)',
    maxHeight: '90vh',
    overflowY: 'auto',
    borderRadius: 20,
    padding: 20,
    background:
      'linear-gradient(180deg,#151109 0%,#0d0b07 100%)',
    border: '1px solid rgba(212,175,55,0.38)',
    boxShadow:
      '0 30px 80px rgba(0,0,0,.65)',
    color: '#f8fafc',
  },

  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 20,
    marginBottom: 16,
  },

  modalEyebrow: {
    color: '#d4af37',
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 1.2,
  },

  modalTitle: {
    margin: '5px 0 0',
    fontSize: 28,
    lineHeight: 1.1,
  },

  modalClose: {
    width: 38,
    height: 38,
    flexShrink: 0,
    borderRadius: 10,
    border:
      '1px solid rgba(212,175,55,.30)',
    background: 'rgba(212,175,55,.08)',
    color: '#f8fafc',
    fontSize: 25,
    cursor: 'pointer',
  },

  modalLoading: {
    padding: '32px 4px',
    color: '#cbd5e1',
    fontSize: 15,
  },

  modalError: {
    padding: 15,
    borderRadius: 12,
    border: '1px solid rgba(239,68,68,.35)',
    background: 'rgba(239,68,68,.08)',
    color: '#fca5a5',
  },

  verdictBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    padding: 14,
    borderRadius: 14,
    border: '1px solid',
    background: 'rgba(255,255,255,.025)',
    marginBottom: 14,
  },

  verdictLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: 800,
  },

  verdictText: {
    fontSize: 20,
    letterSpacing: 0.3,
  },

  scoreBadge: {
    marginLeft: 'auto',
    borderRadius: 999,
    padding: '5px 10px',
    background: 'rgba(212,175,55,.10)',
    color: '#e6c65c',
    fontSize: 12,
    fontWeight: 800,
  },

  financialGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit,minmax(180px,1fr))',
    gap: 10,
  },

  financialMetric: {
    minHeight: 82,
    borderRadius: 13,
    padding: 12,
    background: 'rgba(30,41,59,.45)',
    border:
      '1px solid rgba(212,175,55,.12)',
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  },

  financialMetricTitle: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: 700,
  },

  financialMetricValue: {
    fontSize: 16,
    lineHeight: 1.25,
    color: '#f8fafc',
    wordBreak: 'break-word',
  },

  aiCommentBox: {
    marginTop: 14,
    borderRadius: 14,
    padding: 14,
    border:
      '1px solid rgba(212,175,55,.18)',
    background: 'rgba(212,175,55,.045)',
  },

  aiCommentTitle: {
    fontSize: 14,
    fontWeight: 900,
    color: '#e6c65c',
    marginBottom: 8,
  },

  aiCommentBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  },

  commentRow: {
    display: 'flex',
    gap: 8,
    fontSize: 13,
    lineHeight: 1.5,
    color: '#e2e8f0',
  },

  commentBullet: {
    color: '#d4af37',
    fontWeight: 900,
  },

  modalNote: {
    marginTop: 14,
    paddingTop: 12,
    borderTop:
      '1px solid rgba(148,163,184,.12)',
    color: '#64748b',
    fontSize: 11,
    lineHeight: 1.5,
  },

  modalDoneButton: {
    width: '100%',
    marginTop: 15,
    height: 42,
    borderRadius: 11,
    border:
      '1px solid rgba(212,175,55,.40)',
    background: 'rgba(212,175,55,.10)',
    color: '#e6c65c',
    fontWeight: 900,
    cursor: 'pointer',
  },
  yoyGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit,minmax(210px,1fr))',
    gap: 9,
    marginTop: 4,
  },

  yoyMetric: {
    borderRadius: 12,
    padding: 11,
    border:
      '1px solid rgba(212,175,55,.13)',
    background:
      'rgba(15,23,42,.42)',
  },

  yoyValues: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    marginTop: 7,
  },

  yoySmallLabel: {
    display: 'block',
    fontSize: 10,
    color: '#64748b',
    marginBottom: 3,
  },

  yoyValue: {
    display: 'block',
    fontSize: 13,
    color: '#f8fafc',
    wordBreak: 'break-word',
  },

  yoyValueOld: {
    display: 'block',
    fontSize: 13,
    color: '#94a3b8',
    wordBreak: 'break-word',
  },

  yoyPercent: {
    marginTop: 8,
    paddingTop: 7,
    borderTop:
      '1px solid rgba(148,163,184,.10)',
    fontSize: 12,
    fontWeight: 900,
  },

};
