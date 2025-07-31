import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx'
import { Badge } from '@/components/ui/badge.jsx'
import { 
  Satellite, 
  Globe, 
  Users, 
  Camera,
  AlertTriangle,
  Clock,
  MapPin,
  Telescope
} from 'lucide-react'

const RealTimeSpaceTracker = () => {
  const [issLocation, setIssLocation] = useState(null)
  const [peopleInSpace, setPeopleInSpace] = useState(null)
  const [nasaApod, setNasaApod] = useState(null)
  const [nearEarthObjects, setNearEarthObjects] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)

  // Fetch real-time ISS location
  const fetchISSLocation = async () => {
    try {
      const response = await fetch('/api/iss-location')
      const data = await response.json()
      if (data.success) {
        setIssLocation(data.data)
        setLastUpdate(new Date().toLocaleTimeString())
      }
    } catch (error) {
      console.error('Error fetching ISS location:', error)
    }
  }

  // Fetch people currently in space
  const fetchPeopleInSpace = async () => {
    try {
      const response = await fetch('/api/people-in-space')
      const data = await response.json()
      if (data.success) {
        setPeopleInSpace(data.data)
      }
    } catch (error) {
      console.error('Error fetching people in space:', error)
    }
  }

  // Fetch NASA Astronomy Picture of the Day
  const fetchNASAApod = async () => {
    try {
      const response = await fetch('/api/nasa-apod')
      const data = await response.json()
      if (data.success) {
        setNasaApod(data.data)
      }
    } catch (error) {
      console.error('Error fetching NASA APOD:', error)
    }
  }

  // Fetch Near Earth Objects
  const fetchNearEarthObjects = async () => {
    try {
      const response = await fetch('/api/near-earth-objects')
      const data = await response.json()
      if (data.success) {
        setNearEarthObjects(data.data)
      }
    } catch (error) {
      console.error('Error fetching Near Earth Objects:', error)
    }
  }

  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true)
      await Promise.all([
        fetchISSLocation(),
        fetchPeopleInSpace(),
        fetchNASAApod(),
        fetchNearEarthObjects()
      ])
      setLoading(false)
    }

    fetchAllData()

    // Update ISS location every 5 seconds
    const issInterval = setInterval(fetchISSLocation, 5000)

    // Update other data every 5 minutes
    const dataInterval = setInterval(() => {
      fetchPeopleInSpace()
      fetchNearEarthObjects()
    }, 300000)

    return () => {
      clearInterval(issInterval)
      clearInterval(dataInterval)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading real-time space data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Real-Time Data Header */}
      <div className="text-center mb-6">
        <Badge className="bg-green-500/20 text-green-400 border-green-500 mb-4">
          🔴 LIVE REAL-TIME DATA
        </Badge>
        <h2 className="text-2xl font-bold holographic-text mb-2">
          Real-Time Space Tracking
        </h2>
        <p className="text-muted-foreground">
          Live data from NASA, Open Notify, and other space agencies
        </p>
        {lastUpdate && (
          <p className="text-xs text-muted-foreground mt-2">
            Last updated: {lastUpdate}
          </p>
        )}
      </div>

      {/* ISS Real-Time Location */}
      {issLocation && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        >
          <Card className="quantum-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Satellite className="w-5 h-5 text-blue-400" />
                International Space Station
                <Badge className="bg-green-500/20 text-green-400 border-green-500 text-xs">
                  LIVE
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="data-stream-item">
                  <div className="data-stream-label">Latitude</div>
                  <div className="data-stream-value">
                    {parseFloat(issLocation.iss_position.latitude).toFixed(4)}°
                  </div>
                </div>
                <div className="data-stream-item">
                  <div className="data-stream-label">Longitude</div>
                  <div className="data-stream-value">
                    {parseFloat(issLocation.iss_position.longitude).toFixed(4)}°
                  </div>
                </div>
              </div>
              <div className="data-stream-item">
                <div className="data-stream-label">
                  <MapPin className="w-4 h-4 inline mr-2" />
                  Current Position
                </div>
                <div className="data-stream-meta">
                  Orbiting at ~408 km altitude, traveling at 27,600 km/h
                </div>
              </div>
              <div className="data-stream-item">
                <div className="data-stream-label">
                  <Clock className="w-4 h-4 inline mr-2" />
                  Timestamp
                </div>
                <div className="data-stream-value text-sm">
                  {new Date(issLocation.timestamp * 1000).toLocaleString()}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* People in Space */}
          {peopleInSpace && (
            <Card className="quantum-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-400" />
                  People Currently in Space
                  <Badge className="bg-green-500/20 text-green-400 border-green-500 text-xs">
                    LIVE
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="data-stream-item mb-4">
                  <div className="data-stream-label">Total Count</div>
                  <div className="data-stream-value text-2xl">
                    {peopleInSpace.number}
                  </div>
                </div>
                <div className="space-y-2">
                  {peopleInSpace.people.map((person, index) => (
                    <div key={index} className="data-stream-item">
                      <div className="data-stream-label">{person.name}</div>
                      <div className="data-stream-meta">{person.craft}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}

      {/* NASA Astronomy Picture of the Day */}
      {nasaApod && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="quantum-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Telescope className="w-5 h-5 text-cyan-400" />
                NASA Astronomy Picture of the Day
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500 text-xs">
                  REAL-TIME
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  {nasaApod.media_type === 'image' && (
                    <img 
                      src={nasaApod.url} 
                      alt={nasaApod.title}
                      className="w-full rounded-lg border border-border/50"
                    />
                  )}
                </div>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold text-primary mb-2">
                      {nasaApod.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {nasaApod.explanation}
                    </p>
                  </div>
                  <div className="data-stream-item">
                    <div className="data-stream-label">Date</div>
                    <div className="data-stream-value">{nasaApod.date}</div>
                  </div>
                  {nasaApod.copyright && (
                    <div className="data-stream-item">
                      <div className="data-stream-label">Copyright</div>
                      <div className="data-stream-meta">{nasaApod.copyright}</div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Near Earth Objects */}
      {nearEarthObjects && nearEarthObjects.near_earth_objects && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="quantum-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-400" />
                Near Earth Objects Today
                <Badge className="bg-orange-500/20 text-orange-400 border-orange-500 text-xs">
                  REAL-TIME
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="data-stream-item mb-4">
                <div className="data-stream-label">Objects Detected Today</div>
                <div className="data-stream-value text-2xl">
                  {nearEarthObjects.element_count}
                </div>
              </div>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {Object.values(nearEarthObjects.near_earth_objects)[0]?.slice(0, 5).map((neo, index) => (
                  <div key={index} className="data-stream-item">
                    <div className="data-stream-label">{neo.name}</div>
                    <div className="data-stream-meta">
                      Diameter: {neo.estimated_diameter.meters.estimated_diameter_min.toFixed(0)}m - {neo.estimated_diameter.meters.estimated_diameter_max.toFixed(0)}m
                      {neo.is_potentially_hazardous_asteroid && (
                        <span className="text-orange-400 ml-2">⚠️ Potentially Hazardous</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Data Sources */}
      <div className="text-center text-xs text-muted-foreground">
        <p>Real-time data sources: NASA Open APIs, Open Notify, International Space Station</p>
        <p>Data is fetched live and updated automatically</p>
      </div>
    </div>
  )
}

export default RealTimeSpaceTracker

