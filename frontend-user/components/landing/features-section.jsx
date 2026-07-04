import { Coins, Share2, Users2, Briefcase } from "lucide-react"

const features = [
  {
    icon: Coins,
    title: "Cash Rewards Program",
    color: "bg-yellow-50 text-yellow-600",
  },
  {
    icon: Share2,
    title: "Advanced Affiliate Infrastructure",
    color: "bg-blue-50 text-blue-600",
  },
  {
    icon: Users2,
    title: "Integrated Social Trading",
    color: "bg-purple-50 text-purple-600",
  },
  {
    icon: Briefcase,
    title: "Multi-Account Portfolio Access",
    color: "bg-green-50 text-green-600",
  },
]

export function FeaturesSection() {
  return (
    <section className="py-20 lg:py-28 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Infrastructure</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Built for Performance & Growth
          </h2>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-white rounded-2xl p-4 sm:p-6 text-center hover:shadow-lg transition-shadow border border-border"
            >
              <div className={`w-12 h-12 sm:w-16 sm:h-16 ${feature.color} rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4`}>
                <feature.icon className="w-6 h-6 sm:w-8 sm:h-8" />
              </div>
              <h3 className="text-sm sm:text-lg font-semibold text-foreground">{feature.title}</h3>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
