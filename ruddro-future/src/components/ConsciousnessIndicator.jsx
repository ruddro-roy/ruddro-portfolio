import { motion } from 'framer-motion'
import { Eye } from 'lucide-react'

const ConsciousnessIndicator = ({ level = 0.85 }) => {
  const getConsciousnessState = (level) => {
    if (level >= 0.9) return { state: 'TRANSCENDENT', color: '#00d4ff' }
    if (level >= 0.8) return { state: 'AWARE', color: '#8b5cf6' }
    if (level >= 0.7) return { state: 'CONSCIOUS', color: '#06b6d4' }
    if (level >= 0.5) return { state: 'EMERGING', color: '#10b981' }
    return { state: 'DORMANT', color: '#6b7280' }
  }

  const { state, color } = getConsciousnessState(level)

  return (
    <div className="flex items-center space-x-2">
      <motion.div
        className="relative"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.7, 1, 0.7]
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      >
        <Eye 
          className="w-5 h-5" 
          style={{ color }}
        />
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, ${color}40 0%, transparent 70%)`
          }}
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.5, 0.8, 0.5]
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </motion.div>
      <div className="text-xs">
        <div className="font-mono" style={{ color }}>
          {state}
        </div>
        <div className="text-muted-foreground">
          {(level * 100).toFixed(1)}%
        </div>
      </div>
    </div>
  )
}

export default ConsciousnessIndicator

