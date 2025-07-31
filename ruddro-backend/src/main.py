import os
import sys
import json
import time
import random
import math
import threading
from datetime import datetime, timedelta
# DON'T CHANGE THIS !!!
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from src.models.user import db
from src.routes.user import user_bp
from src.routes.ai_insights import ai_bp
from routes.real_space_data import real_space_data_bp
app = Flask(__name__, static_folder=os.path.join(os.path.dirname(__file__), 'static'))
app.config['SECRET_KEY'] = 'quantum_neural_matrix_2025_advanced_encryption'

# Enable CORS for all routes and origins
CORS(app, origins="*")

# Initialize SocketIO for real-time communication
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Register blueprints
app.register_blueprint(user_bp)
app.register_blueprint(ai_bp, url_prefix='/api/ai')
app.register_blueprint(real_space_data_bp)

# Database configuration
app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{os.path.join(os.path.dirname(__file__), 'database', 'app.db')}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)
with app.app_context():
    db.create_all()

# Global variables for real-time data simulation
active_connections = 0
system_metrics = {
    'neural_activity': 0.0,
    'quantum_coherence': 0.0,
    'data_flow_rate': 0.0,
    'ai_processing_load': 0.0,
    'timestamp': datetime.now().isoformat()
}

def generate_advanced_metrics():
    """Generate futuristic system metrics"""
    global system_metrics
    while True:
        # Simulate advanced AI and quantum computing metrics
        system_metrics.update({
            'neural_activity': round(random.uniform(0.3, 0.95) + 0.1 * math.sin(time.time() * 0.1), 3),
            'quantum_coherence': round(random.uniform(0.7, 0.99) + 0.05 * math.cos(time.time() * 0.15), 3),
            'data_flow_rate': round(random.uniform(850, 1200) + 100 * math.sin(time.time() * 0.2), 1),
            'ai_processing_load': round(random.uniform(0.4, 0.8) + 0.2 * math.cos(time.time() * 0.05), 3),
            'timestamp': datetime.now().isoformat(),
            'active_connections': active_connections
        })
        
        # Emit to all connected clients
        socketio.emit('system_metrics', system_metrics)
        time.sleep(0.5)  # Update every 500ms for smooth animations

# Start background thread for metrics generation
metrics_thread = threading.Thread(target=generate_advanced_metrics, daemon=True)
metrics_thread.start()

@socketio.on('connect')
def handle_connect():
    global active_connections
    active_connections += 1
    emit('connection_status', {'status': 'connected', 'id': request.sid})
    emit('system_metrics', system_metrics)

@socketio.on('disconnect')
def handle_disconnect():
    global active_connections
    active_connections = max(0, active_connections - 1)

@app.route('/api/status')
def system_status():
    """Advanced system status endpoint"""
    return jsonify({
        'status': 'operational',
        'version': '3.14.159',
        'architecture': 'quantum_neural_hybrid',
        'uptime': time.time(),
        'capabilities': [
            'real_time_processing',
            'ai_content_generation',
            'quantum_encryption',
            'neural_pattern_recognition',
            'holographic_rendering'
        ],
        'metrics': system_metrics
    })

@app.route('/api/thoughts/generate')
def generate_thought():
    """AI-powered thought generation"""
    thoughts = [
        "What if consciousness is just the universe's way of debugging itself?",
        "In a multiverse of infinite possibilities, are we the exception or the rule?",
        "When AI surpasses human intelligence, will it still need us to ask the right questions?",
        "If time is an illusion, then progress is just a persistent dream we're all sharing.",
        "The gap between what we can imagine and what we can build is shrinking exponentially.",
        "Every line of code we write is a small act of creation in the digital cosmos.",
        "What if the next breakthrough in AI comes not from more data, but from better questions?",
        "In the quantum realm, observation changes reality. In AI, attention changes understanding.",
        "The future isn't something we predict; it's something we architect, one decision at a time.",
        "When machines dream, do they dream of electric sheep, or do they dream of becoming human?"
    ]
    
    return jsonify({
        'thought': random.choice(thoughts),
        'timestamp': datetime.now().isoformat(),
        'neural_confidence': round(random.uniform(0.85, 0.99), 3),
        'quantum_signature': f"QS-{random.randint(1000, 9999)}-{int(time.time())}"
    })

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    static_folder_path = app.static_folder
    if static_folder_path is None:
        return "Static folder not configured", 404

    if path != "" and os.path.exists(os.path.join(static_folder_path, path)):
        return send_from_directory(static_folder_path, path)
    else:
        index_path = os.path.join(static_folder_path, 'index.html')
        if os.path.exists(index_path):
            return send_from_directory(static_folder_path, 'index.html')
        else:
            return "index.html not found", 404

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, allow_unsafe_werkzeug=True)

