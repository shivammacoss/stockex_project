import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/landing/ui/button"

export function TradingViewChart({ title, defaultSymbol, quickSymbols }) {
  const containerRef = useRef(null)
  const [currentSymbol, setCurrentSymbol] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("vxness_chart_symbol") || defaultSymbol
    }
    return defaultSymbol
  })

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("vxness_chart_symbol", currentSymbol)
    }
  }, [currentSymbol])

  useEffect(() => {
    if (!containerRef.current) return

    containerRef.current.innerHTML = ""

    const script = document.createElement("script")
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
    script.type = "text/javascript"
    script.async = true
    script.crossOrigin = "anonymous"
    
    const config = {
      autosize: false,
      width: "100%",
      height: "600",
      symbol: currentSymbol,
      interval: "D",
      timezone: "Etc/UTC",
      theme: "light",
      style: "1",
      locale: "en",
      allow_symbol_change: true,
      calendar: false,
      hide_side_toolbar: false,
      withdateranges: true,
      support_host: "https://www.tradingview.com",
    }
    
    script.innerHTML = JSON.stringify(config)

    containerRef.current.appendChild(script)

    // Add error handling
    script.onerror = () => {
      console.error('TradingView widget failed to load')
      containerRef.current.innerHTML = `
        <div class="flex items-center justify-center h-full bg-gray-100 rounded-lg">
          <div class="text-center p-4">
            <div class="text-gray-600 mb-2">Chart unavailable</div>
            <div class="text-sm text-gray-500">Please try refreshing the page</div>
          </div>
        </div>
      `
    }

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = ""
      }
    }
  }, [currentSymbol])

  const handleSymbolChange = (symbol) => {
    setCurrentSymbol(symbol)
  }

  return (
    <section className="relative py-16 lg:py-20 overflow-hidden">
      {/* Background Image */}
      <img src="/images/bg-chart-fintech.jpg"
        alt=""
        
        className="object-cover" />
      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/80 to-black/85" />
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h2 className="text-2xl lg:text-3xl font-bold text-white mb-4">{title}</h2>
          <div className="flex flex-wrap gap-2">
            {quickSymbols.map((item) => (
              <Button
                key={item.symbol}
                variant={currentSymbol === item.symbol ? "default" : "outline"}
                size="sm"
                onClick={() => handleSymbolChange(item.symbol)}
                className={currentSymbol === item.symbol ? "bg-primary text-white" : ""}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
          <div
            ref={containerRef}
            className="tradingview-widget-container"
            style={{ height: "600px", width: "100%" }}
          >
            <div style={{ height: "100%", width: "100%" }} />
          </div>
        </div>
      </div>
    </section>
  )
}
