# Orbital Guard - Cloud-Native Satellite Tracking Platform

## Project Overview
Build a sophisticated, real-time satellite tracking and threat analysis platform with cloud-native architecture. The system should provide precise orbital tracking, regional pass predictions, and secure threat monitoring capabilities while maintaining clean, future-proof code architecture.

## Technical Stack

### Backend Architecture
- **Core API**: Node.js with TypeScript and Express.js
- **Database**: MongoDB Atlas (cloud-hosted, no local setup)
- **Caching**: Redis Cloud for high-performance caching
- **Authentication**: JWT-based auth with refresh tokens
- **Security**: Advanced rate limiting, IP whitelisting, CORS policies

### Orbit Microservice
- **Framework**: Python with Flask
- **Libraries**: Skyfield and SGP4 for precise orbital calculations
- **Data Source**: Real-time TLE data from Celestrak
- **API**: RESTful endpoints for orbit predictions and calculations

### Frontend
- **Framework**: React with TypeScript
- **Visualization**: CesiumJS for real-time 3D Earth visualization
- **State Management**: Context API or Zustand
- **UI**: Modern, responsive design with dark/light modes
- **Real-time Updates**: WebSocket connections for live tracking

## Core Features

### Satellite Tracking
- Real-time position tracking for 8,000+ satellites
- Precise orbital mechanics using SGP4 propagation
- Multi-source data aggregation from Celestrak
- Advanced search by name, NORAD ID, or country
- Constellation tracking (Starlink, GPS, etc.)

### Regional Pass Predictions
- Location-based satellite pass calculations
- Visibility predictions with elevation and azimuth
- Pass duration and maximum elevation data
- Notification system for upcoming passes

### Threat Analysis
- Collision probability calculations
- Debris field monitoring
- Anomaly detection in orbital patterns
- Historical trajectory analysis

### User Management
- Role-based access control (Admin, Analyst, Observer)
- JWT authentication with secure refresh tokens
- Session management with Redis
- Audit logging for all actions

## Security Requirements

### API Security
- JWT tokens with short expiration (15 min access, 7 day refresh)
- Cesium token proxy to prevent client-side exposure
- Rate limiting per endpoint and user
- IP whitelisting for admin endpoints
- Request signing for critical operations

### Infrastructure Security
- All secrets in environment variables
- No hardcoded credentials
- HTTPS only with proper SSL certificates
- Security headers (HSTS, CSP, X-Frame-Options)
- Input validation and sanitization

## Cloud Deployment

### Container Architecture
```dockerfile
# Backend Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### Docker Compose
```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    env_file: .env
    ports:
      - "3000:3000"
  
  orbit-service:
    build: ./orbit-service
    env_file: .env
    ports:
      - "5000:5000"
  
  frontend:
    build: ./frontend
    ports:
      - "80:80"
```

### Environment Configuration
Create `.env.example` with:
```
# MongoDB Atlas
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/orbital-guard
MONGODB_DB_NAME=orbital-guard

# Redis Cloud
REDIS_URL=redis://username:password@redis-cloud-host:port

# JWT
JWT_SECRET=your-jwt-secret
JWT_REFRESH_SECRET=your-refresh-secret

# Cesium
CESIUM_ION_TOKEN=your-cesium-token

# API Keys
CELESTRAK_API_KEY=your-api-key
```

## CI/CD Pipeline

### GitHub Actions Workflow
```yaml
name: Deploy Orbital Guard

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run tests
        run: |
          npm test
          npm run lint
  
  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Cloud
        run: |
          # Deploy scripts
```

## Static Personal Site

### Design Requirements
- Minimalist design inspired by karpathy.ai
- Clean typography with system fonts
- Smooth animations and transitions
- Dark/light mode toggle
- Responsive across all devices

### Structure
```
frontend/static-site/
├── index.html
├── styles/
│   ├── main.css
│   └── themes.css
├── scripts/
│   └── app.js
└── assets/
    └── images/
```

### Navigation Tabs
1. **About**: Brief professional introduction
2. **Projects**: Embedded showcase with link to starlink.ruddro.com
3. **Bio**: Professional background and achievements
4. **Contact**: Professional contact information

### Styling Guidelines
- Primary colors: Dark mode (#0a0a0a background, #ffffff text)
- Light mode: (#ffffff background, #0a0a0a text)
- Accent color: #0080ff for links and highlights
- Font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
- Max width: 800px centered content
- Padding: 2rem on mobile, 4rem on desktop

## README Structure

### Professional Documentation
```markdown
# Orbital Guard

A real-time satellite tracking and analysis platform providing precise orbital mechanics calculations, regional pass predictions, and comprehensive space situational awareness.

## What This Does

Orbital Guard tracks over 8,000 active satellites in real-time, calculating precise positions using SGP4 propagation models. The platform enables:

- Live 3D visualization of satellite constellations
- Regional pass predictions for any location
- Collision probability analysis
- Historical trajectory tracking
- Automated alert systems for critical events

## Impact on Space Domain

This platform addresses the growing need for accessible space situational awareness as satellite constellations expand rapidly. By providing real-time tracking and analysis tools, it contributes to:

- Safer satellite operations through collision avoidance
- Better coordination of satellite communications
- Enhanced understanding of orbital dynamics
- Improved space traffic management

## Technical Implementation

Built with cloud-native architecture for scalability and reliability...
```

## Code Quality Standards

### TypeScript Configuration
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true
  }
}
```

### Code Style
- Use ESLint with Airbnb configuration
- Prettier for consistent formatting
- Comprehensive error handling
- Detailed logging with structured logs
- Unit tests for critical functions
- Integration tests for API endpoints

## Performance Optimization

### Backend
- Connection pooling for MongoDB
- Redis caching for frequently accessed data
- Pagination for large datasets
- Compression for API responses
- Efficient database indexing

### Frontend
- Code splitting for faster initial load
- Lazy loading for components
- Memoization for expensive calculations
- Virtual scrolling for large lists
- WebGL optimization for Cesium

## Monitoring and Observability

### Logging
- Structured JSON logs
- Log levels (error, warn, info, debug)
- Request/response logging
- Performance metrics logging

### Metrics
- API response times
- Database query performance
- Cache hit rates
- Active user sessions
- Satellite update frequency

## Future-Proofing

### Scalability
- Microservice architecture for independent scaling
- Message queue for asynchronous processing
- Horizontal scaling support
- Load balancing ready

### Extensibility
- Plugin architecture for new data sources
- Webhook support for external integrations
- GraphQL endpoint for flexible queries
- Event-driven architecture

## Deployment Instructions

1. Clone repository
2. Copy `.env.example` to `.env` and fill in credentials
3. Run `docker-compose up --build` for instant deployment
4. Access at http://localhost

For production deployment on Render/AWS/GCP, use provided CI/CD workflows.

## Important Notes

- All infrastructure is cloud-based, no local database setup required
- Secrets are managed through environment variables
- The platform is designed for real-world satellite tracking applications
- Focus on clean, maintainable code over complex features
- Security is paramount - all tokens are proxied, never exposed

Remember: This is an active development project focused on practical space situational awareness, not theoretical concepts. Keep the code clean, the architecture simple, and the functionality reliable.