# Mission Control Enterprise

## Real-time Satellite Tracking System with Secure 3D Earth Visualization

A sophisticated enterprise-grade application for real-time satellite tracking featuring secure Cesium Ion integration, comprehensive satellite data from Celestrak, and high-performance 3D Earth visualization.

## Features

### Core Capabilities
- **Real-time 3D Earth Visualization**: High-resolution satellite imagery and terrain using Cesium Ion
- **Live Satellite Tracking**: Real-time data for 8,000+ satellites from multiple Celestrak sources
- **Enterprise Security**: Secure token management with session-based proxy architecture
- **Advanced Search**: Fast satellite search by name, NORAD ID, or country
- **Orbital Mechanics**: Precise SGP4 propagation for orbital calculations
- **Performance Optimization**: Efficient rendering for thousands of satellites
- **Multiple Data Sources**: Comprehensive satellite coverage including:
  - Active satellites, Space stations, Weather satellites
  - GPS/GNSS constellations (GPS, Galileo, GLONASS, BeiDou)
  - Communication satellites (Starlink, Intelsat)
  - Scientific and military satellites
  - CubeSats and amateur radio satellites

### Security Features
- Session-based authentication for Cesium Ion access
- Token isolation (never exposed to frontend)
- Rate limiting and DDoS protection
- Secure CORS configuration
- Advanced security headers
- IP-based session validation

## Architecture

### Backend (Node.js/Express)
- **Secure Proxy**: Routes Cesium Ion requests securely
- **Session Management**: Handles secure token distribution
- **Data Processing**: Real-time satellite data aggregation
- **API Gateway**: RESTful endpoints for satellite information

### Frontend (Vanilla JS/Cesium)
- **3D Visualization**: Cesium-powered Earth rendering
- **Real-time Updates**: Live satellite position calculations
- **Interactive UI**: Modern enterprise interface
- **Performance Monitoring**: FPS and system status tracking

## Prerequisites

- Node.js 18.0.0 or higher
- npm 8.0.0 or higher
- Cesium Ion account and access token
- Render.com account (for deployment)

## Installation & Setup

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone <your-repository-url>
cd mission-control-enterprise

# Install backend dependencies
cd ruddro-backend
npm install

# Verify installation
npm run health
```

### 2. Cesium Ion Configuration

1. **Create Cesium Ion Account**:
   - Visit [https://cesium.com/ion/](https://cesium.com/ion/)
   - Sign up for a free account
   - Navigate to Access Tokens section

2. **Generate Access Token**:
   - Create a new token with the following scopes:
     - `assets:read` (Required for imagery and terrain)
     - `assets:list` (Optional for asset browsing)
   - Copy the generated token

3. **Configure Environment Variables**:

#### For Local Development:
Create `.env` file in `ruddro-backend/`:
```env
CESIUM_ION_TOKEN=your_cesium_ion_token_here
NODE_ENV=development
PORT=3000
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

#### For Render.com Deployment:
1. Go to your Render.com dashboard
2. Navigate to your service settings
3. Add environment variable:
   - **Key**: `CESIUM_ION_TOKEN`
   - **Value**: Your Cesium Ion token
   - **Important**: Do NOT put this in the "Secret Files" section

### 3. File Structure Setup

Ensure your project structure matches:
```
project-root/
├── ruddro-backend/
│   ├── public/
│   │   ├── index.html          ← Replace with new version
│   │   ├── app.js              ← Replace with new version
│   │   └── favicon_io/         ← Keep existing favicons
│   ├── server.js               ← Replace with new version
│   ├── package.json            ← Replace with new version
│   └── README.md               ← This file
└── ruddro-future/              ← Keep existing (optional)
```

### 4. Replace Existing Files

**IMPORTANT**: Replace the following files entirely with the new versions:

1. **Replace `ruddro-backend/public/index.html`**:
   - Delete the existing file
   - Create new file with the enterprise HTML provided

2. **Replace `ruddro-backend/public/app.js`**:
   - Delete the existing file
   - Create new file with the enterprise JavaScript provided

3. **Replace `ruddro-backend/server.js`**:
   - Delete the existing file
   - Create new file with the secure backend provided

4. **Replace `ruddro-backend/package.json`**:
   - Delete the existing file
   - Create new file with updated dependencies

### 5. Install New Dependencies

```bash
cd ruddro-backend
npm install
```

This will install the new security dependencies:
- `helmet` - Security headers
- `express-rate-limit` - Rate limiting

## Running the Application

### Development Mode
```bash
cd ruddro-backend
npm run dev
```

### Production Mode
```bash
cd ruddro-backend
npm run production
```

### Health Check
```bash
npm run health
```

The application will be available at:
- Local: `http://localhost:3000`
- Network: `http://your-ip:3000`

## Deployment to Render.com

### 1. Update Render Configuration

1. **Service Settings**:
   - Build Command: `cd ruddro-backend && npm install`
   - Start Command: `cd ruddro-backend && npm start`
   - Root Directory: Leave empty (or set to repository root)

2. **Environment Variables** (in Render dashboard):
   ```
   CESIUM_ION_TOKEN=your_cesium_ion_token_here
   NODE_ENV=production
   PORT=10000
   ALLOWED_ORIGINS=https://your-domain.onrender.com
   ```

3. **Auto-Deploy**:
   - Connect your GitHub repository
   - Enable auto-deploy from main branch

### 2. Verify Deployment

After deployment, check:
1. Health endpoint: `https://your-domain.onrender.com/api/health`
2. Session endpoint: `https://your-domain.onrender.com/api/session`
3. Main application: `https://your-domain.onrender.com`

## API Endpoints

### Session Management
- `GET /api/session` - Create secure session
- Headers: Returns session ID for proxy access

### Satellite Data
- `GET /api/satellites/live` - Real-time satellite data
- `GET /api/satellite/:noradId/details` - Detailed satellite info
- `GET /api/satellite/:noradId/position` - Current position

### Cesium Proxy
- `GET /api/cesium-proxy/*` - Secure Cesium Ion proxy
- Headers: Requires `X-Session-ID`

### System
- `GET /api/health` - System health status

## Features Guide

### Real-time Satellite Tracking
- **Data Sources**: 20+ Celestrak satellite groups
- **Update Frequency**: 30-second intervals
- **Coverage**: 8,000+ satellites worldwide
- **Accuracy**: SGP4 orbital propagation

### 3D Earth Visualization
- **Imagery**: High-resolution Bing Maps via Cesium Ion
- **Terrain**: Cesium World Terrain
- **Lighting**: Dynamic day/night cycles
- **Performance**: Optimized for 60 FPS rendering

### Search & Filtering
- **Search**: By satellite name or NORAD ID
- **Filters**: All, Active, Starlink, GPS/GNSS
- **Real-time**: Instant search results
- **Autocomplete**: Live suggestions

### Security Features
- **Token Security**: Never exposed to client
- **Session Management**: Secure proxy authentication
- **Rate Limiting**: Per-IP request limits
- **CORS Protection**: Configurable origins
- **Security Headers**: CSP, HSTS, etc.

## Performance Optimization

### Client-side
- **Rendering**: WebGL optimization
- **Memory**: Efficient entity management
- **Updates**: Selective re-rendering
- **Throttling**: FPS monitoring

### Server-side
- **Caching**: Session and response caching
- **Compression**: Gzip response compression
- **Rate Limiting**: Request throttling
- **Parallel Processing**: Concurrent data fetching

## Troubleshooting

### Common Issues

1. **"Session initialization failed"**:
   - Check `CESIUM_ION_TOKEN` environment variable
   - Verify token has correct permissions
   - Check network connectivity

2. **"Failed to load satellite data"**:
   - Verify Celestrak API availability
   - Check rate limiting settings
   - Review server logs

3. **3D Earth not loading**:
   - Confirm Cesium Ion token permissions
   - Check browser WebGL support
   - Verify proxy configuration

4. **Performance issues**:
   - Reduce `MAX_SATELLITES_RENDER` in config
   - Disable orbit paths for better performance
   - Check browser performance tab

### Debug Mode

For development debugging:
```javascript
// Available in browser console
window.MissionControl.AppState
window.MissionControl.SatelliteManager
```

### Logs

Check server logs for detailed error information:
```bash
# In production
pm2 logs mission-control

# In development
npm run dev
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CESIUM_ION_TOKEN` | Yes | - | Cesium Ion access token |
| `NODE_ENV` | No | development | Environment mode |
| `PORT` | No | 3000 | Server port |
| `ALLOWED_ORIGINS` | No | * | CORS allowed origins |

### Application Settings

Key configuration options in `app.js`:
- `MAX_SATELLITES_RENDER`: Maximum satellites to display (default: 8000)
- `UPDATE_INTERVAL`: Data refresh interval (default: 30000ms)
- `ORBIT_PROPAGATION_MINUTES`: Orbit calculation duration (default: 120)

## Contributing

### Development Setup
1. Fork the repository
2. Create feature branch
3. Follow existing code style
4. Add tests for new features
5. Submit pull request

### Code Standards
- ESLint configuration for JavaScript
- Security-first development
- Performance optimization
- Comprehensive error handling

## License

MIT License - see LICENSE file for details.

## Support

For issues and support:
1. Check troubleshooting section
2. Review server logs
3. Open GitHub issue with details
4. Include system information and error logs

## Security Notice

This application handles sensitive satellite tracking data. Ensure:
- Keep Cesium Ion tokens secure
- Use HTTPS in production
- Regularly update dependencies
- Monitor for security vulnerabilities
- Configure proper CORS policies

---

**Enterprise-Grade Mission Control System**  
Built with security, performance, and reliability in mind.
