"""
clarke_wright.py – Clarke-Wright Savings Algorithm for geo-aware vehicle assignment.

Replaces greedy bin-packing (FFD) with distance-optimised route clustering.

Key properties:
  - Minimises total driving distance by merging stops with highest "savings"
  - Uses fewest vehicles possible (consolidation-first)
  - Respects vehicle capacity strictly
  - Handles 'full' unit stops (Mega/Giga) — isolated, never merged
  - Graceful fallback when stops lack coordinates

Algorithm steps:
  1. Separate full-vehicle and no-coordinate stops (handled specially)
  2. Compute savings: saving(i,j) = d(depot→i) + d(depot→j) − d(i→j)
  3. Initialize each stop as its own route
  4. Greedily merge pairs with highest saving (respecting capacity)
  5. Assign merged routes to vehicles via best-fit decreasing
  6. Append no-coordinate and overflow stops to emptiest vehicles

Usage:
    from clarke_wright import clarke_wright_assign, has_coordinates

    assignments, unassigned = clarke_wright_assign(
        delivery_stops, vehicles, depot_coords=(55.516, 22.721)
    )
"""

from __future__ import annotations
import math

# Pagramantis, Tauragės r. – fixed depot coordinates
DEPOT_LAT = 55.516
DEPOT_LNG = 22.721

# Items whose name contains these keywords occupy the whole vehicle
FULL_VEHICLE_KEYWORDS = ("mega", "giga")

# Minimum fraction of stops that must have coordinates for CW to engage
MIN_COORD_FRACTION = 0.5


# ── Helpers ───────────────────────────────────────────────────────────────────

def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Straight-line distance in km (Haversine formula)."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _stop_dist(a: dict, b: dict) -> float:
    """Distance between two stops in km; inf if either lacks coordinates."""
    la, lo = a.get("lat"), a.get("lng")
    lb, lo2 = b.get("lat"), b.get("lng")
    if la is None or lo is None or lb is None or lo2 is None:
        return float("inf")
    return _haversine(float(la), float(lo), float(lb), float(lo2))


def _depot_dist(stop: dict, depot: tuple[float, float]) -> float:
    """Distance from depot to stop in km; 0 if coordinates missing."""
    la, lo = stop.get("lat"), stop.get("lng")
    if la is None or lo is None:
        return 0.0
    return _haversine(depot[0], depot[1], float(la), float(lo))


def _is_full(units) -> bool:
    return units == "full"


def _units_as_float(units, vehicle_capacity: float = 999.0) -> float:
    if units == "full":
        return float(vehicle_capacity)
    try:
        return float(units)
    except (TypeError, ValueError):
        return 1.0


def has_coordinates(stops: list[dict]) -> bool:
    """Return True when enough stops have lat/lng for Clarke-Wright to be useful."""
    if not stops:
        return False
    n_with = sum(1 for s in stops if s.get("lat") is not None and s.get("lng") is not None)
    return n_with >= max(2, int(len(stops) * MIN_COORD_FRACTION))


# ── Main algorithm ────────────────────────────────────────────────────────────

def clarke_wright_assign(
    stops: list[dict],
    vehicles: list[dict],
    depot_coords: tuple[float, float] = (DEPOT_LAT, DEPOT_LNG),
) -> tuple[dict[str, list[str]], list[str]]:
    """
    Assign delivery stops to vehicles using the Clarke-Wright savings algorithm.

    Args:
        stops:          List of stop dicts with keys: id, units (float|'full'),
                        lat (float|None), lng (float|None)
        vehicles:       List of vehicle dicts with keys: id, capacity (float)
        depot_coords:   (lat, lng) of the starting depot

    Returns:
        assignments     {vehicle_id: [stop_id, ...]}
        unassigned      [stop_id, ...]  — could not be placed (capacity exceeded)
    """
    if not vehicles:
        return {}, [s["id"] for s in stops]
    if not stops:
        return {v["id"]: [] for v in vehicles}, []

    # ── Partition stops ───────────────────────────────────────────────────────
    full_stops   = [s for s in stops if _is_full(s.get("units"))]
    reg_stops    = [s for s in stops if not _is_full(s.get("units"))]
    no_coord     = [s for s in reg_stops if s.get("lat") is None or s.get("lng") is None]
    coord_stops  = [s for s in reg_stops if s.get("lat") is not None and s.get("lng") is not None]

    n = len(coord_stops)

    # ── Sort vehicles: largest capacity first ─────────────────────────────────
    sorted_veh = sorted(vehicles, key=lambda v: -float(v.get("capacity", 4)))
    max_cap    = float(sorted_veh[0].get("capacity", 4)) if sorted_veh else 4.0

    # ── Compute savings matrix ────────────────────────────────────────────────
    # saving(i,j) = d(depot,i) + d(depot,j) - d(i,j)
    # High saving → stops are far from depot but close to each other → merge them
    savings: list[tuple[float, float, int, int]] = []
    for i in range(n):
        for j in range(i + 1, n):
            si, sj = coord_stops[i], coord_stops[j]
            d_di = _depot_dist(si, depot_coords)
            d_dj = _depot_dist(sj, depot_coords)
            d_ij = _stop_dist(si, sj)
            saving = d_di + d_dj - d_ij
            combined = (
                _units_as_float(si.get("units", 1))
                + _units_as_float(sj.get("units", 1))
            )
            # Tie-break: prefer pairs with more total units (consolidate heavy loads first)
            savings.append((saving, combined, i, j))

    savings.sort(key=lambda x: (-x[0], -x[1]))

    # ── Initialise: each stop is its own route ────────────────────────────────
    # route_id → ordered list of stop indices
    routes: dict[int, list[int]] = {i: [i] for i in range(n)}
    # stop index → current route id
    stop_route: dict[int, int] = {i: i for i in range(n)}
    # route_id → total units consumed
    route_units: dict[int, float] = {
        i: _units_as_float(coord_stops[i].get("units", 1)) for i in range(n)
    }
    next_rid = n  # monotonically increasing route id counter

    # ── Greedy merge loop ─────────────────────────────────────────────────────
    for _saving, _combined, i, j in savings:
        ri = stop_route.get(i)
        rj = stop_route.get(j)
        if ri is None or rj is None or ri == rj:
            continue

        route_i = routes[ri]
        route_j = routes[rj]

        # Both stops must be route endpoints (not interior nodes)
        if i not in (route_i[0], route_i[-1]):
            continue
        if j not in (route_j[0], route_j[-1]):
            continue

        # Merged capacity must not exceed the LARGEST available vehicle
        # (we'll do best-fit assignment to actual vehicles afterwards)
        merged_u = route_units[ri] + route_units[rj]
        if merged_u > max_cap + 0.01:
            continue

        # Orient: i at tail of route_i, j at head of route_j, then concatenate
        if route_i[0] == i:
            route_i = list(reversed(route_i))
        if route_j[-1] == j:
            route_j = list(reversed(route_j))

        merged = route_i + route_j

        # Create new merged route
        routes[next_rid]     = merged
        route_units[next_rid] = merged_u
        for idx in merged:
            stop_route[idx] = next_rid
        del routes[ri], routes[rj]
        next_rid += 1

    # ── Collect final routes (deduplicated) ───────────────────────────────────
    seen: set[int] = set()
    final_routes: list[tuple[float, list[str]]] = []   # (total_units, [stop_id, ...])
    for idx in range(n):
        rid = stop_route[idx]
        if rid in seen:
            continue
        seen.add(rid)
        stop_ids = [coord_stops[k]["id"] for k in routes[rid]]
        final_routes.append((route_units[rid], stop_ids))

    # Largest route first → gets assigned to largest vehicle
    final_routes.sort(key=lambda x: -x[0])

    # ── Assign to vehicles ────────────────────────────────────────────────────
    assignments: dict[str, list[str]]  = {v["id"]: [] for v in vehicles}
    remaining:   dict[str, float]      = {v["id"]: float(v.get("capacity", 4)) for v in vehicles}
    unassigned:  list[str]             = []

    # 1. Full-vehicle stops first — each needs an empty vehicle
    for fs in full_stops:
        placed = False
        for v in sorted_veh:
            vid = v["id"]
            cap = float(v.get("capacity", 4))
            if abs(remaining[vid] - cap) < 0.01:   # still empty
                assignments[vid].append(fs["id"])
                remaining[vid] = 0.0
                placed = True
                break
        if not placed:
            unassigned.append(fs["id"])

    # 2. Clarke-Wright routes — best-fit decreasing into remaining vehicles
    for r_units, stop_ids in final_routes:
        # Best fit: vehicle where (remaining − route_units) is smallest non-negative
        best_vid   = None
        best_slack = float("inf")
        for v in sorted_veh:
            vid = v["id"]
            slack = remaining[vid] - r_units
            if slack >= -0.01 and slack < best_slack:
                best_slack = slack
                best_vid   = vid

        if best_vid is not None:
            assignments[best_vid].extend(stop_ids)
            remaining[best_vid] = round(remaining[best_vid] - r_units, 4)
        else:
            # Route is too large for any vehicle — split and assign individually
            for sid in stop_ids:
                stop_obj  = next((s for s in coord_stops if s["id"] == sid), None)
                su        = _units_as_float(stop_obj.get("units", 1) if stop_obj else 1)
                placed    = False
                for v in sorted_veh:
                    vid = v["id"]
                    if remaining[vid] >= su - 0.01:
                        assignments[vid].append(sid)
                        remaining[vid] = round(remaining[vid] - su, 4)
                        placed = True
                        break
                if not placed:
                    unassigned.append(sid)

    # 3. No-coordinate stops — assign to vehicle with most remaining capacity
    for ns in no_coord:
        if not sorted_veh:
            unassigned.append(ns["id"])
            continue
        best_vid = max(remaining, key=remaining.get)
        best_v   = next(v for v in vehicles if v["id"] == best_vid)
        su       = _units_as_float(ns.get("units", 1), float(best_v.get("capacity", 4)))
        if remaining[best_vid] >= su - 0.01:
            assignments[best_vid].append(ns["id"])
            remaining[best_vid] = round(remaining[best_vid] - su, 4)
        else:
            # Try remaining vehicles
            placed = False
            for v in sorted_veh:
                vid = v["id"]
                su2 = _units_as_float(ns.get("units", 1), float(v.get("capacity", 4)))
                if remaining[vid] >= su2 - 0.01:
                    assignments[vid].append(ns["id"])
                    remaining[vid] = round(remaining[vid] - su2, 4)
                    placed = True
                    break
            if not placed:
                unassigned.append(ns["id"])

    return assignments, unassigned
