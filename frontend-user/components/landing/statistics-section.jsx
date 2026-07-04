import { useEffect, useState, useRef } from "react"

const stats = [
  { value: 50000, suffix: "+", label: "Active Traders", prefix: "" },
  { value: 500, suffix: "Cr", label: "Monthly Volume", prefix: "" },
  { value: 20, suffix: "+", label: "Trading Instruments", prefix: "" },
]

function useCountUp(end, duration = 2000, startOnView = true) {
  const [count, setCount] = useState(0)
  const [hasStarted, setHasStarted] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!startOnView) {
      setHasStarted(true)
    }
  }, [startOnView])

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasStarted) {
          setHasStarted(true)
        }
      },
      { threshold: 0.5 }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [hasStarted])

  useEffect(() => {
    if (!hasStarted) return

    let startTime = null
    const animate = (currentTime) => {
      if (!startTime) startTime = currentTime
      const progress = Math.min((currentTime - startTime) / duration, 1)
      setCount(Math.floor(progress * end))
      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }
    requestAnimationFrame(animate)
  }, [hasStarted, end, duration])

  return { count, ref }
}

export function StatisticsSection() {
  return (
    <section className="py-16 lg:py-20 bg-deep-blue">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
          {stats.map((stat, index) => {
            const { count, ref } = useCountUp(stat.value)
            return (
              <div key={index} ref={ref} className="text-center">
                <div className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white mb-2">
                  {stat.prefix}{count.toLocaleString('en-IN')}{stat.suffix}
                </div>
                <div className="text-lg text-white/70">{stat.label}</div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
