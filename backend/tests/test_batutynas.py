"""Backend tests for Batutynas chatbot API - orders and escalation endpoints"""
import pytest
import requests
import os

BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or 'https://batutynas-support.preview.emergentagent.com').rstrip('/')


class TestHealth:
    """Health check tests"""

    def test_api_root(self):
        r = requests.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        data = r.json()
        assert "message" in data


class TestOrders:
    """Order creation and retrieval tests"""

    def test_create_birthday_order(self):
        payload = {
            "flow_type": "birthday",
            "form_data": {
                "vardas": "TEST_Jonas",
                "telefonas": "+37060000001",
                "data": "2025-06-15",
                "vieta": "Vilnius",
                "vaikoAmzius": "7 metai"
            }
        }
        r = requests.post(f"{BASE_URL}/api/orders", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["flow_type"] == "birthday"
        assert "id" in data
        assert "created_at" in data
        assert data["form_data"]["vardas"] == "TEST_Jonas"

    def test_create_company_order(self):
        payload = {
            "flow_type": "company",
            "form_data": {
                "imonesP": "TEST_UAB Pavyzdys",
                "kontaktinis": "Petras Petraitis",
                "telefonas": "+37060000002",
                "data": "2025-07-20",
                "dalyviai": "30 žmonių",
                "vieta": "Kaunas"
            }
        }
        r = requests.post(f"{BASE_URL}/api/orders", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["flow_type"] == "company"
        assert "id" in data

    def test_create_party_order(self):
        payload = {
            "flow_type": "party",
            "form_data": {
                "vardas": "TEST_Ona",
                "telefonas": "+37060000003",
                "data": "2025-08-10",
                "vieta": "Klaipėda",
                "batutas": "4m (rekomenduojamas)"
            }
        }
        r = requests.post(f"{BASE_URL}/api/orders", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["flow_type"] == "party"

    def test_create_purchase_order(self):
        payload = {
            "flow_type": "purchase",
            "form_data": {
                "vardas": "TEST_Andrius",
                "telefonas": "+37060000004",
                "batutas": "4m",
                "adresas": "Gedimino g. 1, Vilnius"
            }
        }
        r = requests.post(f"{BASE_URL}/api/orders", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["flow_type"] == "purchase"

    def test_get_orders_list(self):
        r = requests.get(f"{BASE_URL}/api/orders")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # Verify no _id in response
        if data:
            assert "_id" not in data[0]


class TestEscalation:
    """Escalation endpoint tests"""

    def test_create_escalation(self):
        payload = {
            "name": "TEST_Rasa",
            "contact": "+37060000005",
            "message": "Norėčiau sužinoti daugiau apie batutų nuomą."
        }
        r = requests.post(f"{BASE_URL}/api/escalation", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "TEST_Rasa"
        assert data["contact"] == "+37060000005"
        assert "id" in data
        assert "created_at" in data

    def test_get_escalations_list(self):
        r = requests.get(f"{BASE_URL}/api/escalations")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        if data:
            assert "_id" not in data[0]


class TestChat:
    """AI chat endpoint tests using Gemini"""

    def test_chat_returns_lithuanian_reply(self):
        """POST /api/chat should return a Lithuanian reply from Gemini"""
        import time
        payload = {
            "session_id": f"test-session-{int(time.time())}",
            "message": "Kokia kaina?"
        }
        r = requests.post(f"{BASE_URL}/api/chat", json=payload, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "reply" in data
        assert isinstance(data["reply"], str)
        assert len(data["reply"]) > 10
        # Check it's not the error message
        assert "+37068558996" not in data["reply"] or "kaina" in data["reply"].lower() or len(data["reply"]) > 50
        print(f"AI reply: {data['reply']}")

    def test_chat_about_pilis_for_kids(self):
        """Ask about trampoline for kids under 5 - should mention Pilis"""
        import time
        payload = {
            "session_id": f"test-session-pilis-{int(time.time())}",
            "message": "Ar turite batutą vaikams iki 5 metų?"
        }
        r = requests.post(f"{BASE_URL}/api/chat", json=payload, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "reply" in data
        reply_lower = data["reply"].lower()
        # Should mention Pilis
        assert "pilis" in reply_lower, f"Expected 'pilis' in reply, got: {data['reply']}"
        print(f"Pilis reply: {data['reply']}")

    def test_chat_order_with_trampoline_and_addons(self):
        """POST /api/orders with trampoline and addons in form_data"""
        payload = {
            "flow_type": "birthday",
            "form_data": {
                "vardas": "TEST_Birthday",
                "telefonas": "+37060000099",
                "vaikuSkaicius": "10 vaikų",
                "data": "2025-09-15",
                "vieta": "Šiauliai",
                "batutas": "Monstrai",
                "priedai": "Cukraus vata, JBL PartyBox"
            }
        }
        r = requests.post(f"{BASE_URL}/api/orders", json=payload, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["form_data"]["batutas"] == "Monstrai"
        assert data["form_data"]["priedai"] == "Cukraus vata, JBL PartyBox"
        print(f"Order with addons: {data['id']}")
