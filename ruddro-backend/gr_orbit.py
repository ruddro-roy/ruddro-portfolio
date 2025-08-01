import sys
import json
from scipy.integrate import odeint
import numpy as np

def gr_orbit(y, t, mu, c, J2, R_e):
    r = y[0:3]
    v = y[3:6]
    r_mag = np.linalg.norm(r)
    v_mag2 = np.dot(v, v)
    r_hat = r / r_mag

    # Newtonian acceleration
    a_newton = -mu * r_hat / r_mag**2

    # J2 oblateness perturbation (k = [0,0,1])
    z_dot = np.dot(r, [0, 0, 1]) / r_mag
    a_j2 = -(3/2) * J2 * mu * R_e**2 / r_mag**4 * (
        (3 * z_dot**2 - 1) * r_hat + 2 * z_dot * (np.array([0, 0, 1]) - 3 * z_dot * r_hat)
    )

    # First-order GR post-Newtonian correction
    a_gr = (mu / (c**2 * r_mag**2)) * (
        (2 * mu / r_mag - v_mag2) * r_hat + 4 * (np.dot(r, v) / r_mag) * (v / r_mag)
    )

    return np.concatenate([v, a_newton + a_j2 + a_gr])

# Parse initial state vector [x,y,z,vx,vy,vz] from command line
if len(sys.argv) < 2:
    raise ValueError("Usage: gr_orbit.py <comma-separated x,y,z,vx,vy,vz>")
y0 = list(map(float, sys.argv[1].split(',')))

# Integrate for 90 minutes (5400 seconds) with 100 points
t = np.linspace(0, 5400, 100)
mu = 398600.4418
c = 299792.458
J2 = 1.0826e-3
R_e = 6371.0

sol = odeint(gr_orbit, y0, t, args=(mu, c, J2, R_e))
# Output positions only
print(json.dumps(sol[:, :3].tolist()))
