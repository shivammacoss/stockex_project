
import { Button } from "@/components/landing/ui/button"
import { Percent, Users, Award, BarChart3, ArrowRight } from "lucide-react"
import { BecomePartnerDialog } from "@/components/landing/auth-dialogs"

const benefits = [
  {
    icon: Percent,
    title: "Referral Commissions",
    description: "Earn attractive commissions on every referral trade.",
  },
  {
    icon: Users,
    title: "Affiliate Program",
    description: "Join our affiliate network and grow your income.",
  },
  {
    icon: Award,
    title: "Performance Rewards",
    description: "Unlock bonuses based on your performance milestones.",
  },
  {
    icon: BarChart3,
    title: "Partner Dashboard",
    description: "Track your earnings and referrals in real-time.",
  },
]

export function PartnershipSection() {
  return (
    <section className="py-20 lg:py-28 bg-deep-blue text-white relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-yellow-accent uppercase tracking-wider mb-3">Partnership</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-balance">
            Partner with STOCKEX
          </h2>
          <p className="text-lg text-white/70 max-w-2xl mx-auto">
            Join our partnership program and unlock new revenue opportunities.
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-12">
          {benefits.map((benefit, index) => (
            <div
              key={index}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-4 sm:p-6 hover:bg-white/10 transition-colors"
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-yellow-accent/20 rounded-xl flex items-center justify-center mb-3 sm:mb-4">
                <benefit.icon className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-accent" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold mb-2">{benefit.title}</h3>
              <p className="text-xs sm:text-sm text-white/60">{benefit.description}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center">
          <BecomePartnerDialog
            trigger={
              <Button size="lg" className="bg-yellow-accent hover:bg-yellow-500 text-deep-blue font-semibold px-8">
                Become a Partner
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            }
          />
        </div>
      </div>

      {/* Background Decorations */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-royal-blue/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-yellow-accent/10 rounded-full blur-3xl" />
    </section>
  )
}
