import sys
from scipy.integrate import odeint
import numpy as np

def gr_orbit(y, t, mu, c, J2, R_e):
    r = y[0:3]
    v = y[3:6]
    r_mag = np.linalg.norm(r)
    v_mag2 = np.dot(v, v)
    r_hat = r / r_mag
    a_newton = -mu * r_hat / r_mag**2
    # J2: Oblateness a_j2 = - (3/2) J2 μ R_e^2 / r^5 * [r - 5 (r·k)^2 r / r^2 + 2 (r·k) k], k=z-hat
    z_dot = np.dot(r, [0,0,1]) / r_mag
    a_j2 = - (3/2) * J2 * mu * R_e**2 / r_mag**4 * ((3 * z_dot**2 - 1) * r_hat + 2 * z_dot * [0,0,1 - 3 z_dot**2])
    # GR PN: a_gr = (μ / (c^2 r^2)) * [ (2 μ / r - v_mag2) r_hat + (4 np.dot(r, v) / r_mag**2) v ]
    a_gr = (mu / (c**2 * r_mag**2)) * ((2 * mu / r_mag - v_mag2) * r_hat + 4 * (np.dot(r, v) / r_mag) * (v / r_mag))
    return np.concatenate([v, a_newton + a_j2 + a_gr])

y0 = list(map(float, sys.argv[1].split(',')))
t = np.linspace(0, 5400, 100)  # 90 min, 100 points
sol = odeint(gr_orbit, y0, t, args=(398600.4418, 299792.458, 1.0826e-3, 6371))
print(json.dumps(sol[:,0:3].tolist()))  # Positions [[x1,y1,z1], ...]
