
export function WhatIsSection({ title, content }) {
  return (
    <section className="py-16 lg:py-20 bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-6">{title}</h2>
        <p className="text-muted-foreground text-lg leading-relaxed">{content}</p>
      </div>
    </section>
  )
}
