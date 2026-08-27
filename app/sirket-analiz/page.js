'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

const METRIC_NAMES = {
  revenue: 'Gelir',
  netIncome: 'Net kâr / zarar',
  eps: 'Hisse başına kâr',
  cash: 'Nakit',
  shortTermInvestments: 'Kısa vadeli yatırımlar',
  operatingCashFlow: 'Operasyonel nakit akışı',
  assets: 'Toplam varlıklar',
  liabilities: 'Toplam yükümlülükler',
};

const TECHNICAL_ITEMS = [
  ['price', 'Güncel fiyat', 'money'],
  ['sma20', '20 günlük ortalama', 'money'],
  ['sma50', '50 günlük ortalama', 'money'],
  ['sma200', '200 günlük ortalama', 'money'],
  ['rsi14', 'RSI (14)', 'number'],
  ['volumeRatio', 'Hacim oranı', 'ratio'],
  ['return5', '5 günlük getiri', 'percent'],
  ['return20', '20 günlük getiri', 'percent'],
  ['return60', '60 günlük getiri', 'percent'],
  ['volatility', 'Yıllık oynaklık', 'percent'],
  ['support20', '20 günlük destek', 'money'],
  ['resistance20', '20 günlük direnç', 'money'],
];

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value, digits = 2) {
  const number = toNumber(value);

  if (number === null) return '—';

  return new Intl.NumberFormat('tr-TR', {
    maximumFractionDigits: digits,
  }).format(number);
}

function formatMoney(value) {
  const number = toNumber(value);

  if (number === null) return '—';

  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'USD',
    notation:
      Math.abs(number) >= 1_000_000
        ? 'compact'
        : 'standard',
    maximumFractionDigits: 2,
  }).format(number);
}

function formatPercent(value) {
  const number = toNumber(value);

  if (number === null) return '—';

  const sign = number > 0 ? '+' : '';

  return `${sign}%${formatNumber(number, 1)}`;
}

function formatMetricValue(key, value) {
  if (key === 'eps') {
    return formatNumber(value);
  }

  return formatMoney(value);
}

function formatTechnicalValue(type, value) {
  if (type === 'money') return formatMoney(value);
  if (type === 'percent') return formatPercent(value);
  if (type === 'ratio') {
    const number = toNumber(value);
    return number === null
      ? '—'
      : `${formatNumber(number)}x`;
  }

  return formatNumber(value);
}

function scoreColor(score) {
  const number = toNumber(score);

  if (number === null) return '#94a3b8';
  if (number >= 75) return '#4ade80';
  if (number >= 55) return '#6ee7b7';

  return '#fb7185';
}

function ScoreCard({
  eyebrow,
  score,
  label,
  note,
}) {
  return (
    <article className="scoreCard">
      <span className="cardEyebrow">
        {eyebrow}
      </span>

      <div className="scoreLine">
        <strong
          style={{
            color: scoreColor(score),
          }}
        >
          {toNumber(score) === null
            ? '—'
            : `${formatNumber(score, 0)}/100`}
        </strong>

        <span>{label || 'Veri yok'}</span>
      </div>

      <p>{note}</p>
    </article>
  );
}

export default function CompanyAnalysisPage() {
  const [symbol, setSymbol] = useState('MU');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const runAnalysis = useCallback(
    async (requestedSymbol) => {
      const cleanSymbol = String(
        requestedSymbol || ''
      )
        .trim()
        .toUpperCase();

      if (!/^[A-Z0-9.-]{1,10}$/.test(cleanSymbol)) {
        setError(
          'Geçerli bir NASDAQ/ABD hisse kodu girin.'
        );
        return;
      }

      try {
        setLoading(true);
        setError('');
        setData(null);
        setSymbol(cleanSymbol);

        const response = await fetch(
          `/api/company-analysis?symbol=${encodeURIComponent(cleanSymbol)}`,
          {
            cache: 'no-store',
          }
        );

        const payload = await response.json();

        if (!response.ok || !payload?.ok) {
          throw new Error(
            payload?.error ||
            'Şirket analizi oluşturulamadı.'
          );
        }

        setData(payload);

        if (typeof window !== 'undefined') {
          const url = new URL(
            window.location.href
          );

          url.searchParams.set(
            'symbol',
            cleanSymbol
          );

          window.history.replaceState(
            {},
            '',
            url
          );
        }
      } catch (analysisError) {
        setError(
          analysisError?.message ||
          'Analiz sırasında bir hata oluştu.'
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const initialSymbol =
      typeof window !== 'undefined'
        ? new URLSearchParams(
            window.location.search
          ).get('symbol') || 'MU'
        : 'MU';

    setSymbol(initialSymbol.toUpperCase());
    runAnalysis(initialSymbol);
  }, [runAnalysis]);

  const metricRows = useMemo(() => {
    const metrics =
      data?.financialRaw?.metrics || {};

    return Object.entries(METRIC_NAMES)
      .map(([key, label]) => ({
        key,
        label,
        metric: metrics[key],
      }))
      .filter((item) => item.metric);
  }, [data]);

  function submit(event) {
    event.preventDefault();
    runAnalysis(symbol);
  }

  const longTerm = data?.longTerm || {};
  const technical = data?.technical || {};
  const filing = data?.filing || {};
  const positives = [
    ...(longTerm.positives || []),
    ...(technical.positives || []),
  ];
  const risks = [
    ...(longTerm.risks || []),
    ...(technical.risks || []),
  ];

  return (
    <main className="page">
      <div className="shell">
        <nav className="topbar">
          <div className="topLinks">
            <Link href="/senkron-panel">
              ← Senkron Panel
            </Link>

            <Link href="/haber-merkezi">
              Haber Merkezi
            </Link>

          </div>

          <span className="liveBadge">
            ● SEC ve piyasa verisi
          </span>
        </nav>

        <header className="hero">
          <div className="heroContent">
            <p className="eyebrow">
              SKY FİNANS • ŞİRKET ARAŞTIRMA
            </p>

            <h1>Şirket Analiz Merkezi</h1>

            <p className="heroText">
              Şirketin mali gücünü ve kısa vadeli
              teknik görünümünü ayrı ayrı incele.
              Sonuçların nedenlerini sade Türkçe
              açıklamalarla öğren.
            </p>

            <form
              className="searchForm"
              onSubmit={submit}
            >
              <input
                value={symbol}
                onChange={(event) =>
                  setSymbol(
                    event.target.value.toUpperCase()
                  )
                }
                placeholder="Örn. MU, NVDA, PLTR"
                maxLength={10}
                aria-label="Hisse kodu"
              />

              <button
                type="submit"
                disabled={loading}
              >
                {loading
                  ? 'Analiz ediliyor…'
                  : 'Şirketi Analiz Et'}
              </button>
            </form>

            <div className="exampleSymbols">
              {[
                'MU',
                'NVDA',
                'PLTR',
                'ONDS',
                'EOSE',
                'RKLB',
              ].map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() =>
                    runAnalysis(item)
                  }
                  disabled={loading}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="heroPanel">
            <span>Analiz edilen şirket</span>
            <strong>
              {data?.symbol || symbol || '—'}
            </strong>
            <small>
              {filing.form
                ? `${filing.form} • ${filing.reportDate || filing.date}`
                : 'Son SEC raporu bekleniyor'}
            </small>
          </div>
        </header>

        {error ? (
          <div className="errorBox">
            {error}
          </div>
        ) : null}

        {loading ? (
          <section className="loadingCard">
            <div className="spinner" />
            <h2>Şirket verileri inceleniyor</h2>
            <p>
              SEC bilançosu ve fiyat hareketleri
              birlikte hesaplanıyor…
            </p>
          </section>
        ) : null}

        {!loading && data ? (
          <>
            <section className="notice">
              <strong>
                Önce sonucu değil, gerekçesini oku.
              </strong>

              <span>
                Mali görünüm şirketin finansal
                durumunu; teknik görünüm ise geçmiş
                fiyat ve hacim davranışını ölçer.
                Bunlar alım veya satım emri değildir.
              </span>
            </section>

            <section className="scoreGrid">
              <ScoreCard
                eyebrow="UZUN VADELİ MALİ GÖRÜNÜM"
                score={longTerm.score}
                label={longTerm.label}
                note={longTerm.note}
              />

              <ScoreCard
                eyebrow="KISA VADELİ TEKNİK GÖRÜNÜM"
                score={technical.score}
                label={technical.label}
                note={
                  technical.scenario ||
                  'Teknik piyasa verisi bulunamadı.'
                }
              />

              <article className="scoreCard">
                <span className="cardEyebrow">
                  VERİ KAPSAMI
                </span>

                <div className="coverageValue">
                  %{formatNumber(
                    longTerm.coverage,
                    0
                  )}
                </div>

                <p>
                  Mali puanın hesaplanabildiği veri
                  kapsamıdır. Değerleme çarpanları
                  henüz bu puana dahil değildir.
                </p>
              </article>
            </section>

            <section className="twoColumns">
              <article className="listCard positiveCard">
                <div className="sectionTitle">
                  <span>✓</span>
                  <div>
                    <small>GÜÇLÜ NOKTALAR</small>
                    <h2>Olumlu Bulgular</h2>
                  </div>
                </div>

                {positives.length ? (
                  <ul>
                    {positives.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="emptyText">
                    Belirgin olumlu bulgu oluşmadı.
                  </p>
                )}
              </article>

              <article className="listCard riskCard">
                <div className="sectionTitle">
                  <span>!</span>
                  <div>
                    <small>RİSK KONTROLÜ</small>
                    <h2>Dikkat Edilecekler</h2>
                  </div>
                </div>

                {risks.length ? (
                  <ul>
                    {risks.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="emptyText">
                    Mevcut ölçütlerde belirgin mali
                    risk oluşmadı. Ancak değerleme,
                    sektör döngüsü ve şirket haberleri
                    ayrıca incelenmelidir.
                  </p>
                )}
              </article>
            </section>

            <section className="sectionCard">
              <div className="headingRow">
                <div>
                  <p className="eyebrow">
                    PUANIN NASIL OLUŞTU?
                  </p>
                  <h2>Mali Kontrol Listesi</h2>
                </div>

                <span className="sourceBadge">
                  Kaynak: SEC EDGAR
                </span>
              </div>

              <div className="checkGrid">
                {(longTerm.checks || []).map(
                  (check) => (
                    <details
                      className="checkCard"
                      key={check.key}
                    >
                      <summary>
                        <div>
                          <strong>
                            {check.title}
                          </strong>
                          <span>
                            {formatPercent(
                              check.value
                            )}
                          </span>
                        </div>

                        <b>
                          {formatNumber(
                            check.score,
                            0
                          )}
                          /{check.maximum}
                        </b>
                      </summary>

                      <p>{check.explanation}</p>
                    </details>
                  )
                )}
              </div>
            </section>

            <section className="sectionCard">
              <div className="headingRow">
                <div>
                  <p className="eyebrow">
                    SON RAPOR ve GEÇEN YIL
                  </p>
                  <h2>Finansal Karşılaştırma</h2>
                </div>

                <a
                  href={`https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(data.symbol)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="externalLink"
                >
                  SEC kayıtlarını aç ↗
                </a>
              </div>

              <div className="tableWrap">
                <div className="metricHeader">
                  <span>Gösterge</span>
                  <span>Son dönem</span>
                  <span>Geçen yıl</span>
                  <span>Değişim</span>
                </div>

                {metricRows.map(
                  ({ key, label, metric }) => (
                    <div
                      className="metricRow"
                      key={key}
                    >
                      <strong>{label}</strong>

                      <span>
                        {formatMetricValue(
                          key,
                          metric.current
                        )}
                      </span>

                      <span>
                        {formatMetricValue(
                          key,
                          metric.previous
                        )}
                      </span>

                      <b
                        className={
                          toNumber(
                            metric.yoyPercent
                          ) >= 0
                            ? 'positive'
                            : 'negative'
                        }
                      >
                        {formatPercent(
                          metric.yoyPercent
                        )}
                      </b>
                    </div>
                  )
                )}
              </div>
            </section>

            <section className="sectionCard">
              <div className="headingRow">
                <div>
                  <p className="eyebrow">
                    FİYAT ve HACİM
                  </p>
                  <h2>Kısa Vadeli Teknik Görünüm</h2>
                </div>

                <a
                  href={`https://tr.investing.com/search/?q=${encodeURIComponent(data.symbol)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="externalLink"
                >
                  Grafiği aç ↗
                </a>
              </div>

              {technical ? (
                <>
                  <div className="technicalGrid">
                    {TECHNICAL_ITEMS.map(
                      ([key, label, type]) => (
                        <article
                          key={key}
                          className="technicalItem"
                        >
                          <span>{label}</span>
                          <strong>
                            {formatTechnicalValue(
                              type,
                              technical[key]
                            )}
                          </strong>
                        </article>
                      )
                    )}
                  </div>

                  <div className="scenarioBox">
                    <strong>
                      Sky teknik senaryosu
                    </strong>
                    <p>{technical.scenario}</p>
                    <small>
                      Teknik veri tarihi:{' '}
                      {technical.asOf || '—'}
                    </small>
                  </div>
                </>
              ) : (
                <p className="emptyText">
                  Teknik piyasa verisi alınamadı.
                </p>
              )}
            </section>

            <footer className="footer">
              <div>
                <strong>Veri kaynakları</strong>
                <span>
                  {data.sources?.financial} •{' '}
                  {data.sources?.market}
                </span>
              </div>

              <div>
                <strong>Son hesaplama</strong>
                <span>
                  {new Date(
                    data.generatedAt
                  ).toLocaleString('tr-TR')}
                </span>
              </div>

              <p>
                Bu ekran eğitim ve karar destek
                amacıyla hazırlanmıştır. Yatırım
                tavsiyesi veya geleceğe ilişkin
                kesin tahmin içermez.
              </p>
            </footer>
          </>
        ) : null}
      </div>

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        :global(html),
        :global(body) {
          max-width: 100%;
          overflow-x: hidden;
          background: #070d16;
        }

        .page {
          min-height: 100vh;
          padding: 24px;
          color: #f8fafc;
          background:
            radial-gradient(
              circle at 8% 0%,
              rgba(14, 116, 144, 0.17),
              transparent 30%
            ),
            radial-gradient(
              circle at 92% 8%,
              rgba(52,211,153, 0.12),
              transparent 31%
            ),
            #070d16;
        }

        .shell {
          width: 100%;
          max-width: 1480px;
          margin: 0 auto;
        }

        .topbar,
        .topLinks,
        .headingRow,
        .sectionTitle,
        .footer {
          display: flex;
          align-items: center;
        }

        .topbar,
        .headingRow {
          justify-content: space-between;
        }

        .topbar {
          gap: 16px;
          margin-bottom: 18px;
        }

        .topLinks {
          gap: 17px;
          flex-wrap: wrap;
        }

        .topLinks a {
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 850;
          text-decoration: none;
        }

        .topLinks a:hover {
          color: #6ee7b7;
        }

        .liveBadge,
        .sourceBadge {
          padding: 7px 11px;
          border: 1px solid rgba(74, 222, 128, 0.22);
          border-radius: 999px;
          color: #86efac;
          background: rgba(34, 197, 94, 0.07);
          font-size: 10px;
          font-weight: 900;
          white-space: nowrap;
        }

        .hero {
          display: grid;
          grid-template-columns:
            minmax(0, 1.25fr)
            minmax(260px, 0.45fr);
          gap: 26px;
          padding: 38px;
          border: 1px solid rgba(52,211,153, 0.3);
          border-radius: 25px;
          background:
            linear-gradient(
              135deg,
              rgba(10, 43, 51, 0.97),
              rgba(15, 23, 42, 0.98)
            );
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
        }

        .heroContent,
        .heroPanel {
          min-width: 0;
        }

        .eyebrow {
          margin: 0 0 8px;
          color: #34d399;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 1.4px;
        }

        h1,
        h2,
        p {
          margin-top: 0;
        }

        h1 {
          margin-bottom: 0;
          font-size: clamp(34px, 5vw, 62px);
          line-height: 1.03;
          letter-spacing: -2px;
        }

        .heroText {
          max-width: 760px;
          margin: 18px 0 0;
          color: #aab8ca;
          font-size: 14px;
          line-height: 1.7;
        }

        .searchForm {
          display: flex;
          gap: 10px;
          max-width: 650px;
          margin-top: 25px;
        }

        .searchForm input {
          flex: 1;
          min-width: 0;
          min-height: 48px;
          padding: 0 15px;
          border: 1px solid rgba(148, 163, 184, 0.24);
          border-radius: 12px;
          outline: none;
          color: #f8fafc;
          background: rgba(2, 8, 18, 0.72);
          font-size: 15px;
          font-weight: 850;
          text-transform: uppercase;
        }

        .searchForm input:focus {
          border-color: rgba(240, 214, 117, 0.7);
        }

        .searchForm button {
          min-height: 48px;
          padding: 0 19px;
          border: 0;
          border-radius: 12px;
          color: #111827;
          background:
            linear-gradient(
              135deg,
              #34d399,
              #6ee7b7
            );
          font-weight: 950;
          cursor: pointer;
        }

        .searchForm button:disabled,
        .exampleSymbols button:disabled {
          cursor: default;
          opacity: 0.55;
        }

        .exampleSymbols {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
          margin-top: 12px;
        }

        .exampleSymbols button {
          padding: 6px 9px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 999px;
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.035);
          font-size: 10px;
          font-weight: 850;
          cursor: pointer;
        }

        .heroPanel {
          align-self: center;
          padding: 24px;
          border: 1px solid rgba(148, 163, 184, 0.14);
          border-radius: 19px;
          background: rgba(0, 0, 0, 0.2);
        }

        .heroPanel span,
        .heroPanel strong,
        .heroPanel small {
          display: block;
        }

        .heroPanel span {
          color: #94a3b8;
          font-size: 11px;
        }

        .heroPanel strong {
          margin-top: 9px;
          color: #6ee7b7;
          font-size: 48px;
        }

        .heroPanel small {
          margin-top: 8px;
          color: #64748b;
          font-size: 10px;
        }

        .errorBox,
        .notice,
        .loadingCard {
          margin-top: 16px;
          padding: 15px;
          border-radius: 14px;
        }

        .errorBox {
          color: #fecaca;
          border: 1px solid rgba(239, 68, 68, 0.3);
          background: rgba(127, 29, 29, 0.24);
        }

        .notice {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          color: #cbd5e1;
          border: 1px solid rgba(56, 189, 248, 0.18);
          background: rgba(14, 116, 144, 0.08);
          font-size: 11px;
          line-height: 1.6;
        }

        .notice strong {
          color: #7dd3fc;
        }

        .loadingCard {
          text-align: center;
          border: 1px solid rgba(148, 163, 184, 0.14);
          background: rgba(15, 23, 42, 0.86);
        }

        .loadingCard h2 {
          margin: 10px 0 4px;
        }

        .loadingCard p {
          color: #94a3b8;
        }

        .spinner {
          width: 28px;
          height: 28px;
          margin: 0 auto;
          border: 3px solid rgba(255, 255, 255, 0.1);
          border-top-color: #6ee7b7;
          border-radius: 50%;
          animation: spin 700ms linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .scoreGrid {
          display: grid;
          grid-template-columns: repeat(
            3,
            minmax(0, 1fr)
          );
          gap: 13px;
          margin-top: 16px;
        }

        .scoreCard,
        .listCard,
        .sectionCard {
          border: 1px solid rgba(148, 163, 184, 0.15);
          background:
            linear-gradient(
              145deg,
              rgba(17, 29, 44, 0.97),
              rgba(12, 19, 31, 0.97)
            );
        }

        .scoreCard {
          min-width: 0;
          padding: 20px;
          border-radius: 17px;
        }

        .cardEyebrow {
          color: #34d399;
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 1.1px;
        }

        .scoreLine {
          display: flex;
          align-items: flex-end;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 12px;
        }

        .scoreLine strong,
        .coverageValue {
          font-size: 31px;
          line-height: 1;
        }

        .scoreLine span {
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 850;
        }

        .scoreCard p {
          margin: 14px 0 0;
          color: #8391a5;
          font-size: 10px;
          line-height: 1.6;
        }

        .coverageValue {
          margin-top: 14px;
          color: #7dd3fc;
          font-weight: 950;
        }

        .twoColumns {
          display: grid;
          grid-template-columns: repeat(
            2,
            minmax(0, 1fr)
          );
          gap: 13px;
          margin-top: 13px;
        }

        .listCard,
        .sectionCard {
          min-width: 0;
          border-radius: 18px;
        }

        .listCard {
          padding: 20px;
        }

        .positiveCard {
          border-color: rgba(34, 197, 94, 0.2);
        }

        .riskCard {
          border-color: rgba(251, 113, 133, 0.18);
        }

        .sectionTitle {
          gap: 11px;
        }

        .sectionTitle > span {
          display: grid;
          width: 36px;
          height: 36px;
          place-items: center;
          border-radius: 10px;
          color: #111827;
          background: #6ee7b7;
          font-weight: 950;
        }

        .sectionTitle small {
          color: #34d399;
          font-size: 8px;
          font-weight: 950;
          letter-spacing: 1px;
        }

        .sectionTitle h2 {
          margin: 3px 0 0;
          font-size: 18px;
        }

        .listCard ul {
          display: grid;
          gap: 9px;
          margin: 17px 0 0;
          padding-left: 18px;
          color: #cbd5e1;
          font-size: 11px;
          line-height: 1.5;
        }

        .emptyText {
          margin: 17px 0 0;
          color: #94a3b8;
          font-size: 11px;
          line-height: 1.6;
        }

        .sectionCard {
          margin-top: 13px;
          padding: 22px;
        }

        .headingRow {
          gap: 15px;
          flex-wrap: wrap;
        }

        .headingRow h2 {
          margin: 0;
          font-size: 22px;
        }

        .sourceBadge {
          color: #7dd3fc;
          border-color: rgba(56, 189, 248, 0.2);
          background: rgba(56, 189, 248, 0.07);
        }

        .externalLink {
          color: #6ee7b7;
          font-size: 11px;
          font-weight: 850;
          text-decoration: none;
        }

        .checkGrid,
        .technicalGrid {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(210px, 1fr)
          );
          gap: 10px;
          margin-top: 17px;
        }

        .checkCard,
        .technicalItem {
          min-width: 0;
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 13px;
          background: rgba(255, 255, 255, 0.025);
        }

        .checkCard {
          padding: 13px;
        }

        .checkCard summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          cursor: pointer;
          list-style: none;
        }

        .checkCard summary::-webkit-details-marker {
          display: none;
        }

        .checkCard summary div span,
        .checkCard summary div strong {
          display: block;
        }

        .checkCard summary strong {
          font-size: 11px;
        }

        .checkCard summary div span {
          margin-top: 4px;
          color: #94a3b8;
          font-size: 9px;
        }

        .checkCard summary b {
          color: #6ee7b7;
          font-size: 13px;
        }

        .checkCard p {
          margin: 12px 0 0;
          padding-top: 10px;
          color: #94a3b8;
          border-top: 1px solid rgba(148, 163, 184, 0.1);
          font-size: 10px;
          line-height: 1.6;
        }

        .tableWrap {
          min-width: 660px;
          margin-top: 17px;
        }

        .sectionCard:has(.tableWrap) {
          overflow-x: auto;
        }

        .metricHeader,
        .metricRow {
          display: grid;
          grid-template-columns:
            1.25fr 1fr 1fr 0.8fr;
          gap: 12px;
          align-items: center;
          padding: 11px;
        }

        .metricHeader {
          color: #64748b;
          border-bottom: 1px solid rgba(148, 163, 184, 0.14);
          font-size: 9px;
          font-weight: 850;
        }

        .metricRow {
          color: #cbd5e1;
          border-bottom: 1px solid rgba(148, 163, 184, 0.08);
          font-size: 11px;
        }

        .metricRow strong {
          color: #f8fafc;
        }

        .positive {
          color: #4ade80;
        }

        .negative {
          color: #fb7185;
        }

        .technicalItem {
          padding: 14px;
        }

        .technicalItem span,
        .technicalItem strong {
          display: block;
        }

        .technicalItem span {
          color: #718096;
          font-size: 9px;
        }

        .technicalItem strong {
          margin-top: 7px;
          color: #f8fafc;
          font-size: 16px;
        }

        .scenarioBox {
          margin-top: 14px;
          padding: 16px;
          border: 1px solid rgba(52,211,153, 0.19);
          border-radius: 13px;
          background: rgba(52,211,153, 0.05);
        }

        .scenarioBox strong {
          color: #6ee7b7;
        }

        .scenarioBox p {
          margin: 8px 0;
          color: #cbd5e1;
          font-size: 11px;
          line-height: 1.6;
        }

        .scenarioBox small {
          color: #64748b;
          font-size: 9px;
        }

        .learningCard {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 22px;
          margin-top: 13px;
          padding: 24px;
          border: 1px solid rgba(52,211,153, 0.27);
          border-radius: 18px;
          background:
            linear-gradient(
              135deg,
              rgba(32, 46, 42, 0.95),
              rgba(14, 23, 38, 0.97)
            );
        }

        .learningCard h2 {
          margin-bottom: 8px;
        }

        .learningCard p:not(.eyebrow) {
          max-width: 760px;
          margin-bottom: 0;
          color: #94a3b8;
          font-size: 11px;
          line-height: 1.6;
        }

        .learningCard a {
          flex: 0 0 auto;
          padding: 12px 15px;
          border-radius: 11px;
          color: #111827;
          background:
            linear-gradient(
              135deg,
              #34d399,
              #6ee7b7
            );
          font-size: 11px;
          font-weight: 950;
          text-decoration: none;
        }

        .footer {
          justify-content: space-between;
          gap: 20px;
          flex-wrap: wrap;
          margin-top: 14px;
          padding: 18px;
          color: #64748b;
          border-top: 1px solid rgba(148, 163, 184, 0.12);
          font-size: 9px;
        }

        .footer div strong,
        .footer div span {
          display: block;
        }

        .footer div strong {
          color: #94a3b8;
        }

        .footer div span {
          margin-top: 4px;
        }

        .footer p {
          max-width: 520px;
          margin: 0;
          line-height: 1.5;
        }

        @media (max-width: 900px) {
          .hero,
          .scoreGrid {
            grid-template-columns: 1fr;
          }

          .heroPanel {
            display: none;
          }

          .twoColumns {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 650px) {
          .page {
            padding: 13px;
          }

          .topbar {
            align-items: flex-start;
          }

          .liveBadge {
            display: none;
          }

          .hero {
            padding: 24px 18px;
          }

          h1 {
            font-size: 38px;
            letter-spacing: -1px;
          }

          .searchForm {
            flex-direction: column;
          }

          .searchForm button {
            width: 100%;
          }

          .sectionCard,
          .listCard {
            padding: 17px;
          }

          .learningCard {
            align-items: flex-start;
            flex-direction: column;
          }

          .learningCard a {
            width: 100%;
            text-align: center;
          }
        }
      `}</style>
    </main>
  );
}
