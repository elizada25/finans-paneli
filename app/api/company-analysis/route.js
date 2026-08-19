import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

function round(value, digits = 2) {
  const number = Number(value);

  if (!Number.isFinite(number)) return null;

  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function average(values) {
  const usable = values.filter(Number.isFinite);

  if (!usable.length) return null;

  return (
    usable.reduce((total, value) => total + value, 0) /
    usable.length
  );
}

function percentChange(current, previous) {
  if (
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return null;
  }

  return ((current / previous) - 1) * 100;
}

function metricValue(metrics, name, field = 'current') {
  const value = Number(metrics?.[name]?.[field]);
  return Number.isFinite(value) ? value : null;
}

function growthValue(metrics, name) {
  const value = Number(metrics?.[name]?.yoyPercent);
  return Number.isFinite(value) ? value : null;
}

function growthPoints(growth, maximum) {
  if (!Number.isFinite(growth)) return null;

  if (growth >= 25) return maximum;
  if (growth >= 10) return maximum * 0.85;
  if (growth > 0) return maximum * 0.65;
  if (growth >= -10) return maximum * 0.35;

  return maximum * 0.1;
}

function buildFinancialView(financial) {
  const metrics = financial?.metrics || {};
  const checks = [];
  const positives = [];
  const risks = [];

  function addCheck({
    key,
    title,
    score,
    maximum,
    value,
    explanation,
  }) {
    if (!Number.isFinite(score)) return;

    checks.push({
      key,
      title,
      score: round(score),
      maximum,
      value,
      explanation,
    });
  }

  const revenueGrowth = growthValue(metrics, 'revenue');

  addCheck({
    key: 'revenue-growth',
    title: 'Gelir büyümesi',
    score: growthPoints(revenueGrowth, 20),
    maximum: 20,
    value: revenueGrowth,
    explanation:
      'Şirket satışlarının geçen yılın aynı dönemine göre değişimini gösterir.',
  });

  if (Number.isFinite(revenueGrowth)) {
    if (revenueGrowth > 10) {
      positives.push(
        `Gelir yıllık bazda %${round(revenueGrowth, 1)} arttı.`
      );
    } else if (revenueGrowth < 0) {
      risks.push(
        `Gelir yıllık bazda %${Math.abs(round(revenueGrowth, 1))} azaldı.`
      );
    }
  }

  const netIncome = metricValue(metrics, 'netIncome');
  const previousNetIncome = metricValue(
    metrics,
    'netIncome',
    'previous'
  );
  const netIncomeGrowth = growthValue(metrics, 'netIncome');

  let profitScore = null;

  if (Number.isFinite(netIncome)) {
    profitScore = netIncome > 0 ? 10 : 1;

    if (
      netIncome > 0 &&
      Number.isFinite(previousNetIncome) &&
      previousNetIncome <= 0
    ) {
      profitScore += 10;
      positives.push(
        'Şirket geçen yılki zarardan net kâra geçti.'
      );
    } else {
      const growthScore = growthPoints(
        netIncomeGrowth,
        10
      );

      profitScore += Number.isFinite(growthScore)
        ? growthScore
        : 0;
    }

    if (netIncome > 0) {
      positives.push('Son rapor döneminde net sonuç pozitif.');
    } else {
      risks.push('Son rapor döneminde şirket zarar açıkladı.');
    }
  }

  addCheck({
    key: 'profitability',
    title: 'Kârlılık görünümü',
    score: profitScore,
    maximum: 20,
    value: netIncomeGrowth,
    explanation:
      'Net kârın pozitif olup olmadığını ve yıllık değişimini birlikte değerlendirir.',
  });

  const operatingCashFlow = metricValue(
    metrics,
    'operatingCashFlow'
  );
  const cashFlowGrowth = growthValue(
    metrics,
    'operatingCashFlow'
  );

  let cashFlowScore = null;

  if (Number.isFinite(operatingCashFlow)) {
    cashFlowScore =
      operatingCashFlow > 0 ? 12 : 1;

    const growthScore = growthPoints(
      cashFlowGrowth,
      8
    );

    cashFlowScore += Number.isFinite(growthScore)
      ? growthScore
      : 0;

    if (operatingCashFlow > 0) {
      positives.push(
        'Şirket faaliyetlerinden pozitif nakit üretiyor.'
      );
    } else {
      risks.push(
        'Operasyonel nakit akışı negatif.'
      );
    }
  }

  addCheck({
    key: 'cash-flow',
    title: 'Nakit üretimi',
    score: cashFlowScore,
    maximum: 20,
    value: cashFlowGrowth,
    explanation:
      'Muhasebe kârının gerçek nakit üretimiyle desteklenip desteklenmediğini gösterir.',
  });

  const assets = metricValue(metrics, 'assets');
  const liabilities = metricValue(
    metrics,
    'liabilities'
  );

  const liabilityRatio =
    Number.isFinite(assets) &&
    assets > 0 &&
    Number.isFinite(liabilities)
      ? (liabilities / assets) * 100
      : null;

  let balanceScore = null;

  if (Number.isFinite(liabilityRatio)) {
    if (liabilityRatio <= 35) balanceScore = 20;
    else if (liabilityRatio <= 55) balanceScore = 16;
    else if (liabilityRatio <= 75) balanceScore = 9;
    else balanceScore = 3;

    if (liabilityRatio <= 55) {
      positives.push(
        `Yükümlülükler varlıkların %${round(liabilityRatio, 1)} seviyesinde.`
      );
    } else if (liabilityRatio > 75) {
      risks.push(
        `Yükümlülük/varlık oranı %${round(liabilityRatio, 1)} ile yüksek.`
      );
    }
  }

  addCheck({
    key: 'balance-sheet',
    title: 'Bilanço dayanıklılığı',
    score: balanceScore,
    maximum: 20,
    value: liabilityRatio,
    explanation:
      'Toplam yükümlülüklerin toplam varlıklara oranını inceler.',
  });

  const cash = metricValue(metrics, 'cash');
  const cashCoverage =
    Number.isFinite(cash) &&
    Number.isFinite(liabilities) &&
    liabilities > 0
      ? (cash / liabilities) * 100
      : null;

  let coverageScore = null;

  if (Number.isFinite(cashCoverage)) {
    if (cashCoverage >= 75) coverageScore = 10;
    else if (cashCoverage >= 40) coverageScore = 8;
    else if (cashCoverage >= 20) coverageScore = 5;
    else coverageScore = 2;

    if (cashCoverage >= 40) {
      positives.push(
        'Nakit seviyesi yükümlülüklere karşı güçlü bir tampon oluşturuyor.'
      );
    } else if (cashCoverage < 20) {
      risks.push(
        'Nakit tamponu toplam yükümlülüklere göre düşük.'
      );
    }
  }

  addCheck({
    key: 'cash-coverage',
    title: 'Nakit tamponu',
    score: coverageScore,
    maximum: 10,
    value: cashCoverage,
    explanation:
      'Nakit varlıkların toplam yükümlülüklerin ne kadarını karşıladığını gösterir.',
  });

  const epsGrowth = growthValue(metrics, 'eps');

  addCheck({
    key: 'eps-growth',
    title: 'Hisse başına kâr',
    score: growthPoints(epsGrowth, 10),
    maximum: 10,
    value: epsGrowth,
    explanation:
      'Şirket kârının hisse başına düşen bölümündeki yıllık değişimi gösterir.',
  });

  if (Number.isFinite(epsGrowth)) {
    if (epsGrowth > 10) {
      positives.push(
        `Hisse başına kâr yıllık bazda %${round(epsGrowth, 1)} arttı.`
      );
    } else if (epsGrowth < 0) {
      risks.push(
        'Hisse başına kâr geçen yılın aynı döneminin altında.'
      );
    }
  }

  const earned = checks.reduce(
    (total, check) => total + check.score,
    0
  );

  const available = checks.reduce(
    (total, check) => total + check.maximum,
    0
  );

  const score =
    available > 0
      ? round((earned / available) * 100)
      : null;

  const coverage = round(
    (available / 100) * 100
  );

  let label = 'Veri yetersiz';

  if (Number.isFinite(score)) {
    if (score >= 75) label = 'Güçlü mali görünüm';
    else if (score >= 60) label = 'Olumlu, izlenmeli';
    else if (score >= 45) label = 'Dengeli / karma';
    else label = 'Zayıf mali görünüm';
  }

  return {
    score,
    label,
    coverage,
    checks,
    positives: [...new Set(positives)].slice(0, 6),
    risks: [...new Set(risks)].slice(0, 6),
    valuationAvailable: false,
    note:
      'Bu puan yalnızca açıklanan mali verilerin kalitesini ölçer; hissenin ucuz veya pahalı olduğunu henüz ölçmez.',
  };
}

async function fetchMarketRows(symbol) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/` +
    `${encodeURIComponent(symbol)}` +
    `?range=1y&interval=1d&events=history`;

  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 Sky-Finans-Company-Analysis/1.0',
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(
      `Piyasa verisi alınamadı: ${response.status}`
    );
  }

  const result =
    (await response.json())?.chart?.result?.[0];

  if (!result) {
    throw new Error('Geçerli piyasa verisi bulunamadı.');
  }

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const adjusted =
    result.indicators?.adjclose?.[0]?.adjclose || [];

  return timestamps
    .map((timestamp, index) => ({
      date: new Date(Number(timestamp) * 1000)
        .toISOString()
        .slice(0, 10),
      close: Number(
        adjusted[index] ?? quote.close?.[index]
      ),
      volume: Number(quote.volume?.[index]),
    }))
    .filter(
      (row) =>
        Number.isFinite(row.close) &&
        row.close > 0
    );
}

function simpleAverage(rows, length) {
  if (rows.length < length) return null;

  return average(
    rows.slice(-length).map((row) => row.close)
  );
}

function calculateRsi(rows, length = 14) {
  if (rows.length <= length) return null;

  const sample = rows.slice(-(length + 1));
  let gains = 0;
  let losses = 0;

  for (let index = 1; index < sample.length; index += 1) {
    const change =
      sample[index].close -
      sample[index - 1].close;

    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  const averageGain = gains / length;
  const averageLoss = losses / length;

  if (averageLoss === 0) return 100;

  const relativeStrength =
    averageGain / averageLoss;

  return 100 - 100 / (1 + relativeStrength);
}

function calculateVolatility(rows) {
  const sample = rows.slice(-21);

  if (sample.length < 10) return null;

  const returns = [];

  for (let index = 1; index < sample.length; index += 1) {
    returns.push(
      sample[index].close /
      sample[index - 1].close -
      1
    );
  }

  const mean = average(returns);

  if (!Number.isFinite(mean)) return null;

  const variance = average(
    returns.map((value) => (value - mean) ** 2)
  );

  if (!Number.isFinite(variance)) return null;

  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

function buildTechnicalView(rows) {
  if (!rows.length) return null;

  const latest = rows[rows.length - 1];
  const price = latest.close;
  const sma20 = simpleAverage(rows, 20);
  const sma50 = simpleAverage(rows, 50);
  const sma200 = simpleAverage(rows, 200);
  const rsi14 = calculateRsi(rows);
  const volatility = calculateVolatility(rows);

  const return5 = rows.length >= 6
    ? percentChange(
        price,
        rows[rows.length - 6].close
      )
    : null;

  const return20 = rows.length >= 21
    ? percentChange(
        price,
        rows[rows.length - 21].close
      )
    : null;

  const return60 = rows.length >= 61
    ? percentChange(
        price,
        rows[rows.length - 61].close
      )
    : null;

  const recent20 = rows.slice(-20);
  const support20 = Math.min(
    ...recent20.map((row) => row.close)
  );
  const resistance20 = Math.max(
    ...recent20.map((row) => row.close)
  );

  const yearRows = rows.slice(-252);
  const yearLow = Math.min(
    ...yearRows.map((row) => row.close)
  );
  const yearHigh = Math.max(
    ...yearRows.map((row) => row.close)
  );

  const recentVolume = average(
    rows
      .slice(-5)
      .map((row) => row.volume)
      .filter(Number.isFinite)
  );

  const normalVolume = average(
    rows
      .slice(-25, -5)
      .map((row) => row.volume)
      .filter(Number.isFinite)
  );

  const volumeRatio =
    Number.isFinite(recentVolume) &&
    Number.isFinite(normalVolume) &&
    normalVolume > 0
      ? recentVolume / normalVolume
      : null;

  let score = 50;
  const positives = [];
  const risks = [];

  if (Number.isFinite(sma20)) {
    if (price > sma20) {
      score += 8;
      positives.push('Fiyat 20 günlük ortalamanın üzerinde.');
    } else {
      score -= 8;
      risks.push('Fiyat 20 günlük ortalamanın altında.');
    }
  }

  if (Number.isFinite(sma50)) {
    if (price > sma50) {
      score += 11;
      positives.push('Orta vadeli fiyat eğilimi pozitif.');
    } else {
      score -= 11;
      risks.push('Fiyat 50 günlük ortalamanın altında.');
    }
  }

  if (Number.isFinite(sma200)) {
    if (price > sma200) {
      score += 14;
      positives.push('Ana trend 200 günlük ortalamanın üzerinde.');
    } else {
      score -= 14;
      risks.push('Ana trend 200 günlük ortalamanın altında.');
    }
  }

  if (Number.isFinite(rsi14)) {
    if (rsi14 >= 50 && rsi14 <= 70) score += 7;
    else if (rsi14 > 75) {
      score -= 4;
      risks.push('RSI kısa vadede aşırı ısınmaya işaret ediyor.');
    } else if (rsi14 < 40) {
      score -= 5;
      risks.push('Momentum zayıf görünüyor.');
    }
  }

  if (Number.isFinite(return20)) {
    score += return20 > 0 ? 6 : -6;
  }

  if (
    Number.isFinite(volumeRatio) &&
    volumeRatio >= 1.15 &&
    Number.isFinite(return5) &&
    return5 > 0
  ) {
    score += 4;
    positives.push(
      'Yükseliş son günlerde artan hacimle destekleniyor.'
    );
  }

  score = round(clamp(score, 0, 100));

  let label = 'Zayıf teknik görünüm';

  if (score >= 70) {
    label = 'Olumlu teknik kurulum';
  } else if (score >= 55) {
    label = 'Teyit bekleniyor';
  }

  const scenario =
    score >= 70
      ? 'Trend olumlu; desteklerin korunması ve hacim teyidi görünümün devamı için izlenmeli.'
      : score >= 55
        ? 'Bazı göstergeler olumlu ancak güçlü bir yön teyidi henüz oluşmamış.'
        : 'Trend ve momentum göstergeleri yeni işlem açısından temkinli olmayı gerektiriyor.';

  return {
    score,
    label,
    scenario,
    asOf: latest.date,
    price: round(price),
    sma20: round(sma20),
    sma50: round(sma50),
    sma200: round(sma200),
    rsi14: round(rsi14),
    volumeRatio: round(volumeRatio),
    volatility: round(volatility),
    return5: round(return5),
    return20: round(return20),
    return60: round(return60),
    support20: round(support20),
    resistance20: round(resistance20),
    yearLow: round(yearLow),
    yearHigh: round(yearHigh),
    positives,
    risks,
    note:
      'Teknik puan geçmiş fiyat ve hacim verilerini özetler; gelecekteki fiyat hareketini garanti etmez.',
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const symbol = String(
      searchParams.get('symbol') || ''
    )
      .trim()
      .toUpperCase();

    if (!/^[A-Z0-9.-]{1,10}$/.test(symbol)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Geçerli bir NASDAQ/ABD hisse kodu girin.',
        },
        { status: 400 }
      );
    }

    const financialUrl = new URL(
      '/api/sky-financials-v2',
      request.url
    );

    financialUrl.searchParams.set(
      'symbol',
      symbol
    );

    const [financialResult, marketResult] =
      await Promise.allSettled([
        fetch(financialUrl, {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
          },
        }),
        fetchMarketRows(symbol),
      ]);

    if (
      financialResult.status !== 'fulfilled'
    ) {
      throw new Error(
        'Mali veriler alınamadı.'
      );
    }

    const financialResponse =
      financialResult.value;

    const financial =
      await financialResponse.json();

    if (
      !financialResponse.ok ||
      financial?.error
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            financial?.error ||
            'Şirketin mali verileri bulunamadı.',
        },
        { status: financialResponse.status || 500 }
      );
    }

    const marketRows =
      marketResult.status === 'fulfilled'
        ? marketResult.value
        : [];

    const technical =
      buildTechnicalView(marketRows);

    return NextResponse.json(
      {
        ok: true,
        version: 'company-analysis-v1',
        symbol,
        generatedAt: new Date().toISOString(),
        sources: {
          financial:
            'SEC EDGAR şirket bildirimleri',
          market:
            technical
              ? 'Günlük fiyat ve hacim verileri'
              : 'Piyasa verisi alınamadı',
        },
        filing: financial.filing || null,
        financialRaw: financial,
        longTerm: buildFinancialView(financial),
        technical,
        limitations: [
          'Değerleme çarpanları ilk sürüme henüz dahil değildir.',
          'Puanlar yatırım tavsiyesi değil, eğitim ve karar destek göstergesidir.',
          'Geçmiş fiyat hareketleri gelecekteki sonucu garanti etmez.',
        ],
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error(
      'Şirket Analiz Merkezi hatası:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          'Şirket analizi oluşturulamadı.',
      },
      { status: 500 }
    );
  }
}
