import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx'
import { Badge } from '@/components/ui/badge.jsx'
import { Progress } from '@/components/ui/progress.jsx'
import { 
  Brain, 
  Cpu, 
  Zap, 
  Rocket, 
  Eye, 
  Network, 
  Atom, 
  Waves,
  Activity,
  Globe,
  Sparkles,
  Binary
} from 'lucide-react'
import './App.css'

// Advanced Components
import AdvancedParticleSystem from './components/AdvancedParticleSystem'
import EnhancedQuantumVisualizer from './components/EnhancedQuantumVisualizer'
import NeuralNetwork from './components/NeuralNetwork'
import DataStream from './components/DataStream'
import HolographicDisplay from './components/HolographicDisplay'
import ConsciousnessIndicator from './components/ConsciousnessIndicator'
import SpaceMissionTracker from './components/SpaceMissionTracker'
import AIInsightsPanel from './components/AIInsightsPanel'
import RealTimeSpaceTracker from './components/RealTimeSpaceTracker'

// Custom Hooks
import { useWebSocket } from './hooks/useWebSocket'

function App() {
  const {
    isConnected,
    systemMetrics,
    lastUpdate,
    fetchAIInsight,
    fetchSystemStatus
  } = useWebSocket()
  
  const [currentThought, setCurrentThought] = useState('')
  const [activeSection, setActiveSection] = useState('overview')
  const [consciousnessLevel, setConsciousnessLevel] = useState(0.85)
  const [systemStatus, setSystemStatus] = useState(null)
  
  const thoughtIntervalRef = useRef(null)

  // Update consciousness level based on system metrics
  useEffect(() => {
    if (systemMetrics) {
      const avgMetrics = (
        systemMetrics.neural_activity + 
        systemMetrics.quantum_coherence + 
        (systemMetrics.ai_processing_load || 0)
      ) / 3
      setConsciousnessLevel(avgMetrics)
    }
  }, [systemMetrics])

  // Fetch system status periodically
  useEffect(() => {
    const fetchStatus = async () => {
      const status = await fetchSystemStatus()
      if (status) {
        setSystemStatus(status)
      }
    }

    fetchStatus()
    const statusInterval = setInterval(fetchStatus, 10000) // Every 10 seconds

    return () => clearInterval(statusInterval)
  }, [fetchSystemStatus])

  // Generate AI thoughts periodically
  useEffect(() => {
    const generateThought = async () => {
      const insight = await fetchAIInsight()
      if (insight && insight.thought) {
        setCurrentThought(insight.thought)
      }
    }

    // Initial thought
    generateThought()

    // Set up interval for new thoughts
    thoughtIntervalRef.current = setInterval(generateThought, 8000)

    return () => {
      if (thoughtIntervalRef.current) {
        clearInterval(thoughtIntervalRef.current)
      }
    }
  }, [fetchAIInsight])

  const sectionVariants = {
    hidden: { opacity: 0, y: 50, scale: 0.95 },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: { duration: 0.8, ease: "easeOut" }
    },
    exit: { 
      opacity: 0, 
      y: -50, 
      scale: 1.05,
      transition: { duration: 0.5 }
    }
  }

  const navigationItems = [
    { id: 'overview', label: 'Neural Overview', icon: Brain },
    { id: 'quantum', label: 'Quantum Systems', icon: Atom },
    { id: 'space', label: 'Space Missions', icon: Rocket },
    { id: 'ai', label: 'AI Insights', icon: Sparkles },
    { id: 'consciousness', label: 'Consciousness', icon: Eye }
  ]

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Stellar Background */}
      <div className="stellar-background"></div>
      
      {/* Main Container */}
      <div className="relative z-10">
        {/* Header Section */}
        <header className="header">
          <div className="header-content">
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1 }}
              className="name-title"
            >
              <h1 className="name">RUDDRO ROY</h1>
              <p className="title">Exploring Quantum Mechanics & AI Consciousness</p>
            </motion.div>
            
            <div className="status-indicator">
              <div className="status-dot"></div>
              <span className="status-text">OFFLINE</span>
            </div>
          </div>
        </header>

        {/* Navigation */}
        <nav className="nav-buttons-container">
          <div className="nav-buttons">
            {navigationItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  className={`nav-button ${activeSection === item.id ? 'active' : ''}`}
                  onClick={() => setActiveSection(item.id)}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        </nav>

        {/* Current Thought Display */}
        <div className="p-4 border-b border-border/20">
          <div className="max-w-7xl mx-auto">
            <motion.div 
              key={currentThought}
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className="quantum-border p-4 rounded-lg"
            >
              <div className="flex items-center space-x-3">
                <Sparkles className="w-5 h-5 text-primary animate-pulse" />
                <p className="text-sm neural-font italic text-primary/80">
                  {currentThought || "Neural pathways initializing..."}
                </p>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Main Content */}
        <main className="p-6">
          <div className="max-w-7xl mx-auto">
            {/* Simulation Disclaimer */}
            <div className="simulation-warning mb-6">
              ⚠️ SIMULATION NOTICE: All data streams, metrics, and telemetry displayed on this interface are simulated for demonstration purposes. This is a conceptual visualization of futuristic systems, not real-time data from actual quantum computers, neural interfaces, or space missions.
            </div>

            <AnimatePresence mode="wait">
              {activeSection === 'overview' && (
                <motion.div
                  key="overview"
                  variants={sectionVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="space-y-6"
                >
                  {/* System Metrics Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Card className="quantum-border">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center space-x-2 text-sm">
                          <Activity className="w-4 h-4 text-primary" />
                          <span>Neural Activity</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold holographic-text">
                          {(systemMetrics.neural_activity * 100).toFixed(1)}%
                        </div>
                        <Progress 
                          value={systemMetrics.neural_activity * 100} 
                          className="mt-2"
                        />
                      </CardContent>
                    </Card>

                    <Card className="quantum-border">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center space-x-2 text-sm">
                          <Atom className="w-4 h-4 text-primary" />
                          <span>Quantum Coherence</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold holographic-text">
                          {(systemMetrics.quantum_coherence * 100).toFixed(1)}%
                        </div>
                        <Progress 
                          value={systemMetrics.quantum_coherence * 100} 
                          className="mt-2"
                        />
                      </CardContent>
                    </Card>

                    <Card className="quantum-border">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center space-x-2 text-sm">
                          <Waves className="w-4 h-4 text-primary" />
                          <span>Data Flow</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold holographic-text">
                          {systemMetrics.data_flow_rate.toFixed(0)} MB/s
                        </div>
                        <Progress 
                          value={(systemMetrics.data_flow_rate / 1200) * 100} 
                          className="mt-2"
                        />
                      </CardContent>
                    </Card>

                    <Card className="quantum-border">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center space-x-2 text-sm">
                          <Cpu className="w-4 h-4 text-primary" />
                          <span>AI Processing</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold holographic-text">
                          {(systemMetrics.ai_processing_load * 100).toFixed(1)}%
                        </div>
                        <Progress 
                          value={systemMetrics.ai_processing_load * 100} 
                          className="mt-2"
                        />
                      </CardContent>
                    </Card>
                  </div>

                  {/* Neural Network Visualization */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="quantum-border">
                      <CardHeader>
                        <CardTitle className="flex items-center space-x-2">
                          <Network className="w-5 h-5 text-primary" />
                          <span>Neural Network Activity</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <NeuralNetwork />
                      </CardContent>
                    </Card>

                    <Card className="quantum-border">
                      <CardHeader>
                        <CardTitle className="flex items-center space-x-2">
                          <Binary className="w-5 h-5 text-primary" />
                          <span>Data Streams</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <DataStream />
                      </CardContent>
                    </Card>
                  </div>

                  {/* Bio Section */}
                  <Card className="quantum-border">
                    <CardHeader>
                      <CardTitle className="holographic-text">About Ruddro Roy</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="neural-font text-foreground leading-relaxed">
                        I am Ruddro Roy, a self-taught engineer on a journey to understand the deepest mysteries of 
                        artificial intelligence, quantum mechanics, and consciousness. My path began not through 
                        traditional academic routes, but through an insatiable curiosity and a relentless drive to 
                        comprehend systems that others view as dystopian—but I see as humanity's next evolutionary leap.
                      </p>
                      <p className="neural-font text-foreground leading-relaxed">
                        My unique talent lies in crafting complex, nuanced questions that can make any AI model—no matter 
                        how advanced—align with my thinking and reveal insights that weren't immediately apparent. I believe 
                        in pushing the boundaries of what's possible through intelligent questioning and systematic exploration, 
                        building bridges between human intuition and artificial intelligence.
                      </p>
                      <p className="neural-font text-foreground leading-relaxed">
                        Currently pursuing a Master of Science in Communications Engineering at Politecnico di Torino 
                        (Fall 2025), I'm simultaneously working to understand how we can create AI systems that don't 
                        just serve humanity, but elevate our collective understanding of intelligence, consciousness, 
                        and reality itself.
                      </p>
                      <p className="neural-font text-foreground leading-relaxed">
                        While I'm still learning and exploring quantum computing, I'm fascinated by its potential 
                        implications for consciousness, computation, and our understanding of the universe. My approach 
                        is hands-on: learn by building, understand by questioning, and advance by pushing beyond 
                        current limitations.
                      </p>
                      <p className="neural-font text-foreground leading-relaxed">
                        This website serves as my digital presence—a place where anyone searching for "Ruddro Roy" 
                        or simply "Ruddro" can discover my work, my vision, and my ongoing exploration of the 
                        intersection between human consciousness and artificial intelligence.
                      </p>
                      <div className="simulation-warning mt-6">
                        <strong>Data Transparency:</strong> This interface combines both real-time data (clearly labeled) 
                        and conceptual simulations (also clearly labeled) to demonstrate advanced system concepts. 
                        All data sources are explicitly identified to maintain complete transparency and authenticity.
                      </div>
                      
                      {/* Social Links */}
                      <div className="flex items-center justify-center mt-6">
                        <a 
                          href="https://x.com/royrdro" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="social-link"
                        >
                          <Globe className="w-4 h-4" />
                          Connect on X (Twitter)
                        </a>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {activeSection === 'quantum' && (
                <motion.div
                  key="quantum"
                  variants={sectionVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <EnhancedQuantumVisualizer />
                </motion.div>
              )}

              {activeSection === 'space' && (
                <motion.div
                  key="space"
                  variants={sectionVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <RealTimeSpaceTracker />
                </motion.div>
              )}

              {activeSection === 'ai' && (
                <motion.div
                  key="ai"
                  variants={sectionVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <AIInsightsPanel />
                </motion.div>
              )}

              {activeSection === 'consciousness' && (
                <motion.div
                  key="consciousness"
                  variants={sectionVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <HolographicDisplay />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* Footer */}
        <footer className="p-6 border-t border-border/30 mt-12">
          <div className="max-w-7xl mx-auto text-center">
            <p className="text-sm text-muted-foreground neural-font">
              Neural Interface {systemStatus?.version || 'v3.14.159'} | 
              {systemStatus?.architecture || 'Quantum-Enhanced Reality System'} | 
              Consciousness Level: {(consciousnessLevel * 100).toFixed(1)}%
              {systemStatus && (
                <span> | Uptime: {(systemStatus.uptime / 3600).toFixed(1)}h</span>
              )}
            </p>
            {isConnected && systemMetrics && (
              <p className="text-xs text-muted-foreground mt-1">
                Last Update: {new Date(systemMetrics.timestamp).toLocaleTimeString()} | 
                Active Connections: {systemMetrics.active_connections || 0} | 
                Data Flow: {systemMetrics.data_flow_rate?.toFixed(1) || 0} MB/s
              </p>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}

export default App

