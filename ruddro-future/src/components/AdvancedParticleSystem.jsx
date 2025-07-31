import { useEffect, useRef } from 'react'

const AdvancedParticleSystem = () => {
  const canvasRef = useRef(null)
  const animationRef = useRef(null)
  const particlesRef = useRef([])
  const connectionsRef = useRef([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    try {
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const particles = particlesRef.current
      const connections = connectionsRef.current

      const resizeCanvas = () => {
        try {
          canvas.width = window.innerWidth
          canvas.height = window.innerHeight
        } catch (error) {
          console.warn('Canvas resize error:', error)
        }
      }
      
      resizeCanvas()
      window.addEventListener('resize', resizeCanvas)

      // Advanced Particle Class
      class QuantumParticle {
        constructor() {
          this.reset()
          this.y = Math.random() * (canvas.height || 800)
          this.opacity = Math.random() * 0.8 + 0.2
          this.type = Math.random() > 0.7 ? 'quantum' : 'neural'
          this.energy = Math.random()
          this.frequency = Math.random() * 0.02 + 0.01
          this.amplitude = Math.random() * 20 + 10
        }

        reset() {
          this.x = Math.random() * (canvas.width || 1200)
          this.y = (canvas.height || 800) + 20
          this.vx = (Math.random() - 0.5) * 1.5
          this.vy = -(Math.random() * 3 + 1)
          this.size = Math.random() * 3 + 1
          this.life = 1
          this.decay = Math.random() * 0.008 + 0.002
          this.phase = Math.random() * Math.PI * 2
          this.pulseSpeed = Math.random() * 0.05 + 0.02
          this.trail = []
          this.maxTrailLength = Math.floor(Math.random() * 10) + 5
        }

        update(time) {
          try {
            // Quantum uncertainty principle simulation
            this.vx += (Math.random() - 0.5) * 0.02
            this.vy += (Math.random() - 0.5) * 0.02
            
            // Wave function behavior
            this.x += this.vx + Math.sin(time * this.frequency + this.phase) * this.amplitude * 0.01
            this.y += this.vy
            
            // Energy fluctuation
            this.energy = 0.5 + 0.5 * Math.sin(time * this.pulseSpeed + this.phase)
            
            // Update trail
            this.trail.push({ x: this.x, y: this.y, life: 1 })
            if (this.trail.length > this.maxTrailLength) {
              this.trail.shift()
            }
            
            // Decay trail
            this.trail.forEach(point => {
              point.life *= 0.95
            })
            
            this.life -= this.decay
            this.phase += this.pulseSpeed
            
            const canvasWidth = canvas.width || 1200
            const canvasHeight = canvas.height || 800
            
            if (this.life <= 0 || this.y < -20 || this.x < -20 || this.x > canvasWidth + 20) {
              this.reset()
            }
          } catch (error) {
            console.warn('Particle update error:', error)
            this.reset()
          }
        }

        draw(ctx, time) {
          try {
            const alpha = this.life * this.opacity * this.energy
            
            // Draw trail
            this.trail.forEach((point, index) => {
              if (point.life > 0.1) {
                const trailAlpha = alpha * point.life * (index / this.trail.length)
                const trailSize = this.size * point.life * 0.5
                
                ctx.save()
                ctx.globalAlpha = trailAlpha
                ctx.fillStyle = this.type === 'quantum' ? '#8b5cf6' : '#00d4ff'
                ctx.beginPath()
                ctx.arc(point.x, point.y, trailSize, 0, Math.PI * 2)
                ctx.fill()
                ctx.restore()
              }
            })
            
            // Quantum interference pattern
            if (this.type === 'quantum') {
              ctx.save()
              ctx.globalCompositeOperation = 'screen'
              const interferenceRadius = this.size * 3 + this.energy * 10
              const gradient = ctx.createRadialGradient(
                this.x, this.y, 0,
                this.x, this.y, interferenceRadius
              )
              gradient.addColorStop(0, `rgba(139, 92, 246, ${alpha * 0.6})`)
              gradient.addColorStop(0.5, `rgba(139, 92, 246, ${alpha * 0.3})`)
              gradient.addColorStop(1, 'transparent')
              ctx.fillStyle = gradient
              ctx.beginPath()
              ctx.arc(this.x, this.y, interferenceRadius, 0, Math.PI * 2)
              ctx.fill()
              ctx.restore()
            }
            
            // Main particle with energy pulsing
            const pulseSize = this.size + this.energy * 3
            ctx.save()
            ctx.globalAlpha = alpha
            ctx.fillStyle = this.type === 'quantum' ? '#8b5cf6' : '#00d4ff'
            ctx.shadowColor = this.type === 'quantum' ? '#8b5cf6' : '#00d4ff'
            ctx.shadowBlur = 10 + this.energy * 10
            ctx.beginPath()
            ctx.arc(this.x, this.y, pulseSize, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
            
            // Quantum state indicator
            if (this.type === 'quantum' && this.energy > 0.8) {
              ctx.save()
              ctx.globalAlpha = alpha * 0.8
              ctx.strokeStyle = '#ffffff'
              ctx.lineWidth = 1
              ctx.beginPath()
              ctx.arc(this.x, this.y, pulseSize + 5, 0, Math.PI * 2)
              ctx.stroke()
              ctx.restore()
            }
          } catch (error) {
            console.warn('Particle draw error:', error)
          }
        }
      }

      // Initialize particles with error handling
      try {
        const particleCount = Math.min(100, Math.floor((canvas.width || 1200) * (canvas.height || 800) / 12000))
        particles.length = 0 // Clear existing particles
        for (let i = 0; i < particleCount; i++) {
          particles.push(new QuantumParticle())
        }
      } catch (error) {
        console.warn('Particle initialization error:', error)
      }

      // Animation loop with error handling
      const animate = (timestamp) => {
        try {
          const canvasWidth = canvas.width || 1200
          const canvasHeight = canvas.height || 800
          
          // Fade effect instead of clear
          ctx.fillStyle = 'rgba(10, 10, 15, 0.05)'
          ctx.fillRect(0, 0, canvasWidth, canvasHeight)

          // Update and draw particles
          particles.forEach(particle => {
            try {
              particle.update(timestamp * 0.001)
              particle.draw(ctx, timestamp * 0.001)
            } catch (error) {
              console.warn('Particle animation error:', error)
            }
          })

          animationRef.current = requestAnimationFrame(animate)
        } catch (error) {
          console.warn('Animation loop error:', error)
        }
      }

      animate()

      return () => {
        window.removeEventListener('resize', resizeCanvas)
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current)
        }
      }
    } catch (error) {
      console.warn('AdvancedParticleSystem initialization error:', error)
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

export default AdvancedParticleSystem

