import sys
import json
import numpy as np


def equations(t, y, mu, c, j2, r_e):
    """
    Compute the derivative of the state vector for a satellite orbiting an oblate
    Earth with first‑order general relativity corrections.

    Parameters:
        t   – time (unused because the system is autonomous)
        y   – state vector [x, y, z, vx, vy, vz]
        mu  – Earth’s gravitational parameter (km^3/s^2)
        c   – speed of light (km/s)
        j2  – J2 coefficient (dimensionless)
        r_e – mean Earth radius (km)

    Returns:
        A 6‑element vector [vx, vy, vz, ax, ay, az].
    """
    r = y[0:3]
    v = y[3:6]
    r_mag = np.linalg.norm(r)
    v_mag2 = np.dot(v, v)
    r_hat = r / r_mag

    # Newtonian gravity
    a_newton = -mu * r_hat / r_mag ** 2

    # J2 perturbation (oblateness)
    z_dot = np.dot(r, [0, 0, 1]) / r_mag
    a_j2 = (
        -1.5
        * j2
        * mu
        * r_e ** 2
        / r_mag ** 4
        * ((3 * z_dot ** 2 - 1) * r_hat + 2 * z_dot * (np.array([0, 0, 1]) - 3 * z_dot * r_hat))
    )

    # First‑order general relativity correction
    a_gr = (mu / (c ** 2 * r_mag ** 2)) * (
        (2 * mu / r_mag - v_mag2) * r_hat + 4 * (np.dot(r, v) / r_mag) * (v / r_mag)
    )

    a_total = a_newton + a_j2 + a_gr
    return np.concatenate([v, a_total])


def rk4_step(f, t, y, dt, *args):
    """
    Perform a single fourth‑order Runge–Kutta integration step.

    Parameters:
        f    – derivative function f(t, y, *args)
        t    – current time (unused here)
        y    – current state vector
        dt   – time step
        args – extra parameters passed to f

    Returns:
        The updated state vector after one RK4 step.
    """
    k1 = f(t, y, *args)
    k2 = f(t + dt / 2, y + dt * k1 / 2, *args)
    k3 = f(t + dt / 2, y + dt * k2 / 2, *args)
    k4 = f(t + dt, y + dt * k3, *args)
    return y + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4)


def main():
    if len(sys.argv) < 2:
        raise ValueError('Usage: gr_orbit.py <comma‑separated state>')
    y0 = np.array(list(map(float, sys.argv[1].split(','))))

    # Physical constants
    mu = 398600.4418  # Earth’s GM (km^3/s^2)
    c = 299792.458  # speed of light (km/s)
    j2 = 1.0826e-3
    r_e = 6371.0  # Earth radius (km)
    t_end = 5400.0  # integrate for 90 minutes (s)
    n_steps = 100
    dt = t_end / (n_steps - 1)

    # Integrate orbit
    positions = []
    t = 0.0
    y = y0.copy()
    for _ in range(n_steps):
        positions.append(y[:3].tolist())
        y = rk4_step(equations, t, y, dt, mu, c, j2, r_e)
        t += dt

    print(json.dumps(positions))


if __name__ == '__main__':
    main()