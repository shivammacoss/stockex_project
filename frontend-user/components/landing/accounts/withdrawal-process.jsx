import { FileText, Search, ArrowRightLeft, Bell } from "lucide-react"

const steps = [
  {
    icon: FileText,
    title: "Submit Request",
    description: "Initiate withdrawal from your client area.",
  },
  {
    icon: Search,
    title: "Internal Review",
    description: "Compliance verification for security.",
  },
  {
    icon: ArrowRightLeft,
    title: "Funds Processed",
    description: "Transferred to your original payment method.",
  },
  {
    icon: Bell,
    title: "Confirmation Sent",
    description: "Receive notification upon completion.",
  },
]

export function WithdrawalProcess() {
  return (
    <section className="py-16 lg:py-20 bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
            Withdrawal Process
          </h2>
          <p className="text-lg text-muted-foreground">
            Same-day processing on eligible methods
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, index) => (
            <div
              key={index}
              className="relative bg-white border border-border rounded-xl p-6 text-center transition-all duration-300 hover:shadow-lg hover:border-primary/30"
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-sm font-bold">
                {index + 1}
              </div>
              <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <step.icon className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
