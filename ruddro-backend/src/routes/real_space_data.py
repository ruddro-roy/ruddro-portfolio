from flask import Blueprint, jsonify
import requests
import time
from datetime import datetime

real_space_data_bp = Blueprint('real_space_data', __name__)

@real_space_data_bp.route('/api/iss-location', methods=['GET'])
def get_iss_location():
    """Get real-time ISS location from Open Notify API"""
    try:
        response = requests.get('http://api.open-notify.org/iss-now.json', timeout=10)
        if response.status_code == 200:
            data = response.json()
            return jsonify({
                'success': True,
                'data': data,
                'source': 'Open Notify API',
                'data_type': 'real-time',
                'last_updated': datetime.now().isoformat()
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to fetch ISS data',
                'data_type': 'real-time'
            }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'data_type': 'real-time'
        }), 500

@real_space_data_bp.route('/api/people-in-space', methods=['GET'])
def get_people_in_space():
    """Get current people in space from Open Notify API"""
    try:
        response = requests.get('http://api.open-notify.org/astros.json', timeout=10)
        if response.status_code == 200:
            data = response.json()
            return jsonify({
                'success': True,
                'data': data,
                'source': 'Open Notify API',
                'data_type': 'real-time',
                'last_updated': datetime.now().isoformat()
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to fetch astronaut data',
                'data_type': 'real-time'
            }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'data_type': 'real-time'
        }), 500

@real_space_data_bp.route('/api/nasa-apod', methods=['GET'])
def get_nasa_apod():
    """Get NASA Astronomy Picture of the Day"""
    try:
        # Using DEMO_KEY for now - user can replace with their own key
        api_key = 'DEMO_KEY'
        response = requests.get(
            f'https://api.nasa.gov/planetary/apod?api_key={api_key}',
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            return jsonify({
                'success': True,
                'data': data,
                'source': 'NASA APOD API',
                'data_type': 'real-time',
                'last_updated': datetime.now().isoformat()
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to fetch NASA APOD data',
                'data_type': 'real-time'
            }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'data_type': 'real-time'
        }), 500

@real_space_data_bp.route('/api/near-earth-objects', methods=['GET'])
def get_near_earth_objects():
    """Get Near Earth Objects data from NASA"""
    try:
        # Using DEMO_KEY for now - user can replace with their own key
        api_key = 'DEMO_KEY'
        today = datetime.now().strftime('%Y-%m-%d')
        response = requests.get(
            f'https://api.nasa.gov/neo/rest/v1/feed?start_date={today}&end_date={today}&api_key={api_key}',
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            return jsonify({
                'success': True,
                'data': data,
                'source': 'NASA NeoWs API',
                'data_type': 'real-time',
                'last_updated': datetime.now().isoformat()
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to fetch Near Earth Objects data',
                'data_type': 'real-time'
            }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'data_type': 'real-time'
        }), 500

@real_space_data_bp.route('/api/space-weather', methods=['GET'])
def get_space_weather():
    """Get space weather data from NASA DONKI"""
    try:
        # Using DEMO_KEY for now - user can replace with their own key
        api_key = 'DEMO_KEY'
        today = datetime.now().strftime('%Y-%m-%d')
        response = requests.get(
            f'https://api.nasa.gov/DONKI/FLR?startDate={today}&endDate={today}&api_key={api_key}',
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            return jsonify({
                'success': True,
                'data': data,
                'source': 'NASA DONKI API',
                'data_type': 'real-time',
                'last_updated': datetime.now().isoformat()
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to fetch space weather data',
                'data_type': 'real-time'
            }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'data_type': 'real-time'
        }), 500

