"""Auth primitives with no framework dependency, so they stay unit-testable
without booting FastAPI/Mongo. Added after the 2026-08-01 bot takeover.
"""
import hmac


def consteq(a: str, b: str) -> bool:
    """Constant-time compare.

    hmac.compare_digest rejects non-ASCII str, so comparing raw strings let an
    attacker force an unhandled 500 just by sending a non-ASCII password or
    header — and the failed attempt never reached the throttle. Compare UTF-8
    bytes instead.
    """
    return hmac.compare_digest((a or '').encode('utf-8'), (b or '').encode('utf-8'))


def client_ip(request) -> str:
    """Best-effort real client IP for rate-limit bucketing.

    X-Forwarded-For is client-supplied and proxies APPEND to it, so element [0]
    is whatever the caller injected — rotating it would mint a fresh throttle
    bucket per request. Prefer the platform header, else the LAST hop (ours).
    """
    real = (request.headers.get('x-real-ip') or '').strip()
    if real:
        return real
    xff = [p.strip() for p in request.headers.get('x-forwarded-for', '').split(',') if p.strip()]
    if xff:
        return xff[-1]
    return request.client.host if request.client else 'unknown'
