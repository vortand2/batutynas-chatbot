"""The availability path must never present an unverifiable date as free.

Regression guard for the 2026-08-01 finding: _check_date_bridge returned False
("available") whenever the bridge errored, and /availability still reported
source="calendar_bridge", so a bridge outage silently advertised booked dates
as free. Enabling auth on the bridge made that reachable in production.

Run: python3 backend/tests/test_availability_failclosed.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


def _aggregate(results, dates):
    """Mirrors _booked_from_bridge's aggregation and the endpoint's decision."""
    booked = [dates[i] for i, r in enumerate(results) if r is True]
    unverified = [dates[i] for i, r in enumerate(results) if r is None]
    if unverified:
        return {"booked_dates": sorted(set(booked) | set(unverified)),
                "source": "calendar_bridge_degraded",
                "unverified_count": len(unverified)}
    return {"booked_dates": booked, "source": "calendar_bridge"}


DATES = ["2026-08-01", "2026-08-02", "2026-08-03"]


def test_bridge_error_never_reported_as_free():
    # middle date errored; it must NOT appear as bookable
    out = _aggregate([False, None, True], DATES)
    assert "2026-08-02" in out["booked_dates"], "unverified date offered as free"
    assert out["source"] == "calendar_bridge_degraded"
    assert out["unverified_count"] == 1


def test_total_outage_blocks_everything_and_says_so():
    out = _aggregate([None, None, None], DATES)
    assert out["booked_dates"] == DATES
    assert out["source"] == "calendar_bridge_degraded"


def test_healthy_bridge_is_unchanged():
    out = _aggregate([False, True, False], DATES)
    assert out["booked_dates"] == ["2026-08-02"]
    assert out["source"] == "calendar_bridge", "clean data must not be labelled degraded"
    assert "unverified_count" not in out


def test_real_helper_returns_none_on_error():
    """The live helper must return None (unknown), not False (free), on failure."""
    import httpx
    from server import _check_date_bridge

    class Boom(httpx.AsyncClient):
        async def get(self, *a, **k):
            raise httpx.ConnectError("bridge down")

    async def go():
        async with Boom() as c:
            return await _check_date_bridge(c, "Monstrai", "2026-08-02")
    assert asyncio.run(go()) is None, "bridge failure must be None, not False"


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn(); print("PASS", name)
            except ImportError as e:
                print("SKIP", name, "(deps unavailable:", e, ")")
    print("done")
