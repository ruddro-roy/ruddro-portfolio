import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

export const useWebSocket = (url = 'http://localhost:5000') => {
  const [isConnected, setIsConnected] = useState(false)
  const [systemMetrics, setSystemMetrics] = useState({
    neural_activity: 0.0,
    quantum_coherence: 0.0,
    data_flow_rate: 0.0,
    ai_processing_load: 0.0,
    timestamp: new Date().toISOString(),
    active_connections: 0
  })
  const [lastUpdate, setLastUpdate] = useState(Date.now())
  const socketRef = useRef(null)

  useEffect(() => {
    // Initialize WebSocket connection
    socketRef.current = io(url, {
      transports: ['websocket', 'polling'],
      timeout: 5000,
      forceNew: true
    })

    const socket = socketRef.current

    // Connection event handlers
    socket.on('connect', () => {
      console.log('🚀 Connected to Quantum Neural Network')
      setIsConnected(true)
    })

    socket.on('disconnect', () => {
      console.log('🔌 Disconnected from Quantum Neural Network')
      setIsConnected(false)
    })

    socket.on('connect_error', (error) => {
      console.log('❌ Connection error:', error)
      setIsConnected(false)
    })

    // Real-time data handlers
    socket.on('system_metrics', (data) => {
      setSystemMetrics(data)
      setLastUpdate(Date.now())
    })

    socket.on('connection_status', (data) => {
      console.log('📡 Connection status:', data)
    })

    // Cleanup on unmount
    return () => {
      if (socket) {
        socket.disconnect()
      }
    }
  }, [url])

  // API call functions
  const fetchAIInsight = async () => {
    try {
      const response = await fetch(`${url}/api/thoughts/generate`)
      if (response.ok) {
        return await response.json()
      }
    } catch (error) {
      console.error('Error fetching AI insight:', error)
    }
    return null
  }

  const fetchSystemStatus = async () => {
    try {
      const response = await fetch(`${url}/api/status`)
      if (response.ok) {
        return await response.json()
      }
    } catch (error) {
      console.error('Error fetching system status:', error)
    }
    return null
  }

  const fetchSpaceMissions = async () => {
    try {
      const response = await fetch(`${url}/api/realtime/space_missions`)
      if (response.ok) {
        return await response.json()
      }
    } catch (error) {
      console.error('Error fetching space missions:', error)
    }
    return null
  }

  const fetchQuantumState = async () => {
    try {
      const response = await fetch(`${url}/api/ai/quantum_state`)
      if (response.ok) {
        return await response.json()
      }
    } catch (error) {
      console.error('Error fetching quantum state:', error)
    }
    return null
  }

  const fetchNeuralActivity = async () => {
    try {
      const response = await fetch(`${url}/api/ai/neural_activity`)
      if (response.ok) {
        return await response.json()
      }
    } catch (error) {
      console.error('Error fetching neural activity:', error)
    }
    return null
  }

  const fetchResearchAreas = async () => {
    try {
      const response = await fetch(`${url}/api/ai/research_areas`)
      if (response.ok) {
        return await response.json()
      }
    } catch (error) {
      console.error('Error fetching research areas:', error)
    }
    return null
  }

  return {
    isConnected,
    systemMetrics,
    lastUpdate,
    socket: socketRef.current,
    // API functions
    fetchAIInsight,
    fetchSystemStatus,
    fetchSpaceMissions,
    fetchQuantumState,
    fetchNeuralActivity,
    fetchResearchAreas
  }
}

