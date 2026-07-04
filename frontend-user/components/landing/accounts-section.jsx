import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/landing/ui/button';
import { Sparkles, Flame, ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { joinStockexSections } from '@/data/joinStockexAccounts';

function useScrollReveal(threshold = 0.12) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, inView };
}

function revealFromTop(inView, delayMs = 0) {
  return {
    opacity: inView ? 1 : 0,
    transform: inView ? 'translateY(0) scale(1)' : 'translateY(-2.5rem) scale(0.97)',
    transition: `opacity 0.75s ease-out ${delayMs}ms, transform 0.75s cubic-bezier(0.22, 1, 0.36, 1) ${delayMs}ms`,
  };
}

function AccountCard({ account }) {
  const Icon = account.icon;
  const detailUrl = `/accounts/${account.slug}`;

  return (
    <Link
      href={detailUrl}
      className={`group relative block bg-white rounded-2xl p-8 border-2 transition-all duration-300 hover:shadow-xl hover:-translate-y-2 cursor-pointer ${account.cardStyle} ${
        account.casino ? 'ring-2 ring-fuchsia-400/40 ring-offset-2 shadow-lg shadow-fuchsia-200/50' : ''
      }`}
    >
      {account.featured && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="bg-yellow-accent text-deep-blue text-xs font-bold px-4 py-1.5 rounded-full">
            POPULAR
          </span>
        </div>
      )}

      {account.casino && (
        <>
          <div className="absolute -top-4 right-4">
            <span className="inline-flex items-center gap-1 bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg animate-pulse">
              <Flame className="w-3 h-3" /> HOT
            </span>
          </div>
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-fuchsia-500/5 via-purple-500/5 to-pink-500/10 pointer-events-none" />
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-fuchsia-400 via-purple-400 to-pink-400 opacity-0 group-hover:opacity-100 transition-opacity -z-10 blur-sm" />
        </>
      )}

      <div
        className={`relative w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ${
          account.casino
            ? 'bg-gradient-to-br from-fuchsia-500 to-pink-500 shadow-lg shadow-fuchsia-400/40'
            : 'bg-primary/10'
        }`}
      >
        <Icon className={`w-8 h-8 ${account.casino ? 'text-white' : 'text-primary'}`} />
        {account.casino && (
          <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-yellow-400 animate-pulse" />
        )}
      </div>

      <h3
        className={`relative text-xl font-bold mb-2 ${
          account.casino
            ? 'text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-700 via-purple-700 to-pink-700'
            : 'text-deep-blue'
        }`}
      >
        {account.title}
      </h3>
      <p className="relative text-muted-foreground mb-6">{account.description}</p>

      <div className="relative space-y-3 mb-8">
        {account.features.map((feature, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                account.casino ? 'bg-fuchsia-100' : 'bg-muted'
              }`}
            >
              <feature.icon
                className={`w-4 h-4 ${account.casino ? 'text-fuchsia-600' : 'text-primary'}`}
              />
            </div>
            <span className="text-sm text-foreground">{feature.text}</span>
          </div>
        ))}
      </div>

      <Button
        className={`w-full py-6 font-semibold pointer-events-none ${account.buttonStyle}`}
        tabIndex={-1}
      >
        {account.buttonText}
        <ArrowRight className="w-4 h-4 ml-2 opacity-70" />
      </Button>
    </Link>
  );
}

function BrokerBenefitCard({ account }) {
  const Icon = account.icon;
  const detailUrl = `/accounts/${account.slug}`;

  return (
    <Link
      href={detailUrl}
      className={`group relative block rounded-2xl border-2 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer overflow-hidden ${account.cardStyle}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#07162b] via-[#0a1f3b] to-[#0b2d52]" />
      <div className="absolute -top-20 -right-16 w-64 h-64 rounded-full bg-cyan-400/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-blue-500/15 blur-3xl pointer-events-none" />
      <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_15%_20%,rgba(59,130,246,0.35),transparent_38%),radial-gradient(circle_at_85%_75%,rgba(34,211,238,0.28),transparent_35%)] pointer-events-none" />

      <div className="relative p-8 lg:p-10">
        <div className="flex flex-col lg:flex-row lg:items-start gap-8">
          <div className="lg:max-w-sm shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
              <Icon className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-2xl font-bold text-deep-blue mb-2">{account.title}</h3>
            <p className="text-muted-foreground">{account.description}</p>
          </div>

          <div className="flex-1 grid sm:grid-cols-2 gap-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-primary mb-4">
                What you get
              </p>
              <div className="space-y-3">
                {account.features.map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <feature.icon className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-sm text-foreground leading-snug">{feature.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {account.benefitSources?.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-yellow-600 mb-4">
                  Where it comes from
                </p>
                <div className="space-y-3">
                  {account.benefitSources.map((src, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3"
                    >
                      <div className="text-sm font-semibold text-deep-blue">{src.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{src.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <Button
          className={`mt-8 w-full sm:w-auto px-8 py-6 font-semibold pointer-events-none ${account.buttonStyle}`}
          tabIndex={-1}
        >
          {account.buttonText}
          <ArrowRight className="w-4 h-4 ml-2 opacity-70" />
        </Button>
      </div>
    </Link>
  );
}

function ReferralBanner({ highlight }) {
  const Icon = highlight.icon;

  return (
    <div className="mt-8 rounded-2xl border border-dark-600 bg-gradient-to-br from-emerald-950/35 to-teal-950/20 p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-start gap-5">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center shrink-0">
          <Icon className="w-7 h-7 text-emerald-300" />
        </div>
        <div className="flex-1">
          <h4 className="text-lg font-bold text-emerald-200 mb-3">{highlight.title}</h4>
          <ul className="grid sm:grid-cols-2 gap-2">
            {highlight.points.map((point, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-gray-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function JoinSection({ section, isFirst }) {
  const { ref, inView } = useScrollReveal();

  return (
    <div
      ref={ref}
      className={isFirst ? '' : 'pt-16 lg:pt-20 border-t border-border/60'}
    >
      <div
        className="text-center mb-10 motion-reduce:!opacity-100 motion-reduce:!translate-y-0"
        style={revealFromTop(inView, 0)}
      >
        <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">
          {section.eyebrow}
        </p>
        <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-deep-blue mb-3 text-balance">
          {section.title}
        </h3>
        <p className="text-base sm:text-lg text-muted-foreground max-w-3xl mx-auto">
          {section.subtitle}
        </p>
      </div>

      {section.layout === 'broker' ? (
        section.accounts.map((account, index) => (
          <div
            key={account.id}
            className="motion-reduce:!opacity-100 motion-reduce:!translate-y-0"
            style={revealFromTop(inView, 120 + index * 100)}
          >
            <BrokerBenefitCard account={account} />
          </div>
        ))
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-8">
            {section.accounts.map((account, index) => (
              <div
                key={account.id}
                className="motion-reduce:!opacity-100 motion-reduce:!translate-y-0"
                style={revealFromTop(inView, 120 + index * 120)}
              >
                <AccountCard account={account} />
              </div>
            ))}
          </div>
          {section.referralHighlight && (
            <div
              className="motion-reduce:!opacity-100 motion-reduce:!translate-y-0"
              style={revealFromTop(inView, 360)}
            >
              <ReferralBanner highlight={section.referralHighlight} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function AccountsSection() {
  return (
    <section className="py-20 lg:py-28 bg-secondary/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="space-y-4">
          {joinStockexSections.map((section, idx) => (
            <JoinSection key={section.id} section={section} isFirst={idx === 0} />
          ))}
        </div>
      </div>
    </section>
  );
}
