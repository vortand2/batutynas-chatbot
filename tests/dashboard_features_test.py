"""
Playwright tests for new dashboard features:
Edit modal, delete dialog, date picker (move), filter bar, booking card actions.
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

        # ─── TEST GROUP 1: Filter Bar ───
        print("\n═══ FILTER BAR TESTS ═══\n")
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        page = ctx.new_page()

        page.goto("http://localhost:3456/dashboard/", wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(2000)

        # 1. Filter bar exists
        filter_bar = page.locator("#filterBar")
        log(filter_bar.count() > 0, "Filter bar element exists")

        # 2. Filter pills rendered
        filter_pills = page.locator(".filter-pill")
        pill_count = filter_pills.count()
        log(pill_count > 0, "Filter pills rendered", f"{pill_count} pills")

        # 3. "Visi" pill is first and active by default
        if pill_count > 0:
            first_pill = filter_pills.nth(0)
            first_text = first_pill.text_content()
            log("Visi" in first_text, "First pill is 'Visi'", first_text.strip())

            has_active = first_pill.evaluate("el => el.classList.contains('active')")
            log(has_active, "Visi pill is active by default")

        # 4. Click a non-Visi pill to filter
        if pill_count > 1:
            second_pill = filter_pills.nth(1)
            second_text = second_pill.text_content().strip()
            second_pill.click()
            page.wait_for_timeout(500)

            has_active2 = second_pill.evaluate("el => el.classList.contains('active')")
            log(has_active2, f"Clicking '{second_text}' makes it active")

            # First pill should not be active anymore
            first_inactive = first_pill.evaluate("el => !el.classList.contains('active')")
            log(first_inactive, "Visi pill deactivated after filter selection")

            # Click Visi again to reset
            first_pill.click()
            page.wait_for_timeout(500)
            reset_active = first_pill.evaluate("el => el.classList.contains('active')")
            log(reset_active, "Clicking Visi resets filter")

        page.screenshot(path="/tmp/dashboard_filter_bar.png")
        log(True, "Filter bar screenshot saved")

        ctx.close()

        # ─── TEST GROUP 2: Booking Card Action Buttons ───
        print("\n═══ BOOKING CARD ACTIONS TESTS ═══\n")
        ctx2 = browser.new_context(viewport={"width": 1280, "height": 800})
        page2 = ctx2.new_page()

        page2.goto("http://localhost:3456/dashboard/", wait_until="networkidle", timeout=15000)
        page2.wait_for_timeout(2000)

        # Click a day with bookings
        day16 = page2.locator('.cal-day[data-date="2026-03-16"]')
        if day16.count() > 0:
            day16.click()
            page2.wait_for_timeout(600)

            # 5. Action buttons exist on booking cards
            action_btns = page2.locator(".booking-action-btn")
            log(action_btns.count() > 0, "Action buttons on booking cards", f"{action_btns.count()} buttons")

            # 6. Edit button exists
            edit_btn = page2.locator('[data-action="edit"]')
            log(edit_btn.count() > 0, "Edit button exists", f"{edit_btn.count()} found")

            # 7. Move button exists
            move_btn = page2.locator('[data-action="move"]')
            log(move_btn.count() > 0, "Move button exists", f"{move_btn.count()} found")

            # 8. Delete button exists
            delete_btn = page2.locator('[data-action="delete"]')
            log(delete_btn.count() > 0, "Delete button exists", f"{delete_btn.count()} found")

            # 9. Entry source badge exists
            source_badge = page2.locator(".booking-source-badge")
            log(source_badge.count() > 0, "Entry source badges rendered", f"{source_badge.count()} badges")

            # 10. Created date row
            meta_row = page2.locator(".booking-card-meta")
            log(meta_row.count() > 0, "Created date meta row rendered", f"{meta_row.count()} rows")

            page2.screenshot(path="/tmp/dashboard_booking_card_v2.png")
            log(True, "Booking card v2 screenshot saved")
        else:
            log(False, "March 16 cell not found — skipping card action tests")

        ctx2.close()

        # ─── TEST GROUP 3: Edit Modal ───
        print("\n═══ EDIT MODAL TESTS ═══\n")
        ctx3 = browser.new_context(viewport={"width": 1280, "height": 800})
        page3 = ctx3.new_page()

        page3.goto("http://localhost:3456/dashboard/", wait_until="networkidle", timeout=15000)
        page3.wait_for_timeout(2000)

        day16 = page3.locator('.cal-day[data-date="2026-03-16"]')
        if day16.count() > 0:
            day16.click()
            page3.wait_for_timeout(600)

            edit_btn = page3.locator('[data-action="edit"]').first
            if edit_btn.count() > 0:
                edit_btn.click()
                page3.wait_for_timeout(500)

                # 11. Edit modal backdrop appears
                backdrop = page3.locator("#editModalBackdrop")
                log(backdrop.count() > 0, "Edit modal backdrop exists")

                # 12. Modal is visible (has is-open class)
                if backdrop.count() > 0:
                    is_open = backdrop.evaluate("el => el.classList.contains('is-open')")
                    log(is_open, "Edit modal has is-open class")

                # 13. Edit modal content exists
                content = page3.locator("#editModalContent")
                log(content.count() > 0, "Edit modal content exists")

                # 14. Form fields present
                date_input = page3.locator('input[name="event_date"]')
                log(date_input.count() > 0, "Date input field exists")

                time_input = page3.locator('input[name="event_time"]')
                log(time_input.count() > 0, "Time input field exists")

                status_select = page3.locator('select[name="status"]')
                log(status_select.count() > 0, "Status select exists")

                payment_select = page3.locator('select[name="payment_status"]')
                log(payment_select.count() > 0, "Payment status select exists")

                price_input = page3.locator('input[name="price"]')
                log(price_input.count() > 0, "Price input exists")

                notes_textarea = page3.locator('textarea[name="notes"]')
                log(notes_textarea.count() > 0, "Notes textarea exists")

                # 15. Save button
                save_btn = page3.locator("#editModalSaveBtn")
                log(save_btn.count() > 0, "Save button exists")
                if save_btn.count() > 0:
                    save_text = save_btn.text_content()
                    log("Išsaugoti" in save_text, "Save button is Lithuanian", save_text)

                # 16. Cancel button
                cancel_btn = page3.locator(".btn-cancel")
                log(cancel_btn.count() > 0, "Cancel button exists")

                page3.screenshot(path="/tmp/dashboard_edit_modal.png")
                log(True, "Edit modal screenshot saved")

                # 17. Close modal with cancel
                if cancel_btn.count() > 0:
                    cancel_btn.click()
                    page3.wait_for_timeout(400)
                    backdrop_after = page3.locator("#editModalBackdrop")
                    is_gone = backdrop_after.count() == 0 or not backdrop_after.is_visible()
                    log(is_gone, "Modal closes on cancel click")

                # 18. Reopen and close with Escape
                edit_btn_2 = page3.locator('[data-action="edit"]').first
                if edit_btn_2.count() > 0:
                    edit_btn_2.click()
                    page3.wait_for_timeout(500)
                    page3.keyboard.press("Escape")
                    page3.wait_for_timeout(400)
                    backdrop_esc = page3.locator("#editModalBackdrop")
                    closed_esc = backdrop_esc.count() == 0 or not backdrop_esc.is_visible()
                    log(closed_esc, "Modal closes on Escape key")
            else:
                log(False, "Edit button not found — skipping modal tests")

        ctx3.close()

        # ─── TEST GROUP 4: Delete Dialog ───
        print("\n═══ DELETE DIALOG TESTS ═══\n")
        ctx4 = browser.new_context(viewport={"width": 1280, "height": 800})
        page4 = ctx4.new_page()

        page4.goto("http://localhost:3456/dashboard/", wait_until="networkidle", timeout=15000)
        page4.wait_for_timeout(2000)

        day16 = page4.locator('.cal-day[data-date="2026-03-16"]')
        if day16.count() > 0:
            day16.click()
            page4.wait_for_timeout(600)

            delete_btn = page4.locator('[data-action="delete"]').first
            if delete_btn.count() > 0:
                delete_btn.click()
                page4.wait_for_timeout(500)

                # 19. Delete dialog backdrop
                del_backdrop = page4.locator("#deleteDialogBackdrop")
                log(del_backdrop.count() > 0, "Delete dialog backdrop exists")

                # 20. Delete dialog is open
                if del_backdrop.count() > 0:
                    del_open = del_backdrop.evaluate("el => el.classList.contains('is-open')")
                    log(del_open, "Delete dialog has is-open class")

                # 21. Confirmation message
                confirm_msg = page4.locator(".confirm-dialog-message")
                if confirm_msg.count() > 0:
                    msg_text = confirm_msg.text_content()
                    log("ištrinti" in msg_text.lower(), "Delete confirmation message in Lithuanian", msg_text)

                # 22. Confirm and cancel buttons
                del_cancel = page4.locator("#deleteDlgCancel")
                del_confirm = page4.locator("#deleteDlgConfirm")
                log(del_cancel.count() > 0, "Delete cancel button exists")
                log(del_confirm.count() > 0, "Delete confirm button exists")

                page4.screenshot(path="/tmp/dashboard_delete_dialog.png")
                log(True, "Delete dialog screenshot saved")

                # 23. Close with cancel (don't actually delete)
                if del_cancel.count() > 0:
                    del_cancel.click()
                    page4.wait_for_timeout(300)
                    del_after = page4.locator("#deleteDialogBackdrop")
                    del_closed = del_after.count() == 0 or not del_after.is_visible()
                    log(del_closed, "Delete dialog closes on cancel")
            else:
                log(False, "Delete button not found — skipping dialog tests")

        ctx4.close()

        # ─── TEST GROUP 5: Date Picker (Move) ───
        print("\n═══ DATE PICKER TESTS ═══\n")
        ctx5 = browser.new_context(viewport={"width": 1280, "height": 800})
        page5 = ctx5.new_page()

        page5.goto("http://localhost:3456/dashboard/", wait_until="networkidle", timeout=15000)
        page5.wait_for_timeout(2000)

        day16 = page5.locator('.cal-day[data-date="2026-03-16"]')
        if day16.count() > 0:
            day16.click()
            page5.wait_for_timeout(600)

            move_btn = page5.locator('[data-action="move"]').first
            if move_btn.count() > 0:
                move_btn.click()
                page5.wait_for_timeout(500)

                # 24. Date picker dropdown appears
                dp = page5.locator("#dpDropdown")
                log(dp.count() > 0, "Date picker dropdown exists")

                # 25. Date picker is open
                if dp.count() > 0:
                    dp_open = dp.evaluate("el => el.classList.contains('is-open')")
                    log(dp_open, "Date picker has is-open class")

                    # 26. Nav buttons
                    dp_prev = dp.locator(".dp-nav-btn").first
                    dp_next = dp.locator(".dp-nav-btn").nth(1)
                    log(dp_prev.count() > 0, "Date picker prev button exists")
                    log(dp_next.count() > 0, "Date picker next button exists")

                    # 27. Month label
                    dp_month = dp.locator(".dp-month-label")
                    if dp_month.count() > 0:
                        label_text = dp_month.text_content()
                        log("Kovas" in label_text or "2026" in label_text, "Date picker month label", label_text)

                    # 28. Weekday headers
                    dp_weekdays = dp.locator(".dp-weekday")
                    log(dp_weekdays.count() == 7, "Date picker has 7 weekday headers", f"{dp_weekdays.count()}")

                    # 29. Day cells
                    dp_days = dp.locator(".dp-day:not(.is-outside)")
                    log(dp_days.count() > 20, "Date picker has day cells", f"{dp_days.count()} days")

                    # 30. Selected day highlighted
                    selected = dp.locator(".dp-day.is-selected")
                    log(selected.count() > 0, "Current booking day is selected")

                    # 31. Today highlighted
                    dp_today = dp.locator(".dp-day.is-today")
                    log(dp_today.count() > 0, "Today is highlighted in date picker")

                    page5.screenshot(path="/tmp/dashboard_date_picker.png")
                    log(True, "Date picker screenshot saved")

                    # 32. Navigate months
                    dp_next.click()
                    page5.wait_for_timeout(300)
                    new_label = dp.locator(".dp-month-label").text_content() if dp.locator(".dp-month-label").count() > 0 else ""
                    log("Balandis" in new_label, "Date picker next month works", new_label)

                    # 33. Close by pressing Escape
                    page5.keyboard.press("Escape")
                    page5.wait_for_timeout(300)
                    dp_after = page5.locator("#dpDropdown")
                    dp_closed = dp_after.count() == 0
                    log(dp_closed, "Date picker closes on Escape")
            else:
                log(False, "Move button not found — skipping date picker tests")

        ctx5.close()

        # ─── TEST GROUP 6: Mobile — New Features ───
        print("\n═══ MOBILE NEW FEATURES TESTS ═══\n")
        ctx6 = browser.new_context(viewport={"width": 375, "height": 812})
        page6 = ctx6.new_page()

        page6.goto("http://localhost:3456/dashboard/", wait_until="networkidle", timeout=15000)
        page6.wait_for_timeout(2000)

        # 34. Filter bar on mobile
        filter_bar_m = page6.locator("#filterBar")
        log(filter_bar_m.count() > 0, "Mobile: filter bar exists")

        pills_m = page6.locator(".filter-pill")
        log(pills_m.count() > 0, "Mobile: filter pills rendered", f"{pills_m.count()}")

        # 35. Open day accordion and check action buttons
        day16_m = page6.locator('.cal-day[data-date="2026-03-16"]')
        if day16_m.count() > 0:
            day16_m.click()
            page6.wait_for_timeout(600)

            mobile_actions = page6.locator(".booking-action-btn")
            log(mobile_actions.count() > 0, "Mobile: action buttons on cards", f"{mobile_actions.count()}")

            # 36. Open edit modal on mobile
            edit_mobile = page6.locator('[data-action="edit"]').first
            if edit_mobile.count() > 0:
                edit_mobile.click()
                page6.wait_for_timeout(500)

                modal_m = page6.locator("#editModalBackdrop")
                log(modal_m.count() > 0, "Mobile: edit modal opens")

                page6.screenshot(path="/tmp/dashboard_mobile_edit_modal.png")
                log(True, "Mobile edit modal screenshot saved")

                # Close it
                page6.keyboard.press("Escape")
                page6.wait_for_timeout(400)

        ctx6.close()

        # ─── TEST GROUP 7: Toast Notifications ───
        print("\n═══ TOAST TESTS ═══\n")
        ctx7 = browser.new_context(viewport={"width": 1280, "height": 800})
        page7 = ctx7.new_page()

        page7.goto("http://localhost:3456/dashboard/", wait_until="networkidle", timeout=15000)
        page7.wait_for_timeout(2000)

        # 37. Toast container exists
        toast_container = page7.locator("#toastContainer")
        log(toast_container.count() > 0, "Toast container exists")

        # 38. Trigger a toast via JS and check it appears
        page7.evaluate("showToast('Test toast', 'success')")
        page7.wait_for_timeout(300)

        toast_items = page7.locator(".toast-item")
        log(toast_items.count() > 0, "Toast item renders on showToast()", f"{toast_items.count()} items")

        if toast_items.count() > 0:
            toast_text = toast_items.first.text_content()
            log("Test toast" in toast_text, "Toast shows correct message", toast_text.strip())

        page7.screenshot(path="/tmp/dashboard_toast.png")
        log(True, "Toast screenshot saved")

        ctx7.close()

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
    for f in ["/tmp/dashboard_filter_bar.png",
              "/tmp/dashboard_booking_card_v2.png",
              "/tmp/dashboard_edit_modal.png",
              "/tmp/dashboard_delete_dialog.png",
              "/tmp/dashboard_date_picker.png",
              "/tmp/dashboard_mobile_edit_modal.png",
              "/tmp/dashboard_toast.png"]:
        if os.path.exists(f):
            print(f"  {f}")

    sys.exit(1 if FAIL > 0 else 0)
