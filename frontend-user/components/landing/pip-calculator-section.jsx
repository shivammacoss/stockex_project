
import { useState, useEffect } from "react"
import { Calculator, RefreshCw, TrendingUp } from "lucide-react"

const instruments = [
  { label: "EUR/USD", pipSize: 0.0001, contractSize: 100000 },
  { label: "GBP/USD", pipSize: 0.0001, contractSize: 100000 },
  { label: "USD/JPY", pipSize: 0.01,   contractSize: 100000 },
  { label: "USD/CHF", pipSize: 0.0001, contractSize: 100000 },
  { label: "AUD/USD", pipSize: 0.0001, contractSize: 100000 },
  { label: "USD/CAD", pipSize: 0.0001, contractSize: 100000 },
  { label: "NZD/USD", pipSize: 0.0001, contractSize: 100000 },
  { label: "EUR/GBP", pipSize: 0.0001, contractSize: 100000 },
  { label: "XAU/USD", pipSize: 0.01,   contractSize: 100 },
  { label: "XAG/USD", pipSize: 0.001,  contractSize: 5000 },
  { label: "US30",    pipSize: 1,       contractSize: 1 },
  { label: "NASDAQ",  pipSize: 0.25,    contractSize: 1 },
  { label: "BTC/USD", pipSize: 1,       contractSize: 1 },
]

const accountCurrencies = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "INR"]

// Mock exchange rates to convert pip value to account currency
const mockRates = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 149.5,
  AUD: 1.53,
  CAD: 1.36,
  CHF: 0.90,
  INR: 83.2,
}

export function PipCalculatorSection() {
  const [instrument, setInstrument]   = useState("EUR/USD")
  const [lotSize, setLotSize]         = useState("1")
  const [lots, setLots]               = useState("1")
  const [pips, setPips]               = useState("10")
  const [accountCcy, setAccountCcy]   = useState("USD")
  const [result, setResult]           = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const lotSizeOptions = [
    { label: "Standard (1.00)", value: "1", multiplier: 1 },
    { label: "Mini (0.10)",     value: "0.1", multiplier: 0.1 },
    { label: "Micro (0.01)",    value: "0.01", multiplier: 0.01 },
  ]

  const calculate = () => {
    const inst = instruments.find(i => i.label === instrument)
    if (!inst) return

    const lotsNum     = parseFloat(lots) || 0
    const pipsNum     = parseFloat(pips) || 0
    const lotMult     = parseFloat(lotSize) || 1
    const rate        = mockRates[accountCcy] || 1

    // Pip value in USD = (pipSize × contractSize × lots × lotMult)
    const pipValueUSD   = inst.pipSize * inst.contractSize * lotsNum * lotMult
    // Convert to account currency
    const pipValue      = pipValueUSD * rate
    const totalProfit   = pipValue * pipsNum

    setResult({ pipValue, totalProfit })
    setLastUpdated(new Date())
  }

  // Auto-calculate on any change and set initial timestamp on client
  useEffect(() => {
    calculate()
    if (!lastUpdated) setLastUpdated(new Date())
  }, [instrument, lotSize, lots, pips, accountCcy])

  const reset = () => {
    setInstrument("EUR/USD")
    setLotSize("1")
    setLots("1")
    setPips("10")
    setAccountCcy("USD")
  }

  const fmt = (n) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })

  return (
    <section className="py-20 lg:py-28 bg-foreground text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Trading Tools</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 text-balance">
            Live Pip Value Calculator
          </h2>
          <p className="text-lg text-white/80 max-w-2xl mx-auto">
            Instantly calculate your pip value and potential profit or loss across all instruments.
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-8 items-start">

          {/* Calculator Card */}
          <div className="lg:col-span-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl shadow-lg overflow-hidden">
            {/* Card Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/20 bg-white/5">
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-primary" />
                <span className="font-semibold text-white">Pip Calculator</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-white/60">
                  {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}
                </span>
                <button
                  onClick={reset}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-medium"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Row 1: Instrument + Account Currency */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-white">Instrument</label>
                  <select
                    value={instrument}
                    onChange={e => setInstrument(e.target.value)}
                    className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
                  >
                    {instruments.map(i => (
                      <option key={i.label} value={i.label}>{i.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-white">Account Currency</label>
                  <select
                    value={accountCcy}
                    onChange={e => setAccountCcy(e.target.value)}
                    className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
                  >
                    {accountCurrencies.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Lot Type + Number of Lots */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-white">Lot Type</label>
                  <select
                    value={lotSize}
                    onChange={e => setLotSize(e.target.value)}
                    className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
                  >
                    {lotSizeOptions.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-white">Number of Lots</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={lots}
                    onChange={e => setLots(e.target.value)}
                    className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
                  />
                </div>
              </div>

              {/* Row 3: Number of Pips */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-white">Number of Pips</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={pips}
                    onChange={e => setPips(e.target.value)}
                    className="flex-1 h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
                  />
                  {/* Quick pip buttons */}
                  <div className="flex gap-1.5">
                    {[10, 50, 100].map(p => (
                      <button
                        key={p}
                        onClick={() => setPips(String(p))}
                        className={`px-3 h-11 rounded-lg text-sm font-medium border transition-all ${
                          pips === String(p)
                            ? "bg-primary text-white border-primary"
                            : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-white/20" />

              {/* Results */}
              {result && (
                <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 sm:gap-4">
                  <div className="bg-primary/20 border border-primary/40 rounded-xl p-3 sm:p-4">
                    <p className="text-xs text-white/60 mb-1 font-medium uppercase tracking-wide">Pip Value</p>
                    <p className="text-lg sm:text-2xl font-bold text-primary break-all">
                      {accountCcy} {fmt(result.pipValue)}
                    </p>
                    <p className="text-xs text-white/60 mt-1">per pip</p>
                  </div>
                  <div className="bg-green-500/20 border border-green-500/40 rounded-xl p-3 sm:p-4">
                    <p className="text-xs text-white/60 mb-1 font-medium uppercase tracking-wide">Total P&L</p>
                    <p className="text-lg sm:text-2xl font-bold text-green-400 break-all">
                      {accountCcy} {fmt(result.totalProfit)}
                    </p>
                    <p className="text-xs text-white/60 mt-1">for {pips} pips</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Info Panel */}
          <div className="lg:col-span-2 space-y-4">
            {/* How it works */}
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6 shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-white">How It Works</h3>
              </div>
              <div className="space-y-3 text-sm text-white/80">
                <div className="flex gap-3">
                  <span className="w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">1</span>
                  <p>Select your trading instrument and account base currency.</p>
                </div>
                <div className="flex gap-3">
                  <span className="w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">2</span>
                  <p>Choose your lot type (Standard, Mini, or Micro) and enter the number of lots.</p>
                </div>
                <div className="flex gap-3">
                  <span className="w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">3</span>
                  <p>Enter the number of pips — the result updates instantly.</p>
                </div>
              </div>
            </div>

            {/* Lot Size Reference */}
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6 shadow-lg">
              <h3 className="font-semibold text-white mb-4">Lot Size Reference</h3>
              <div className="space-y-2">
                {[
                  { type: "Standard",  size: "100,000 units", color: "bg-primary" },
                  { type: "Mini",      size: "10,000 units",  color: "bg-blue-500" },
                  { type: "Micro",     size: "1,000 units",   color: "bg-purple-500" },
                ].map(row => (
                  <div key={row.type} className="flex items-center justify-between py-2 border-b border-white/20 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${row.color}`} />
                      <span className="text-sm font-medium text-white">{row.type}</span>
                    </div>
                    <span className="text-sm text-white/60 font-mono">{row.size}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Disclaimer */}
            <p className="text-xs text-white/60 px-1 leading-relaxed">
              * Pip values are calculated using indicative exchange rates and are for informational purposes only. Actual values may vary based on live market conditions.
            </p>
          </div>

        </div>
      </div>
    </section>
  )
}
