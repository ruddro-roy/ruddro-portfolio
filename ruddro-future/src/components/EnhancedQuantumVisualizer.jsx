import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx'
import { Badge } from '@/components/ui/badge.jsx'
import { Progress } from '@/components/ui/progress.jsx'
import { 
  Atom, 
  Zap, 
  Brain,
  BookOpen,
  Lightbulb,
  Target,
  TrendingUp,
  Microscope
} from 'lucide-react'

const EnhancedQuantumVisualizer = () => {
  const [explorationProgress, setExplorationProgress] = useState({
    quantum_basics: 75,
    superposition: 60,
    entanglement: 45,
    quantum_computing: 35,
    consciousness_theories: 80
  })

  const [currentFocus, setCurrentFocus] = useState('Quantum-Classical Interface')
  const [learningGoals, setLearningGoals] = useState([
    'Understanding quantum superposition in computational contexts',
    'Exploring quantum entanglement implications for information processing',
    'Investigating quantum consciousness theories and their validity',
    'Building intuition for quantum mechanical principles',
    'Connecting quantum physics to artificial intelligence architectures'
  ])

  const [researchAreas, setResearchAreas] = useState([
    {
      name: 'Quantum Information Theory',
      status: 'exploring',
      progress: 40,
      description: 'Studying how quantum mechanics can enhance information processing'
    },
    {
      name: 'Quantum-AI Convergence',
      status: 'active',
      progress: 65,
      description: 'Investigating potential synergies between quantum computing and AI'
    },
    {
      name: 'Consciousness & Quantum Mechanics',
      status: 'researching',
      progress: 55,
      description: 'Exploring theories connecting quantum effects to consciousness'
    },
    {
      name: 'Quantum Error Correction',
      status: 'learning',
      progress: 25,
      description: 'Understanding how to maintain quantum coherence in practical systems'
    }
  ])

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFocus(prev => {
        const focuses = [
          'Quantum-Classical Interface',
          'Superposition Principles',
          'Entanglement Dynamics',
          'Quantum Information Processing',
          'Consciousness Theories'
        ]
        const currentIndex = focuses.indexOf(prev)
        return focuses[(currentIndex + 1) % focuses.length]
      })
    }, 4000)

    return () => clearInterval(interval)
  }, [])

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-400 border-green-500'
      case 'exploring': return 'bg-blue-500/20 text-blue-400 border-blue-500'
      case 'researching': return 'bg-purple-500/20 text-purple-400 border-purple-500'
      case 'learning': return 'bg-orange-500/20 text-orange-400 border-orange-500'
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center mb-6">
        <Badge className="bg-purple-500/20 text-purple-400 border-purple-500 mb-4">
          🔬 EXPLORATION IN PROGRESS
        </Badge>
        <h2 className="text-2xl font-bold holographic-text mb-2">
          Quantum Computing Exploration
        </h2>
        <p className="text-muted-foreground">
          My journey into quantum mechanics, computing, and consciousness theories
        </p>
      </div>

      {/* Current Focus */}
      <motion.div
        key={currentFocus}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="quantum-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-cyan-400" />
              Current Focus Area
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-2xl font-bold holographic-text mb-2">
                {currentFocus}
              </div>
              <p className="text-muted-foreground">
                Actively studying and building understanding through hands-on exploration
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Learning Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="quantum-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-400" />
              Learning Progress
              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500 text-xs">
                SELF-TAUGHT
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(explorationProgress).map(([area, progress]) => (
              <div key={area} className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium capitalize">
                    {area.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {progress}%
                  </span>
                </div>
                <Progress value={progress} className="progress-quantum" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="quantum-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-yellow-400" />
              Learning Goals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {learningGoals.map((goal, index) => (
                <div key={index} className="data-stream-item">
                  <div className="flex items-start gap-2">
                    <BookOpen className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                    <span className="text-sm">{goal}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Research Areas */}
      <Card className="quantum-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Microscope className="w-5 h-5 text-purple-400" />
            Active Research Areas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {researchAreas.map((area, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="data-stream-item"
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-primary">{area.name}</h4>
                  <Badge className={getStatusColor(area.status)}>
                    {area.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  {area.description}
                </p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Understanding Progress</span>
                    <span>{area.progress}%</span>
                  </div>
                  <Progress value={area.progress} className="progress-quantum h-2" />
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Exploration Philosophy */}
      <Card className="quantum-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-cyan-400" />
            Exploration Philosophy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="neural-font text-foreground leading-relaxed">
            My approach to quantum computing is rooted in curiosity and hands-on exploration. 
            Rather than claiming expertise I don't yet possess, I'm building understanding 
            through experimentation, questioning fundamental assumptions, and connecting 
            quantum principles to consciousness and AI architectures.
          </p>
          <p className="neural-font text-foreground leading-relaxed">
            I believe the most profound insights come from asking the right questions rather 
            than having all the answers. My goal is to develop an intuitive understanding 
            of quantum mechanics that can inform future AI and consciousness research.
          </p>
          <div className="simulation-warning">
            This section represents my ongoing learning journey in quantum computing. 
            The progress indicators reflect my current understanding and areas of active study, 
            not professional expertise or completed research.
          </div>
        </CardContent>
      </Card>

      {/* Data Sources */}
      <div className="text-center text-xs text-muted-foreground">
        <p>Learning progress tracked through self-assessment and practical exploration</p>
        <p>Research areas updated based on current studies and interests</p>
      </div>
    </div>
  )
}

export default EnhancedQuantumVisualizer

