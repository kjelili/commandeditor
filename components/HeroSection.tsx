'use client'

import { useEffect, useRef, useState } from 'react'

interface HeroSectionProps {
  hasFiles?: boolean
}

export default function HeroSection({ hasFiles }: HeroSectionProps) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const heroRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleMouse = (e: MouseEvent) => {
      if (!heroRef.current) return
      const rect = heroRef.current.getBoundingClientRect()
      setMousePos({
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      })
    }
    const el = heroRef.current
    el?.addEventListener('mousemove', handleMouse)
    return () => el?.removeEventListener('mousemove', handleMouse)
  }, [])

  const tools = [
    { name: 'Merge', icon: 'M', color: '#c49a2e' },
    { name: 'Split', icon: 'S', color: '#5e8050' },
    { name: 'Compress', icon: 'C', color: '#3d6e9e' },
    { name: 'Edit', icon: 'E', color: '#c04832' },
    { name: 'Convert', icon: 'Cv', color: '#8c7055' },
  ]

  return (
    <section
      ref={heroRef}
      className="relative overflow-hidden bg-hero min-h-[90vh] flex items-center"
      style={{
        backgroundImage: `
          radial-gradient(at ${25 + mousePos.x * 10}% ${30 + mousePos.y * 5}%, rgba(196,154,46,0.20) 0px, transparent 55%),
          radial-gradient(at ${75 - mousePos.x * 10}% ${70 - mousePos.y * 5}%, rgba(61,110,158,0.14) 0px, transparent 50%),
          radial-gradient(at 50% 50%, rgba(94,128,80,0.08) 0px, transparent 60%)
        `,
        backgroundColor: '#1e1510',
      }}
    >
      {/* Paper texture */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Decorative floating elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Large circle top right */}
        <div
          className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full border border-gold-400/10"
          style={{ transform: `translate(${mousePos.x * -15}px, ${mousePos.y * -10}px)` }}
        />
        <div
          className="absolute -top-16 -right-16 w-[380px] h-[380px] rounded-full border border-gold-400/6"
          style={{ transform: `translate(${mousePos.x * -8}px, ${mousePos.y * -5}px)` }}
        />

        {/* Bottom left accent */}
        <div
          className="absolute -bottom-48 -left-24 w-[400px] h-[400px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(94,128,80,0.12) 0%, transparent 70%)',
            transform: `translate(${mousePos.x * 12}px, ${mousePos.y * 8}px)`,
          }}
        />

        {/* Floating document mockups */}
        <FloatingDoc
          style={{
            top: '15%',
            right: '8%',
            transform: `translate(${mousePos.x * -20}px, ${mousePos.y * -12}px)`,
            animationDelay: '0s',
          }}
          lines={5}
          accent="#c49a2e"
        />
        <FloatingDoc
          style={{
            top: '55%',
            right: '3%',
            transform: `translate(${mousePos.x * -12}px, ${mousePos.y * -6}px)`,
            animationDelay: '2s',
          }}
          lines={3}
          accent="#3d6e9e"
        />
        <FloatingDoc
          style={{
            top: '25%',
            left: '4%',
            transform: `translate(${mousePos.x * 15}px, ${mousePos.y * 10}px)`,
            animationDelay: '1s',
          }}
          lines={4}
          accent="#5e8050"
        />
      </div>

      {/* Main content */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
        <div className="max-w-3xl">
          {/* Eyebrow */}
          <div className="flex items-center gap-3 mb-8 animate-in">
            <div className="flex items-center gap-2 bg-white/8 border border-white/12 rounded-full px-4 py-2">
              <div className="w-1.5 h-1.5 rounded-full bg-moss-400 animate-pulse-soft" />
              <span className="eyebrow text-white/70 text-xs">Voice-Controlled · Hands-Free · 100% Private</span>
            </div>
          </div>

          {/* Main headline */}
          <h1 className="display-xl text-white mb-6 animate-in delay-100">
            Document work,
            <br />
            <span className="text-gradient-gold italic">by voice.</span>
          </h1>

          {/* Sub-headline */}
          <p className="body-lg text-white/65 max-w-2xl mb-10 animate-in delay-200">
            The first voice-controlled PDF toolkit — 50+ hands-free commands and 50+ tools.
            Everything processes locally in your browser — your files never leave your device.
          </p>

          {/* Tool pills */}
          <div className="flex flex-wrap gap-2 mb-12 animate-in delay-300">
            {tools.map((tool) => (
              <div
                key={tool.name}
                className="flex items-center gap-2 bg-white/8 border border-white/12 rounded-full px-4 py-2 transition-all duration-200 hover:bg-white/12 cursor-default"
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: tool.color + '30', border: `1px solid ${tool.color}50` }}
                >
                  <span className="text-[9px] font-bold" style={{ color: tool.color }}>{tool.icon}</span>
                </div>
                <span className="text-white/80 text-sm font-medium">{tool.name}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-full px-4 py-2">
              <span className="text-white/40 text-sm">+ Voice Commands</span>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex flex-wrap items-center gap-4 animate-in delay-400">
            <a
              href="#workspace"
              className="inline-flex items-center gap-2 px-7 py-4 rounded-xl text-ink-950 font-semibold text-base transition-all duration-200 hover:shadow-glow-gold hover:-translate-y-0.5 active:translate-y-0"
              style={{ background: 'linear-gradient(135deg, #d4a843 0%, #c49a2e 100%)' }}
            >
              Open Workspace
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
            <a
              href="#features"
              className="inline-flex items-center gap-2 px-6 py-4 rounded-xl text-white/75 font-medium text-base border border-white/15 transition-all duration-200 hover:border-white/30 hover:text-white"
            >
              See features
            </a>
          </div>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, transparent, var(--color-paper))' }}
      />
    </section>
  )
}

function FloatingDoc({
  style,
  lines,
  accent,
}: {
  style: React.CSSProperties
  lines: number
  accent: string
}) {
  return (
    <div
      className="absolute hidden lg:block"
      style={{
        ...style,
        animation: 'float 6s ease-in-out infinite',
        transition: 'transform 0.3s ease-out',
      }}
    >
      <div
        className="w-28 rounded-lg p-3 border"
        style={{
          background: 'rgba(250,249,246,0.06)',
          borderColor: 'rgba(250,249,246,0.12)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {/* Top bar with accent */}
        <div className="flex items-center gap-1.5 mb-2.5">
          <div className="w-2 h-2 rounded-sm" style={{ background: accent + '90' }} />
          <div className="h-1.5 rounded-full flex-1" style={{ background: 'rgba(255,255,255,0.12)' }} />
        </div>
        {/* Lines */}
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-1.5 rounded-full mb-1.5"
            style={{
              background: 'rgba(255,255,255,0.10)',
              width: `${70 + Math.random() * 25}%`,
              opacity: 1 - i * 0.1,
            }}
          />
        ))}
      </div>
    </div>
  )
}
