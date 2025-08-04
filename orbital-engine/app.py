#!/usr/bin/env python3
"""
Orbital Guard - Orbital Mechanics Engine
Advanced satellite tracking and orbital analysis microservice
"""

import os
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
import json

from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from pydantic import BaseModel, ValidationError
import numpy as np
from skyfield.api import load, wgs84
from skyfield.sgp4lib import EarthSatellite
from sgp4.api import Satrec
import requests

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Rate limiting
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Data models
class SatelliteData(BaseModel):
    norad_id: str
    name: str
    tle_line1: str
    tle_line2: str
    epoch: Optional[str] = None
    classification: Optional[str] = None
    launch_date: Optional[str] = None
    decay_date: Optional[str] = None
    country: Optional[str] = None

class PositionRequest(BaseModel):
    norad_id: str
    timestamp: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    altitude: Optional[float] = None

class ConjunctionRequest(BaseModel):
    satellite1_id: str
    satellite2_id: str
    start_time: str
    end_time: str
    min_distance: Optional[float] = 10.0  # km

class PassPredictionRequest(BaseModel):
    norad_id: str
    latitude: float
    longitude: float
    altitude: float = 0.0
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    min_elevation: float = 10.0

# Global variables
ts = load.timescale()
satellites_cache: Dict[str, EarthSatellite] = {}
celestrak_urls = [
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=tle',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=galileo&FORMAT=tle',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=glonass&FORMAT=tle',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=beidou&FORMAT=tle',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=noaa&FORMAT=tle',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=goes&FORMAT=tle',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=resource&FORMAT=tle',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=sarsat&FORMAT=tle',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=dmc&FORMAT=tle',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=tdrss&FORMAT=tle',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=argos&FORMAT=tle',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=spire&FORMAT=tle',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=planet&FORMAT=tle',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=oneweb&FORMAT=tle',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium&FORMAT=tle',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=orbcomm&FORMAT=tle',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=globalstar&FORMAT=tle'
]

def load_tle_data() -> Dict[str, SatelliteData]:
    """Load TLE data from Celestrak and cache it"""
    satellites = {}
    
    for url in celestrak_urls:
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            
            lines = response.text.strip().split('\n')
            for i in range(0, len(lines), 3):
                if i + 2 < len(lines):
                    name = lines[i].strip()
                    line1 = lines[i + 1].strip()
                    line2 = lines[i + 2].strip()
                    
                    # Extract NORAD ID from line 1
                    norad_id = line1[2:7].strip()
                    
                    if norad_id.isdigit():
                        satellites[norad_id] = SatelliteData(
                            norad_id=norad_id,
                            name=name,
                            tle_line1=line1,
                            tle_line2=line2
                        )
                        
        except Exception as e:
            logger.error(f"Error loading TLE data from {url}: {e}")
            continue
    
    return satellites

def create_satellite_object(satellite_data: SatelliteData) -> EarthSatellite:
    """Create Skyfield EarthSatellite object from TLE data"""
    try:
        satellite = EarthSatellite(satellite_data.tle_line1, satellite_data.tle_line2)
        return satellite
    except Exception as e:
        logger.error(f"Error creating satellite object for {satellite_data.norad_id}: {e}")
        raise

def calculate_satellite_position(norad_id: str, timestamp: datetime) -> Dict[str, Any]:
    """Calculate satellite position at given timestamp"""
    try:
        if norad_id not in satellites_cache:
            raise ValueError(f"Satellite {norad_id} not found in cache")
        
        satellite = satellites_cache[norad_id]
        t = ts.from_datetime(timestamp)
        
        # Calculate position
        geocentric = satellite.at(t)
        lat, lon = wgs84.latlon_of(geocentric)
        elevation = wgs84.height_of(geocentric)
        
        # Calculate velocity
        velocity = satellite.velocity_at(t)
        
        return {
            'norad_id': norad_id,
            'timestamp': timestamp.isoformat(),
            'latitude': lat.degrees,
            'longitude': lon.degrees,
            'altitude': elevation.km,
            'velocity': {
                'x': velocity[0].km_per_s,
                'y': velocity[1].km_per_s,
                'z': velocity[2].km_per_s
            }
        }
    except Exception as e:
        logger.error(f"Error calculating position for {norad_id}: {e}")
        raise

def calculate_conjunction(sat1_id: str, sat2_id: str, start_time: datetime, 
                        end_time: datetime, min_distance: float = 10.0) -> List[Dict[str, Any]]:
    """Calculate conjunction analysis between two satellites"""
    try:
        if sat1_id not in satellites_cache or sat2_id not in satellites_cache:
            raise ValueError("One or both satellites not found in cache")
        
        sat1 = satellites_cache[sat1_id]
        sat2 = satellites_cache[sat2_id]
        
        # Generate time range
        times = ts.linspace(ts.from_datetime(start_time), ts.from_datetime(end_time), 1000)
        
        conjunctions = []
        for t in times:
            pos1 = sat1.at(t)
            pos2 = sat2.at(t)
            
            # Calculate distance
            distance = (pos1 - pos2).distance().km
            
            if distance <= min_distance:
                conjunctions.append({
                    'timestamp': t.utc_datetime().isoformat(),
                    'distance_km': distance,
                    'satellite1_position': {
                        'x': pos1.position.km[0],
                        'y': pos1.position.km[1],
                        'z': pos1.position.km[2]
                    },
                    'satellite2_position': {
                        'x': pos2.position.km[0],
                        'y': pos2.position.km[1],
                        'z': pos2.position.km[2]
                    }
                })
        
        return conjunctions
    except Exception as e:
        logger.error(f"Error calculating conjunction: {e}")
        raise

def calculate_pass_predictions(norad_id: str, latitude: float, longitude: float, 
                             altitude: float = 0.0, start_time: Optional[datetime] = None,
                             end_time: Optional[datetime] = None, min_elevation: float = 10.0) -> List[Dict[str, Any]]:
    """Calculate pass predictions for a satellite from a given location"""
    try:
        if norad_id not in satellites_cache:
            raise ValueError(f"Satellite {norad_id} not found in cache")
        
        satellite = satellites_cache[norad_id]
        observer = wgs84.latlon(latitude, longitude, altitude)
        
        if start_time is None:
            start_time = datetime.utcnow()
        if end_time is None:
            end_time = start_time + timedelta(days=7)
        
        # Generate time range
        times = ts.linspace(ts.from_datetime(start_time), ts.from_datetime(end_time), 10000)
        
        passes = []
        in_pass = False
        pass_start = None
        max_elevation = 0
        
        for t in times:
            # Calculate satellite position relative to observer
            difference = satellite - observer
            topocentric = difference.at(t)
            alt, az, distance = topocentric.altaz()
            
            elevation = alt.degrees
            
            if elevation >= min_elevation:
                if not in_pass:
                    in_pass = True
                    pass_start = t.utc_datetime()
                    max_elevation = elevation
                else:
                    max_elevation = max(max_elevation, elevation)
            elif in_pass:
                # Pass ended
                pass_end = t.utc_datetime()
                passes.append({
                    'start_time': pass_start.isoformat(),
                    'end_time': pass_end.isoformat(),
                    'duration_minutes': (pass_end - pass_start).total_seconds() / 60,
                    'max_elevation': max_elevation,
                    'satellite_id': norad_id
                })
                in_pass = False
                max_elevation = 0
        
        return passes
    except Exception as e:
        logger.error(f"Error calculating pass predictions for {norad_id}: {e}")
        raise

# API Routes
@app.route('/health', methods=['GET'])
@limiter.limit("100 per minute")
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'satellites_cached': len(satellites_cache),
        'version': '1.0.0'
    })

@app.route('/satellites', methods=['GET'])
@limiter.limit("100 per minute")
def get_satellites():
    """Get list of all cached satellites"""
    try:
        satellites = []
        for norad_id, satellite in satellites_cache.items():
            satellites.append({
                'norad_id': norad_id,
                'name': satellite.name,
                'epoch': satellite.epoch.utc_datetime().isoformat()
            })
        
        return jsonify({
            'satellites': satellites,
            'count': len(satellites)
        })
    except Exception as e:
        logger.error(f"Error getting satellites: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/satellites/<norad_id>/position', methods=['POST'])
@limiter.limit("50 per minute")
def get_satellite_position(norad_id: str):
    """Get satellite position at specified time"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        position_request = PositionRequest(norad_id=norad_id, **data)
        
        # Parse timestamp
        if position_request.timestamp:
            timestamp = datetime.fromisoformat(position_request.timestamp.replace('Z', '+00:00'))
        else:
            timestamp = datetime.utcnow()
        
        position = calculate_satellite_position(norad_id, timestamp)
        return jsonify(position)
    
    except ValidationError as e:
        return jsonify({'error': f'Validation error: {e}'}), 400
    except Exception as e:
        logger.error(f"Error getting position for {norad_id}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/orbital/conjunction', methods=['POST'])
@limiter.limit("20 per minute")
def calculate_conjunction_analysis():
    """Calculate conjunction analysis between two satellites"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        conjunction_request = ConjunctionRequest(**data)
        
        start_time = datetime.fromisoformat(conjunction_request.start_time.replace('Z', '+00:00'))
        end_time = datetime.fromisoformat(conjunction_request.end_time.replace('Z', '+00:00'))
        
        conjunctions = calculate_conjunction(
            conjunction_request.satellite1_id,
            conjunction_request.satellite2_id,
            start_time,
            end_time,
            conjunction_request.min_distance
        )
        
        return jsonify({
            'conjunctions': conjunctions,
            'count': len(conjunctions),
            'analysis_period': {
                'start': conjunction_request.start_time,
                'end': conjunction_request.end_time
            }
        })
    
    except ValidationError as e:
        return jsonify({'error': f'Validation error: {e}'}), 400
    except Exception as e:
        logger.error(f"Error calculating conjunction: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/orbital/passes', methods=['POST'])
@limiter.limit("30 per minute")
def calculate_pass_predictions_endpoint():
    """Calculate pass predictions for a satellite"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        pass_request = PassPredictionRequest(**data)
        
        start_time = None
        if pass_request.start_time:
            start_time = datetime.fromisoformat(pass_request.start_time.replace('Z', '+00:00'))
        
        passes = calculate_pass_predictions(
            pass_request.norad_id,
            pass_request.latitude,
            pass_request.longitude,
            pass_request.altitude,
            start_time,
            None,  # end_time will be calculated automatically
            pass_request.min_elevation
        )
        
        return jsonify({
            'passes': passes,
            'count': len(passes),
            'location': {
                'latitude': pass_request.latitude,
                'longitude': pass_request.longitude,
                'altitude': pass_request.altitude
            }
        })
    
    except ValidationError as e:
        return jsonify({'error': f'Validation error: {e}'}), 400
    except Exception as e:
        logger.error(f"Error calculating pass predictions: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/orbital/propagate', methods=['POST'])
@limiter.limit("20 per minute")
def propagate_orbit():
    """Propagate satellite orbit for custom time period"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        norad_id = data.get('norad_id')
        start_time = datetime.fromisoformat(data['start_time'].replace('Z', '+00:00'))
        end_time = datetime.fromisoformat(data['end_time'].replace('Z', '+00:00'))
        step_minutes = data.get('step_minutes', 60)
        
        if norad_id not in satellites_cache:
            return jsonify({'error': f'Satellite {norad_id} not found'}), 404
        
        satellite = satellites_cache[norad_id]
        times = ts.linspace(ts.from_datetime(start_time), ts.from_datetime(end_time), 
                           int((end_time - start_time).total_seconds() / (step_minutes * 60)))
        
        positions = []
        for t in times:
            geocentric = satellite.at(t)
            lat, lon = wgs84.latlon_of(geocentric)
            elevation = wgs84.height_of(geocentric)
            
            positions.append({
                'timestamp': t.utc_datetime().isoformat(),
                'latitude': lat.degrees,
                'longitude': lon.degrees,
                'altitude': elevation.km
            })
        
        return jsonify({
            'norad_id': norad_id,
            'positions': positions,
            'count': len(positions)
        })
    
    except Exception as e:
        logger.error(f"Error propagating orbit: {e}")
        return jsonify({'error': str(e)}), 500

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(429)
def too_many_requests(error):
    return jsonify({'error': 'Too many requests'}), 429

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

# Initialize satellite cache on startup
def initialize_cache():
    """Initialize satellite cache with TLE data"""
    try:
        logger.info("Loading TLE data from Celestrak...")
        satellites_data = load_tle_data()
        
        for norad_id, satellite_data in satellites_data.items():
            try:
                satellite = create_satellite_object(satellite_data)
                satellites_cache[norad_id] = satellite
            except Exception as e:
                logger.warning(f"Failed to create satellite object for {norad_id}: {e}")
                continue
        
        logger.info(f"Loaded {len(satellites_cache)} satellites into cache")
        
    except Exception as e:
        logger.error(f"Failed to initialize satellite cache: {e}")

if __name__ == '__main__':
    # Initialize cache on startup
    initialize_cache()
    
    # Run the app
    app.run(host='0.0.0.0', port=5000, debug=False)