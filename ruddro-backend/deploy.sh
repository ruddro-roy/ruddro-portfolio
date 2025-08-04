#!/bin/bash

# Mission Control Enterprise - Deployment Script
# This script helps automate the setup and deployment process

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check Node.js version
check_node_version() {
    if command_exists node; then
        local node_version=$(node --version | cut -d'v' -f2)
        local major_version=$(echo $node_version | cut -d'.' -f1)
        
        if [ "$major_version" -ge 18 ]; then
            print_success "Node.js version $node_version detected"
            return 0
        else
            print_error "Node.js version $node_version detected. Version 18.0.0 or higher required."
            return 1
        fi
    else
        print_error "Node.js not found. Please install Node.js 18.0.0 or higher."
        return 1
    fi
}

# Function to check npm version
check_npm_version() {
    if command_exists npm; then
        local npm_version=$(npm --version)
        print_success "npm version $npm_version detected"
        return 0
    else
        print_error "npm not found. Please install npm."
        return 1
    fi
}

# Function to create .env file
create_env_file() {
    local env_file=".env"
    
    if [ -f "$env_file" ]; then
        print_warning ".env file already exists. Backing up to .env.backup"
        cp "$env_file" "$env_file.backup"
    fi
    
    print_status "Creating .env file..."
    
    # Prompt for Cesium Ion token
    echo
    echo "Please enter your Cesium Ion token:"
    echo "If you don't have one, visit: https://cesium.com/ion/tokens"
    read -p "Cesium Ion Token: " cesium_token
    
    if [ -z "$cesium_token" ]; then
        print_error "Cesium Ion token is required!"
        exit 1
    fi
    
    # Prompt for environment
    echo
    echo "Select environment:"
    echo "1) Development (localhost)"
    echo "2) Production (Render.com)"
    read -p "Choice (1-2): " env_choice
    
    case $env_choice in
        1)
            cat > "$env_file" << EOF
# Mission Control Enterprise - Development Configuration
CESIUM_ION_TOKEN=$cesium_token
NODE_ENV=development
PORT=3000
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
EOF
            print_success "Development .env file created"
            ;;
        2)
            read -p "Enter your Render.com domain (e.g., your-app.onrender.com): " render_domain
            cat > "$env_file" << EOF
# Mission Control Enterprise - Production Configuration
CESIUM_ION_TOKEN=$cesium_token
NODE_ENV=production
PORT=10000
ALLOWED_ORIGINS=https://$render_domain
EOF
            print_success "Production .env file created"
            print_warning "Remember to set these environment variables in your Render.com dashboard!"
            ;;
        *)
            print_error "Invalid choice"
            exit 1
            ;;
    esac
}

# Function to install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    
    if npm install; then
        print_success "Dependencies installed successfully"
    else
        print_error "Failed to install dependencies"
        exit 1
    fi
}

# Function to run health check
run_health_check() {
    print_status "Running health check..."
    
    if npm run test; then
        print_success "Health check passed"
    else
        print_warning "Health check failed, but continuing..."
    fi
}

# Function to start application
start_application() {
    echo
    echo "Select how to start the application:"
    echo "1) Development mode (with auto-reload)"
    echo "2) Production mode"
    echo "3) Just install, don't start"
    read -p "Choice (1-3): " start_choice
    
    case $start_choice in
        1)
            print_status "Starting in development mode..."
            print_success "Application will start at http://localhost:3000"
            print_status "Press Ctrl+C to stop"
            npm run dev
            ;;
        2)
            print_status "Starting in production mode..."
            npm run production &
            local pid=$!
            print_success "Application started with PID $pid"
            print_success "Application available at http://localhost:3000"
            ;;
        3)
            print_success "Installation complete. Use 'npm run dev' or 'npm start' to run."
            ;;
        *)
            print_error "Invalid choice"
            exit 1
            ;;
    esac
}

# Function to display deployment instructions
show_deployment_instructions() {
    echo
    echo "=========================================="
    echo "    RENDER.COM DEPLOYMENT INSTRUCTIONS"
    echo "=========================================="
    echo
    echo "1. Go to your Render.com dashboard"
    echo "2. Create a new Web Service"
    echo "3. Connect your GitHub repository"
    echo "4. Configure the service:"
    echo "   - Build Command: cd ruddro-backend && npm install"
    echo "   - Start Command: cd ruddro-backend && npm start"
    echo "   - Root Directory: (leave empty)"
    echo
    echo "5. Add Environment Variable:"
    echo "   - Key: CESIUM_ION_TOKEN"
    echo "   - Value: [Your Cesium Ion Token]"
    echo "   - (Do NOT use Secret Files for this)"
    echo
    echo "6. Additional Environment Variables (optional):"
    echo "   - NODE_ENV=production"
    echo "   - ALLOWED_ORIGINS=https://your-domain.onrender.com"
    echo
    echo "7. Deploy and test:"
    echo "   - Health: https://your-domain.onrender.com/api/health"
    echo "   - App: https://your-domain.onrender.com"
    echo
    echo "=========================================="
}

# Function to validate Cesium token
validate_cesium_token() {
    local token="$1"
    
    print_status "Validating Cesium Ion token..."
    
    # Try to make a request to Cesium Ion API
    local response=$(curl -s -w "%{http_code}" -o /dev/null \
        -H "Authorization: Bearer $token" \
        "https://api.cesium.com/v1/me" 2>/dev/null || echo "000")
    
    if [ "$response" = "200" ]; then
        print_success "Cesium Ion token is valid"
        return 0
    else
        print_warning "Could not validate Cesium Ion token (HTTP $response)"
        print_warning "This might be due to network issues or token permissions"
        print_warning "Continuing with setup..."
        return 0
    fi
}

# Main deployment function
main() {
    echo
    echo "=========================================="
    echo "  Mission Control Enterprise Deployment"
    echo "=========================================="
    echo
    
    # Check prerequisites
    print_status "Checking prerequisites..."
    
    if ! check_node_version; then
        exit 1
    fi
    
    if ! check_npm_version; then
        exit 1
    fi
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ]; then
        print_error "package.json not found. Please run this script from the ruddro-backend directory."
        exit 1
    fi
    
    # Check if .env exists
    if [ ! -f ".env" ]; then
        print_status "No .env file found. Creating one..."
        create_env_file
    else
        print_status "Found existing .env file"
        echo
        read -p "Do you want to recreate the .env file? (y/N): " recreate_env
        if [[ $recreate_env =~ ^[Yy]$ ]]; then
            create_env_file
        fi
    fi
    
    # Load environment variables
    if [ -f ".env" ]; then
        export $(cat .env | grep -v '^#' | xargs)
        
        # Validate Cesium token if curl is available
        if command_exists curl && [ -n "$CESIUM_ION_TOKEN" ]; then
            validate_cesium_token "$CESIUM_ION_TOKEN"
        fi
    fi
    
    # Install dependencies
    install_dependencies
    
    # Run health check
    run_health_check
    
    # Show completion message
    echo
    print_success "Setup completed successfully!"
    echo
    
    # Ask about starting the application
    start_application
    
    # Show deployment instructions
    echo
    read -p "Do you want to see Render.com deployment instructions? (y/N): " show_instructions
    if [[ $show_instructions =~ ^[Yy]$ ]]; then
        show_deployment_instructions
    fi
    
    echo
    print_success "Deployment script completed!"
    echo
    echo "Quick start commands:"
    echo "  Development: npm run dev"
    echo "  Production:  npm start"
    echo "  Health:      npm run health"
    echo
}

# Run main function
main "$@"