import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx'
import { Badge } from '@/components/ui/badge.jsx'
import { Progress } from '@/components/ui/progress.jsx'
import { Atom, Zap, Activity, Cpu } from 'lucide-react'

const QuantumVisualizer = () => {
  const [quantumState, setQuantumState] = useState({
    qubits: [],
    entanglement_pairs: 0,
    coherence_time: 0,
    fidelity: 0,
    error_rate: 0
  })
  
  const [activeQubit, setActiveQubit] = useState(null)
  const canvasRef = useRef(null)
  const animationRef = useRef(null)

  // Generate quantum state data
  useEffect(() => {
    const generateQuantumData = () => {
      const qubits = []
      const states = ['|0⟩', '|1⟩', '|+⟩', '|-⟩', '|i⟩', '|-i⟩']
      
      for (let i = 0; i < 64; i++) {
        qubits.push({
          id: i,
          state: states[Math.floor(Math.random() * states.length)],
          coherence_time: Math.random() * 150 + 50,
          fidelity: Math.random() * 0.049 + 0.95,
          phase: Math.random() * 2 * Math.PI,
          amplitude: Math.random() * 0.5 + 0.5,
          entangled_with: Math.random() > 0.7 ? 
            Array.from({length: Math.floor(Math.random() * 3)}, () => 
              Math.floor(Math.random() * 64)
            ).filter(id => id !== i) : []
        })
      }

      setQuantumState({
        qubits,
        entanglement_pairs: qubits.reduce((sum, q) => sum + q.entangled_with.length, 0),
        coherence_time: qubits.reduce((sum, q) => sum + q.coherence_time, 0) / qubits.length,
        fidelity: qubits.reduce((sum, q) => sum + q.fidelity, 0) / qubits.length,
        error_rate: Math.random() * 0.009 + 0.001
      })
    }

    generateQuantumData()
    const interval = setInterval(generateQuantumData, 2000)
    return () => clearInterval(interval)
  }, [])

  // Quantum circuit visualization
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    canvas.width = canvas.offsetWidth * 2
    canvas.height = canvas.offsetHeight * 2
    ctx.scale(2, 2)

    const animate = () => {
      ctx.fillStyle = '#0a0a0f'
      ctx.fillRect(0, 0, canvas.width / 2, canvas.height / 2)

      // Draw quantum circuit
      const qubits = quantumState.qubits.slice(0, 8) // Show first 8 qubits
      const qubitSpacing = (canvas.height / 2) / (qubits.length + 1)
      const time = Date.now() * 0.001

      qubits.forEach((qubit, index) => {
        const y = qubitSpacing * (index + 1)
        
        // Draw qubit line
        ctx.strokeStyle = '#334155'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(20, y)
        ctx.lineTo(canvas.width / 2 - 20, y)
        ctx.stroke()

        // Draw qubit state
        const stateX = 50 + Math.sin(time + qubit.phase) * 10
        ctx.fillStyle = '#00d4ff'
        ctx.beginPath()
        ctx.arc(stateX, y, 8, 0, Math.PI * 2)
        ctx.fill()

        // Draw quantum gates
        for (let gate = 0; gate < 5; gate++) {
          const gateX = 100 + gate * 60
          const gateSize = 20
          
          // Gate background
          ctx.fillStyle = 'rgba(139, 92, 246, 0.3)'
          ctx.fillRect(gateX - gateSize/2, y - gateSize/2, gateSize, gateSize)
          
          // Gate border
          ctx.strokeStyle = '#8b5cf6'
          ctx.lineWidth = 1
          ctx.strokeRect(gateX - gateSize/2, y - gateSize/2, gateSize, gateSize)
          
          // Gate label
          ctx.fillStyle = '#e0e7ff'
          ctx.font = '10px monospace'
          ctx.textAlign = 'center'
          const gates = ['H', 'X', 'Y', 'Z', 'T']
          ctx.fillText(gates[gate], gateX, y + 3)
        }

        // Draw entanglement connections
        qubit.entangled_with.forEach(targetId => {
          if (targetId < qubits.length) {
            const targetY = qubitSpacing * (targetId + 1)
            ctx.strokeStyle = `rgba(0, 212, 255, ${0.5 + 0.3 * Math.sin(time * 2)})`
            ctx.lineWidth = 2
            ctx.setLineDash([5, 5])
            ctx.beginPath()
            ctx.moveTo(canvas.width / 2 - 50, y)
            ctx.lineTo(canvas.width / 2 - 50, targetY)
            ctx.stroke()
            ctx.setLineDash([])
          }
        })

        // Qubit label
        ctx.fillStyle = '#94a3b8'
        ctx.font = '12px monospace'
        ctx.textAlign = 'left'
        ctx.fillText(`Q${index}`, 5, y + 4)
        ctx.fillText(qubit.state, canvas.width / 2 - 40, y + 4)
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [quantumState])

  const QubitCard = ({ qubit, index }) => (
    <motion.div
      key={qubit.id}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      className={`p-3 rounded-lg border cursor-pointer transition-all duration-300 ${
        activeQubit === qubit.id 
          ? 'border-primary bg-primary/10 quantum-glow' 
          : 'border-border/50 hover:border-primary/50'
      }`}
      onClick={() => setActiveQubit(activeQubit === qubit.id ? null : qubit.id)}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono text-muted-foreground">Q{qubit.id}</span>
        <Badge variant="outline" className="text-xs">
          {qubit.state}
        </Badge>
      </div>
      
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span>Fidelity</span>
          <span className="text-primary">{(qubit.fidelity * 100).toFixed(2)}%</span>
        </div>
        <Progress value={qubit.fidelity * 100} className="h-1" />
        
        <div className="flex justify-between text-xs">
          <span>Coherence</span>
          <span className="text-primary">{qubit.coherence_time.toFixed(1)}μs</span>
        </div>
        <Progress value={(qubit.coherence_time / 200) * 100} className="h-1" />
      </div>
      
      {qubit.entangled_with.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/30">
          <span className="text-xs text-muted-foreground">
            Entangled with: {qubit.entangled_with.join(', ')}
          </span>
        </div>
      )}
    </motion.div>
  )

  return (
    <div className="space-y-6">
      {/* Quantum System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="quantum-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center space-x-2 text-sm">
              <Atom className="w-4 h-4 text-primary" />
              <span>Qubit Count</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold holographic-text">
              {quantumState.qubits.length}
            </div>
            <p className="text-xs text-muted-foreground">Active qubits</p>
          </CardContent>
        </Card>

        <Card className="quantum-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center space-x-2 text-sm">
              <Zap className="w-4 h-4 text-primary" />
              <span>Entanglement</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold holographic-text">
              {quantumState.entanglement_pairs}
            </div>
            <p className="text-xs text-muted-foreground">Entangled pairs</p>
          </CardContent>
        </Card>

        <Card className="quantum-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center space-x-2 text-sm">
              <Activity className="w-4 h-4 text-primary" />
              <span>Coherence</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold holographic-text">
              {quantumState.coherence_time.toFixed(1)}μs
            </div>
            <p className="text-xs text-muted-foreground">Average time</p>
          </CardContent>
        </Card>

        <Card className="quantum-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center space-x-2 text-sm">
              <Cpu className="w-4 h-4 text-primary" />
              <span>Fidelity</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold holographic-text">
              {(quantumState.fidelity * 100).toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground">System accuracy</p>
          </CardContent>
        </Card>
      </div>

      {/* Quantum Circuit Visualization */}
      <Card className="quantum-border">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Atom className="w-5 h-5 text-primary" />
            <span>Quantum Circuit</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <canvas
            ref={canvasRef}
            className="w-full h-64 rounded-lg bg-background/50"
          />
        </CardContent>
      </Card>

      {/* Qubit Grid */}
      <Card className="quantum-border">
        <CardHeader>
          <CardTitle>Qubit States</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {quantumState.qubits.slice(0, 16).map((qubit, index) => (
              <QubitCard key={qubit.id} qubit={qubit} index={index} />
            ))}
          </div>
          
          {activeQubit !== null && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 rounded-lg border border-primary/30 bg-primary/5"
            >
              <h4 className="font-semibold mb-2">Qubit {activeQubit} Details</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">State:</span>
                  <span className="ml-2 font-mono text-primary">
                    {quantumState.qubits[activeQubit]?.state}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Phase:</span>
                  <span className="ml-2 font-mono text-primary">
                    {quantumState.qubits[activeQubit]?.phase.toFixed(3)} rad
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Amplitude:</span>
                  <span className="ml-2 font-mono text-primary">
                    {quantumState.qubits[activeQubit]?.amplitude.toFixed(3)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Error Rate:</span>
                  <span className="ml-2 font-mono text-primary">
                    {(quantumState.error_rate * 100).toFixed(3)}%
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default QuantumVisualizer

