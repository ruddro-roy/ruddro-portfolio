# Mission Control Enterprise - Quick Fix & Deployment

## IMMEDIATE FIX for "Error: undefined" Issue

The loading error is caused by missing dependencies and configuration issues. Here's the complete fix:

### Step 1: Install Missing Dependencies

```bash
cd ruddro-backend
npm install helmet express-rate-limit
```

### Step 2: Set Environment Variable

#### For Local Testing:
```bash
export CESIUM_ION_TOKEN=your_actual_cesium_ion_token_here
```

#### For Render.com Production:
1. Go to your Render.com dashboard
2. Find your service
3. Go to Environment tab
4. Add: `CESIUM_ION_TOKEN` = `your_actual_cesium_ion_token_here`

### Step 3: Get Your Cesium Ion Token

1. Visit: https://cesium.com/ion/tokens
2. Sign up/login to Cesium Ion
3. Create a new token with default permissions
4. Copy the token (starts with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)

### Step 4: Test Locally

```bash
cd ruddro-backend
export CESIUM_ION_TOKEN=your_actual_token_here
node server.js
```

You should see:
```
Mission Control Backend v2.0 operational on port 3000
✓ Cesium Ion token: Configured
```

Open: http://localhost:3000

### Step 5: Deploy to Render.com

#### Update Render Service Configuration:

1. **Build Command**: 
   ```
   cd ruddro-backend && npm install
   ```

2. **Start Command**: 
   ```
   cd ruddro-backend && npm start
   ```

3. **Environment Variables**:
   - `CESIUM_ION_TOKEN`: your_actual_token_here
   - `NODE_ENV`: production
   - `PORT`: 10000

4. **Root Directory**: Leave empty

#### Deploy Process:
1. Push your code to GitHub
2. Render will auto-deploy
3. Check logs for any errors
4. Test the deployed app

## Enterprise Architecture (Advanced Features)

### Current Implementation
- ✅ Secure Cesium Ion proxy (no token exposure)
- ✅ Real-time satellite data from 20+ Celestrak sources
- ✅ 8,000+ satellites with live tracking
- ✅ Advanced search and filtering
- ✅ 3D Earth visualization with orbital mechanics
- ✅ Enterprise security (session management, rate limiting)

### Planned Enterprise Features

#### 1. Advanced Security & Authentication
```javascript
// JWT Authentication with role-based access
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// User roles: admin, analyst, viewer
const roles = {
    admin: ['read', 'write', 'delete', 'manage_users'],
    analyst: ['read', 'write', 'analyze'],
    viewer: ['read']
};

// IP Whitelisting middleware
const ipWhitelist = ['192.168.1.0/24', '10.0.0.0/8'];
```

#### 2. Microservices Architecture
```yaml
# docker-compose.yml
version: '3.8'
services:
  api-gateway:
    build: ./api-gateway
    ports: ["8080:8080"]
  
  auth-service:
    build: ./auth-service
    environment:
      - JWT_SECRET=${JWT_SECRET}
  
  analysis-service:
    build: ./analysis-service
    runtime: python:3.11
  
  data-service:
    build: ./data-service
    environment:
      - MONGODB_URI=${MONGODB_URI}
      - REDIS_URI=${REDIS_URI}
```

#### 3. Advanced Analytics & Threat Detection
```python
# analysis-service/threat_detector.py
import numpy as np
from scipy.spatial.distance import cdist
import asyncio

class ThreatDetector:
    def __init__(self):
        self.min_distance_km = 50  # Collision threshold
        self.altitude_bands = {
            'leo': (160, 2000),
            'meo': (2000, 35786),
            'geo': (35786, 36000)
        }
    
    async def detect_close_approaches(self, satellites):
        """Detect potential collisions using orbital mechanics"""
        threats = []
        positions = np.array([[s.lat, s.lon, s.alt] for s in satellites])
        
        # Calculate distances between all satellites
        distances = cdist(positions, positions)
        
        # Find close approaches
        close_pairs = np.where((distances < self.min_distance_km) & (distances > 0))
        
        for i, j in zip(*close_pairs):
            threat = {
                'sat1': satellites[i],
                'sat2': satellites[j],
                'distance': distances[i, j],
                'risk_level': self.calculate_risk(satellites[i], satellites[j]),
                'estimated_time': self.predict_closest_approach(satellites[i], satellites[j])
            }
            threats.append(threat)
        
        return threats
```

#### 4. Real-time Notifications
```javascript
// notification-service/alerts.js
const nodemailer = require('nodemailer');
const twilio = require('twilio');

class AlertSystem {
    constructor() {
        this.emailTransporter = nodemailer.createTransporter({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
        
        this.smsClient = twilio(
            process.env.TWILIO_SID,
            process.env.TWILIO_TOKEN
        );
    }
    
    async sendThreatAlert(threat, recipients) {
        const message = `🚨 SATELLITE THREAT DETECTED
        ${threat.sat1.name} & ${threat.sat2.name}
        Distance: ${threat.distance.toFixed(2)} km
        Risk Level: ${threat.risk_level}
        ETA: ${threat.estimated_time}`;
        
        // Send email alerts
        for (const email of recipients.emails) {
            await this.emailTransporter.sendMail({
                to: email,
                subject: 'Satellite Threat Alert',
                text: message
            });
        }
        
        // Send SMS alerts for high-risk threats
        if (threat.risk_level === 'HIGH') {
            for (const phone of recipients.phones) {
                await this.smsClient.messages.create({
                    to: phone,
                    from: process.env.TWILIO_PHONE,
                    body: message
                });
            }
        }
    }
}
```

#### 5. Advanced UI Components
```typescript
// components/ThreatMonitor.tsx
import React, { useState, useEffect } from 'react';
import { Alert, Badge, Timeline } from 'antd';

interface Threat {
    id: string;
    satellites: [string, string];
    distance: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    estimatedTime: string;
}

const ThreatMonitor: React.FC = () => {
    const [threats, setThreats] = useState<Threat[]>([]);
    
    useEffect(() => {
        const ws = new WebSocket('/api/threats/stream');
        
        ws.onmessage = (event) => {
            const threat = JSON.parse(event.data);
            setThreats(prev => [threat, ...prev.slice(0, 9)]);
        };
        
        return () => ws.close();
    }, []);
    
    return (
        <div className="threat-monitor">
            <h3>Active Threats ({threats.length})</h3>
            <Timeline>
                {threats.map(threat => (
                    <Timeline.Item
                        key={threat.id}
                        color={getRiskColor(threat.riskLevel)}
                    >
                        <Alert
                            message={`${threat.satellites[0]} ↔ ${threat.satellites[1]}`}
                            description={`Distance: ${threat.distance} km`}
                            type={getRiskType(threat.riskLevel)}
                            showIcon
                            action={
                                <Badge 
                                    status={getRiskStatus(threat.riskLevel)} 
                                    text={threat.riskLevel} 
                                />
                            }
                        />
                    </Timeline.Item>
                ))}
            </Timeline>
        </div>
    );
};
```

### Performance & Scalability

#### Database Schema (MongoDB)
```javascript
// models/Satellite.js
const satelliteSchema = {
    noradId: { type: Number, index: true },
    name: String,
    tle: {
        line1: String,
        line2: String,
        epoch: { type: Date, index: true }
    },
    position: {
        latitude: Number,
        longitude: Number,
        altitude: Number,
        lastCalculated: { type: Date, index: true }
    },
    metadata: {
        country: String,
        launchDate: Date,
        objectType: String,
        rcsSize: String
    },
    // TTL index for automatic cleanup
    expiresAt: { 
        type: Date, 
        default: Date.now, 
        expires: 86400 // 24 hours
    }
};
```

#### Redis Caching Strategy
```javascript
// cache/satellite-cache.js
const redis = require('redis');
const client = redis.createClient(process.env.REDIS_URI);

class SatelliteCache {
    async getCachedPositions(noradIds) {
        const keys = noradIds.map(id => `sat:pos:${id}`);
        return await client.mget(keys);
    }
    
    async setCachedPosition(noradId, position, ttl = 300) {
        await client.setex(
            `sat:pos:${noradId}`, 
            ttl, 
            JSON.stringify(position)
        );
    }
    
    async invalidateCache(pattern) {
        const keys = await client.keys(pattern);
        if (keys.length > 0) {
            await client.del(keys);
        }
    }
}
```

## Testing & Compliance

### Test Coverage (80%+ target)
```javascript
// tests/api.test.js
const request = require('supertest');
const app = require('../server');

describe('API Endpoints', () => {
    test('GET /api/health should return operational status', async () => {
        const response = await request(app)
            .get('/api/health')
            .expect(200);
            
        expect(response.body.status).toBe('operational');
        expect(response.body.services.satelliteData).toBe('active');
    });
    
    test('POST /api/session should create secure session', async () => {
        const response = await request(app)
            .post('/api/session')
            .expect(200);
            
        expect(response.body.sessionId).toHaveLength(64);
        expect(response.body.expires).toBeGreaterThan(Date.now());
    });
});
```

### ITAR Compliance Features
```javascript
// middleware/compliance.js
const auditLogger = require('./audit-logger');

const complianceMiddleware = (req, res, next) => {
    // Log all API access for audit trail
    auditLogger.log({
        timestamp: new Date().toISOString(),
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
        method: req.method,
        userId: req.user?.id,
        accessLevel: req.user?.role
    });
    
    // Check for sensitive data access
    if (req.path.includes('/military') || req.path.includes('/classified')) {
        if (!req.user || req.user.clearanceLevel < 3) {
            return res.status(403).json({ 
                error: 'Insufficient clearance level' 
            });
        }
    }
    
    next();
};
```

## Quick Start Summary

1. **Install dependencies**: `npm install helmet express-rate-limit`
2. **Get Cesium Ion token**: https://cesium.com/ion/tokens
3. **Set environment**: `export CESIUM_ION_TOKEN=your_token`
4. **Run locally**: `node server.js`
5. **Deploy to Render**: Set environment variables in dashboard
6. **Access**: Your app will be live at your-domain.onrender.com

The current implementation provides enterprise-grade satellite tracking with secure Cesium Ion integration. The advanced features outlined above can be implemented incrementally based on specific requirements.