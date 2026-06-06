import { useEffect, useRef } from "react"

export default function GridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animationId: number
    let particles: Array<{
      x: number
      y: number
      vx: number
      vy: number
      size: number
      opacity: number
      phase: number
    }> = []

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    const initParticles = () => {
      particles = Array.from({ length: 28 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        size: Math.random() * 1.2 + 0.4,
        opacity: Math.random() * 0.18 + 0.03,
        phase: Math.random() * Math.PI * 2,
      }))
    }

    const drawGrid = () => {
      const spacing = 90
      ctx.strokeStyle = "rgba(255, 255, 255, 0.018)"
      ctx.lineWidth = 0.5

      for (let x = 0; x < canvas.width; x += spacing) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvas.height)
        ctx.stroke()
      }

      for (let y = 0; y < canvas.height; y += spacing) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
        ctx.stroke()
      }
    }

    const drawParticles = (time: number) => {
      particles.forEach((p) => {
        p.x += p.vx
        p.y += p.vy

        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0

        const pulse = Math.sin(time * 0.001 + p.phase) * 0.5 + 0.5
        const alpha = p.opacity * (0.4 + pulse * 0.6)

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
        ctx.fill()
      })
    }

    const drawGlowSpots = () => {
      const gradient1 = ctx.createRadialGradient(
        canvas.width * 0.25, canvas.height * 0.25, 0,
        canvas.width * 0.25, canvas.height * 0.25, canvas.width * 0.5
      )
      gradient1.addColorStop(0, "rgba(255, 255, 255, 0.018)")
      gradient1.addColorStop(1, "transparent")
      ctx.fillStyle = gradient1
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const gradient2 = ctx.createRadialGradient(
        canvas.width * 0.75, canvas.height * 0.7, 0,
        canvas.width * 0.75, canvas.height * 0.7, canvas.width * 0.45
      )
      gradient2.addColorStop(0, "rgba(255, 255, 255, 0.012)")
      gradient2.addColorStop(1, "transparent")
      ctx.fillStyle = gradient2
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    const animate = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      drawGlowSpots()
      drawGrid()
      drawParticles(time)
      animationId = requestAnimationFrame(animate)
    }

    resize()
    initParticles()
    animate(0)

    const onResize = () => {
      resize()
      initParticles()
    }
    window.addEventListener("resize", onResize)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener("resize", onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  )
}
