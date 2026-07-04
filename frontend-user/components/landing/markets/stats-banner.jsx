
import { useEffect, useState, useRef } from "react"



function AnimatedCounter({ value, prefix = "", suffix = "" }) {
  const [count, setCount] = useState(0)
  const ref = useRef(null)
  const numericValue = parseFloat(value.replace(/[^0-9.]/g, ""))

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          let start = 0
          const duration = 2000
          const startTime = performance.now()

          const animate = (currentTime) => {
            const elapsed = currentTime - startTime
            const progress = Math.min(elapsed / duration, 1)
            const easeOut = 1 - Math.pow(1 - progress, 3)
            setCount(numericValue * easeOut)

            if (progress < 1) {
              requestAnimationFrame(animate)
            }
          }

          requestAnimationFrame(animate)
          observer.disconnect()
        }
      },
      { threshold: 0.5 }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [numericValue])

  const displayValue = value.includes("+") 
    ? `${prefix}${Math.round(count)}+${suffix}`
    : value.includes(":")
    ? value
    : `${prefix}${count.toFixed(value.includes(".") ? 2 : 0)}${suffix}`

  return (
    <div ref={ref} className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground">
      {displayValue}
    </div>
  )
}

export function StatsBanner({ stats }) {
  return (
    <section className="relative py-12 lg:py-16 overflow-hidden">
      {/* Background Image */}
      <img src="/images/bg-stats-fintech.jpg"
        alt=""
        
        className="object-cover" />
      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/80 to-black/85" />
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <div className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white">
                <AnimatedCounterInner value={stat.value} prefix={stat.prefix} suffix={stat.suffix} />
              </div>
              <p className="mt-2 text-sm text-white/70">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function AnimatedCounterInner({ value, prefix = "", suffix = "" }) {
  const [count, setCount] = useState(0)
  const ref = useRef(null)
  const numericValue = parseFloat(value.replace(/[^0-9.]/g, ""))

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          const duration = 2000
          const startTime = performance.now()

          const animate = (currentTime) => {
            const elapsed = currentTime - startTime
            const progress = Math.min(elapsed / duration, 1)
            const easeOut = 1 - Math.pow(1 - progress, 3)
            setCount(numericValue * easeOut)

            if (progress < 1) {
              requestAnimationFrame(animate)
            }
          }

          requestAnimationFrame(animate)
          observer.disconnect()
        }
      },
      { threshold: 0.5 }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [numericValue])

  const displayValue = value.includes("+") 
    ? `${prefix}${Math.round(count)}+${suffix}`
    : value.includes(":")
    ? value
    : `${prefix}${count.toFixed(value.includes(".") ? 2 : 0)}${suffix}`

  return <span ref={ref}>{displayValue}</span>
}
