# Orbital Guard - Build Requirements

Build a cloud-native satellite tracking platform with real-time visualization and analysis capabilities.

## Core Architecture

### Backend (Node.js + TypeScript)
- Express.js API with JWT authentication
- MongoDB Atlas for data persistence (cloud-only)
- Redis Cloud for caching and sessions
- TypeScript with strict mode enabled
- Clean architecture with service/repository pattern

### Orbit Service (Python Microservice)
- Flask API for orbital calculations
- Skyfield/SGP4 for precise orbital mechanics
- TLE data integration from Celestrak
- RESTful endpoints for predictions

### Frontend (React + TypeScript)
- CesiumJS for 3D Earth visualization
- Real-time satellite tracking
- Modern, responsive UI with dark/light modes
- WebSocket for live updates

## Key Features
- Track 8,000+ satellites in real-time
- Regional pass predictions
- Collision probability analysis
- User role management
- Secure alert system

## Security
- JWT with refresh tokens
- Cesium token proxy (no client exposure)
- Rate limiting and IP whitelisting
- Environment-based configuration
- No hardcoded secrets

## Deployment
- Docker Compose for instant deployment
- Cloud-only infrastructure (Render/AWS/GCP)
- GitHub Actions CI/CD
- `.env.example` for configuration template

## Static Portfolio Site
Create a minimal personal site at `frontend/static-site/`:
- Style: Clean, minimal like karpathy.ai
- Tabs: About, Projects (embed starlink.ruddro.com), Bio, Contact
- Dark/light mode toggle
- Responsive design
- No external dependencies

## README Guidelines
Write about:
- What the platform does (real-time tracking, predictions)
- Impact on space situational awareness
- Technical implementation details
- How to deploy and use

Avoid:
- Claims of "enterprise-grade" or "defense-grade"
- Marketing language
- Overstating capabilities

## Code Standards
- Clean, documented code
- Comprehensive error handling
- Unit and integration tests
- ESLint + Prettier
- Structured logging

## Infrastructure
- All cloud services (no local databases)
- Autonomous operation
- Environment variable configuration
- Docker-based deployment
- Kubernetes-ready manifests (optional)

Focus: Build a functional, professional satellite tracking platform that demonstrates advanced technical skills while maintaining clean, maintainable code.