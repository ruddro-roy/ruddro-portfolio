#!/bin/bash

# Mission Control - Automated Startup Script
# This script sets up and starts the Mission Control satellite tracking application

echo "🚀 Mission Control - Automated Startup"
echo "======================================"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[⚠]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[ℹ]${NC} $1"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
else
    NODE_VERSION=$(node --version)
    print_status "Node.js found: $NODE_VERSION"
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed!"
    echo "Please install npm (usually comes with Node.js)"
    exit 1
else
    NPM_VERSION=$(npm --version)
    print_status "npm found: $NPM_VERSION"
fi

# Navigate to backend directory
if [ ! -d "ruddro-backend" ]; then
    print_error "Backend directory not found!"
    echo "Please run this script from the project root directory"
    exit 1
fi

cd ruddro-backend
print_status "Changed to backend directory"

# Check if package.json exists
if [ ! -f "package.json" ]; then
    print_error "package.json not found!"
    echo "Please ensure you're in the correct directory"
    exit 1
fi

# Install dependencies
print_info "Installing dependencies..."
if npm install; then
    print_status "Dependencies installed successfully"
else
    print_error "Failed to install dependencies"
    exit 1
fi

# Check if simple-server.js exists
if [ ! -f "simple-server.js" ]; then
    print_error "simple-server.js not found!"
    echo "Please ensure you have created the simple-server.js file as instructed"
    exit 1
fi

# Check if starlink app files exist
if [ ! -f "../ruddro-future/starlink/app.js" ]; then
    print_error "Starlink app.js not found!"
    echo "Please ensure you have created the app.js file in ruddro-future/starlink/"
    exit 1
fi

if [ ! -f "../ruddro-future/starlink/style.css" ]; then
    print_error "Starlink style.css not found!"
    echo "Please ensure you have created the style.css file in ruddro-future/starlink/"
    exit 1
fi

if [ ! -f "../ruddro-future/starlink/index.html" ]; then
    print_error "Starlink index.html not found!"
    echo "Please ensure the index.html file exists in ruddro-future/starlink/"
    exit 1
fi

print_status "All required files found"

# Kill any existing processes on port 3001
print_info "Checking for existing processes on port 3001..."
if lsof -ti:3001 &> /dev/null; then
    print_warning "Port 3001 is in use, attempting to free it..."
    pkill -f "node.*simple-server" 2>/dev/null || true
    sleep 2
fi

# Start the backend server
print_info "Starting Mission Control Backend..."
echo ""
echo "🛰️  Mission Control will be available at:"
echo "   📡 Backend API: http://localhost:3001/api/health"
echo "   🚀 Starlink App: http://localhost:3001/starlink/"
echo "   📊 TLE Data: http://localhost:3001/api/tle"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Run the server
if npm run simple; then
    print_status "Server started successfully"
else
    print_error "Failed to start server"
    echo ""
    echo "Troubleshooting steps:"
    echo "1. Check if port 3001 is available: lsof -i:3001"
    echo "2. Check Node.js version (requires 16+): node --version"
    echo "3. Try manual start: node simple-server.js"
    echo "4. Check the logs above for specific errors"
    exit 1
fi
