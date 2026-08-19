import SEC_CIKS from './sec-ciks.json';

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

    const SKY_KNOWN_CIKS = {
      ONDS: '0001646188',
      EOSE: '0001805077',
      MU: '0000723125',
      NVDA: '0001045810',
      META: '0001326801',
      AAOI: '0001158114',
      AMD: '0000002488',
      PLTR: '0001321655',
      RKLB: '0001819994',
      SOFI: '0001818874',
    };

    const cik =
      SKY_KNOWN_CIKS[symbol] ||
      await resolveCIK(symbol);

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
        false,
        filing,
        'quarter'
      ),

      netIncome: getYoYMetric(
        facts,
        [
          'ProfitLoss',
          'NetIncomeLoss',
          'NetIncomeLossAvailableToCommonStockholdersBasic',
        ],
        ['USD'],
        false,
        filing,
        'quarter'
      ),

      eps: getYoYMetric(
        facts,
        [
          'EarningsPerShareDiluted',
          'EarningsPerShareBasic',
        ],
        ['USD/shares'],
        false,
        filing,
        'quarter'
      ),

      cash: getYoYMetric(
        facts,
        [
          'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
          'CashAndCashEquivalentsAtCarryingValue',
        ],
        ['USD'],
        true,
        filing,
        'instant'
      ),

      shortTermInvestments: getYoYMetric(
        facts,
        [
          'ShortTermInvestments',
          'MarketableSecuritiesCurrent',
          'MarketableSecurities',
        ],
        ['USD'],
        true,
        filing,
        'instant'
      ),

      operatingCashFlow: getYoYMetric(
        facts,
        [
          'NetCashProvidedByUsedInOperatingActivities',
        ],
        ['USD'],
        false,
        filing,
        'ytd'
      ),

      assets: getYoYMetric(
        facts,
        ['Assets'],
        ['USD'],
        true,
        filing,
        'instant'
      ),

      liabilities: getYoYMetric(
        facts,
        ['Liabilities'],
        ['USD'],
        true,
        filing,
        'instant'
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
          'X-Sky-Financials-Version': 'V4-duration-matched',
        },
      }
    );
  } catch (error) {
    console.error('Sky financials V3 hatası:', error);

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
  const normalizedSymbol = String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/\./g, '-');

  const localCik =
    SEC_CIKS[normalizedSymbol];

  if (localCik) {
    return String(localCik)
      .padStart(10, '0');
  }

  const headers = {
    'User-Agent':
      process.env.SEC_USER_AGENT ||
      'Sky-Finans/1.4 financial-research-dashboard',
    Accept: 'application/json',
  };

  /*
    Birinci kaynak: SEC'in standart ticker listesi.
  */
  try {
    const response = await fetch(
      'https://www.sec.gov/files/company_tickers.json',
      {
        headers,
        next: {
          revalidate: 86400,
        },
        signal: AbortSignal.timeout(12000),
      }
    );

    if (response.ok) {
      const json = await response.json();

      for (const row of Object.values(json || {})) {
        const ticker = String(
          row?.ticker || ''
        )
          .trim()
          .toUpperCase()
          .replace(/\./g, '-');

        if (ticker === normalizedSymbol) {
          return String(row?.cik_str || '')
            .padStart(10, '0');
        }
      }
    } else {
      console.warn(
        'SEC company_tickers yanıtı:',
        response.status
      );
    }
  } catch (error) {
    console.warn(
      'SEC standart ticker listesi hatası:',
      error?.message || error
    );
  }

  /*
    İkinci kaynak: SEC'in borsa bilgisi içeren
    alternatif ticker listesi.
  */
  try {
    const response = await fetch(
      'https://www.sec.gov/files/company_tickers_exchange.json',
      {
        headers,
        next: {
          revalidate: 86400,
        },
        signal: AbortSignal.timeout(12000),
      }
    );

    if (!response.ok) {
      console.warn(
        'SEC exchange ticker yanıtı:',
        response.status
      );

      return null;
    }

    const json = await response.json();
    const fields = Array.isArray(json?.fields)
      ? json.fields
      : [];

    const rows = Array.isArray(json?.data)
      ? json.data
      : [];

    const cikIndex = fields.indexOf('cik');
    const tickerIndex = fields.indexOf('ticker');

    if (cikIndex === -1 || tickerIndex === -1) {
      return null;
    }

    for (const row of rows) {
      if (!Array.isArray(row)) continue;

      const ticker = String(
        row[tickerIndex] || ''
      )
        .trim()
        .toUpperCase()
        .replace(/\./g, '-');

      if (ticker === normalizedSymbol) {
        return String(row[cikIndex] || '')
          .padStart(10, '0');
      }
    }
  } catch (error) {
    console.warn(
      'SEC alternatif ticker listesi hatası:',
      error?.message || error
    );
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
  instantMetric = false,
  filing = null,
  periodMode = 'quarter'
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
          item.start || '',
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
        Metrikleri son 10-Q/10-K raporunun erişim numarası
        ve dönem sonuna bağla. Aynı yeni rapor içinde SEC,
        geçen yılın karşılaştırma satırlarını da yeniden
        dosyaladığı için yalnızca "filed" tarihine bakmak
        eski dönemin seçilmesine yol açar.
      */
      const current = selectCurrentFact(
        unique,
        filing,
        instantMetric,
        periodMode
      );

      if (!current) continue;

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
        previous = findPreviousByDates(
          unique,
          current,
          instantMetric,
          periodMode
        );
      }

      if (!previous) {
        previous = unique.find((candidate) => {
          if (candidate === current) return false;

          const currentYear =
            new Date(current.end).getUTCFullYear();

          const candidateYear =
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

          if (
            !instantMetric &&
            periodMode !== 'instant'
          ) {
            const currentDuration =
              durationDays(current);

            const candidateDuration =
              durationDays(candidate);

            if (
              currentDuration <= 0 ||
              candidateDuration <= 0 ||
              Math.abs(
                currentDuration -
                candidateDuration
              ) > 10
            ) {
              return false;
            }
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

        currentStart: current.start || null,
        currentEnd: current.end,
        previousStart: previous?.start || null,
        previousEnd: previous?.end || null,

        currentDurationDays:
          instantMetric ? 0 : durationDays(current),
        previousDurationDays:
          previous && !instantMetric
            ? durationDays(previous)
            : 0,

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

function selectCurrentFact(
  values,
  filing,
  instantMetric,
  periodMode
) {
  let pool = [...values];

  if (filing?.accessionNumber) {
    const accessionMatches = pool.filter(
      (item) => item.accn === filing.accessionNumber
    );

    if (accessionMatches.length) {
      pool = accessionMatches;
    } else {
      return null;
    }
  } else if (filing?.date) {
    const filedMatches = pool.filter(
      (item) => item.filed === filing.date
    );

    if (filedMatches.length) {
      pool = filedMatches;
    }
  }

  if (filing?.reportDate) {
    const endMatches = pool.filter(
      (item) => item.end === filing.reportDate
    );

    if (endMatches.length) {
      pool = endMatches;
    } else {
      return null;
    }
  }

  if (!pool.length) return null;

  if (instantMetric || periodMode === 'instant') {
    return [...pool].sort((a, b) =>
      scoreInstantFact(b, filing) -
      scoreInstantFact(a, filing)
    )[0];
  }

  if (periodMode === 'ytd') {
    return [...pool].sort(
      (a, b) => durationDays(b) - durationDays(a)
    )[0];
  }

  const annual = filing?.form === '10-K';
  const targetDays = annual ? 365 : 91;

  return [...pool].sort((a, b) => {
    const aFrame = isUsefulFrame(a.frame, false) ? 1 : 0;
    const bFrame = isUsefulFrame(b.frame, false) ? 1 : 0;

    if (aFrame !== bFrame) return bFrame - aFrame;

    return (
      Math.abs(durationDays(a) - targetDays) -
      Math.abs(durationDays(b) - targetDays)
    );
  })[0];
}

function scoreInstantFact(item, filing) {
  let score = 0;

  if (isUsefulFrame(item.frame, true)) score += 10;
  if (filing?.reportDate && item.end === filing.reportDate) {
    score += 100;
  }

  return score;
}

function durationDays(item) {
  if (!item?.start || !item?.end) return 0;

  const start = new Date(`${item.start}T00:00:00Z`).getTime();
  const end = new Date(`${item.end}T00:00:00Z`).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 0;
  }

  return Math.round((end - start) / 86400000) + 1;
}

function findPreviousByDates(
  values,
  current,
  instantMetric,
  periodMode
) {
  const previousEnd = shiftYear(current.end, -1);
  const previousStart = current.start
    ? shiftYear(current.start, -1)
    : null;

  const candidates = values.filter((item) => {
    if (item === current || item.end !== previousEnd) {
      return false;
    }

    if (instantMetric || periodMode === 'instant') {
      return true;
    }

    if (previousStart && item.start === previousStart) {
      return true;
    }

    return (
      Math.abs(durationDays(item) - durationDays(current)) <= 7
    );
  });

  return candidates.sort((a, b) => {
    const aExact = previousStart && a.start === previousStart ? 1 : 0;
    const bExact = previousStart && b.start === previousStart ? 1 : 0;

    if (aExact !== bExact) return bExact - aExact;

    return (
      new Date(b.filed || b.end).getTime() -
      new Date(a.filed || a.end).getTime()
    );
  })[0] || null;
}

function shiftYear(value, amount) {
  if (!value) return null;

  const date = new Date(`${value}T00:00:00Z`);

  if (!Number.isFinite(date.getTime())) return null;

  date.setUTCFullYear(date.getUTCFullYear() + amount);
  return date.toISOString().slice(0, 10);
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

  const matches = values.filter(
    (item) =>
      item !== current &&
      String(item.frame || '') === targetFrame
  );

  if (!matches.length) return null;

  const targetStart = current.start
    ? shiftYear(current.start, -1)
    : null;

  const targetEnd = shiftYear(
    current.end,
    -1
  );

  if (instantMetric) {
    return [...matches].sort((a, b) => {
      const aExact =
        targetEnd && a.end === targetEnd ? 1 : 0;

      const bExact =
        targetEnd && b.end === targetEnd ? 1 : 0;

      if (aExact !== bExact) {
        return bExact - aExact;
      }

      return (
        new Date(b.filed || b.end).getTime() -
        new Date(a.filed || a.end).getTime()
      );
    })[0] || null;
  }

  const currentDuration =
    durationDays(current);

  const durationMatches = matches.filter(
    (item) => {
      const candidateDuration =
        durationDays(item);

      return (
        currentDuration > 0 &&
        candidateDuration > 0 &&
        Math.abs(
          currentDuration -
          candidateDuration
        ) <= 10
      );
    }
  );

  return [...durationMatches].sort((a, b) => {
    const aExactDates =
      targetStart &&
      targetEnd &&
      a.start === targetStart &&
      a.end === targetEnd
        ? 1
        : 0;

    const bExactDates =
      targetStart &&
      targetEnd &&
      b.start === targetStart &&
      b.end === targetEnd
        ? 1
        : 0;

    if (aExactDates !== bExactDates) {
      return bExactDates - aExactDates;
    }

    const aSameForm =
      a.form === current.form ? 1 : 0;

    const bSameForm =
      b.form === current.form ? 1 : 0;

    if (aSameForm !== bSameForm) {
      return bSameForm - aSameForm;
    }

    const aDifference = Math.abs(
      durationDays(a) - currentDuration
    );

    const bDifference = Math.abs(
      durationDays(b) - currentDuration
    );

    if (aDifference !== bDifference) {
      return aDifference - bDifference;
    }

    return (
      new Date(b.filed || b.end).getTime() -
      new Date(a.filed || a.end).getTime()
    );
  })[0] || null;
}


function getLatestFiling(data) {
  const recent = data?.filings?.recent;

  const forms = recent?.form || [];
  const dates = recent?.filingDate || [];
  const reportDates = recent?.reportDate || [];
  const accessionNumbers = recent?.accessionNumber || [];

  for (let i = 0; i < forms.length; i++) {
    if (
      forms[i] === '10-Q' ||
      forms[i] === '10-K'
    ) {
      return {
        form: forms[i],
        date: dates[i],
        reportDate: reportDates[i] || null,
        accessionNumber: accessionNumbers[i] || null,
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
Kısa vadeli yatırımlar: ${money(
  metrics.shortTermInvestments?.current
)}
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
Kısa vadeli yatırımlar: ${money(
  metrics.shortTermInvestments?.previous
)}
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
