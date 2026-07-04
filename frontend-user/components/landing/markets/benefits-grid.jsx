


export function BenefitsGrid({ title, description, benefits }) {
  return (
    <section className="relative py-16 lg:py-20 overflow-hidden">
      {/* Background Image */}
      <img src="/images/bg-benefits-fintech.jpg"
        alt=""
        
        className="object-cover" />
      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/85 via-black/80 to-black/85" />
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-2xl lg:text-3xl font-bold text-white mb-4">{title}</h2>
          {description && (
            <p className="text-white/70 max-w-2xl mx-auto">{description}</p>
          )}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {benefits.map((benefit, index) => (
            <div
              key={index}
              className="group p-6 lg:p-8 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl hover:bg-white/15 hover:border-primary/50 transition-all duration-300 hover:-translate-y-1"
            >
              <div className="w-14 h-14 bg-primary/20 rounded-xl flex items-center justify-center mb-5 group-hover:bg-primary/30 transition-colors">
                <benefit.icon className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-3">{benefit.title}</h3>
              <p className="text-white/70 text-sm leading-relaxed">{benefit.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
