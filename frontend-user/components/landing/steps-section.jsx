import { UserPlus, Wallet, LineChart, Download } from "lucide-react"

const steps = [
  {
    number: "01",
    icon: UserPlus,
    title: "Register Account",
    description: "Complete a secure online registration within minutes.",
  },
  {
    number: "02",
    icon: Wallet,
    title: "Fund Account",
    description: "Choose from multiple global payment solutions.",
  },
  {
    number: "03",
    icon: LineChart,
    title: "Execute Trades",
    description: "Access deep liquidity with competitive pricing.",
  },
  {
    number: "04",
    icon: Download,
    title: "Download Platform",
    description: "Trade anytime via desktop, web, or mobile.",
  },
]

export function StepsSection() {
  return (
    <section className="py-20 lg:py-28 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Get Started</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Get Started in 4 Simple Steps
          </h2>
        </div>

        {/* Steps Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <div key={index} className="relative">
              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-10 left-[60%] w-full h-[2px] bg-border" />
              )}
              
              <div className="relative z-10 flex flex-col items-center text-center">
                {/* Step Number & Icon */}
                <div className="relative mb-6">
                  <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center">
                    <step.icon className="w-8 h-8 text-primary" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-white">{step.number}</span>
                  </div>
                </div>
                
                <h3 className="text-lg font-semibold text-foreground mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
