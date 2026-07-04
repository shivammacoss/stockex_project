import { CircleDollarSign, Globe, Shield, Timer, Lock, Zap } from "lucide-react"

const benefits = [
  {
    icon: CircleDollarSign,
    title: "Zero Deposit Fees",
    description: "No charges on deposits",
  },
  {
    icon: Globe,
    title: "Multiple Currency Support",
    description: "USD, EUR, GBP and more",
  },
  {
    icon: Shield,
    title: "Secure Payment Gateways",
    description: "Encrypted transactions",
  },
  {
    icon: Timer,
    title: "Transparent Processing",
    description: "Clear timeframes",
  },
  {
    icon: Lock,
    title: "Segregated Funds",
    description: "Client fund protection",
  },
  {
    icon: Zap,
    title: "Fast Withdrawals",
    description: "Quick processing times",
  },
]

export function FundingBenefits() {
  return (
    <section className="py-16 lg:py-20 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
            Key Funding Benefits
          </h2>
          <p className="text-lg text-muted-foreground">
            Secure, fast, and transparent funding options
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {benefits.map((benefit, index) => (
            <div
              key={index}
              className="bg-white border border-border rounded-xl p-5 text-center transition-all duration-300 hover:shadow-md hover:border-primary/30"
            >
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <benefit.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground text-sm mb-1">{benefit.title}</h3>
              <p className="text-xs text-muted-foreground">{benefit.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
