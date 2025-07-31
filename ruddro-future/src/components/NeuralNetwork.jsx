import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

const NeuralNetwork = () => {
  const canvasRef = useRef(null)
  const animationRef = useRef(null)
  const [networkStats, setNetworkStats] = useState({
    totalNeurons: 0,
    activeConnections: 0,
    processingRate: 0
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    canvas.width = canvas.offsetWidth * 2
    canvas.height = canvas.offsetHeight * 2
    ctx.scale(2, 2)

    const width = canvas.width / 2
    const height = canvas.height / 2

    // Neural network structure
    const layers = [
      { neurons: 8, x: 50 },
      { neurons: 12, x: 150 },
      { neurons: 16, x: 250 },
      { neurons: 12, x: 350 },
      { neurons: 6, x: 450 }
    ]

    // Initialize neurons
    const neurons = []
    layers.forEach((layer, layerIndex) => {
      const neuronSpacing = height / (layer.neurons + 1)
      for (let i = 0; i < layer.neurons; i++) {
        neurons.push({
          x: layer.x,
          y: neuronSpacing * (i + 1),
          layer: layerIndex,
          activation: Math.random(),
          targetActivation: Math.random(),
          connections: [],
          pulsePhase: Math.random() * Math.PI * 2,
          size: 6 + Math.random() * 4
        })
      }
    })

    // Create connections between layers
    neurons.forEach((neuron, index) => {
      if (neuron.layer < layers.length - 1) {
        const nextLayerNeurons = neurons.filter(n => n.layer === neuron.layer + 1)
        nextLayerNeurons.forEach(targetNeuron => {
          if (Math.random() > 0.3) { // 70% connection probability
            neuron.connections.push({
              target: targetNeuron,
              weight: (Math.random() - 0.5) * 2,
              activity: 0,
              lastPulse: 0
            })
          }
        })
      }
    })

    let totalNeurons = neurons.length
    let activeConnections = neurons.reduce((sum, n) => sum + n.connections.length, 0)

    const animate = (timestamp) => {
      // Clear canvas with fade effect
      ctx.fillStyle = 'rgba(10, 10, 15, 0.1)'
      ctx.fillRect(0, 0, width, height)

      const time = timestamp * 0.001
      let processingRate = 0

      // Update neuron activations
      neurons.forEach(neuron => {
        // Smooth activation changes
        neuron.activation += (neuron.targetActivation - neuron.activation) * 0.05
        
        // Occasionally change target activation
        if (Math.random() < 0.01) {
          neuron.targetActivation = Math.random()
        }

        // Update pulse phase
        neuron.pulsePhase += 0.1 + neuron.activation * 0.2
        
        if (neuron.activation > 0.7) processingRate++
      })

      // Draw connections
      neurons.forEach(neuron => {
        neuron.connections.forEach(connection => {
          const target = connection.target
          const distance = Math.sqrt(
            Math.pow(target.x - neuron.x, 2) + Math.pow(target.y - neuron.y, 2)
          )

          // Update connection activity
          if (neuron.activation > 0.6 && Math.random() < 0.1) {
            connection.activity = 1
            connection.lastPulse = timestamp
          }

          // Decay activity
          connection.activity *= 0.95

          // Draw connection line
          const alpha = 0.1 + connection.activity * 0.4
          const weight = Math.abs(connection.weight)
          ctx.strokeStyle = connection.weight > 0 
            ? `rgba(0, 212, 255, ${alpha})` 
            : `rgba(139, 92, 246, ${alpha})`
          ctx.lineWidth = 0.5 + weight * 1.5
          ctx.beginPath()
          ctx.moveTo(neuron.x, neuron.y)
          ctx.lineTo(target.x, target.y)
          ctx.stroke()

          // Draw signal pulse
          if (connection.activity > 0.1) {
            const pulseProgress = Math.min(1, (timestamp - connection.lastPulse) / 500)
            const pulseX = neuron.x + (target.x - neuron.x) * pulseProgress
            const pulseY = neuron.y + (target.y - neuron.y) * pulseProgress

            ctx.fillStyle = connection.weight > 0 ? '#00d4ff' : '#8b5cf6'
            ctx.beginPath()
            ctx.arc(pulseX, pulseY, 2 + connection.activity * 3, 0, Math.PI * 2)
            ctx.fill()

            // Glow effect
            ctx.save()
            ctx.globalCompositeOperation = 'screen'
            const gradient = ctx.createRadialGradient(
              pulseX, pulseY, 0,
              pulseX, pulseY, 10
            )
            gradient.addColorStop(0, connection.weight > 0 ? '#00d4ff80' : '#8b5cf680')
            gradient.addColorStop(1, 'transparent')
            ctx.fillStyle = gradient
            ctx.beginPath()
            ctx.arc(pulseX, pulseY, 10, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
          }
        })
      })

      // Draw neurons
      neurons.forEach(neuron => {
        const pulseIntensity = 0.5 + 0.5 * Math.sin(neuron.pulsePhase)
        const glowSize = neuron.size + neuron.activation * 8 + pulseIntensity * 4

        // Neuron glow
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        const gradient = ctx.createRadialGradient(
          neuron.x, neuron.y, 0,
          neuron.x, neuron.y, glowSize
        )
        const alpha = (neuron.activation * 0.6 + 0.2) * pulseIntensity
        gradient.addColorStop(0, `rgba(0, 212, 255, ${alpha})`)
        gradient.addColorStop(0.7, `rgba(0, 212, 255, ${alpha * 0.3})`)
        gradient.addColorStop(1, 'transparent')
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(neuron.x, neuron.y, glowSize, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        // Neuron core
        ctx.fillStyle = `rgba(0, 212, 255, ${0.8 + neuron.activation * 0.2})`
        ctx.beginPath()
        ctx.arc(neuron.x, neuron.y, neuron.size, 0, Math.PI * 2)
        ctx.fill()

        // Neuron border
        ctx.strokeStyle = '#e0e7ff'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(neuron.x, neuron.y, neuron.size, 0, Math.PI * 2)
        ctx.stroke()

        // Activity indicator
        if (neuron.activation > 0.8) {
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(neuron.x, neuron.y, 2, 0, Math.PI * 2)
          ctx.fill()
        }
      })

      // Draw layer labels
      ctx.fillStyle = '#94a3b8'
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      layers.forEach((layer, index) => {
        const labels = ['Input', 'Hidden 1', 'Hidden 2', 'Hidden 3', 'Output']
        ctx.fillText(labels[index] || `Layer ${index}`, layer.x, height - 10)
      })

      // Update stats
      setNetworkStats({
        totalNeurons,
        activeConnections,
        processingRate: Math.round(processingRate)
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  return (
    <div className="space-y-4">
      {/* Network Statistics */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/30">
          <div className="text-lg font-bold text-primary">{networkStats.totalNeurons}</div>
          <div className="text-xs text-muted-foreground">Neurons</div>
        </div>
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/30">
          <div className="text-lg font-bold text-primary">{networkStats.activeConnections}</div>
          <div className="text-xs text-muted-foreground">Connections</div>
        </div>
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/30">
          <div className="text-lg font-bold text-primary">{networkStats.processingRate}</div>
          <div className="text-xs text-muted-foreground">Active</div>
        </div>
      </div>

      {/* Neural Network Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full h-64 rounded-lg bg-background/50 border border-border/30"
        />
        
        {/* Overlay Information */}
        <div className="absolute top-2 left-2 text-xs text-muted-foreground">
          <div>Neural Activity Visualization</div>
          <div className="mt-1">
            <span className="inline-block w-2 h-2 bg-primary rounded-full mr-1"></span>
            Excitatory
            <span className="inline-block w-2 h-2 bg-purple-500 rounded-full mr-1 ml-3"></span>
            Inhibitory
          </div>
        </div>
      </div>

      {/* Network Architecture Info */}
      <div className="text-xs text-muted-foreground space-y-1">
        <div>Architecture: Deep Feedforward Network</div>
        <div>Activation Function: ReLU with Quantum Enhancement</div>
        <div>Learning Rate: Adaptive (0.001 - 0.1)</div>
        <div>Optimization: Quantum-Inspired Gradient Descent</div>
      </div>
    </div>
  )
}

export default NeuralNetwork

