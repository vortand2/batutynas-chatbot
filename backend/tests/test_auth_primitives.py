"""Regression tests for the auth primitives added after the 2026-08-01 bot takeover.

Both cases here are bugs that shipped and were caught in review — keep them.

Run: python3 backend/tests/test_auth_primitives.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from authutils import consteq as _consteq, client_ip as _client_ip  # noqa: E402


class _FakeRequest:
    def __init__(self, headers, host="10.0.0.1"):
        self.headers = headers
        self.client = type("C", (), {"host": host})()


def test_consteq_survives_non_ascii():
    # hmac.compare_digest raises TypeError on non-ASCII str. Before the byte
    # encoding, POST /admin/auth {"password": "A"} returned an unhandled 500
    # and the attempt was never recorded by the throttle.
    assert _consteq("Ā", "abc") is False


def test_consteq_allows_lithuanian_passwords():
    assert _consteq("ąčęėį", "ąčęėį") is True


def test_consteq_still_correct():
    assert _consteq("secret", "secret") is True
    assert _consteq("secret", "secrey") is False
    assert _consteq(None, "x") is False
    assert _consteq("", "") is True


def test_client_ip_ignores_spoofed_first_hop():
    # X-Forwarded-For is client-supplied and proxies APPEND. Reading [0] let an
    # attacker mint a fresh throttle bucket per request by rotating the header.
    r = _FakeRequest({"x-forwarded-for": "evil-rotating-value, 203.0.113.9"})
    assert _client_ip(r) == "203.0.113.9"


def test_client_ip_prefers_platform_header():
    r = _FakeRequest({"x-real-ip": "203.0.113.9", "x-forwarded-for": "1.2.3.4"})
    assert _client_ip(r) == "203.0.113.9"


def test_client_ip_falls_back_to_socket():
    assert _client_ip(_FakeRequest({})) == "10.0.0.1"


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print("PASS", name)
    print("all auth primitive tests passed")
