export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const symbol = String(searchParams.get('symbol') || '')
      .trim()
      .toUpperCase();

    if (!symbol || !/^[A-Z0-9.-]{1,10}$/.test(symbol)) {
      return Response.json(
        { error: 'Geçerli bir ABD hisse kodu gerekli.' },
        { status: 400 }
      );
    }

    const cik = await resolveCIK(symbol);

    if (!cik) {
      return Response.json(
        {
          error:
            `${symbol} için SEC kaydı bulunamadı. ` +
            `Bu analiz şu anda SEC'e raporlama yapan ABD şirketlerini destekliyor.`,
        },
        { status: 404 }
      );
    }

    const [factsResponse, submissionsResponse] = await Promise.all([
      fetch(
        `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
        {
          cache: 'no-store',
          headers: {
            'User-Agent': 'Sky-Finans/1.3',
            Accept: 'application/json',
          },
        }
      ),
      fetch(
        `https://data.sec.gov/submissions/CIK${cik}.json`,
        {
          cache: 'no-store',
          headers: {
            'User-Agent': 'Sky-Finans/1.3',
            Accept: 'application/json',
          },
        }
      ),
    ]);

    if (!factsResponse.ok) {
      throw new Error('SEC finansal verileri alınamadı.');
    }

    const factsJson = await factsResponse.json();

    const submissionsJson =
      submissionsResponse.ok
        ? await submissionsResponse.json()
        : {};

    const facts = factsJson?.facts?.['us-gaap'] || {};

    const filing = getLatestFiling(submissionsJson);

    /*
      Gelir tablosu kalemlerinde mümkün olduğunca
      aynı çeyrek geçen yıl karşılaştırması yapılır.

      Bilanço kalemlerinde aynı çeyrek sonu geçen yıl
      karşılaştırması yapılır.
    */
    const metrics = {
      revenue: getYoYMetric(
        facts,
        [
          'RevenueFromContractWithCustomerExcludingAssessedTax',
          'Revenues',
          'SalesRevenueNet',
        ],
        ['USD'],
        false
      ),

      netIncome: getYoYMetric(
        facts,
        [
          'NetIncomeLoss',
          'ProfitLoss',
        ],
        ['USD'],
        false
      ),

      eps: getYoYMetric(
        facts,
        [
          'EarningsPerShareDiluted',
          'EarningsPerShareBasic',
        ],
        ['USD/shares'],
        false
      ),

      cash: getYoYMetric(
        facts,
        [
          'CashAndCashEquivalentsAtCarryingValue',
          'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
        ],
        ['USD'],
        true
      ),

      operatingCashFlow: getYoYMetric(
        facts,
        [
          'NetCashProvidedByUsedInOperatingActivities',
        ],
        ['USD'],
        false
      ),

      assets: getYoYMetric(
        facts,
        ['Assets'],
        ['USD'],
        true
      ),

      liabilities: getYoYMetric(
        facts,
        ['Liabilities'],
        ['USD'],
        true
      ),
    };

    const result = buildFinancialAnalysis(
      symbol,
      metrics,
      filing
    );

    return Response.json(
      result,
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Sky financials V1.3 hatası:', error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Bilanço analizi yapılamadı.',
      },
      { status: 500 }
    );
  }
}

async function resolveCIK(symbol) {
  const response = await fetch(
    'https://www.sec.gov/files/company_tickers.json',
    {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Sky-Finans/1.3',
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) return null;

  const json = await response.json();

  for (const row of Object.values(json || {})) {
    if (
      String(row?.ticker || '').toUpperCase() === symbol
    ) {
      return String(row?.cik_str || '')
        .padStart(10, '0');
    }
  }

  return null;
}

/*
  SEC XBRL'den son rapor dönemi ile mümkün olduğunca
  bir önceki yılın AYNI dönemini eşleştirir.
*/
function getYoYMetric(
  facts,
  tags,
  units,
  instantMetric = false
) {
  for (const tag of tags) {
    const fact = facts?.[tag];

    if (!fact?.units) continue;

    for (const unit of units) {
      const raw = fact.units?.[unit];

      if (!Array.isArray(raw)) continue;

      const values = raw
        .filter((item) => {
          if (
            item.form !== '10-Q' &&
            item.form !== '10-K'
          ) {
            return false;
          }

          if (!Number.isFinite(Number(item.val))) {
            return false;
          }

          if (!item.end) return false;

          return true;
        })
        .sort((a, b) => {
          const aTime = new Date(
            a.filed || a.end
          ).getTime();

          const bTime = new Date(
            b.filed || b.end
          ).getTime();

          return bTime - aTime;
        });

      const unique = [];

      for (const item of values) {
        const key = [
          item.end,
          item.form,
          item.fp || '',
          item.frame || '',
        ].join('|');

        if (
          unique.some(
            (existing) => existing.__key === key
          )
        ) {
          continue;
        }

        unique.push({
          ...item,
          __key: key,
        });
      }

      if (!unique.length) continue;

      /*
        Önce frame içeren en yeni veri aranır.
        Frame, SEC'de CY2026Q1 / CY2026Q1I gibi
        dönemleri doğru eşleştirmemizi sağlar.
      */
      let current =
        unique.find((item) =>
          isUsefulFrame(item.frame, instantMetric)
        ) ||
        unique[0];

      let previous = findSamePeriodLastYear(
        unique,
        current,
        instantMetric
      );

      /*
        Frame bulunamazsa fiscal period (fp)
        ve yıl üzerinden ikinci yöntem.
      */
      if (!previous) {
        previous = unique.find((candidate) => {
          if (candidate === current) return false;

          const currentYear =
            Number(current.fy) ||
            new Date(current.end).getUTCFullYear();

          const candidateYear =
            Number(candidate.fy) ||
            new Date(candidate.end).getUTCFullYear();

          if (
            candidateYear !== currentYear - 1
          ) {
            return false;
          }

          if (
            current.fp &&
            candidate.fp &&
            current.fp !== candidate.fp
          ) {
            return false;
          }

          /*
            Dönem sonu aylarını mümkün olduğunca eşleştir.
          */
          const currentEnd = new Date(current.end);
          const candidateEnd =
            new Date(candidate.end);

          const monthDistance = Math.abs(
            currentEnd.getUTCMonth() -
            candidateEnd.getUTCMonth()
          );

          return monthDistance <= 1;
        });
      }

      return {
        current: Number(current.val),
        previous:
          previous &&
          Number.isFinite(Number(previous.val))
            ? Number(previous.val)
            : null,

        currentEnd: current.end,
        previousEnd: previous?.end || null,

        currentFrame: current.frame || null,
        previousFrame: previous?.frame || null,

        currentForm: current.form || null,
        previousForm: previous?.form || null,

        yoyPercent: calculateGrowth(
          Number(current.val),
          previous
            ? Number(previous.val)
            : null
        ),
      };
    }
  }

  return null;
}

function isUsefulFrame(frame, instantMetric) {
  if (!frame) return false;

  const value = String(frame);

  if (instantMetric) {
    return /^CY\d{4}Q[1-4]I$/.test(value) ||
           /^CY\d{4}I$/.test(value);
  }

  return /^CY\d{4}Q[1-4]$/.test(value) ||
         /^CY\d{4}$/.test(value);
}

function findSamePeriodLastYear(
  values,
  current,
  instantMetric
) {
  const frame = String(current?.frame || '');

  if (!frame) return null;

  const match = frame.match(
    /^CY(\d{4})(.*)$/
  );

  if (!match) return null;

  const year = Number(match[1]);
  const suffix = match[2];

  if (!Number.isFinite(year)) return null;

  const targetFrame =
    `CY${year - 1}${suffix}`;

  return (
    values.find(
      (item) =>
        String(item.frame || '') ===
        targetFrame
    ) || null
  );
}

function getLatestFiling(data) {
  const recent = data?.filings?.recent;

  const forms = recent?.form || [];
  const dates = recent?.filingDate || [];

  for (let i = 0; i < forms.length; i++) {
    if (
      forms[i] === '10-Q' ||
      forms[i] === '10-K'
    ) {
      return {
        form: forms[i],
        date: dates[i],
      };
    }
  }

  return null;
}

function buildFinancialAnalysis(
  symbol,
  metrics,
  filing
) {
  let score = 0;

  const comments = [];
  const yoyComments = [];

  // -------------------------------------------------------
  // GELİR
  // -------------------------------------------------------

  const revenueGrowth =
    metrics.revenue?.yoyPercent;

  if (Number.isFinite(revenueGrowth)) {
    if (revenueGrowth >= 20) {
      score += 2;

      yoyComments.push(
        `Gelir geçen yılın aynı dönemine göre %${revenueGrowth.toFixed(
          1
        )} arttı. Güçlü yıllık büyüme var.`
      );
    } else if (revenueGrowth >= 5) {
      score += 1;

      yoyComments.push(
        `Gelir geçen yılın aynı dönemine göre %${revenueGrowth.toFixed(
          1
        )} arttı.`
      );
    } else if (revenueGrowth >= 0) {
      yoyComments.push(
        `Gelir geçen yılın aynı dönemine göre %${revenueGrowth.toFixed(
          1
        )} arttı; büyüme sınırlı.`
      );
    } else {
      score -= 2;

      yoyComments.push(
        `Gelir geçen yılın aynı dönemine göre %${Math.abs(
          revenueGrowth
        ).toFixed(1)} geriledi.`
      );
    }
  }

  // -------------------------------------------------------
  // NET KÂR / ZARAR
  // -------------------------------------------------------

  const netCurrent =
    metrics.netIncome?.current;

  const netPrevious =
    metrics.netIncome?.previous;

  if (Number.isFinite(netCurrent)) {
    if (netCurrent > 0) {
      score += 1;
      comments.push('Son dönemde net sonuç pozitif.');
    } else {
      score -= 1;
      comments.push('Son dönemde şirket net zarar açıkladı.');
    }
  }

  if (
    Number.isFinite(netCurrent) &&
    Number.isFinite(netPrevious)
  ) {
    if (
      netPrevious < 0 &&
      netCurrent > netPrevious
    ) {
      score += 1;

      yoyComments.push(
        'Net zarar geçen yılın aynı dönemine göre azaldı.'
      );
    } else if (
      netPrevious > 0 &&
      netCurrent < 0
    ) {
      score -= 2;

      yoyComments.push(
        'Geçen yıl aynı dönemde kâr varken bu yıl zarar oluştu.'
      );
    } else if (
      netPrevious > 0 &&
      netCurrent > netPrevious
    ) {
      score += 1;

      yoyComments.push(
        'Net kâr geçen yılın aynı döneminin üzerinde.'
      );
    } else if (
      netPrevious < 0 &&
      netCurrent < netPrevious
    ) {
      score -= 1;

      yoyComments.push(
        'Net zarar geçen yılın aynı dönemine göre büyüdü.'
      );
    }
  }

  // -------------------------------------------------------
  // EPS
  // -------------------------------------------------------

  const epsCurrent =
    metrics.eps?.current;

  const epsPrevious =
    metrics.eps?.previous;

  if (
    Number.isFinite(epsCurrent) &&
    Number.isFinite(epsPrevious)
  ) {
    if (epsCurrent > epsPrevious) {
      score += 1;

      yoyComments.push(
        `EPS geçen yılın aynı dönemindeki ${formatNumber(
          epsPrevious
        )} seviyesinden ${formatNumber(
          epsCurrent
        )} seviyesine iyileşti.`
      );
    } else if (epsCurrent < epsPrevious) {
      score -= 1;

      yoyComments.push(
        `EPS geçen yılın aynı dönemindeki ${formatNumber(
          epsPrevious
        )} seviyesinden ${formatNumber(
          epsCurrent
        )} seviyesine geriledi.`
      );
    }
  }

  // -------------------------------------------------------
  // NAKİT
  // -------------------------------------------------------

  const cashGrowth =
    metrics.cash?.yoyPercent;

  if (Number.isFinite(cashGrowth)) {
    if (cashGrowth >= 20) {
      score += 1;

      yoyComments.push(
        `Nakit geçen yılın aynı dönemine göre %${cashGrowth.toFixed(
          1
        )} arttı.`
      );
    } else if (cashGrowth <= -20) {
      score -= 1;

      yoyComments.push(
        `Nakit geçen yılın aynı dönemine göre %${Math.abs(
          cashGrowth
        ).toFixed(1)} azaldı.`
      );
    }
  }

  // -------------------------------------------------------
  // OPERASYONEL NAKİT
  // -------------------------------------------------------

  const opCurrent =
    metrics.operatingCashFlow?.current;

  const opPrevious =
    metrics.operatingCashFlow?.previous;

  if (Number.isFinite(opCurrent)) {
    if (opCurrent > 0) {
      score += 1;
      comments.push('Operasyonel nakit akışı pozitif.');
    } else {
      score -= 1;
      comments.push('Operasyonel nakit akışı negatif.');
    }
  }

  if (
    Number.isFinite(opCurrent) &&
    Number.isFinite(opPrevious)
  ) {
    if (opCurrent > opPrevious) {
      yoyComments.push(
        'Operasyonel nakit akışı geçen yılın aynı dönemine göre iyileşti.'
      );
    } else if (opCurrent < opPrevious) {
      yoyComments.push(
        'Operasyonel nakit akışı geçen yılın aynı dönemine göre zayıfladı.'
      );
    }
  }

  // -------------------------------------------------------
  // VARLIKLAR / YÜKÜMLÜLÜKLER
  // -------------------------------------------------------

  const assetGrowth =
    metrics.assets?.yoyPercent;

  const liabilityGrowth =
    metrics.liabilities?.yoyPercent;

  if (Number.isFinite(assetGrowth)) {
    yoyComments.push(
      `Toplam varlıklar yıllık bazda ${
        assetGrowth >= 0 ? '%' : '-%'
      }${Math.abs(assetGrowth).toFixed(1)} ${
        assetGrowth >= 0 ? 'arttı' : 'azaldı'
      }.`
    );
  }

  if (Number.isFinite(liabilityGrowth)) {
    yoyComments.push(
      `Toplam yükümlülükler yıllık bazda ${
        liabilityGrowth >= 0 ? '%' : '-%'
      }${Math.abs(liabilityGrowth).toFixed(1)} ${
        liabilityGrowth >= 0 ? 'arttı' : 'azaldı'
      }.`
    );

    if (
      liabilityGrowth > 20 &&
      (!Number.isFinite(assetGrowth) ||
       liabilityGrowth > assetGrowth)
    ) {
      score -= 1;
    }
  }

  // -------------------------------------------------------
  // GENEL KARAR
  // -------------------------------------------------------

  let verdict = 'NÖTR';

  if (score >= 4) {
    verdict = 'GÜÇLÜ';
  } else if (score >= 2) {
    verdict = 'OLUMLU';
  } else if (score <= -3) {
    verdict = 'RİSKLİ';
  } else if (score < 0) {
    verdict = 'ZAYIF';
  }

  const yoyAvailable =
    Object.values(metrics).some(
      (metric) =>
        metric &&
        Number.isFinite(metric.current) &&
        Number.isFinite(metric.previous)
    );

  const answer =
`${symbol} BİLANÇO ANALİZİ — ${verdict}

Son rapor: ${filing?.form || '—'} • ${formatDate(
  filing?.date
)}

SON DÖNEM:
Gelir: ${money(metrics.revenue?.current)}
Net kâr/zarar: ${money(metrics.netIncome?.current)}
EPS: ${formatNumber(metrics.eps?.current)}
Nakit: ${money(metrics.cash?.current)}
Operasyonel nakit akışı: ${money(
  metrics.operatingCashFlow?.current
)}
Toplam varlıklar: ${money(metrics.assets?.current)}
Toplam yükümlülükler: ${money(
  metrics.liabilities?.current
)}

GEÇEN YIL AYNI DÖNEM:
Gelir: ${money(metrics.revenue?.previous)}
Net kâr/zarar: ${money(metrics.netIncome?.previous)}
EPS: ${formatNumber(metrics.eps?.previous)}
Nakit: ${money(metrics.cash?.previous)}
Operasyonel nakit akışı: ${money(
  metrics.operatingCashFlow?.previous
)}
Toplam varlıklar: ${money(metrics.assets?.previous)}
Toplam yükümlülükler: ${money(
  metrics.liabilities?.previous
)}

Sky bilanço değerlendirmesi:
${
  comments.length
    ? comments.map((x) => `• ${x}`).join('\n')
    : '• Son dönem için ek yorum bulunamadı.'
}

1 yıllık karşılaştırma:
${
  yoyComments.length
    ? yoyComments.map((x) => `• ${x}`).join('\n')
    : '• Aynı dönem geçen yıl karşılaştırması için yeterli standart SEC verisi bulunamadı.'
}

Bilanço puanı: ${score}
SONUÇ: ${verdict}`;

  return {
    symbol,
    verdict,
    score,
    filing,
    metrics,
    yoyAvailable,
    comments,
    yoyComments,
    answer,
  };
}

function calculateGrowth(current, previous) {
  if (
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return null;
  }

  return (
    ((current - previous) /
      Math.abs(previous)) *
    100
  );
}

function money(value) {
  if (!Number.isFinite(value)) return '—';

  const abs = Math.abs(value);

  if (abs >= 1_000_000_000) {
    return `$${(
      value / 1_000_000_000
    ).toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} milyar`;
  }

  if (abs >= 1_000_000) {
    return `$${(
      value / 1_000_000
    ).toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} milyon`;
  }

  return `$${value.toLocaleString('tr-TR', {
    maximumFractionDigits: 0,
  })}`;
}

function formatNumber(value) {
  return Number.isFinite(value)
    ? Number(value).toLocaleString('tr-TR', {
        maximumFractionDigits: 3,
      })
    : '—';
}

function formatDate(value) {
  if (!value) return '—';

  return new Date(
    `${value}T12:00:00Z`
  ).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  });
}
