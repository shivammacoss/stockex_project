
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/landing/ui/accordion"



export function FAQAccordion({ title = "Frequently Asked Questions", faqs }) {
  return (
    <section className="relative py-16 lg:py-20 overflow-hidden">
      {/* Background Image */}
      <img src="/images/bg-faq-fintech.jpg"
        alt=""
        
        className="object-cover" />
      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/80 to-black/85" />
      
      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl lg:text-3xl font-bold text-white mb-8 text-center">{title}</h2>
        <Accordion type="single" collapsible className="space-y-4">
          {faqs.map((faq, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-6 data-[state=open]:bg-white/15 transition-all"
            >
              <AccordionTrigger className="text-left font-semibold text-white hover:no-underline py-5">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-white/70 pb-5">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
