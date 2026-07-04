"use client";

import { TrendingUp, TrendingDown } from "lucide-react";

// Static sample quotes — the original ticker streamed from Stockex's socket /
// zerodha feed. On this marketing page we show a representative scrolling
// marquee (same visual) without wiring an external realtime feed.
const TICKER_DATA = [
  { label: "RELIANCE", price: 1402.35, changePercent: 0.42 },
  { label: "TCS", price: 3890.1, changePercent: -0.18 },
  { label: "HDFCBANK", price: 1678.9, changePercent: 0.65 },
  { label: "INFY", price: 1560.25, changePercent: 0.3 },
  { label: "ICICIBANK", price: 1245.6, changePercent: -0.22 },
  { label: "NIFTY 50", price: 24277.85, changePercent: 0.42 },
  { label: "BANKNIFTY", price: 57924.3, changePercent: -0.18 },
  { label: "SENSEX", price: 79800.5, changePercent: 0.47 },
  { label: "GOLD", price: 71850.0, changePercent: 0.31 },
  { label: "CRUDE", price: 6420.0, changePercent: -0.55 },
  { label: "USDINR", price: 83.45, changePercent: 0.05 },
  { label: "TATAMOTORS", price: 985.4, changePercent: 0.72 },
];

function formatPrice(price) {
  return price.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function LiveTicker() {
  const displayItems = TICKER_DATA.map((q) => ({
    ...q,
    isUp: q.changePercent >= 0,
    hasData: true,
  }));

  const row = (item, index) => {
    const up = item.isUp;
    const priceColor = up ? "text-green-500" : "text-red-500";
    const sign = item.changePercent >= 0 ? "+" : "";
    return (
      <div
        key={`${item.label}-${index}`}
        className="flex items-center gap-3 px-6 py-2.5 border-r border-white/15 whitespace-nowrap"
      >
        <span className="font-semibold text-yellow-400 text-sm">{item.label}</span>
        <span className={`text-sm font-medium tabular-nums ${priceColor}`}>
          {formatPrice(item.price)}
        </span>
        <span className={`flex items-center gap-1 text-sm font-medium tabular-nums ${priceColor}`}>
          {up ? <TrendingUp className="w-3 h-3 shrink-0" /> : <TrendingDown className="w-3 h-3 shrink-0" />}
          {sign}
          {item.changePercent.toFixed(2)}%
        </span>
      </div>
    );
  };

  return (
    <div className="bg-black border-b border-white/10 overflow-hidden shadow-md">
      <div className="flex animate-ticker">
        {[...displayItems, ...displayItems].map((item, index) => row(item, index))}
      </div>
    </div>
  );
}
