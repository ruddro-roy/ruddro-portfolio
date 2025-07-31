import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx'
import { Badge } from '@/components/ui/badge.jsx'
import { Progress } from '@/components/ui/progress.jsx'
import { Rocket, Globe, Zap, Users } from 'lucide-react'

const SpaceMissionTracker = () => {
  const [missions, setMissions] = useState([])

  useEffect(() => {
    const missionData = [
      {
        id: 'MARS_ALPHA',
        name: 'Mars Colony Alpha',
        status: 'operational',
        distance: 225000000,
        crew: 12,
        aiSystems: 47,
        powerLevel: 0.92,
        health: 0.96
      },
      {
        id: 'LUNAR_ARTEMIS',
        name: 'Lunar Base Artemis',
        status: 'expanding',
        distance: 384400,
        crew: 8,
        aiSystems: 23,
        powerLevel: 0.88,
        health: 0.94
      },
      {
        id: 'ISS_QUANTUM',
        name: 'ISS Quantum Lab',
        status: 'research',
        distance: 408,
        crew: 6,
        aiSystems: 15,
        powerLevel: 0.95,
        health: 0.98
      }
    ]

    const updateMissions = () => {
      setMissions(missionData.map(mission => ({
        ...mission,
        powerLevel: Math.max(0.7, mission.powerLevel + (Math.random() - 0.5) * 0.05),
        health: Math.max(0.8, mission.health + (Math.random() - 0.5) * 0.03)
      })))
    }

    updateMissions()
    const interval = setInterval(updateMissions, 3000)
    return () => clearInterval(interval)
  }, [])

  const getStatusColor = (status) => {
    switch (status) {
      case 'operational': return 'bg-green-500'
      case 'expanding': return 'bg-blue-500'
      case 'research': return 'bg-purple-500'
      default: return 'bg-gray-500'
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {missions.map((mission, index) => (
          <motion.div
            key={mission.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.2 }}
          >
            <Card className="quantum-border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    <Rocket className="w-4 h-4 text-primary" />
                    <span>{mission.name}</span>
                  </div>
                  <Badge className={getStatusColor(mission.status)}>
                    {mission.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center space-x-1">
                    <Globe className="w-3 h-3 text-muted-foreground" />
                    <span>{mission.distance.toLocaleString()} km</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Users className="w-3 h-3 text-muted-foreground" />
                    <span>{mission.crew} crew</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>Power Level</span>
                      <span className="text-primary">{(mission.powerLevel * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={mission.powerLevel * 100} className="h-1" />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>System Health</span>
                      <span className="text-primary">{(mission.health * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={mission.health * 100} className="h-1" />
                  </div>
                </div>

                <div className="pt-2 border-t border-border/30">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">AI Systems</span>
                    <span className="text-primary font-mono">{mission.aiSystems}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="quantum-border">
        <CardHeader>
          <CardTitle className="holographic-text">Mission Control Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
              <div className="text-xl font-bold text-primary">
                {missions.reduce((sum, m) => sum + m.crew, 0)}
              </div>
              <div className="text-xs text-muted-foreground">Total Crew</div>
            </div>
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
              <div className="text-xl font-bold text-primary">
                {missions.reduce((sum, m) => sum + m.aiSystems, 0)}
              </div>
              <div className="text-xs text-muted-foreground">AI Systems</div>
            </div>
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
              <div className="text-xl font-bold text-primary">
                {missions.length}
              </div>
              <div className="text-xs text-muted-foreground">Active Missions</div>
            </div>
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
              <div className="text-xl font-bold text-primary">
                {((missions.reduce((sum, m) => sum + m.health, 0) / missions.length) * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-muted-foreground">Avg Health</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default SpaceMissionTracker

