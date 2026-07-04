import { LogIn, CreditCard, DollarSign, CheckCircle, Wallet } from "lucide-react"

const steps = [
  {
    icon: LogIn,
    step: "1",
    title: "Login to Client Portal",
    description: "Access your secure client area with your credentials.",
  },
  {
    icon: CreditCard,
    step: "2",
    title: "Select Payment Method",
    description: "Choose from bank transfer, card, or e-wallet options.",
  },
  {
    icon: DollarSign,
    step: "3",
    title: "Enter Amount",
    description: "Specify the amount you wish to deposit.",
  },
  {
    icon: CheckCircle,
    step: "4",
    title: "Complete Transaction",
    description: "Confirm and process your payment securely.",
  },
  {
    icon: Wallet,
    step: "5",
    title: "Funds Reflected",
    description: "Your funds appear in your trading account.",
  },
]

export function FundingSteps() {
  return (
    <section className="py-16 lg:py-20 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
            How to Fund Your Account
          </h2>
          <p className="text-lg text-muted-foreground">
            Simple 5-step process to start trading
          </p>
        </div>

        <div className="relative">
          {/* Connection Line */}
          <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-0.5 bg-border -translate-y-1/2 z-0" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {steps.map((step, index) => (
              <div key={index} className="relative z-10 flex flex-col items-center text-center">
                <div className="relative mb-4">
                  <div className="w-16 h-16 bg-white border-2 border-primary rounded-full flex items-center justify-center shadow-lg">
                    <step.icon className="w-7 h-7 text-primary" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center text-sm font-bold">
                    {step.step}
                  </div>
                </div>
                <h3 className="font-semibold text-foreground mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
