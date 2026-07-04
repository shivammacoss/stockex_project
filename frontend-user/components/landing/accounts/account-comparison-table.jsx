import { Check, X } from "lucide-react"

const features = [
  { name: "Min Deposit", standard: "$100", pro: "$500", raw: "$1,000", zero: "$1,000" },
  { name: "Commission", standard: "$0", pro: "Low", raw: "Yes", zero: "Yes" },
  { name: "Spread", standard: "Medium", pro: "Low", raw: "Raw", zero: "Zero" },
  { name: "Leverage", standard: "Up to 1:1000*", pro: "Up to 1:1000*", raw: "Up to 1:1000*", zero: "Up to 1:1000*" },
  { name: "Platform", standard: "MT5", pro: "MT5", raw: "MT5", zero: "MT5" },
  { name: "Priority Support", standard: false, pro: true, raw: true, zero: true },
  { name: "VIP Manager", standard: false, pro: false, raw: false, zero: true },
  { name: "Advanced Tools", standard: false, pro: true, raw: true, zero: true },
]

function CellValue({ value }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="w-5 h-5 text-primary mx-auto" />
    ) : (
      <X className="w-5 h-5 text-muted-foreground/50 mx-auto" />
    )
  }
  return <span>{value}</span>
}

export function AccountComparisonTable() {
  return (
    <section className="py-16 lg:py-20 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
            Account Comparison
          </h2>
          <p className="text-lg text-muted-foreground">
            Compare features across all account types
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left py-4 px-6 font-semibold text-foreground">Feature</th>
                  <th className="text-center py-4 px-6 font-semibold text-foreground">Standard</th>
                  <th className="text-center py-4 px-6 font-semibold text-foreground bg-primary/5 border-x border-primary/20">
                    Pro
                  </th>
                  <th className="text-center py-4 px-6 font-semibold text-foreground">RAW</th>
                  <th className="text-center py-4 px-6 font-semibold text-foreground">Zero Spread</th>
                </tr>
              </thead>
              <tbody>
                {features.map((feature, index) => (
                  <tr 
                    key={index} 
                    className={`border-b border-border last:border-b-0 transition-colors hover:bg-muted/30 ${
                      index % 2 === 0 ? "bg-white" : "bg-muted/10"
                    }`}
                  >
                    <td className="py-4 px-6 font-medium text-foreground">{feature.name}</td>
                    <td className="py-4 px-6 text-center text-muted-foreground">
                      <CellValue value={feature.standard} />
                    </td>
                    <td className="py-4 px-6 text-center text-foreground font-medium bg-primary/5 border-x border-primary/20">
                      <CellValue value={feature.pro} />
                    </td>
                    <td className="py-4 px-6 text-center text-muted-foreground">
                      <CellValue value={feature.raw} />
                    </td>
                    <td className="py-4 px-6 text-center text-muted-foreground">
                      <CellValue value={feature.zero} />
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
