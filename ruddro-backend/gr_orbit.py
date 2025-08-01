import sys
import json
import numpy as np

def equations(t, y, mu, c, J2, R_e):
    """Return derivative vector [vx, vy, vz, ax, ay, az] at time t for state y."""
    r = y[0:3]
    v = y[3:6]
    r_mag = np.linalg.norm(r)
    v_mag2 = np.dot(v, v)
    r_hat = r / r_mag

    # Newtonian gravity
    a_newton = -mu * r_hat / r_mag**2

    # J2 perturbation (oblateness)
    z_dot = np.dot(r, [0, 0, 1]) / r_mag
    a_j2 = -(3/2) * J2 * mu * R_e**2 / r_mag**4 * (
        (3 * z_dot**2 - 1) * r_hat + 2 * z_dot * (np.array([0, 0, 1]) - 3 * z_dot * r_hat)
    )

    # First-order general relativity correction
    a_gr = (mu / (c**2 * r_mag**2)) * (
        (2 * mu / r_mag - v_mag2) * r_hat + 4 * (np.dot(r, v) / r_mag) * (v / r_mag)
    )

    a_total = a_newton + a_j2 + a_gr
    return np.concatenate([v, a_total])

def rk4_step(f, t, y, dt, *args):
    """Perform a single Runge–Kutta 4th order step."""
    k1 = f(t, y, *args)
    k2 = f(t + dt/2, y + dt * k1 / 2, *args)
    k3 = f(t + dt/2, y + dt * k2 / 2, *args)
    k4 = f(t + dt, y + dt * k3, *args)
    return y + (dt / 6) * (k1 + 2*k2 + 2*k3 + k4)

# Initial state from command line
if len(sys.argv) < 2:
    raise ValueError("Usage: gr_orbit.py <comma-separated x,y,z,vx,vy,vz>")
y0 = np.array(list(map(float, sys.argv[1].split(','))))

# Simulation parameters
mu = 398600.4418         # Earth's GM
c  = 299792.458          # speed of light (km/s)
J2 = 1.0826e-3
R_e= 6371.0              # Earth radius (km)
T_end = 5400.0           # 90 minutes (sec)
N_steps = 100
dt = T_end / (N_steps - 1)

# Integrate
positions = []
t = 0.0
y = y0.copy()
for i in range(N_steps):
    positions.append(y[:3].tolist())
    y = rk4_step(equations, t, y, dt, mu, c, J2, R_e)
    t += dt

print(json.dumps(positions))
