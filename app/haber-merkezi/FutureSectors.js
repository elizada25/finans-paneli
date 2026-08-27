'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export default function FutureSectors() {
  const [reports, setReports] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [expandedId, setExpandedId] = useState('');
  const [articleOpen, setArticleOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/future-sectors?limit=12', {
        cache: 'no-store',
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Aylık raporlar alınamadı.');
      }

      const nextReports = Array.isArray(data.reports) ? data.reports : [];
      setReports(nextReports);
      setSelectedId((current) => current || nextReports[0]?.id || '');
    } catch (reportError) {
      setError(reportError?.message || 'Aylık raporlar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const report = useMemo(
    () => reports.find((item) => item.id === selectedId) || reports[0],
    [reports, selectedId]
  );

  return (
    <section className="futureSection">
      <div className="sectionTop">
        <div>
          <p className="eyebrow">AYLIK AKILLI TARAMA</p>
          <h2>Geleceğin Sektörleri</h2>
          <p className="description">
            Uzun vadeli temalar; piyasa gücü, haber yoğunluğu ve risk
            başlıklarıyla her ay aynı kurallarla karşılaştırılır.
          </p>
        </div>

        <div className="topControls">
          {reports.length > 1 ? (
            <label className="reportSelect">
              <span>Rapor dönemi</span>
              <select
                value={report?.id || ''}
                onChange={(event) => {
                  setSelectedId(event.target.value);
                  setExpandedId('');
                  setArticleOpen(false);
                }}
              >
                {reports.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.monthLabel}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <button type="button" className="reloadButton" onClick={loadReports}>
            ↻ Yenile
          </button>
        </div>
      </div>

      {loading && !report ? (
        <div className="messageBox">
          <span className="spinner" />
          Aylık sektör raporu yükleniyor…
        </div>
      ) : null}

      {error && !report ? (
        <div className="messageBox error">
          <strong>Rapor alınamadı.</strong>
          <span>{error}</span>
          <button type="button" onClick={loadReports}>Tekrar dene</button>
        </div>
      ) : null}

      {!loading && !error && !report ? (
        <div className="emptyBox">
          <div className="emptyIcon">◇</div>
          <div>
            <strong>İlk aylık rapor henüz hazırlanmadı.</strong>
            <span>
              Kurulumdan sonra GitHub Actions içindeki “Gelecegin
              Sektorleri Aylik Rapor” görevini bir kez çalıştırın. Sonraki
              raporlar her ay otomatik oluşur.
            </span>
          </div>
        </div>
      ) : null}

      {report ? (
        <>
          <div className="reportMeta">
            <div>
              <span>DÖNEM</span>
              <strong>{report.monthLabel}</strong>
            </div>
            <div>
              <span>QQQ • 1 AY</span>
              <strong className={valueClass(report.benchmark?.oneMonth)}>
                {formatPercent(report.benchmark?.oneMonth)}
              </strong>
            </div>
            <div>
              <span>QQQ • 3 AY</span>
              <strong className={valueClass(report.benchmark?.threeMonth)}>
                {formatPercent(report.benchmark?.threeMonth)}
              </strong>
            </div>
            <div>
              <span>SON TARAMA</span>
              <strong>{formatDate(report.generatedAt)}</strong>
            </div>
          </div>

          <div className="rankingHeader">
            <div>
              <p className="eyebrow">BU AYIN SIRALAMASI</p>
              <h3>Sermaye ve ilgi nerede güçleniyor?</h3>
            </div>
            <span>Detay için sektöre dokunun</span>
          </div>

          <div className="rankingGrid">
            {(report.ranking || []).map((sector, index) => {
              const expanded = expandedId === sector.id;
              return (
                <article
                  key={sector.id}
                  className={expanded ? 'sectorCard expanded' : 'sectorCard'}
                  style={{ '--sector-color': sector.color || '#34d399' }}
                >
                  <button
                    type="button"
                    className="sectorSummary"
                    onClick={() => setExpandedId(expanded ? '' : sector.id)}
                    aria-expanded={expanded}
                  >
                    <span className="rank">#{index + 1}</span>
                    <span className="sectorIcon">{sector.icon || '◆'}</span>
                    <span className="sectorIdentity">
                      <strong>{sector.name}</strong>
                      <small>{sector.ticker} • {sector.signal}</small>
                    </span>
                    <span className="metric">
                      <small>1 ay</small>
                      <strong className={valueClass(sector.oneMonth)}>
                        {formatPercent(sector.oneMonth)}
                      </strong>
                    </span>
                    <span className="metric desktopMetric">
                      <small>QQQ farkı</small>
                      <strong className={valueClass(sector.relativeThreeMonth)}>
                        {formatPercent(sector.relativeThreeMonth)}
                      </strong>
                    </span>
                    <span className="score">
                      <strong>{sector.score}</strong>
                      <small>/100</small>
                    </span>
                    <span className="chevron">{expanded ? '−' : '+'}</span>
                  </button>

                  {expanded ? <SectorDetail sector={sector} /> : null}
                </article>
              );
            })}
          </div>

          <div className="articlePanel">
            <button
              type="button"
              className="articleButton"
              onClick={() => setArticleOpen((current) => !current)}
              aria-expanded={articleOpen}
            >
              <span className="articleMark">A</span>
              <span>
                <small>AYLIK ARAŞTIRMA YAZISI</small>
                <strong>{report.article?.title}</strong>
              </span>
              <b>{articleOpen ? 'Yazıyı kapat ↑' : 'Yazıyı oku →'}</b>
            </button>

            {articleOpen ? (
              <div className="articleBody">
                <p className="articleIntro">{report.article?.intro}</p>
                {(report.article?.paragraphs || []).map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            ) : null}
          </div>

          <div className="methodBox">
            <strong>Nasıl hesaplanıyor?</strong>
            <span>{report.methodology}</span>
            <small>
              Bu çalışma yatırım tavsiyesi veya kesin gelecek tahmini değildir.
              Haber başlıkları ilgili yayıncılara aittir.
            </small>
          </div>
        </>
      ) : null}

      <style jsx>{`
        .futureSection {
          margin-top: 18px;
          padding: 24px;
          border: 1px solid rgba(52, 211, 153, 0.25);
          border-radius: 22px;
          background:
            radial-gradient(circle at 92% 0%, rgba(52, 211, 153, 0.1), transparent 30%),
            linear-gradient(145deg, rgba(14, 23, 35, 0.98), rgba(7, 13, 22, 0.98));
          box-shadow: 0 22px 60px rgba(0, 0, 0, 0.22);
        }

        .sectionTop,
        .rankingHeader,
        .articleButton {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .eyebrow {
          margin: 0 0 7px;
          color: #34d399;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 1.5px;
        }

        h2,
        h3,
        p { margin-top: 0; }
        h2 { margin-bottom: 8px; font-size: 28px; letter-spacing: -0.7px; }
        h3 { margin-bottom: 0; font-size: 20px; }

        .description {
          max-width: 760px;
          margin-bottom: 0;
          color: #94a3b8;
          font-size: 13px;
          line-height: 1.65;
        }

        .topControls { display: flex; align-items: end; gap: 9px; }
        .reportSelect { display: grid; gap: 5px; }
        .reportSelect span { color: #64748b; font-size: 9px; font-weight: 900; }

        select,
        .reloadButton,
        .messageBox button {
          min-height: 38px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 10px;
          color: #e2e8f0;
          background: #111b2a;
          font: inherit;
          font-size: 11px;
          font-weight: 850;
        }

        select { min-width: 150px; padding: 0 10px; }
        .reloadButton,
        .messageBox button { padding: 0 13px; cursor: pointer; }

        .messageBox,
        .emptyBox {
          display: flex;
          align-items: center;
          gap: 13px;
          margin-top: 20px;
          padding: 18px;
          border: 1px solid rgba(148, 163, 184, 0.14);
          border-radius: 15px;
          color: #94a3b8;
          background: rgba(15, 23, 42, 0.7);
          font-size: 12px;
        }

        .messageBox.error { border-color: rgba(248, 113, 113, 0.3); color: #fca5a5; }
        .messageBox.error { flex-wrap: wrap; }
        .emptyIcon { color: #34d399; font-size: 30px; }
        .emptyBox div:last-child { display: grid; gap: 5px; }
        .emptyBox strong { color: #e2e8f0; }
        .emptyBox span { line-height: 1.55; }

        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(52, 211, 153, 0.2);
          border-top-color: #34d399;
          border-radius: 50%;
          animation: spin 800ms linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .reportMeta {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 1px;
          overflow: hidden;
          margin-top: 22px;
          border: 1px solid rgba(148, 163, 184, 0.13);
          border-radius: 14px;
          background: rgba(148, 163, 184, 0.13);
        }

        .reportMeta > div {
          display: grid;
          gap: 5px;
          padding: 14px;
          background: #0c1522;
        }

        .reportMeta span,
        .metric small,
        .score small { color: #64748b; font-size: 8px; font-weight: 900; letter-spacing: 0.8px; }
        .reportMeta strong { color: #dbe5f2; font-size: 12px; }
        .positive { color: #4ade80 !important; }
        .negative { color: #fb7185 !important; }

        .rankingHeader { align-items: end; margin: 28px 2px 12px; }
        .rankingHeader > span { color: #64748b; font-size: 10px; }
        .rankingGrid { display: grid; gap: 8px; }

        .sectorCard {
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.13);
          border-left: 3px solid var(--sector-color);
          border-radius: 13px;
          background: rgba(14, 23, 36, 0.9);
          transition: border-color 160ms ease, background 160ms ease;
        }

        .sectorCard:hover,
        .sectorCard.expanded {
          border-color: color-mix(in srgb, var(--sector-color) 48%, transparent);
          background: rgba(17, 28, 43, 0.98);
        }

        .sectorSummary {
          display: grid;
          grid-template-columns: 34px 32px minmax(220px, 1fr) 84px 100px 70px 22px;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 13px 14px;
          border: 0;
          color: inherit;
          background: transparent;
          text-align: left;
          cursor: pointer;
        }

        .rank { color: #64748b; font-size: 11px; font-weight: 900; }
        .sectorIcon { color: var(--sector-color); font-size: 19px; text-align: center; }
        .sectorIdentity { display: grid; gap: 4px; }
        .sectorIdentity strong { color: #e8eef7; font-size: 12px; }
        .sectorIdentity small { color: var(--sector-color); font-size: 8px; font-weight: 900; letter-spacing: 0.7px; }
        .metric { display: grid; gap: 3px; text-align: right; }
        .metric strong { color: #cbd5e1; font-size: 11px; }
        .score { display: flex; align-items: baseline; justify-content: end; color: var(--sector-color); }
        .score strong { font-size: 22px; line-height: 1; }
        .chevron { color: #94a3b8; font-size: 18px; text-align: right; }

        .articlePanel {
          overflow: hidden;
          margin-top: 18px;
          border: 1px solid rgba(167, 139, 250, 0.24);
          border-radius: 16px;
          background: linear-gradient(135deg, rgba(70, 48, 112, 0.18), rgba(13, 22, 35, 0.96));
        }

        .articleButton {
          width: 100%;
          padding: 18px;
          border: 0;
          color: inherit;
          background: transparent;
          text-align: left;
          cursor: pointer;
        }

        .articleMark {
          display: grid;
          place-items: center;
          flex: 0 0 42px;
          width: 42px;
          height: 42px;
          border: 1px solid rgba(167, 139, 250, 0.35);
          border-radius: 12px;
          color: #c4b5fd;
          background: rgba(167, 139, 250, 0.12);
          font: 800 20px Georgia, serif;
        }

        .articleButton > span:nth-child(2) { display: grid; flex: 1; gap: 5px; }
        .articleButton small { color: #a78bfa; font-size: 8px; font-weight: 950; letter-spacing: 1px; }
        .articleButton strong { color: #e8eef7; font-size: 14px; }
        .articleButton b { color: #c4b5fd; font-size: 10px; white-space: nowrap; }

        .articleBody { padding: 2px 22px 22px 82px; }
        .articleBody p { color: #aab8ca; font-size: 12px; line-height: 1.75; }
        .articleBody .articleIntro { color: #e2e8f0; font-size: 14px; font-weight: 700; }

        .methodBox {
          display: grid;
          gap: 5px;
          margin-top: 13px;
          padding: 13px 15px;
          border-radius: 12px;
          background: rgba(2, 6, 12, 0.45);
        }

        .methodBox strong { color: #94a3b8; font-size: 10px; }
        .methodBox span { color: #718096; font-size: 10px; line-height: 1.55; }
        .methodBox small { color: #536174; font-size: 9px; }

        @media (max-width: 850px) {
          .futureSection { padding: 16px; border-radius: 18px; }
          .sectionTop { align-items: flex-start; flex-direction: column; }
          .topControls { width: 100%; }
          .reportSelect { flex: 1; }
          select { width: 100%; }
          .reportMeta { grid-template-columns: repeat(2, 1fr); }
          .rankingHeader { align-items: flex-start; flex-direction: column; gap: 5px; }
          .sectorSummary { grid-template-columns: 25px 28px minmax(0, 1fr) 68px 20px; gap: 7px; padding: 12px 9px; }
          .desktopMetric { display: none; }
          .score { grid-column: 4; grid-row: 1; }
          .metric { display: none; }
          .chevron { grid-column: 5; }
          .sectorIdentity strong { font-size: 11px; }
          .articleButton { align-items: flex-start; }
          .articleButton b { display: none; }
          .articleBody { padding: 0 17px 17px; }
        }
      `}</style>
    </section>
  );
}

function SectorDetail({ sector }) {
  return (
    <div className="detail">
      <div className="detailStats">
        <DetailStat label="3 aylık getiri" value={formatPercent(sector.threeMonth)} valueType={valueClass(sector.threeMonth)} />
        <DetailStat label="QQQ'ya göre 1 ay" value={formatPercent(sector.relativeOneMonth)} valueType={valueClass(sector.relativeOneMonth)} />
        <DetailStat label="Haber / kaynak" value={`${sector.newsCount} / ${sector.sourceCount}`} />
        <DetailStat label="Takip göstergesi" value={`${sector.ticker} • $${formatNumber(sector.lastPrice)}`} />
      </div>

      <p className="thesis">{sector.thesis}</p>

      <div className="columns">
        <div>
          <h4>Yapısal büyüme nedenleri</h4>
          <ul>
            {(sector.structuralDrivers || []).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div>
          <h4>Takip edilecek riskler</h4>
          <ul className="risks">
            {(sector.risks || []).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>

      {(sector.news || []).length ? (
        <div className="newsList">
          <h4>Bu ayın ilgili haberleri</h4>
          {(sector.news || []).map((item, index) => (
            <a key={`${item.link}-${index}`} href={item.link} target="_blank" rel="noreferrer">
              <span>{item.title}</span>
              <small>{item.source} • {formatDate(item.publishedAt)} ↗</small>
            </a>
          ))}
        </div>
      ) : null}

      <style jsx>{`
        .detail { padding: 3px 18px 18px 80px; }
        .detailStats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
        .thesis { margin: 16px 0; color: #cbd5e1; font-size: 12px; line-height: 1.65; }
        .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .columns > div,
        .newsList { padding: 13px; border: 1px solid rgba(148, 163, 184, 0.11); border-radius: 11px; background: rgba(2, 6, 12, 0.32); }
        h4 { margin: 0 0 9px; color: #94a3b8; font-size: 9px; letter-spacing: 0.8px; text-transform: uppercase; }
        ul { display: grid; gap: 7px; margin: 0; padding-left: 17px; color: #86efac; }
        ul.risks { color: #fda4af; }
        li { padding-left: 2px; font-size: 10px; line-height: 1.45; }
        li::marker { color: currentColor; }
        .newsList { display: grid; gap: 1px; margin-top: 10px; }
        .newsList a { display: grid; gap: 3px; padding: 9px 5px; border-bottom: 1px solid rgba(148, 163, 184, 0.08); text-decoration: none; }
        .newsList a:last-child { border-bottom: 0; }
        .newsList span { color: #cbd5e1; font-size: 10px; line-height: 1.4; }
        .newsList small { color: #64748b; font-size: 8px; }
        .newsList a:hover span { color: #6ee7b7; }
        @media (max-width: 850px) {
          .detail { padding: 4px 10px 13px; }
          .detailStats { grid-template-columns: repeat(2, 1fr); }
          .columns { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

function DetailStat({ label, value, valueType = '' }) {
  return (
    <div className="stat">
      <small>{label}</small>
      <strong className={valueType}>{value}</strong>
      <style jsx>{`
        .stat { display: grid; gap: 4px; padding: 10px; border-radius: 9px; background: rgba(148, 163, 184, 0.06); }
        small { color: #64748b; font-size: 8px; }
        strong { color: #cbd5e1; font-size: 11px; }
        strong.positive { color: #4ade80; }
        strong.negative { color: #fb7185; }
      `}</style>
    </div>
  );
}

function valueClass(value) {
  const number = Number(value);
  if (number > 0) return 'positive';
  if (number < 0) return 'negative';
  return '';
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number > 0 ? '+' : ''}%${number.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}
