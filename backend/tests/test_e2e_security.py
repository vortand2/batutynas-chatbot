"""
E2E and Security tests for Batutynas chatbot + admin dashboard
Tests: E2E-1 to E2E-6, SEC-1 to SEC-8
"""
import pytest
import requests
import os
import hashlib
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
ADMIN_PASSWORD = "__ADMIN_PASSWORD__"
N8N_SYNC_SECRET = "__N8N_SYNC_SECRET__"

def get_admin_token():
    day = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    return hashlib.sha256(f"{ADMIN_PASSWORD}:{day}".encode()).hexdigest()


@pytest.fixture(scope="module")
def admin_token():
    resp = requests.post(f"{BASE_URL}/api/admin/auth", json={"password": ADMIN_PASSWORD})
    assert resp.status_code == 200
    return resp.json()["token"]


@pytest.fixture(scope="module")
def test_order_id(admin_token):
    """Create a test order and return its ID. Cleanup after module."""
    resp = requests.post(f"{BASE_URL}/api/orders", json={
        "flow_type": "birthday",
        "form_data": {
            "vardas": "TEST_E2E Vartotojas",
            "telefonas": "+37060000099",
            "data": "2026-05-15",
            "batutas": "Chameleonas",
            "vieta": "Kaunas"
        }
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "pending"
    order_id = data["id"]
    yield order_id
    # cleanup - reject it so it doesn't pollute
    requests.post(
        f"{BASE_URL}/api/orders/{order_id}/reject",
        headers={"x-admin-token": admin_token}
    )


# ── E2E Tests ────────────────────────────────────────────────────────────────

class TestE2EFlow:
    """E2E flow: order creation → pending → sync → confirm/reject"""

    def test_e2e_1_create_order_returns_pending(self):
        """E2E-1: POST /api/orders with valid payload → status='pending', id returned"""
        resp = requests.post(f"{BASE_URL}/api/orders", json={
            "flow_type": "birthday",
            "form_data": {
                "vardas": "TEST_E2E1",
                "telefonas": "+37060000001",
                "data": "2026-06-01",
                "batutas": "Pilis",
                "vieta": "Vilnius"
            }
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["status"] == "pending", f"Expected pending, got {data['status']}"
        assert "id" in data and data["id"], "Expected id in response"
        # cleanup
        token = get_admin_token()
        requests.post(f"{BASE_URL}/api/orders/{data['id']}/reject", headers={"x-admin-token": token})
        print(f"E2E-1 PASS: order created with id={data['id']}, status=pending")

    def test_e2e_2_pending_orders_visible(self, admin_token, test_order_id):
        """E2E-2: GET /api/admin/pending-orders → new order visible"""
        resp = requests.get(f"{BASE_URL}/api/admin/pending-orders", headers={"x-admin-token": admin_token})
        assert resp.status_code == 200
        orders = resp.json()
        ids = [o["id"] for o in orders]
        assert test_order_id in ids, f"Order {test_order_id} not in pending orders"
        print(f"E2E-2 PASS: order {test_order_id} visible in pending-orders")

    def test_e2e_3_n8n_sync_confirmed(self, test_order_id):
        """E2E-3: POST /api/webhook/n8n-sync with confirmed → matched=1, success=true"""
        resp = requests.post(
            f"{BASE_URL}/api/webhook/n8n-sync",
            json={"orderId": test_order_id, "status": "confirmed", "source": "telegram"},
            headers={"x-sync-secret": N8N_SYNC_SECRET}
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success") is True, f"Expected success=true, got {data}"
        assert data.get("matched") == 1 or data.get("matched") == 1, f"Expected matched=1, got {data}"
        print(f"E2E-3 PASS: n8n-sync confirmed, matched={data.get('matched')}")

    def test_e2e_4_confirmed_not_in_pending(self, admin_token, test_order_id):
        """E2E-4: After n8n-sync confirmed → order not in pending-orders"""
        resp = requests.get(f"{BASE_URL}/api/admin/pending-orders", headers={"x-admin-token": admin_token})
        assert resp.status_code == 200
        orders = resp.json()
        ids = [o["id"] for o in orders]
        assert test_order_id not in ids, f"Confirmed order {test_order_id} should NOT be in pending"
        print(f"E2E-4 PASS: confirmed order not in pending list")

    def test_e2e_5_confirm_order_graceful(self, admin_token):
        """E2E-5: POST /api/orders/{id}/confirm → calls n8n, handles error gracefully (502 if n8n fails)"""
        # Create a fresh order to confirm
        resp = requests.post(f"{BASE_URL}/api/orders", json={
            "flow_type": "birthday",
            "form_data": {"vardas": "TEST_E2E5", "telefonas": "+37060000005", "data": "2026-07-01", "batutas": "Monstrai"}
        })
        assert resp.status_code == 200
        order_id = resp.json()["id"]

        confirm_resp = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/confirm",
            json={"price": 100, "notes": "Test confirm"},
            headers={"x-admin-token": admin_token}
        )
        # Either success (200) or graceful error (502 if n8n unavailable)
        assert confirm_resp.status_code in (200, 502), f"Expected 200 or 502, got {confirm_resp.status_code}: {confirm_resp.text}"
        if confirm_resp.status_code == 200:
            data = confirm_resp.json()
            assert data.get("success") is True
            print(f"E2E-5 PASS: confirm succeeded with calendar")
        else:
            print(f"E2E-5 PASS: confirm returned 502 (n8n unavailable) - graceful error handling confirmed")
        # cleanup if needed
        if confirm_resp.status_code == 502:
            requests.post(f"{BASE_URL}/api/orders/{order_id}/reject", headers={"x-admin-token": admin_token})

    def test_e2e_6_reject_order(self, admin_token):
        """E2E-6: POST /api/orders/{id}/reject → status='rejected', not in pending"""
        # Create fresh order
        resp = requests.post(f"{BASE_URL}/api/orders", json={
            "flow_type": "party",
            "form_data": {"vardas": "TEST_E2E6", "telefonas": "+37060000006", "data": "2026-08-01", "batutas": "Candy Pop"}
        })
        assert resp.status_code == 200
        order_id = resp.json()["id"]

        # Reject
        reject_resp = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/reject",
            headers={"x-admin-token": admin_token}
        )
        assert reject_resp.status_code == 200
        data = reject_resp.json()
        assert data.get("success") is True
        assert data.get("order_id") == order_id

        # Verify not in pending
        pending = requests.get(f"{BASE_URL}/api/admin/pending-orders", headers={"x-admin-token": admin_token})
        ids = [o["id"] for o in pending.json()]
        assert order_id not in ids, "Rejected order should not be in pending"
        print(f"E2E-6 PASS: order rejected, not in pending")


# ── Security Tests ────────────────────────────────────────────────────────────

class TestSecurity:
    """Security endpoint tests"""

    def test_sec_1_wrong_password_401(self):
        """SEC-1: Wrong admin password → 401"""
        resp = requests.post(f"{BASE_URL}/api/admin/auth", json={"password": "wrongpassword"})
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print("SEC-1 PASS: wrong password returns 401")

    def test_sec_2_dashboard_no_token_401(self):
        """SEC-2: GET /api/admin/dashboard without token → 401"""
        resp = requests.get(f"{BASE_URL}/api/admin/dashboard")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print("SEC-2 PASS: dashboard without token returns 401")

    def test_sec_3_n8n_sync_no_secret_401(self):
        """SEC-3: POST /api/webhook/n8n-sync without secret → 401"""
        resp = requests.post(f"{BASE_URL}/api/webhook/n8n-sync", json={"orderId": "test", "status": "confirmed"})
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print("SEC-3 PASS: n8n-sync without secret returns 401")

    def test_sec_4_n8n_sync_wrong_secret_401(self):
        """SEC-4: POST /api/webhook/n8n-sync with wrong secret → 401"""
        resp = requests.post(
            f"{BASE_URL}/api/webhook/n8n-sync",
            json={"orderId": "test", "status": "confirmed"},
            headers={"x-sync-secret": "wrong-secret"}
        )
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print("SEC-4 PASS: n8n-sync with wrong secret returns 401")

    def test_sec_5_invalid_flow_type_400(self):
        """SEC-5: POST /api/orders with invalid flow_type → 400"""
        resp = requests.post(f"{BASE_URL}/api/orders", json={
            "flow_type": "hacker",
            "form_data": {"vardas": "Test"}
        })
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        print("SEC-5 PASS: invalid flow_type returns 400")

    def test_sec_6_confirm_no_token_401(self):
        """SEC-6: POST /api/orders/{id}/confirm without token → 401"""
        resp = requests.post(f"{BASE_URL}/api/orders/some-fake-id/confirm", json={})
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print("SEC-6 PASS: confirm without token returns 401")

    def test_sec_7_reject_no_token_401(self):
        """SEC-7: POST /api/orders/{id}/reject without token → 401"""
        resp = requests.post(f"{BASE_URL}/api/orders/some-fake-id/reject")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print("SEC-7 PASS: reject without token returns 401")

    def test_sec_8_security_headers(self):
        """SEC-8: Security headers present on /api/ routes"""
        resp = requests.get(f"{BASE_URL}/api/")
        headers = resp.headers
        assert "x-content-type-options" in {k.lower() for k in headers}, f"Missing X-Content-Type-Options. Headers: {dict(headers)}"
        assert "x-frame-options" in {k.lower() for k in headers}, f"Missing X-Frame-Options"
        assert "x-xss-protection" in {k.lower() for k in headers}, f"Missing X-XSS-Protection"
        print(f"SEC-8 PASS: Security headers present: X-Content-Type-Options={headers.get('X-Content-Type-Options')}, X-Frame-Options={headers.get('X-Frame-Options')}, X-XSS-Protection={headers.get('X-XSS-Protection')}")
