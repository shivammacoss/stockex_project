import { useCallback, useEffect, useRef, useState } from "react"
import { Volume2, VolumeX } from "lucide-react"

const METRO_AUDIO_SRC = "/audio/metro-train-ambience.mp3"
const METRO_VOLUME = 0.42

export function HeroSection() {
  const videoRef = useRef(null)
  const audioRef = useRef(null)
  const [soundOn, setSoundOn] = useState(false)
  const [needsTap, setNeedsTap] = useState(true)

  const startMetroSound = useCallback(async () => {
    const audio = audioRef.current
    const video = videoRef.current
    if (!audio) return false

    audio.volume = METRO_VOLUME
    audio.loop = true

    try {
      if (video && !video.paused) {
        audio.currentTime = video.currentTime % (audio.duration || 1) || 0
      }
      await audio.play()
      setSoundOn(true)
      setNeedsTap(false)
      return true
    } catch {
      setNeedsTap(true)
      return false
    }
  }, [])

  const stopMetroSound = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    setSoundOn(false)
  }, [])

  const toggleSound = useCallback(async () => {
    if (soundOn) {
      stopMetroSound()
      return
    }
    await startMetroSound()
  }, [soundOn, startMetroSound, stopMetroSound])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onVideoPlay = () => {
      if (soundOn && audioRef.current?.paused) {
        audioRef.current.play().catch(() => setNeedsTap(true))
      }
    }

    video.addEventListener("play", onVideoPlay)
    return () => video.removeEventListener("play", onVideoPlay)
  }, [soundOn])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  const onHeroInteract = useCallback(() => {
    if (!soundOn && needsTap) void startMetroSound()
  }, [soundOn, needsTap, startMetroSound])

  return (
    <section
      className="relative min-h-screen flex items-center justify-center overflow-hidden cursor-default"
      onClick={onHeroInteract}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onHeroInteract()
      }}
      role="presentation"
    >
      <div className="absolute inset-0 z-0">
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
        >
          <source src="/video/stockexhomepagevideo.mp4" type="video/mp4" />
        </video>
      </div>

      {/* Metro / train ambience (video stays muted for autoplay policy) */}
      <audio ref={audioRef} src={METRO_AUDIO_SRC} preload="auto" loop />

      <div className="absolute bottom-6 right-6 z-20 flex flex-col items-end gap-2">
        {needsTap && !soundOn && (
          <span className="text-xs text-white/80 bg-black/50 backdrop-blur-sm px-3 py-1 rounded-full">
            Tap for metro train sound
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            void toggleSound()
          }}
          aria-label={soundOn ? "Mute metro train sound" : "Play metro train sound"}
          aria-pressed={soundOn}
          className="flex items-center justify-center w-11 h-11 rounded-full bg-black/55 backdrop-blur-md border border-white/20 text-white hover:bg-black/70 transition-colors shadow-lg"
        >
          {soundOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>
      </div>
    </section>
  )
}
