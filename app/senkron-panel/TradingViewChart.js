'use client';

export default function TradingViewChart({
  symbol = 'NASDAQ:EOSE',
}) {
  const chartUrl =
    `https://s.tradingview.com/widgetembed/` +
    `?symbol=${encodeURIComponent(symbol)}` +
    `&interval=D` +
    `&theme=dark` +
    `&style=1` +
    `&timezone=Europe%2FIstanbul` +
    `&locale=tr` +
    `&hide_side_toolbar=0` +
    `&allow_symbol_change=1` +
    `&save_image=0` +
    `&withdateranges=1`;

  return (
    <iframe
      title={`${symbol} canlı grafiği`}
      src={chartUrl}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        display: 'block',
      }}
      allowFullScreen
    />
  );
}