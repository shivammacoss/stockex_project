import { Shield, Award, Sliders, CircleDollarSign, Layers, Headphones, Zap, Gift } from "lucide-react"

const advantages = [
  {
    icon: Shield,
    title: "Regulated Execution Environment",
    description: "Trade with confidence in a secure and compliant environment.",
  },
  {
    icon: Award,
    title: "Award-Winning Platforms",
    description: "Access industry-leading MT5 platform with advanced tools.",
  },
  {
    icon: Sliders,
    title: "Dynamic Leverage Control",
    description: "Flexible leverage up to 1:1000* based on your needs.",
  },
  {
    icon: CircleDollarSign,
    title: "No Deposit Fees",
    description: "Fund your account without any additional charges.",
  },
  {
    icon: Layers,
    title: "Multi-Asset Access",
    description: "Trade Forex, CFDs, Indices, Commodities, and more.",
  },
  {
    icon: Headphones,
    title: "24/5 Multilingual Support",
    description: "Get assistance whenever you need it in your language.",
  },
  {
    icon: Zap,
    title: "Same-Day Withdrawals",
    description: "Fast and reliable withdrawal processing.",
  },
  {
    icon: Gift,
    title: "Free Demo Accounts",
    description: "Practice trading risk-free with virtual funds.",
  },
]

export function AccountAdvantages() {
  return (
    <section className="py-16 lg:py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
            Advantages Across All Account Types
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Every VXNESS account comes with premium features and benefits
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {advantages.map((advantage, index) => (
            <div
              key={index}
              className="group bg-white border border-border rounded-xl p-6 transition-all duration-300 hover:shadow-lg hover:border-primary/30 hover:-translate-y-1"
            >
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <advantage.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{advantage.title}</h3>
              <p className="text-sm text-muted-foreground">{advantage.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
