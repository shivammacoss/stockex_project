import { useState, useMemo } from "react"
import { Button } from "@/components/landing/ui/button"
import { Input } from "@/components/landing/ui/input"
import { Search, ChevronUp, ChevronDown, LineChart, Plus } from "lucide-react"

export function InstrumentTable({ title, description, instruments, onLoadChart }) {
  const [searchQuery, setSearchQuery] = useState("")
  const [sortField, setSortField] = useState("symbol")
  const [sortDirection, setSortDirection] = useState("asc")
  const [watchlist, setWatchlist] = useState([])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  const filteredAndSortedInstruments = useMemo(() => {
    let result = instruments.filter(
      (instrument) =>
        instrument.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        instrument.fullName.toLowerCase().includes(searchQuery.toLowerCase())
    )

    result.sort((a, b) => {
      const aValue = a[sortField]
      const bValue = b[sortField]
      const comparison = aValue.localeCompare(bValue, undefined, { numeric: true })
      return sortDirection === "asc" ? comparison : -comparison
    })

    return result
  }, [instruments, searchQuery, sortField, sortDirection])

  const toggleWatchlist = (symbol) => {
    setWatchlist((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]
    )
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null
    return sortDirection === "asc" ? (
      <ChevronUp className="w-4 h-4 inline ml-1" />
    ) : (
      <ChevronDown className="w-4 h-4 inline ml-1" />
    )
  }

  return (
    <section className="relative py-16 lg:py-20 overflow-hidden">
      {/* Background Image */}
      <img src="/images/bg-chart-fintech.jpg"
        alt=""
        
        className="object-cover" />
      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-black/85 to-black/90" />
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h2 className="text-2xl lg:text-3xl font-bold text-white mb-4">{title}</h2>
          <p className="text-white/70 max-w-3xl">{description}</p>
        </div>

        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search instruments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th
                    className="px-4 py-4 text-left font-semibold text-foreground cursor-pointer hover:bg-muted/80 transition-colors"
                    onClick={() => handleSort("symbol")}
                  >
                    Symbol <SortIcon field="symbol" />
                  </th>
                  <th
                    className="px-4 py-4 text-left font-semibold text-foreground cursor-pointer hover:bg-muted/80 transition-colors"
                    onClick={() => handleSort("fullName")}
                  >
                    Full Name <SortIcon field="fullName" />
                  </th>
                  <th className="px-4 py-4 text-left font-semibold text-foreground">Contract Size</th>
                  <th className="px-4 py-4 text-left font-semibold text-foreground">Tick Size</th>
                  <th className="px-4 py-4 text-left font-semibold text-foreground">Min Size</th>
                  <th className="px-4 py-4 text-left font-semibold text-foreground">Min Spread</th>
                  <th className="px-4 py-4 text-left font-semibold text-foreground">Leverage</th>
                  <th className="px-4 py-4 text-left font-semibold text-foreground">Margin</th>
                  <th className="px-4 py-4 text-left font-semibold text-foreground">Swap Long</th>
                  <th className="px-4 py-4 text-left font-semibold text-foreground">Swap Short</th>
                  <th className="px-4 py-4 text-left font-semibold text-foreground">Hours</th>
                  <th className="px-4 py-4 text-center font-semibold text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedInstruments.map((instrument, index) => (
                  <tr
                    key={instrument.symbol}
                    className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${
                      index % 2 === 0 ? "bg-white" : "bg-muted/10"
                    }`}
                  >
                    <td className="px-4 py-4 font-medium text-primary">{instrument.symbol}</td>
                    <td className="px-4 py-4 text-foreground">{instrument.fullName}</td>
                    <td className="px-4 py-4 text-muted-foreground">{instrument.contractSize}</td>
                    <td className="px-4 py-4 text-muted-foreground">{instrument.tickSize}</td>
                    <td className="px-4 py-4 text-muted-foreground">{instrument.minSize}</td>
                    <td className="px-4 py-4 text-muted-foreground">{instrument.minSpread}</td>
                    <td className="px-4 py-4 text-muted-foreground">{instrument.leverage}</td>
                    <td className="px-4 py-4 text-muted-foreground">{instrument.margin}</td>
                    <td className="px-4 py-4 text-muted-foreground">{instrument.swapLong}</td>
                    <td className="px-4 py-4 text-muted-foreground">{instrument.swapShort}</td>
                    <td className="px-4 py-4 text-muted-foreground text-xs">{instrument.tradingHours}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleWatchlist(instrument.symbol)}
                          className={watchlist.includes(instrument.symbol) ? "text-primary" : "text-muted-foreground"}
                          title="Add to Watchlist"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                        {onLoadChart && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onLoadChart(instrument.symbol)}
                            className="text-muted-foreground hover:text-primary"
                            title="Load on Chart"
                          >
                            <LineChart className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
