-- ============================================================
-- Batutynas — Seed Data
-- All 20 equipment items from live chatbot inventory
-- + Sample contacts and bookings for testing
-- ============================================================

-- -----------------------------------------------------------
-- Equipment: All 20 items from live chatbot
-- -----------------------------------------------------------

-- Big Parks (public events only)
INSERT INTO batutynas.equipment (name, icon, category, size_label, capacity, min_guests, max_guests, age_range, setup_time, detail, image_url, popular) VALUES
('Džiumandži parkas', '🌴', 'big-park', '14x16 m', 'Iki 40 vaikų', 15, 200, '4–14 m.', '~60 min', 'Nuotykių parkas · Surinkimas: ~60 min · Reikia: lygios 16x14 m aikštelės · Įeina: batutas, generatorius, prižiūrėtojas', 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2026-01-19-at-08.02.18-Rc7QdQX9UPx5Qii4.jpeg', TRUE),
('Fantazijų parkas', '🏰', 'big-park', '14x14 m', 'Iki 30 vaikų', 10, 150, '4–14 m.', '~50 min', 'Batutų parkas · Surinkimas: ~50 min · Reikia: lygios 14x14 m aikštelės · Įeina: batutas, generatorius, prižiūrėtojas', 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250718_183358_615_1752852849151_photo_optimized-1-Su0yn2ubUUAdRTaM.jpg', FALSE),
('Giga ruožas', '🏃', 'big-park', '45x8 m', '360 dalyvių/val.', 10, 1000, '6+ m.', '~90 min', 'Kliūčių trasa 40 m · Surinkimas: ~90 min · Reikia: 45x8 m aikštelės · Įeina: trasa, generatorius, 2 prižiūrėtojai', 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/klia-aia3-ruoa3-4as7_-PF5s1CBJOSf9Dsw8.jpg', TRUE);

-- Mega Trampolines (birthdays + public)
INSERT INTO batutynas.equipment (name, icon, category, size_label, capacity, min_guests, max_guests, age_range, setup_time, detail, image_url, popular) VALUES
('Mega Waikiki', '🌊', 'mega-trampoline', '16x4 m', 'Iki 15 vaikų', 5, 15, '4–14 m.', '~40 min', 'Aukščiausias 8,5 m · Čiuožykla + šokinėjimo zona · Įeina: generatorius', 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2026-01-19-at-08.02.20-1-qKrIjl8vIiaDDEeJ.jpeg', TRUE),
('Mega Rocket', '🚀', 'mega-trampoline', '14x5 m', 'Iki 15 vaikų', 5, 15, '4–14 m.', '~40 min', '2 dalys: čiuožykla + arena · Surinkimas: ~40 min · Įeina: generatorius', 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250608_144102_598_1749383165455_photo-1-DWXubfRscVaZs0KU.jpg', FALSE),
('Mega Ufonautai', '🛸', 'mega-trampoline', '14x5 m', 'Iki 15 vaikų', 5, 15, '4–14 m.', '~40 min', '2 dalys: čiuožykla + šokinėjimo zona · Surinkimas: ~40 min · Įeina: generatorius', 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2025-03-21-at-15.48.00-k77GausjdJtLgsxH.jpeg', FALSE),
('Mega ruožas', '🏃', 'mega-trampoline', '25x6 m', '240 dalyvių/val.', 8, 600, '6+ m.', '~45 min', '21 m kliūčių trasa · Surinkimas: ~45 min · Įeina: generatorius, prižiūrėtojas', 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/klia-aia3-ruoa3-4as5_-xMAasSCrKpRl9Lza.jpg', FALSE);

-- Standard Trampolines (birthdays)
INSERT INTO batutynas.equipment (name, icon, category, size_label, capacity, min_guests, max_guests, age_range, setup_time, detail, image_url, popular) VALUES
('Monstrai', '👾', 'standard-trampoline', '8x5 m', 'Iki 12 vaikų', 4, 12, '3–12 m.', '~25 min', 'Su velcro Dart žaidimu · Surinkimas: ~25 min · Idealus gimtadieniams', 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165240_881_49-sRgMsjrVMtThU9QZ.png', FALSE),
('Candy Pop', '🍭', 'standard-trampoline', '8x5 m', 'Iki 12 vaikų', 4, 12, '3–12 m.', '~25 min', 'Spalvingas dizainas · Surinkimas: ~25 min · Šokinėjimo zona + čiuožykla', 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165543_886_49-6FZ64pJgz45vxYSk.png', TRUE),
('Aštuonkojis', '🐙', 'standard-trampoline', '8x5 m', 'Iki 12 vaikų', 4, 12, '3–12 m.', '~25 min', 'Jūros tematika · Surinkimas: ~25 min · Šokinėjimo zona + čiuožykla', 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210164945_873_49-guBAxfjAKUTQkefw.png', FALSE),
('Chameleonas', '🦎', 'standard-trampoline', '8x5 m', 'Iki 12 vaikų', 4, 12, '3–12 m.', '~25 min', 'Su didele čiuožykla · Surinkimas: ~25 min · Spalvų keitimo dizainas', 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165904_889_49-YAzOnlljvGg8uSaZ.png', FALSE),
('Vienaragiai', '🦄', 'standard-trampoline', '9x4 m', 'Iki 12 vaikų', 4, 12, '3–10 m.', '~25 min', 'Su tuneliais ir čiuožykla · Surinkimas: ~25 min · Vienaragių tema', 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/vienaragiai_live1-WinCFPxPLvD4Bvpp.jpg', FALSE),
('Pilis mažiesiems', '🏯', 'standard-trampoline', '5x4 m', 'Iki 6 vaikų', 2, 6, '2–5 m.', '~15 min', 'Mažiausias batutas · Surinkimas: ~15 min · Saugus mažiausiems', 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250525_115950_542_1748163603293_photo_optimized-Vr2HXTPMFyM6szXt.jpg', FALSE);

-- Addons
INSERT INTO batutynas.equipment (name, icon, category, size_label, capacity, min_guests, max_guests, age_range, setup_time, detail, image_url) VALUES
('Milžiniškas Dart', '🎯', 'addon', '5x4,5 m', '60 dalyvių/val.', 1, 999, 'Visos amžiaus grupės', '~15 min', 'Velcro kamuoliai + pripučiamas taikinys · Surinkimas: ~15 min', 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/img-20250825-wa0000-1-KNKOwGZxrP8Qotu0.jpg'),
('Kamuolių medžioklė', '⚽', 'addon', '8 m arena', '4 žaidėjai/raundas', 1, 999, NULL, '~20 min', 'Pripučiama arena · 4 žaidėjai vienu metu · Komandinis žaidimas', 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/img-20250908-wa0000-OjvumGsbJUPEqY7H.jpg'),
('Rodeo bulius', '🤠', 'addon', '5x5 m', 'Neribota', 1, 999, '6+', NULL, 'Mechaninis bulius su saugiu pripučiamu kilimėliu · Reguliuojamas greitis', 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/gemini_generated_image_y02vw0y02vw0y02v-1UPI9AO2yIhGQbUk.png'),
('Saldėsių aparatai', '🍬', 'addon', NULL, 'Vata, popcorn, šerbetas', 1, 999, NULL, NULL, 'Cukraus vata + popcorn + šerbetas · 1 aparatas NEMOKAMAI su batutu', 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/gemini_generated_image_n0wezbn0wezbn0we-eBEHQuTVAV3qYVji.png');

-- Party Equipment
INSERT INTO batutynas.equipment (name, icon, category, size_label, capacity, min_guests, max_guests, detail, image_url, popular) VALUES
('Disco paviljonas', '🪩', 'party-equipment', '4x4 m', 'Iki 20 žmonių', 1, 999, 'LED apšvietimas + garso sistema · 4x4 m palapinė · Tinka vakarėliams ir šokiams', 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/unnamed-2-DZswbmOPQZ24Gc8b.jpg', TRUE),
('Putų šou', '🫧', 'party-equipment', NULL, 'Neribota', 1, 999, 'Putų mašina + pripučiamas baseinas · Neriboti dalyviai · Vasaros pramoga', '', FALSE),
('Banketo stalai ir kėdės', '🪑', 'party-equipment', NULL, 'Iki 50 vietų', 1, 999, 'Banketo stalai + kėdės · Iki 50 vietų · Pristatymas ir surinkimas įskaičiuota', 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/gemini_generated_image_lmbogflmbogflmbo-yW8t5tAPn0eG8rIQ.png', FALSE);

-- -----------------------------------------------------------
-- Sample Contacts (for testing)
-- -----------------------------------------------------------
INSERT INTO batutynas.contacts (name, phone, email, source, first_booking_date, total_bookings, total_spent, last_booking_date) VALUES
('Jonas Jonaitis', '+37060012345', 'jonas@example.lt', 'Facebook', '2025-06-15', 3, 450.00, '2026-02-20'),
('Ona Onaitė', '+37060067890', 'ona@example.lt', 'Website', '2025-08-10', 2, 280.00, '2025-12-05'),
('Petras Petraitis', '+37060011111', NULL, 'Phone', '2026-01-20', 1, 150.00, '2026-01-20');

-- -----------------------------------------------------------
-- Sample Bookings (for testing dashboard + workflows)
-- -----------------------------------------------------------

-- Past completed booking
INSERT INTO batutynas.bookings (contact_id, event_date, event_time, pickup_time, delivery_address, city, status, price, deposit_amount, deposit_paid, payment_status, entry_source, confirmation_sent, reminder_sent, review_requested, converted_from_inquiry) VALUES
(1, CURRENT_DATE - INTERVAL '14 days', '10:00', '18:00', 'Kauno g. 15', 'Tauragė', 'Completed', 150.00, 50.00, TRUE, 'Paid in Full', 'Chatbot', TRUE, TRUE, TRUE, TRUE),
(2, CURRENT_DATE - INTERVAL '7 days', '14:00', '20:00', 'Vilniaus g. 8', 'Šilutė', 'Completed', 180.00, 50.00, TRUE, 'Paid in Full', 'Phone', TRUE, TRUE, FALSE, FALSE);

-- Today's booking
INSERT INTO batutynas.bookings (contact_id, event_date, event_time, pickup_time, delivery_address, city, status, price, deposit_amount, deposit_paid, payment_status, entry_source, confirmation_sent, reminder_sent) VALUES
(1, CURRENT_DATE, '11:00', '19:00', 'Dariaus ir Girėno g. 22', 'Tauragė', 'Confirmed', 200.00, 70.00, TRUE, 'Deposit Paid', 'Telegram', TRUE, TRUE);

-- Tomorrow's booking (deposit unpaid)
INSERT INTO batutynas.bookings (contact_id, event_date, event_time, pickup_time, delivery_address, city, status, price, deposit_amount, deposit_paid, payment_status, entry_source, confirmation_sent) VALUES
(3, CURRENT_DATE + INTERVAL '1 day', '15:00', '21:00', 'Žemaičių g. 5', 'Kelmė', 'Confirmed', 120.00, 40.00, FALSE, 'Unpaid', 'Direct Facebook', TRUE);

-- Future inquiry (not yet confirmed)
INSERT INTO batutynas.bookings (contact_id, event_date, event_time, delivery_address, city, status, entry_source) VALUES
(2, CURRENT_DATE + INTERVAL '10 days', '12:00', 'Tilžės g. 10', 'Šilutė', 'Inquiry', 'Chatbot');

-- -----------------------------------------------------------
-- Sample Booking_Equipment assignments
-- -----------------------------------------------------------

-- Past booking 1: Candy Pop + Saldėsių aparatai
INSERT INTO batutynas.booking_equipment (booking_id, equipment_id)
SELECT 1, id FROM batutynas.equipment WHERE name = 'Candy Pop'
UNION ALL
SELECT 1, id FROM batutynas.equipment WHERE name = 'Saldėsių aparatai';

-- Past booking 2: Mega Waikiki
INSERT INTO batutynas.booking_equipment (booking_id, equipment_id)
SELECT 2, id FROM batutynas.equipment WHERE name = 'Mega Waikiki';

-- Today's booking: Monstrai + Milžiniškas Dart
INSERT INTO batutynas.booking_equipment (booking_id, equipment_id)
SELECT 3, id FROM batutynas.equipment WHERE name = 'Monstrai'
UNION ALL
SELECT 3, id FROM batutynas.equipment WHERE name = 'Milžiniškas Dart';

-- Tomorrow's booking: Vienaragiai
INSERT INTO batutynas.booking_equipment (booking_id, equipment_id)
SELECT 4, id FROM batutynas.equipment WHERE name = 'Vienaragiai';
