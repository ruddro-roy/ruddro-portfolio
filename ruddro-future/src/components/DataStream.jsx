import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Badge } from '@/components/ui/badge.jsx'
import { Progress } from '@/components/ui/progress.jsx'

const DataStream = () => {
  const [streams, setStreams] = useState([])
  const [totalBandwidth, setTotalBandwidth] = useState(0)

  useEffect(() => {
    const streamTypes = [
      { name: 'Neural Activity', type: 'neural', priority: 'critical' },
      { name: 'Quantum State', type: 'quantum', priority: 'high' },
      { name: 'Space Telemetry', type: 'space', priority: 'high' },
      { name: 'AI Training', type: 'ai', priority: 'normal' },
      { name: 'Consciousness', type: 'consciousness', priority: 'critical' },
      { name: 'Sensor Data', type: 'sensor', priority: 'normal' },
      { name: 'Network Traffic', type: 'network', priority: 'low' },
      { name: 'System Logs', type: 'logs', priority: 'low' }
    ]

    const generateStreams = () => {
      const newStreams = streamTypes.map((streamType, index) => ({
        id: index,
        ...streamType,
        dataRate: Math.random() * 100 + 20,
        latency: Math.random() * 5 + 0.1,
        packets: Math.floor(Math.random() * 10000) + 1000,
        status: Math.random() > 0.1 ? 'active' : 'standby',
        errorRate: Math.random() * 0.01,
        lastUpdate: Date.now()
      }))

      setStreams(newStreams)
      setTotalBandwidth(newStreams.reduce((sum, stream) => sum + stream.dataRate, 0))
    }

    generateStreams()
    const interval = setInterval(generateStreams, 2000)
    return () => clearInterval(interval)
  }, [])

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'critical': return 'text-red-400'
      case 'high': return 'text-orange-400'
      case 'normal': return 'text-blue-400'
      case 'low': return 'text-gray-400'
      default: return 'text-gray-400'
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-500'
      case 'standby': return 'bg-yellow-500'
      case 'error': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  return (
    <div className="space-y-4">
      {/* Stream Overview */}
      <div className="grid grid-cols-2 gap-4 text-center">
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
          <div className="text-xl font-bold text-primary">{streams.length}</div>
          <div className="text-xs text-muted-foreground">Active Streams</div>
        </div>
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
          <div className="text-xl font-bold text-primary">{totalBandwidth.toFixed(1)}</div>
          <div className="text-xs text-muted-foreground">MB/s Total</div>
        </div>
      </div>

      {/* Data Streams List */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        <AnimatePresence>
          {streams.map((stream) => (
            <motion.div
              key={stream.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="p-3 rounded-lg border border-border/30 bg-card/50 data-stream"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(stream.status)}`} />
                  <span className="text-sm font-medium">{stream.name}</span>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${getPriorityColor(stream.priority)}`}
                  >
                    {stream.priority}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {stream.dataRate.toFixed(1)} MB/s
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Latency:</span>
                  <span className="ml-1 text-primary">{stream.latency.toFixed(1)}ms</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Packets:</span>
                  <span className="ml-1 text-primary">{stream.packets.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Error:</span>
                  <span className="ml-1 text-primary">{(stream.errorRate * 100).toFixed(3)}%</span>
                </div>
              </div>

              <div className="mt-2">
                <Progress 
                  value={(stream.dataRate / 120) * 100} 
                  className="h-1"
                />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Stream Statistics */}
      <div className="text-xs text-muted-foreground space-y-1">
        <div>Protocol: Quantum-Enhanced TCP/IP</div>
        <div>Encryption: AES-256 + Quantum Key Distribution</div>
        <div>Compression: Neural Network Adaptive</div>
        <div>Error Correction: Reed-Solomon + AI Prediction</div>
      </div>
    </div>
  )
}

export default DataStream

