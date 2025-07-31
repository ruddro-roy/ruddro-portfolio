import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx'
import { Badge } from '@/components/ui/badge.jsx'
import { Button } from '@/components/ui/button.jsx'
import { Progress } from '@/components/ui/progress.jsx'
import { Brain, Sparkles, Zap, RefreshCw } from 'lucide-react'

const AIInsightsPanel = () => {
  const [currentInsight, setCurrentInsight] = useState(null)
  const [researchAreas, setResearchAreas] = useState([])
  const [predictions, setPredictions] = useState([])
  const [isGenerating, setIsGenerating] = useState(false)

  const insights = [
    {
      category: 'AI Evolution',
      insight: 'The next breakthrough in AI will come from understanding the mathematics of consciousness itself.',
      implications: ['Direct neural interfaces', 'Consciousness transfer', 'Digital immortality'],
      timeline: '2027-2030',
      confidence: 0.89
    },
    {
      category: 'Quantum Computing',
      insight: 'Quantum supremacy in practical applications will emerge through hybrid classical-quantum algorithms.',
      implications: ['Cryptography revolution', 'Drug discovery acceleration', 'Climate modeling precision'],
      timeline: '2025-2027',
      confidence: 0.76
    },
    {
      category: 'Space Technology',
      insight: 'Self-replicating AI systems will be essential for sustainable Mars colonization.',
      implications: ['Autonomous construction', 'Resource optimization', 'Ecosystem management'],
      timeline: '2028-2035',
      confidence: 0.82
    }
  ]

  useEffect(() => {
    const areas = [
      { name: 'Quantum-Enhanced AI', progress: 0.73, breakthrough: 0.89 },
      { name: 'Neural Interfaces', progress: 0.45, breakthrough: 0.67 },
      { name: 'Consciousness Modeling', progress: 0.31, breakthrough: 0.42 },
      { name: 'Spacetime Computation', progress: 0.18, breakthrough: 0.23 }
    ]

    const futurePredictions = [
      { year: 2026, prediction: 'Quantum-AI hybrid achieves protein folding breakthrough', confidence: 0.78 },
      { year: 2027, prediction: 'Neural interfaces enable thought-to-code programming', confidence: 0.65 },
      { year: 2028, prediction: 'AI systems exhibit emergent consciousness indicators', confidence: 0.52 },
      { year: 2030, prediction: 'Mars colony powered by AI-managed systems', confidence: 0.71 }
    ]

    setResearchAreas(areas)
    setPredictions(futurePredictions)
    setCurrentInsight(insights[0])
  }, [])

  const generateNewInsight = async () => {
    setIsGenerating(true)
    
    // Simulate AI generation delay
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    const randomInsight = insights[Math.floor(Math.random() * insights.length)]
    setCurrentInsight({
      ...randomInsight,
      confidence: Math.random() * 0.3 + 0.7,
      timestamp: new Date().toISOString()
    })
    
    setIsGenerating(false)
  }

  return (
    <div className="space-y-6">
      {/* Current AI Insight */}
      <Card className="quantum-border">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span className="holographic-text">AI-Generated Insight</span>
            </div>
            <Button
              onClick={generateNewInsight}
              disabled={isGenerating}
              size="sm"
              className="quantum-glow"
            >
              {isGenerating ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              Generate
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AnimatePresence mode="wait">
            {currentInsight && (
              <motion.div
                key={currentInsight.insight}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-primary">
                    {currentInsight.category}
                  </Badge>
                  <div className="text-sm text-muted-foreground">
                    Confidence: {(currentInsight.confidence * 100).toFixed(1)}%
                  </div>
                </div>

                <blockquote className="text-lg neural-font italic border-l-4 border-primary pl-4">
                  "{currentInsight.insight}"
                </blockquote>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold mb-2">Implications</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {currentInsight.implications.map((implication, index) => (
                        <li key={index} className="flex items-center space-x-2">
                          <div className="w-1 h-1 bg-primary rounded-full" />
                          <span>{implication}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Timeline</h4>
                    <div className="text-sm text-primary font-mono">
                      {currentInsight.timeline}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Research Areas */}
      <Card className="quantum-border">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Brain className="w-5 h-5 text-primary" />
            <span>Active Research Areas</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {researchAreas.map((area, index) => (
              <motion.div
                key={area.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="p-3 rounded-lg border border-border/30 bg-card/50"
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">{area.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {(area.breakthrough * 100).toFixed(0)}% breakthrough probability
                  </Badge>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Progress</span>
                    <span className="text-primary">{(area.progress * 100).toFixed(1)}%</span>
                  </div>
                  <Progress value={area.progress * 100} className="h-2" />
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Future Predictions */}
      <Card className="quantum-border">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Zap className="w-5 h-5 text-primary" />
            <span>Future Predictions</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {predictions.map((prediction, index) => (
              <motion.div
                key={prediction.year}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start space-x-3 p-3 rounded-lg border border-border/30 bg-card/30"
              >
                <div className="text-primary font-bold text-lg">
                  {prediction.year}
                </div>
                <div className="flex-1">
                  <p className="text-sm">{prediction.prediction}</p>
                  <div className="mt-1 flex items-center space-x-2">
                    <span className="text-xs text-muted-foreground">Confidence:</span>
                    <Progress 
                      value={prediction.confidence * 100} 
                      className="h-1 w-20"
                    />
                    <span className="text-xs text-primary">
                      {(prediction.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default AIInsightsPanel

