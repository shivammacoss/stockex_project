import { Shield, Monitor, LineChart } from "lucide-react"

export function PlatformBlurb() {
  return (
    <section className="py-12 lg:py-16 bg-foreground text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-white/90 text-center mb-8 max-w-4xl mx-auto leading-relaxed">
          Trade through regulated infrastructure with segregated client funds and institutional-grade custody. 
          VXNESS uses industry-standard trading platforms and live charts to deliver low-latency execution, 
          deep liquidity, and fully auditable pricing.
        </p>
        <div className="grid sm:grid-cols-3 gap-6">
          <div className="flex items-start gap-4 p-4 bg-white/5 rounded-xl">
            <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center shrink-0">
              <Monitor className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">MetaTrader 5</h3>
              <p className="text-white/70 text-sm">Industry-standard desktop, web and mobile execution for advanced charting and algorithmic strategies.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 p-4 bg-white/5 rounded-xl">
            <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center shrink-0">
              <LineChart className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">TradingView</h3>
              <p className="text-white/70 text-sm">Embedded live charts for market visualization and analysis.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 p-4 bg-white/5 rounded-xl">
            <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center shrink-0">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">Mauritius FSC</h3>
              <p className="text-white/70 text-sm">Example regulated execution environment & fund segregation model.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
