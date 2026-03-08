"""
Comprehensive Playwright tests for Batutynas Dashboard.
Tests: page load, stats, calendar, day selection, booking cards,
mobile responsiveness, month navigation, equipment strip, and accessibility.
"""

import sys
import os
from playwright.sync_api import sync_playwright

PASS = 0
FAIL = 0
RESULTS = []

def log(status, name, detail=""):
    global PASS, FAIL
    icon = "✅" if status else "❌"
    if status:
        PASS += 1
    else:
        FAIL += 1
    msg = f"{icon} {name}" + (f" — {detail}" if detail else "")
    RESULTS.append(msg)
    print(msg)

def run_tests():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ─── TEST GROUP 1: Desktop (1280x800) ───
        print("\n═══ DESKTOP TESTS (1280×800) ═══\n")
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        # 1. Page loads
        try:
            page.goto("http://localhost:3456/dashboard/", wait_until="networkidle", timeout=15000)
            log(True, "Page loads", "networkidle reached")
        except Exception as e:
            log(False, "Page loads", str(e))
            browser.close()
            return

        page.wait_for_timeout(2000)  # Let count-up animations + API calls finish

        # 2. Screenshot
        page.screenshot(path="/tmp/dashboard_desktop.png", full_page=True)
        log(True, "Desktop screenshot saved", "/tmp/dashboard_desktop.png")

        # 3. No console errors
        js_errors = [e for e in console_errors if "favicon" not in e.lower()]
        log(len(js_errors) == 0, "No console errors", f"{len(js_errors)} errors" if js_errors else "clean")
        for e in js_errors[:5]:
            print(f"   ⚠️  {e}")

        # 4. Header
        logo = page.locator("text=Batutynas")
        log(logo.count() > 0, "Logo visible")

        # 5. Stats bar - 4 KPIs
        stat_cards = page.locator(".stat-card")
        log(stat_cards.count() == 4, "4 stat cards", f"found {stat_cards.count()}")

        # 6. Calendar grid rendered (JS-generated)
        cal_grid = page.locator("#calGrid")
        log(cal_grid.count() > 0, "Calendar grid exists")

        cal_headers = page.locator(".cal-header")
        log(cal_headers.count() == 7, "7 weekday headers", f"found {cal_headers.count()}")

        # Check Lithuanian weekday abbreviations
        if cal_headers.count() >= 7:
            first_header = cal_headers.nth(0).text_content()
            log(first_header.upper() == "PR", "First weekday is Pr (Monday)", first_header)

        # 7. Month title
        month_title_el = page.locator("#monthTitle")
        if month_title_el.count() > 0:
            month_title = month_title_el.text_content()
            log("2026" in month_title, "Month title has year", month_title)
            log("Kovas" in month_title, "Month title is Lithuanian", month_title)
        else:
            log(False, "Month title element not found")

        # 8. Navigation buttons
        prev_btn = page.locator("button:has-text('‹')")
        next_btn = page.locator("button:has-text('›')")
        today_btn = page.locator("button:has-text('ŠIANDIEN')")
        log(prev_btn.count() > 0, "Prev month button")
        log(next_btn.count() > 0, "Next month button")
        log(today_btn.count() > 0, "Today button")

        # 9. Today highlighted
        today_cell = page.locator(".cal-day.today")
        log(today_cell.count() > 0, "Today cell highlighted")

        # 10. Side panel visible on desktop
        side_panel = page.locator("#sidePanel")
        panel_visible = side_panel.is_visible() if side_panel.count() > 0 else False
        log(panel_visible, "Side panel visible on desktop")

        # 11. Booking dots and count badges
        cal_days = page.locator(".cal-day")
        log(cal_days.count() > 10, "Calendar day cells rendered", f"{cal_days.count()} cells")

        dots = page.locator(".cal-dot")
        log(dots.count() > 0, "Booking dots rendered", f"{dots.count()} dots")

        badges = page.locator(".cal-day-count")
        log(badges.count() > 0, "Count badges rendered", f"{badges.count()} badges")

        # 12. Click day with bookings (March 16)
        day16 = page.locator('.cal-day[data-date="2026-03-16"]')
        if day16.count() > 0:
            day16.click()
            page.wait_for_timeout(600)

            panel_text = side_panel.text_content() if side_panel.count() > 0 else ""
            has_bookings = "užsakym" in panel_text.lower()
            log(has_bookings, "Side panel shows bookings after click")

            booking_cards = page.locator(".booking-card")
            log(booking_cards.count() > 0, "Booking cards rendered", f"{booking_cards.count()} cards")

            phone_link = page.locator("a[href^='tel:']")
            log(phone_link.count() > 0, "Phone tel: link exists")

            badges_el = page.locator(".booking-card-badges .badge")
            log(badges_el.count() > 0, "Status/payment badges rendered", f"{badges_el.count()} badges")

            time_el = page.locator(".booking-card-time")
            log(time_el.count() > 0, "Time display rendered")

            page.screenshot(path="/tmp/dashboard_desktop_panel.png")
            log(True, "Desktop panel screenshot saved")
        else:
            log(False, "March 16 cell not found — skipping panel tests")

        # 13. Month navigation - previous
        prev_btn.click()
        page.wait_for_timeout(2000)
        new_title = page.locator("#monthTitle").text_content()
        log("Vasaris" in new_title, "Prev month navigation works", new_title)
        page.screenshot(path="/tmp/dashboard_prev_month.png")

        # 14. Today button returns
        today_btn.click()
        page.wait_for_timeout(2000)
        back_title = page.locator("#monthTitle").text_content()
        log("Kovas" in back_title, "Today button returns to current month", back_title)

        # 15. Next month
        next_btn.click()
        page.wait_for_timeout(2000)
        next_title = page.locator("#monthTitle").text_content()
        log("Balandis" in next_title, "Next month navigation works", next_title)

        today_btn.click()
        page.wait_for_timeout(1500)

        # 16. Equipment strip
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(500)

        equip_title = page.locator(".equipment-title")
        log(equip_title.count() > 0, "Equipment section header")

        equip_pills = page.locator(".equip-pill")
        log(equip_pills.count() > 0, "Equipment pills rendered", f"{equip_pills.count()} pills")

        page.screenshot(path="/tmp/dashboard_equipment.png")
        log(True, "Equipment screenshot saved")

        context.close()

        # ─── TEST GROUP 2: Mobile (375x812) ───
        print("\n═══ MOBILE TESTS (375×812) ═══\n")
        mobile_ctx = browser.new_context(viewport={"width": 375, "height": 812})
        mobile = mobile_ctx.new_page()

        mobile_errors = []
        mobile.on("console", lambda msg: mobile_errors.append(msg.text) if msg.type == "error" else None)

        mobile.goto("http://localhost:3456/dashboard/", wait_until="networkidle", timeout=15000)
        mobile.wait_for_timeout(2000)

        mobile.screenshot(path="/tmp/dashboard_mobile.png", full_page=True)
        log(True, "Mobile screenshot saved")

        mobile_js = [e for e in mobile_errors if "favicon" not in e.lower()]
        log(len(mobile_js) == 0, "No mobile console errors")

        # Stats
        log(mobile.locator(".stat-card").count() == 4, "Mobile: 4 stat cards")

        # Side panel hidden on mobile
        mobile_side = mobile.locator("#sidePanel")
        if mobile_side.count() > 0:
            side_hidden = not mobile_side.is_visible()
            log(side_hidden, "Mobile: side panel hidden")
        else:
            log(True, "Mobile: no side panel (expected)")

        # Calendar fills width
        cal_pane = mobile.locator(".calendar-pane")
        if cal_pane.count() > 0:
            cal_box = cal_pane.bounding_box()
            if cal_box:
                log(cal_box["width"] > 330, "Mobile: calendar fills width", f"width={cal_box['width']:.0f}px")
            else:
                log(False, "Mobile: calendar bounding box null")

        # Click day to open accordion
        day16_m = mobile.locator('.cal-day[data-date="2026-03-16"]')
        if day16_m.count() > 0:
            day16_m.click()
            mobile.wait_for_timeout(600)

            accordion = mobile.locator(".day-accordion")
            if accordion.count() > 0:
                log(accordion.is_visible(), "Mobile: accordion opens on day click")

                acc_cards = accordion.locator(".booking-card")
                log(acc_cards.count() > 0, "Mobile: accordion has booking cards", f"{acc_cards.count()} cards")

                mobile.screenshot(path="/tmp/dashboard_mobile_accordion.png", full_page=True)
                log(True, "Mobile accordion screenshot saved")

                # Close accordion
                day16_m.click()
                mobile.wait_for_timeout(500)
                acc_after = mobile.locator(".day-accordion")
                acc_closed = acc_after.count() == 0 or not acc_after.is_visible()
                log(acc_closed, "Mobile: accordion closes on second click")
            else:
                log(False, "Mobile: accordion not found after click")

        # Mobile month nav
        mobile.locator("button:has-text('‹')").click()
        mobile.wait_for_timeout(2000)
        m_month = mobile.locator("#monthTitle").text_content()
        log("Vasaris" in m_month, "Mobile: prev month works", m_month)

        mobile.locator("button:has-text('ŠIANDIEN')").click()
        mobile.wait_for_timeout(1500)

        mobile_ctx.close()

        # ─── TEST GROUP 3: Tablet (768x1024) ───
        print("\n═══ TABLET TESTS (768×1024) ═══\n")
        tablet_ctx = browser.new_context(viewport={"width": 768, "height": 1024})
        tablet = tablet_ctx.new_page()
        tablet.goto("http://localhost:3456/dashboard/", wait_until="networkidle", timeout=15000)
        tablet.wait_for_timeout(2000)

        tablet.screenshot(path="/tmp/dashboard_tablet.png", full_page=True)
        log(True, "Tablet screenshot saved")

        log(tablet.locator(".stat-card").count() == 4, "Tablet: 4 stat cards")
        log(tablet.locator("#calGrid").count() > 0, "Tablet: calendar renders")

        tablet_ctx.close()

        # ─── TEST GROUP 4: Data Integrity ───
        print("\n═══ DATA INTEGRITY TESTS ═══\n")
        data_ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        data_page = data_ctx.new_page()
        data_page.goto("http://localhost:3456/dashboard/", wait_until="networkidle", timeout=15000)
        data_page.wait_for_timeout(2000)

        # Lithuanian month name
        current_month = data_page.locator("#monthTitle").text_content()
        lt_months = ["Sausis", "Vasaris", "Kovas", "Balandis", "Gegužė", "Birželis",
                     "Liepa", "Rugpjūtis", "Rugsėjis", "Spalis", "Lapkritis", "Gruodis"]
        log(any(m in current_month for m in lt_months), "Lithuanian month name", current_month)

        # Status translations
        data_page.locator('.cal-day[data-date="2026-03-16"]').click()
        data_page.wait_for_timeout(600)
        panel_html = data_page.locator("#sidePanel").inner_html()

        # Status/payment values are title-case in HTML, CSS text-transform: uppercase renders them
        lt_statuses = ["Patvirtinta", "Pristatyta", "Baigta", "Užklausa", "Atšaukta"]
        log(any(s in panel_html for s in lt_statuses), "Lithuanian status labels")

        lt_payments = ["Apmokėta", "Neapmokėta", "Avansas"]
        log(any(p in panel_html for p in lt_payments), "Lithuanian payment labels")

        log("€" in panel_html, "Price with € symbol")

        has_addr = any(x in panel_html for x in ["g.", "gatvė", "Šilutė", "Kaunas", "Vilnius"])
        log(has_addr, "Address information displayed")

        data_ctx.close()

        # ─── TEST GROUP 5: Accessibility & Meta ───
        print("\n═══ ACCESSIBILITY TESTS ═══\n")
        a11y_ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        a11y = a11y_ctx.new_page()
        a11y.goto("http://localhost:3456/dashboard/", wait_until="networkidle", timeout=15000)
        a11y.wait_for_timeout(1000)

        title = a11y.title()
        log(len(title) > 0, "Page has title", title)

        log(a11y.locator('meta[name="viewport"]').count() > 0, "Viewport meta tag")
        log(a11y.locator('meta[charset]').count() > 0, "Charset meta tag")

        # Check Outfit font loaded
        fonts = a11y.evaluate("() => getComputedStyle(document.body).fontFamily")
        log("outfit" in fonts.lower() if fonts else False, "Outfit font applied", fonts[:50] if fonts else "none")

        # Phone links after day click
        a11y.locator('.cal-day[data-date="2026-03-16"]').click()
        a11y.wait_for_timeout(500)
        tel_links = a11y.locator('a[href^="tel:"]')
        log(tel_links.count() > 0, "Phone links are tel: links", f"{tel_links.count()}")

        # Color contrast: check accent color is defined
        accent = a11y.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()")
        log(len(accent) > 0, "CSS --accent variable defined", accent)

        a11y_ctx.close()
        browser.close()


if __name__ == "__main__":
    run_tests()

    total = PASS + FAIL
    print(f"\n{'═' * 50}")
    print(f"  RESULTS: {PASS}/{total} passed, {FAIL} failed")
    print(f"{'═' * 50}")

    if FAIL > 0:
        print("\n❌ FAILURES:")
        for r in RESULTS:
            if r.startswith("❌"):
                print(f"  {r}")

    print("\n📸 Screenshots saved:")
    for f in ["/tmp/dashboard_desktop.png", "/tmp/dashboard_desktop_panel.png",
              "/tmp/dashboard_prev_month.png", "/tmp/dashboard_equipment.png",
              "/tmp/dashboard_mobile.png", "/tmp/dashboard_mobile_accordion.png",
              "/tmp/dashboard_tablet.png"]:
        if os.path.exists(f):
            print(f"  {f}")

    sys.exit(1 if FAIL > 0 else 0)
