import { Award, Trophy, Star, Medal } from "lucide-react"

const awards = [
  {
    year: "2020",
    title: "Fastest Growing Forex Broker",
    icon: Trophy,
  },
  {
    year: "2021",
    title: "Best Customer Service in Forex",
    icon: Star,
  },
  {
    year: "2022",
    title: "Best Forex Affiliate Program",
    icon: Award,
  },
  {
    year: "2022",
    title: "Best Broker Customer Satisfaction",
    icon: Medal,
  },
  {
    year: "2023",
    title: "Fastest Growing Forex Broker",
    icon: Trophy,
  },
  {
    year: "2023",
    title: "Best Broker Customer Satisfaction",
    icon: Medal,
  },
]

export function AwardsSection() {
  return (
    <section className="py-20 lg:py-28 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Recognition</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Industry Recognition & Awards
          </h2>
        </div>

        {/* Awards Grid */}
        <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {awards.map((award, index) => (
            <div
              key={index}
              className="bg-white rounded-2xl p-4 sm:p-6 flex items-center gap-3 sm:gap-4 border border-border hover:shadow-lg hover:border-primary/20 transition-all"
            >
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <award.icon className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
              </div>
              <div>
                <div className="text-xs sm:text-sm text-primary font-semibold mb-1">{award.year}</div>
                <div className="text-sm sm:text-base text-foreground font-medium">{award.title}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
