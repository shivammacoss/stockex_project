import { Button } from "@/components/landing/ui/button"
import { TrendingUp, Users } from "lucide-react"

export function SocialTradingSection() {
  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Copy Trading</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-deep-blue mb-4 text-balance">
            Copy Trading Community
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Follow and copy successful traders. Learn from the best and grow your portfolio.
          </p>
        </div>

        {/* Trader Leaderboard Cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { name: "Rahul Sharma", profit: "+45.2%", followers: "8.5k", rank: 1, trades: 156 },
            { name: "Priya Mehta", profit: "+38.7%", followers: "6.2k", rank: 2, trades: 124 },
            { name: "Arjun Patel", profit: "+32.4%", followers: "4.8k", rank: 3, trades: 98 },
          ].map((trader, index) => (
            <div key={index} className="bg-white border-2 border-border rounded-2xl p-6 hover:border-primary/30 hover:shadow-xl transition-all duration-300">
              {/* Rank Badge */}
              <div className="flex items-center justify-between mb-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${
                  trader.rank === 1 ? "bg-yellow-500" : trader.rank === 2 ? "bg-gray-400" : "bg-amber-600"
                }`}>
                  #{trader.rank}
                </div>
                <div className="flex items-center gap-1 text-profit-green font-bold">
                  <TrendingUp className="w-5 h-5" />
                  {trader.profit}
                </div>
              </div>

              {/* Trader Info */}
              <div className="mb-4">
                <h3 className="text-xl font-bold text-deep-blue">{trader.name}</h3>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {trader.followers} followers
                  </span>
                  <span>{trader.trades} trades</span>
                </div>
              </div>

              {/* Copy Button */}
              <Button className="w-full bg-primary hover:bg-primary/90 text-white">
                Copy Trader
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
