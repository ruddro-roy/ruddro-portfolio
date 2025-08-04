#!/bin/bash

# Orbital Guard Deployment Script
# Deploys the complete platform with all services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi

    log_success "Docker and Docker Compose are installed"
}

# Check if .env file exists
check_env() {
    if [ ! -f .env ]; then
        log_warning ".env file not found. Creating from template..."
        cp .env.example .env
        log_info "Please edit .env file with your configuration before continuing"
        log_info "Required variables:"
        log_info "  - MONGODB_URI: Your MongoDB Atlas connection string"
        log_info "  - REDIS_URL: Your Redis Cloud connection string"
        log_info "  - JWT_SECRET: A secure random string for JWT signing"
        log_info "  - CESIUM_ION_TOKEN: Your Cesium Ion access token"
        exit 1
    fi

    log_success "Environment configuration found"
}

# Build and start services
deploy_services() {
    log_info "Building and starting Orbital Guard services..."
    
    # Stop existing containers
    docker-compose down --remove-orphans
    
    # Build and start services
    docker-compose up --build -d
    
    log_success "Services deployed successfully"
}

# Check service health
check_health() {
    log_info "Checking service health..."
    
    # Wait for services to start
    sleep 30
    
    # Check API health
    if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
        log_success "API service is healthy"
    else
        log_error "API service is not responding"
        return 1
    fi
    
    # Check orbital engine health
    if curl -f http://localhost:5000/health > /dev/null 2>&1; then
        log_success "Orbital Engine is healthy"
    else
        log_error "Orbital Engine is not responding"
        return 1
    fi
    
    # Check frontend
    if curl -f http://localhost:80 > /dev/null 2>&1; then
        log_success "Frontend is healthy"
    else
        log_error "Frontend is not responding"
        return 1
    fi
    
    # Check static site
    if curl -f http://localhost:8080 > /dev/null 2>&1; then
        log_success "Static site is healthy"
    else
        log_error "Static site is not responding"
        return 1
    fi
    
    log_success "All services are healthy"
}

# Show service URLs
show_urls() {
    log_info "Orbital Guard Platform is now running at:"
    echo
    echo -e "${GREEN}Frontend Application:${NC} http://localhost:80"
    echo -e "${GREEN}API Documentation:${NC} http://localhost:3000/api/health"
    echo -e "${GREEN}Orbital Engine:${NC} http://localhost:5000/health"
    echo -e "${GREEN}Personal Site:${NC} http://localhost:8080"
    echo
    log_info "To view logs: docker-compose logs -f"
    log_info "To stop services: docker-compose down"
}

# Main deployment function
main() {
    echo "🚀 Orbital Guard Deployment Script"
    echo "=================================="
    echo
    
    check_docker
    check_env
    deploy_services
    check_health
    show_urls
    
    log_success "Deployment completed successfully!"
}

# Handle script arguments
case "${1:-}" in
    "stop")
        log_info "Stopping Orbital Guard services..."
        docker-compose down
        log_success "Services stopped"
        ;;
    "restart")
        log_info "Restarting Orbital Guard services..."
        docker-compose restart
        log_success "Services restarted"
        ;;
    "logs")
        log_info "Showing service logs..."
        docker-compose logs -f
        ;;
    "clean")
        log_info "Cleaning up containers and images..."
        docker-compose down --rmi all --volumes --remove-orphans
        log_success "Cleanup completed"
        ;;
    "help"|"-h"|"--help")
        echo "Orbital Guard Deployment Script"
        echo
        echo "Usage: $0 [command]"
        echo
        echo "Commands:"
        echo "  (no args)  Deploy the complete platform"
        echo "  stop       Stop all services"
        echo "  restart    Restart all services"
        echo "  logs       Show service logs"
        echo "  clean      Clean up containers and images"
        echo "  help       Show this help message"
        ;;
    *)
        main
        ;;
esac