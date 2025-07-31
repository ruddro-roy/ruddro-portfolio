import { useEffect, useRef } from 'react'

const ParticleField = () => {
  const canvasRef = useRef(null)
  const animationRef = useRef(null)
  const particlesRef = useRef([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const particles = particlesRef.current

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Particle class
    class Particle {
      constructor() {
        this.reset()
        this.y = Math.random() * canvas.height
        this.opacity = Math.random() * 0.5 + 0.2
      }

      reset() {
        this.x = Math.random() * canvas.width
        this.y = canvas.height + 10
        this.vx = (Math.random() - 0.5) * 0.5
        this.vy = -(Math.random() * 2 + 1)
        this.size = Math.random() * 2 + 1
        this.life = 1
        this.decay = Math.random() * 0.01 + 0.005
        this.color = Math.random() > 0.7 ? '#8b5cf6' : '#00d4ff'
        this.glowSize = Math.random() * 10 + 5
      }

      update() {
        this.x += this.vx
        this.y += this.vy
        this.life -= this.decay
        
        // Add some quantum uncertainty
        this.vx += (Math.random() - 0.5) * 0.01
        this.vy += (Math.random() - 0.5) * 0.01
        
        // Reset if particle is dead or off screen
        if (this.life <= 0 || this.y < -10 || this.x < -10 || this.x > canvas.width + 10) {
          this.reset()
        }
      }

      draw(ctx) {
        const alpha = this.life * this.opacity
        
        // Draw glow
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.beginPath()
        const gradient = ctx.createRadialGradient(
          this.x, this.y, 0,
          this.x, this.y, this.glowSize
        )
        gradient.addColorStop(0, `${this.color}${Math.floor(alpha * 255).toString(16).padStart(2, '0')}`)
        gradient.addColorStop(1, `${this.color}00`)
        ctx.fillStyle = gradient
        ctx.arc(this.x, this.y, this.glowSize, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        // Draw particle core
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.fillStyle = this.color
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }

    // Initialize particles
    const particleCount = Math.min(150, Math.floor(canvas.width * canvas.height / 10000))
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle())
    }

    // Neural connections
    const drawConnections = () => {
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const distance = Math.sqrt(dx * dx + dy * dy)
          
          if (distance < 100) {
            const alpha = (1 - distance / 100) * 0.1
            ctx.strokeStyle = `rgba(0, 212, 255, ${alpha})`
            ctx.lineWidth = 0.5
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }
      ctx.restore()
    }

    // Animation loop
    const animate = () => {
      ctx.fillStyle = 'rgba(10, 10, 15, 0.1)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Update and draw particles
      particles.forEach(particle => {
        particle.update()
        particle.draw(ctx)
      })

      // Draw neural connections
      drawConnections()

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ background: 'transparent' }}
    />
  )
}

export default ParticleField

