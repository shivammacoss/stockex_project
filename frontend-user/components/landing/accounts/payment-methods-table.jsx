import { CreditCard, Building2, Wallet, Bitcoin } from "lucide-react"

const paymentMethods = [
  {
    icon: Building2,
    method: "Bank Transfer",
    processingTime: "3–30 Minutes",
    currency: "USD, EUR, GBP",
    fees: "Free",
    available: true,
  },
  {
    icon: CreditCard,
    method: "Credit/Debit Card",
    processingTime: "3–30 Minutes",
    currency: "USD, EUR, GBP",
    fees: "Free",
    available: true,
  },
  {
    icon: Wallet,
    method: "E-Wallet",
    processingTime: "3–30 Minutes",
    currency: "USD, EUR",
    fees: "Free",
    available: true,
  },
  {
    icon: Bitcoin,
    method: "Crypto",
    processingTime: "Coming Soon",
    currency: "Coming Soon",
    fees: "Coming Soon",
    available: false,
  },
]

export function PaymentMethodsTable() {
  return (
    <section className="py-16 lg:py-20 bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
            Payment Methods
          </h2>
          <p className="text-lg text-muted-foreground">
            Choose from multiple secure payment options
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left py-4 px-6 font-semibold text-foreground">Method</th>
                  <th className="text-center py-4 px-6 font-semibold text-foreground">Processing Time</th>
                  <th className="text-center py-4 px-6 font-semibold text-foreground">Currency</th>
                  <th className="text-center py-4 px-6 font-semibold text-foreground">Fees</th>
                </tr>
              </thead>
              <tbody>
                {paymentMethods.map((method, index) => (
                  <tr 
                    key={index} 
                    className={`border-b border-border last:border-b-0 transition-colors hover:bg-muted/30 ${
                      !method.available ? "opacity-60" : ""
                    }`}
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          method.available ? "bg-primary/10" : "bg-muted"
                        }`}>
                          <method.icon className={`w-5 h-5 ${method.available ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <span className="font-medium text-foreground">{method.method}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-center text-muted-foreground">{method.processingTime}</td>
                    <td className="py-4 px-6 text-center text-muted-foreground">{method.currency}</td>
                    <td className="py-4 px-6 text-center">
                      <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
                        method.fees === "Free" 
                          ? "bg-primary/10 text-primary" 
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {method.fees}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-sm text-muted-foreground text-center mt-4">
          Note: Processing times may vary depending on verification and provider.
        </p>
      </div>
    </section>
  )
}
