# SCab – MVP Product Spec (v4)

**One line:** SCab matches two people leaving the same place at the same time and heading the same way, so they share one cab and each pay about half the fare.

**Main use case:** people landing at an airport. **Also supported:** any address to any address.

**Principle:** SCab must never make a trip worse than booking alone. A rider never waits longer than they chose, and if no co-rider is found they can book solo with one tap.

> v4 changes from v3: any Indian airport (not just Bangalore), terminals stored as data, address pickups, per-region fares and currency, walking to a shared meeting point.

---

## 1. MVP scope

| Item | Decision |
|---|---|
| Where | India (Ola Maps covers only India). Built so more countries can be added as data (§10) |
| Pickup | Any Indian airport with scheduled flights (per terminal), **or** any address |
| Drop | Any address 1–150 km from the pickup |
| Riders per cab | 2 (3 later) |
| Ways to request | **Live** ("I'm leaving now") and **Scheduled** (landing time, or "Leave at" time) |
| Platform | Web app (PWA), mobile-first |
| Login | Google sign-in |
| Cab booking | Outside SCab, on Uber/Ola, via a deep link |
| Payment between riders | UPI deep link (GPay / PhonePe), outside SCab |

Out of scope for the MVP: flight-number tracking, in-app cab booking, in-app payments, masked calling, ID verification, 3+ riders, multiple pickup stops.

---

## 2. Pickups

Both pickup kinds use the same address search ("From").

### 2.1 Airport pickup
When the picked place is at a known airport (within 3 km of one of its terminals):
- **One terminal** → selected automatically ("✈️ Rajiv Gandhi International Airport (HYD)").
- **Several terminals** → the rider **must** pick one. SCab never guesses: a wrong terminal puts two riders in different buildings. Nothing is preselected, even if the place name mentions a terminal.
- The cab pickup is the terminal's **meeting point** (e.g. "Terminal 1 Arrivals – app cab pickup area").

Airports and terminals are data, not code (§9.2). An airport SCab doesn't know yet is treated as a normal address.

### 2.2 Address pickup
Anything else: a home, office, mall, station. The pickup is the exact point the rider picked.

Two riders can share only if their pickups are **within 2 km** of each other (§4.1). The cab stops **once**, at the pickup of **whoever posted first**; the other rider walks there.

---

## 3. The key idea: the "ready window"

Every request becomes a **ready window**: from the moment the rider is ready to leave until their chosen wait runs out.

| Request | Window starts |
|---|---|
| Live | Now |
| Scheduled, airport | Landing time + time to get out (cabin only **15 min**, checked bags **35 min**, international **+30 min**) |
| Scheduled, address | The "Leave at" time |

> Example: lands 8:00 PM, cabin bag only, will wait 20 min → ready window **8:15 – 8:35 PM**.

Two riders can share only if their windows **overlap by at least 5 minutes**. Live and scheduled riders are in **one shared pool**.

---

## 4. Requesting a ride

### 4.1 Live – "I'm leaving now"
| Field | Notes |
|---|---|
| From | Address search. Airport → pick the terminal if there are several |
| To | Address search, biased towards the pickup |
| Wait | Not asked. "We'll look for up to **15 min** · change" (10 / 15 / 20 / 30) |
| Women only | Shown **only** to female accounts |

- **Auto-accept is ON**: a good match is confirmed instantly.
- After posting, the rider sees the **searching screen** (§5).

### 4.2 Scheduled – "Schedule a ride"
| Field | Airport pickup | Address pickup |
|---|---|---|
| From | Address search + terminal | Address search |
| When | Landing date & time | Leave at (date & time) |
| Bags | Cabin only / Checked bags | — |
| International flight | Toggle | — |
| To | Address search | Address search |
| How long can you wait? | 10 / 15 / 20 / 30 min (default 20) | same |
| Women only | Female accounts only | same |
| Ask me before confirming a co-rider | Default **ON** (one-tap Accept). OFF = auto-accept | same |

- Up to **30 days** ahead.
- After posting: *"We'll look for co-riders leaving Kempegowda International Airport Bengaluru, Terminal 1 between 8:15 and 8:35 PM."*

A rider can't have two active trips with overlapping windows.

---

## 5. The searching screen

Shown right after a live request, and when opening any trip.

- **Looking:** a pulsing animation, *"Looking for a co-rider…"*, and a countdown bar: *"Searching until 8:35 PM · 12:05 left"*.
- **Near-miss offer** when available (§6.5).
- **"Book solo on Uber instead"** is always available. It **stops the search first**, so SCab never matches a rider who has already left.
- **Cancel search.**
- Updates live: switches to the match screen the moment a co-rider is found, or to *"No co-rider this time"* when the window ends.
- A scheduled trip whose window hasn't started shows *"Ride scheduled"* with the window instead.

---

## 6. Matching

Runs automatically: the moment a trip is posted, whenever something changes (delay, "I'm out" / "I'm ready", longer wait, a match ending), and every minute in the background.

### 6.1 A pair matches only if **all** of these hold
1. **Same pickup:**
   - airport: the **same terminal**; or
   - address: both are address pickups, in the same region, with pickups **≤ 2 km** apart.
   - An airport pickup never matches an address pickup.
2. Ready windows overlap by **≥ 5 min**
3. **Each rider saves ≥ 30% and ≥ ₹200** compared with riding alone
4. **Neither rider loses more than 15 min**: the farther rider's extra time for the second drop, plus walking time for whoever walks to the meeting point
5. Women-only respected: if either trip is women-only, both riders are female
6. Never re-pair two people whose earlier match was **declined, cancelled or timed out**

> **Known interaction:** walking 2 km takes ~27 min at 4.5 km/h, which is over the 15-min limit in rule 4, so in practice address pickups match up to ~1.1 km apart. The ₹200 minimum (rule 3) also rules out many short city trips (e.g. 41% saving on a ₹444 solo fare is only ₹182). Both are settings (§9.1) and under review.

### 6.2 Picking the best pair
Among valid candidates: the **fewest extra minutes**, then the **biggest window overlap**.

### 6.3 Estimates used for matching
Fares come from the **region** (§9.2). For India: base **₹150**, **₹24/km**.
- Solo fare ≈ base + per-km × road km from the rider's **own** pickup (road km ≈ straight line × 1.3, or the app's Ola Maps road distance).
- Shared fare ≈ base + per-km × (road km from the **meeting point** to the farther drop + detour km).
- Extra minutes for the farther rider ≈ detour km at 20 km/h + 3 min for the stop.
- Walking minutes ≈ walking distance at 4.5 km/h.

> Bengaluru T1 → Koramangala + HSR: both save ≈ 47%, extra ≈ 7 min → **match**.
> Koramangala (two pickups 400 m apart) → Whitefield + Hoodi: both save ≈ 46%, the later poster walks 400 m → **match**.

### 6.4 Confirming a match
- Riders with auto-accept are accepted automatically. If both are, the match is **confirmed instantly**.
- Otherwise the rider sees **Accept / Decline** with the deadline. Deadline: **2 hours**, or the end of the earlier ready window if that's sooner.
- **Decline** → both riders go back to "looking" (never re-paired with each other).
- **No reply by the deadline** → same as decline (timed out).

### 6.5 Near-miss offers
If a rider has no match but someone compatible will be ready **shortly after** their wait ends (up to 20 min), they see:

> *"A rider going 2 km from your drop will be out at 8:47 PM. Wait 12 more min and pay ~₹440 instead of ₹880?"*

Tapping **Wait** extends their wait (total wait max 60 min) and matching runs again. The other rider's name and address are **not** shown before a match.

---

## 7. On the day (scheduled riders)

| Button | Who | When | What happens |
|---|---|---|---|
| **Flight delayed?** | Airport | Before "I'm out" | Rider enters the new landing time. Window moves. |
| **Landed** | Airport | From landing time | Tells the co-rider (status only). |
| **I'm out** | Airport | From landing time | Window becomes now → now + wait. |
| **I'm ready** | Address | From 1 h before "Leave at" | Window becomes now → now + wait. |

If a change breaks a match:
- **Not yet confirmed** → the match ends automatically ("window changed"; the two *can* be re-paired later) and SCab looks again.
- **Confirmed** → nothing ends automatically. Both see: *"Riya will be out at 8:50, 15 min after your wait ends."* Options: **Wait for her** (extends wait) or **Find someone else**.

---

## 8. After a match

### 8.1 What riders see
- The **meeting point**: the terminal's cab pickup area, or the first poster's pickup address.
- Who walks: *"Walk 400 m to meet at Forum Mall, Koramangala"* / *"Your co-rider walks to you."*
- Estimated share and saving: *"You pay about ₹487 · you both save 47%"*.
- Once confirmed: **Chat** and **Call** unlock. Phone number and UPI ID become visible to the co-rider only now.
- The **booker**, the co-rider's landing time / stage, and drop area.

### 8.2 No co-rider → book solo
When the window ends with no match, the trip becomes **expired** and the rider sees *"No co-rider this time."* → **Book solo on Uber** (deep link with their drop pre-filled).

### 8.3 Booker rules
- **Booker = the rider going farther.** Shown to both: "Riya books this cab."
- Only the booker sees **Book on Uber** and **Booked for ₹___**. The other rider has no price field.
- **Swap booker:** either rider can request it and the other must tap **Allow**. Only before the cab is booked.
- Once marked booked, the booker is **locked**. The database rejects any second "booked" claim.

### 8.4 Booking
1. Booker taps **Book on Uber**. Uber opens with pickup = meeting point and drop = booker's drop.
2. SCab shows **"Add stop: <co-rider's drop>"** with a **Copy** button.
3. Booker returns and taps **Booked for ₹___** (pre-filled with SCab's estimate, editable).
4. If the booker has no UPI ID yet, they're asked for it here.

### 8.5 Fare confirmation
- The co-rider sees **"Riya booked for ₹900. Looks right?"** → **✓ Confirm** / **✗ Doesn't match**.
- **Doesn't match** → the match is flagged and the two riders sort it out in chat. (No receipt upload: too much effort for riders.)
- If the booker later changes the fare, the co-rider must confirm again.

### 8.6 Fare split: everyone saves the same %
Each rider pays in proportion to what they would have paid **alone**, so both save the same percentage ("You both save 47%"). Rounding difference goes to the booker.

> Fare ₹1,000. Solo estimates: Aryan ₹1,100, Riya ₹1,160.
> Aryan pays 1,000 × 1,100 ÷ 2,260 = **₹487**. Riya pays **₹513**.

### 8.7 Payment
- The non-booker sees **"Pay ₹487 to Riya"** (prompted at the first drop) → UPI app opens pre-filled → **Paid ✓**.
- The booker can tap **Not received**; the match is flagged.

### 8.8 Rating
After payment: 👍 or 👎 for the co-rider (one tap, optional).

### 8.9 Leaving a match
| Action | When | Effect |
|---|---|---|
| **Find someone else** | Before booking | Both go back to "looking"; never re-paired |
| **Cancel trip** | Any time before completion | Your trip ends; co-rider goes back to "looking". After booking it counts as a **late cancellation** on your profile |

### 8.10 Statuses

**Trip:** `open` (looking) → `matched` → `completed`, or `cancelled` / `expired`

**Trip stage (scheduled):** `scheduled` → `landed` (airport only) → `out` ("I'm out" / "I'm ready")

**Match:** `proposed` → `confirmed` → `booked` → `completed`, or `cancelled`

**Why a match was cancelled:** `declined`, `timeout`, `cancelled`, `window_changed`, `expired` (confirmed but never booked, closed 3 h after the windows ended)

**Fare:** `pending` → `confirmed`, or `disputed`

---

## 9. Settings (editable without code)

### 9.1 Matching rules: table `matching_settings` (one row)

| Setting | Default |
|---|---|
| min_overlap_minutes | 5 |
| max_extra_minutes | 15 |
| min_saving_percent | 30 |
| road_factor | 1.3 |
| city_speed_kmph / stop_minutes | 20 / 3 |
| max_pickup_walk_m | 2000 |
| walk_speed_kmph | 4.5 |
| exit_minutes_cabin / checked / international_extra | 15 / 35 / 30 |
| accept_minutes | 120 |
| near_miss_max_minutes | 20 |

### 9.2 Places and money

| Table | What | Today |
|---|---|---|
| `regions` | Where SCab runs: country, currency, timezone, rough boundary, **fare_base**, **fare_per_km**, **min_saving_amount** | India: INR, Asia/Kolkata, ₹150 + ₹24/km, min saving ₹200 |
| `airports` | Every airport: IATA code, name, city, location, active | 116 Indian airports with scheduled flights (OurAirports) |
| `terminals` | Each airport's terminals: name, location, **meeting point**, active | 126. Several terminals at AMD, BLR, BOM, COK, DEL, JAI, MAA, TRV; one (`MAIN`) elsewhere |

Turning an airport, terminal or region off (`active = false`) stops new trips there without affecting existing ones.

---

## 10. Later
- More countries: add a region (currency, fares, boundary) and its airports; add a maps provider outside India
- Flight-number tracking (auto landing time, terminal and delays)
- Road times from Ola Maps instead of estimates
- Multiple pickups (cab collects both riders)
- 3 riders (SUV)
- Saved places
- Verified work-email badge and same-company preference
- Push / WhatsApp notifications
