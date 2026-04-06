/**
 * clarkeWright.js – Clarke-Wright Savings Algorithm (JS port of backend/clarke_wright.py)
 *
 * Running vehicle assignment in the browser means backend code never needs to
 * change when the algorithm is updated — push to git = deployed via GitHub Pages.
 *
 * Also includes binPackAssign() as a fallback when stops lack coordinates,
 * and assignPickups() to mirror the pickup-matching logic from server.py.
 *
 * Exports:
 *   hasCoordinates(stops)                           → boolean
 *   clarkeWrightAssign(stops, vehicles)             → { assignments, unassigned }
 *   binPackAssign(stops, vehicles)                  → { assignments, unassigned }
 *   assignPickups(pickupStops, assignments,
 *                 deliveryStops, vehicles)           → { assignments, unassigned }
 */

// Pagramantis, Tauragės r. – fixed depot coordinates
const DEPOT_LAT = 55.516;
const DEPOT_LNG = 22.721;

// Minimum fraction of stops that must have coordinates for CW to engage
const MIN_COORD_FRACTION = 0.5;


// ── Helpers ───────────────────────────────────────────────────────────────────

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371.0;
  const toRad = deg => (deg * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLam = toRad(lon2 - lon1);
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function stopDist(a, b) {
  const la = a.lat, lo = a.lng;
  const lb = b.lat, lo2 = b.lng;
  if (la == null || lo == null || lb == null || lo2 == null) return Infinity;
  return haversine(Number(la), Number(lo), Number(lb), Number(lo2));
}

function depotDist(stop, depot) {
  const la = stop.lat, lo = stop.lng;
  if (la == null || lo == null) return 0;
  return haversine(depot[0], depot[1], Number(la), Number(lo));
}

function isFullUnit(units) {
  return units === 'full';
}

function unitsAsFloat(units, vehicleCapacity = 999) {
  if (units === 'full') return Number(vehicleCapacity);
  const n = Number(units);
  return isNaN(n) ? 1.0 : n;
}


// ── hasCoordinates ─────────────────────────────────────────────────────────────

/**
 * Return true when enough stops have lat/lng for Clarke-Wright to be useful.
 * Mirrors: has_coordinates() in clarke_wright.py
 */
export function hasCoordinates(stops) {
  if (!stops || stops.length === 0) return false;
  const nWith = stops.filter(s => s.lat != null && s.lng != null).length;
  return nWith >= Math.max(2, Math.floor(stops.length * MIN_COORD_FRACTION));
}


// ── clarkeWrightAssign ────────────────────────────────────────────────────────

/**
 * Assign delivery stops to vehicles using Clarke-Wright savings algorithm.
 * Mirrors: clarke_wright_assign() in clarke_wright.py
 *
 * @param {Array}  stops    - [{id, units, lat, lng, ...}]
 * @param {Array}  vehicles - [{id, capacity, ...}]
 * @returns {{ assignments: Object, unassigned: Array }}
 *   assignments = { vehicleId: [stopId, ...] }
 *   unassigned  = [stopId, ...]
 */
export function clarkeWrightAssign(
  stops,
  vehicles,
  depotCoords = [DEPOT_LAT, DEPOT_LNG],
) {
  if (!vehicles || vehicles.length === 0) {
    return { assignments: {}, unassigned: stops.map(s => s.id) };
  }
  if (!stops || stops.length === 0) {
    const assignments = {};
    vehicles.forEach(v => { assignments[v.id] = []; });
    return { assignments, unassigned: [] };
  }

  // ── Partition stops ─────────────────────────────────────────────────────────
  const fullStops  = stops.filter(s => isFullUnit(s.units));
  const regStops   = stops.filter(s => !isFullUnit(s.units));
  const noCoord    = regStops.filter(s => s.lat == null || s.lng == null);
  const coordStops = regStops.filter(s => s.lat != null && s.lng != null);
  const n          = coordStops.length;

  // ── Sort vehicles: largest capacity first ───────────────────────────────────
  const sortedVeh = [...vehicles].sort(
    (a, b) => Number(b.capacity || 4) - Number(a.capacity || 4),
  );
  const maxCap = sortedVeh.length > 0 ? Number(sortedVeh[0].capacity || 4) : 4;

  // ── Compute savings matrix ──────────────────────────────────────────────────
  // saving(i,j) = d(depot,i) + d(depot,j) - d(i,j)
  const savings = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const si = coordStops[i];
      const sj = coordStops[j];
      const dDi = depotDist(si, depotCoords);
      const dDj = depotDist(sj, depotCoords);
      const dIj = stopDist(si, sj);
      const saving   = dDi + dDj - dIj;
      const combined = unitsAsFloat(si.units ?? 1) + unitsAsFloat(sj.units ?? 1);
      savings.push([saving, combined, i, j]);
    }
  }
  // Sort descending by saving, tie-break by combined units
  savings.sort((a, b) => b[0] - a[0] || b[1] - a[1]);

  // ── Initialise: each stop is its own route ──────────────────────────────────
  // routes: routeId → [stopIndex, ...]
  const routes     = {};
  const stopRoute  = {};    // stopIndex → routeId
  const routeUnits = {};    // routeId   → total units
  for (let i = 0; i < n; i++) {
    routes[i]     = [i];
    stopRoute[i]  = i;
    routeUnits[i] = unitsAsFloat(coordStops[i].units ?? 1);
  }
  let nextRid = n;

  // ── Greedy merge loop ───────────────────────────────────────────────────────
  for (const [, , i, j] of savings) {
    const ri = stopRoute[i];
    const rj = stopRoute[j];
    if (ri == null || rj == null || ri === rj) continue;

    let routeI = routes[ri];
    let routeJ = routes[rj];

    // Both stops must be route endpoints
    if (routeI[0] !== i && routeI[routeI.length - 1] !== i) continue;
    if (routeJ[0] !== j && routeJ[routeJ.length - 1] !== j) continue;

    // Capacity check
    const mergedU = routeUnits[ri] + routeUnits[rj];
    if (mergedU > maxCap + 0.01) continue;

    // Orient: i at tail of routeI, j at head of routeJ
    if (routeI[0] === i) routeI = [...routeI].reverse();
    if (routeJ[routeJ.length - 1] === j) routeJ = [...routeJ].reverse();

    const merged = [...routeI, ...routeJ];

    routes[nextRid]     = merged;
    routeUnits[nextRid] = mergedU;
    merged.forEach(idx => { stopRoute[idx] = nextRid; });
    delete routes[ri];
    delete routes[rj];
    nextRid++;
  }

  // ── Collect final routes ────────────────────────────────────────────────────
  const seen         = new Set();
  const finalRoutes  = [];  // [{ units, stopIds }]
  for (let idx = 0; idx < n; idx++) {
    const rid = stopRoute[idx];
    if (seen.has(rid)) continue;
    seen.add(rid);
    finalRoutes.push({
      units:   routeUnits[rid],
      stopIds: routes[rid].map(k => coordStops[k].id),
    });
  }
  finalRoutes.sort((a, b) => b.units - a.units);  // largest first

  // ── Assign to vehicles ──────────────────────────────────────────────────────
  const assignments = {};
  const remaining   = {};
  vehicles.forEach(v => {
    assignments[v.id] = [];
    remaining[v.id]   = Number(v.capacity || 4);
  });
  const unassigned = [];

  // 1. Full-vehicle stops → each needs an empty vehicle
  for (const fs of fullStops) {
    let placed = false;
    for (const v of sortedVeh) {
      const cap = Number(v.capacity || 4);
      if (Math.abs(remaining[v.id] - cap) < 0.01) {  // still empty
        assignments[v.id].push(fs.id);
        remaining[v.id] = 0;
        placed = true;
        break;
      }
    }
    if (!placed) unassigned.push(fs.id);
  }

  // 2. CW routes → first-fit decreasing: assign to the first (largest) vehicle
  // that can hold this route. sortedVeh is already sorted largest-capacity-first,
  // so this guarantees big vehicles fill up before small ones.
  for (const { units: rUnits, stopIds } of finalRoutes) {
    let bestVid = null;
    for (const v of sortedVeh) {
      if (remaining[v.id] >= rUnits - 0.01) {
        bestVid = v.id;
        break;  // first fit: stop at the first (largest) vehicle that fits
      }
    }

    if (bestVid !== null) {
      assignments[bestVid].push(...stopIds);
      remaining[bestVid] = Math.round((remaining[bestVid] - rUnits) * 10000) / 10000;
    } else {
      // Route too large — assign individually
      for (const sid of stopIds) {
        const stopObj = coordStops.find(s => s.id === sid);
        const su      = unitsAsFloat(stopObj?.units ?? 1);
        let placed    = false;
        for (const v of sortedVeh) {
          if (remaining[v.id] >= su - 0.01) {
            assignments[v.id].push(sid);
            remaining[v.id] = Math.round((remaining[v.id] - su) * 10000) / 10000;
            placed = true;
            break;
          }
        }
        if (!placed) unassigned.push(sid);
      }
    }
  }

  // 3. No-coordinate stops → first-fit (largest vehicle first).
  // sortedVeh is already sorted largest-capacity-first.
  for (const ns of noCoord) {
    if (sortedVeh.length === 0) { unassigned.push(ns.id); continue; }

    let placed = false;
    for (const v of sortedVeh) {
      const su = unitsAsFloat(ns.units ?? 1, Number(v.capacity || 4));
      if (remaining[v.id] >= su - 0.01) {
        assignments[v.id].push(ns.id);
        remaining[v.id] = Math.round((remaining[v.id] - su) * 10000) / 10000;
        placed = true;
        break;
      }
    }
    if (!placed) unassigned.push(ns.id);
  }

  return { assignments, unassigned };
}


// ── binPackAssign ─────────────────────────────────────────────────────────────

/**
 * Greedy bin-packing fallback (used when stops lack coordinates).
 * Mirrors: bin_pack() in bin_pack.py
 *
 * @param {Array}  stops    - [{id, units, ...}]
 * @param {Array}  vehicles - [{id, capacity, ...}]
 * @returns {{ assignments: Object, unassigned: Array }}
 */
export function binPackAssign(stops, vehicles) {
  if (!vehicles || vehicles.length === 0) {
    return { assignments: {}, unassigned: stops.map(s => s.id) };
  }

  // Sort: 'full' first, then by units descending
  const sorted = [...stops].sort((a, b) => {
    const au = a.units, bu = b.units;
    if (au === 'full' && bu !== 'full') return -1;
    if (bu === 'full' && au !== 'full') return  1;
    return unitsAsFloat(bu ?? 1) - unitsAsFloat(au ?? 1);
  });

  // Sort vehicles largest-first so first-fit-decreasing fills large vehicles first
  const sortedVehicles = [...vehicles].sort(
    (a, b) => Number(b.capacity || 4) - Number(a.capacity || 4),
  );

  const remaining   = {};
  const assignments = {};
  sortedVehicles.forEach(v => {
    remaining[v.id]   = Number(v.capacity || 4);
    assignments[v.id] = [];
  });
  // Ensure all original vehicles have an entry even if capacity is 0
  vehicles.forEach(v => {
    if (!(v.id in assignments)) assignments[v.id] = [];
  });
  const unassigned = [];

  for (const stop of sorted) {
    const rawUnits = stop.units;
    let placed = false;

    for (const v of sortedVehicles) {
      const cap = Number(v.capacity || 4);
      const rem = remaining[v.id];
      const eff = unitsAsFloat(rawUnits, cap);

      if (rawUnits === 'full') {
        if (Math.abs(rem - cap) < 0.01) {  // vehicle is empty
          assignments[v.id].push(stop.id);
          remaining[v.id] = 0;
          placed = true;
          break;
        }
      } else {
        if (rem >= eff - 0.01) {
          assignments[v.id].push(stop.id);
          remaining[v.id] = Math.round((rem - eff) * 10000) / 10000;
          placed = true;
          break;
        }
      }
    }

    if (!placed) unassigned.push(stop.id);
  }

  return { assignments, unassigned };
}


// ── assignPickups ─────────────────────────────────────────────────────────────

/**
 * Assign pickup stops to the same vehicle as their delivery counterpart.
 * Matches by formattedAddress (same address = same event = same vehicle).
 * Mirrors the pickup-matching logic in optimize_route_multi (server.py).
 *
 * @param {Array}  pickupStops  - stops with type !== 'delivery'
 * @param {Object} assignments  - current assignments from CW/bin-pack (delivery only)
 * @param {Array}  deliveryStops - all delivery stops (for address lookup)
 * @param {Array}  vehicles      - [{id, ...}]
 * @returns {{ assignments: Object, unassigned: Array }}
 *   Returns a NEW assignments object (does not mutate input).
 */
export function assignPickups(pickupStops, assignments, deliveryStops, vehicles) {
  // Deep-copy assignments so we don't mutate the input
  const result = {};
  Object.entries(assignments).forEach(([vid, ids]) => {
    result[vid] = [...ids];
  });

  // Build address → vehicleId map from delivery assignments
  const addrToVehicle = {};
  Object.entries(result).forEach(([vid, sids]) => {
    sids.forEach(sid => {
      const s = deliveryStops.find(x => x.id === sid);
      if (s) {
        const addr = (s.formattedAddress || s.address || '').trim().toLowerCase();
        if (addr) addrToVehicle[addr] = vid;
      }
    });
  });

  const unassigned = [];
  for (const ps of pickupStops) {
    const addr      = (ps.formattedAddress || ps.address || '').trim().toLowerCase();
    const targetVid = addrToVehicle[addr];

    if (targetVid && result[targetVid] !== undefined) {
      result[targetVid].push(ps.id);
    } else if (vehicles && vehicles.length > 0) {
      // Fallback: assign to the largest vehicle (big cars get priority)
      const largestVid = [...vehicles].sort(
        (a, b) => Number(b.capacity || 4) - Number(a.capacity || 4),
      )[0].id;
      result[largestVid].push(ps.id);
    } else {
      unassigned.push(ps.id);
    }
  }

  return { assignments: result, unassigned };
}
