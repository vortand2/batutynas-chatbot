"""
bin_pack.py – Multi-vehicle capacity bin-packing algorithm.

Rules:
  - 'full' units  → item takes the vehicle's entire capacity (e.g. Mega Ruožas)
  - float/int units → item takes that many capacity slots (supports 0.5 fractions)
  - Vehicles are filled greedily: largest items first, first vehicle that fits.

Usage:
    from bin_pack import bin_pack, get_default_units

    assignments, unassigned = bin_pack(stops, vehicles)
"""

from __future__ import annotations

# Keywords whose presence (anywhere in equipment name) marks the item as full-vehicle
FULL_VEHICLE_KEYWORDS = ("mega", "giga")


def get_default_units(equipment: str) -> str | float:
    """Auto-detect unit cost for an equipment name.

    Returns 'full' for large trampolines (Mega/Giga), 1.0 for everything else.
    The owner can override this value in the UI.
    """
    name = (equipment or "").lower()
    for kw in FULL_VEHICLE_KEYWORDS:
        if kw in name:
            return "full"
    return 1.0


def _effective_units(units: str | int | float | None, vehicle_capacity: float) -> float:
    """Convert units to a float for comparison against remaining capacity."""
    if units == "full":
        return float(vehicle_capacity)
    try:
        return float(units)
    except (TypeError, ValueError):
        return 1.0


def bin_pack(stops: list[dict], vehicles: list[dict]) -> tuple[dict[str, list[str]], list[str]]:
    """Greedy bin-packing: assign stops to vehicles by capacity.

    Supports fractional units (e.g. 0.5 for small add-ons).

    Args:
        stops:    list of {id, units, ...} dicts (units = float/int or 'full')
        vehicles: list of {id, capacity, ...} dicts

    Returns:
        assignments   – {vehicle_id: [stop_id, ...]}
        unassigned    – [stop_id, ...] (could not be placed)
    """
    if not vehicles:
        return {}, [s["id"] for s in stops]

    # Sort: 'full' items first, then by units descending so large items are placed first
    def _sort_key(s: dict) -> tuple:
        u = s.get("units", 1)
        if u == "full":
            return (0, 0.0)
        try:
            return (1, -float(u))
        except (TypeError, ValueError):
            return (1, -1.0)

    sorted_stops = sorted(stops, key=_sort_key)

    remaining: dict[str, float] = {v["id"]: float(v.get("capacity", 4)) for v in vehicles}
    assignments: dict[str, list[str]] = {v["id"]: [] for v in vehicles}
    unassigned: list[str] = []

    for stop in sorted_stops:
        raw_units = stop.get("units", 1)
        placed = False

        for v in vehicles:
            vid = v["id"]
            cap = float(v.get("capacity", 4))
            rem = remaining[vid]
            eff = _effective_units(raw_units, cap)

            if raw_units == "full":
                # Full-vehicle item: only fits in an empty vehicle
                if abs(rem - cap) < 0.01:   # vehicle is empty (float-safe)
                    assignments[vid].append(stop["id"])
                    remaining[vid] = 0.0
                    placed = True
                    break
            else:
                if rem >= eff - 0.01:       # fits (float-safe epsilon)
                    assignments[vid].append(stop["id"])
                    remaining[vid] = round(rem - eff, 4)
                    placed = True
                    break

        if not placed:
            unassigned.append(stop["id"])

    return assignments, unassigned
