# SCab – MVP Product Spec (v5)

**One line:** SCab matches two people leaving the same place at the same time and heading the same way, so they share one cab and each pay about half the fare.

**Main use case:** people landing at an airport. **Also supported:** any address to any address.

**Principle:** SCab must never make a trip worse than booking alone. A rider never waits longer than they chose, and if no co-rider is found they can book solo with one tap.

> v5 changes from v4: riders **choose** their co-rider from a list of options (no automatic matching, no auto-accept), one request at a time; no rupee minimum, savings shown only as a percentage; detour limited in road km; each rider sets how far they will walk.
>
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

Each rider says **how far they will walk** to meet (No / 250 m / 500 m / 1 km / 2 km, default 500 m). Two riders can share if their pickups are within the walking distance of whichever of them walks. The cab stops **once**: the **later poster walks** to the earlier poster's pickup if their limit allows, otherwise the earlier poster walks.

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
| How far can you walk? | Address pickups only. No / 250 m / 500 m / 1 km / 2 km (default 500 m) |
| Women only | Shown **only** to female accounts |

Button: **Post ride & see co-riders**. The ride is posted straight away and the rider sees the options screen (§5).

### 4.2 Scheduled – "Schedule a ride"
| Field | Airport pickup | Address pickup |
|---|---|---|
| From | Address search + terminal | Address search |
| When | Landing date & time | Leave at (date & time) |
| Bags | Cabin only / Checked bags | — |
| International flight | Toggle | — |
| To | Address search | Address search |
| How long can you wait? | 10 / 15 / 20 / 30 min (default 20) | same |
| How far can you walk? | — | No / 250 m / 500 m / 1 km / 2 km (default 500 m) |
| Women only | Female accounts only | same |

- Up to **30 days** ahead.
- After posting, the rider goes to the ride's screen (§5) and can see options days ahead.

A rider can't have two active trips with overlapping windows.

---

## 5. The ride screen: choosing a co-rider

**A ride must be posted to see options.** Options only show riders who have also posted. When nobody fits yet, the rider sees *"No riders yet. When someone heading your way posts a ride, they'll show up here."* and the list fills in as people post.

- Top: *"Your ride is posted · Looking until 8:35 PM · 12:05 left"* (or *"Ride scheduled · Ready 8:15 – 8:35 PM tomorrow"*).
- **Riders heading your way**, best saving first. Each option shows only:
  - **"You may save up to 47%"** (never a rupee amount: fares are estimates until booked)
  - how far their drop is from yours, and the detour in km
  - when they're ready
  - who walks and how far
  - No name, photo or address before a match.
- **Send request** on any option. **One request at a time**; the rider can **Withdraw** it to ask someone else.
- Requests received appear at the top with **Accept / Decline** and a reply countdown. If both riders ask each other, it's a match at once.
- **Near-miss offer** when available (§6.5).
- **"Book solo on Uber instead"** (once the window has started) and **Cancel ride**.
- Updates live; the home screen shows *"A rider wants to share · Reply"* on that ride.

---

## 6. Matching

Nothing is matched automatically. SCab only decides **who is shown as an option**; riders decide who they ride with.

### 6.1 Hard rules: who is shown as an option
1. **Same pickup:** the same terminal; or both address pickups in the same region, within the walking distance of whoever walks (§2.2). An airport pickup never matches an address pickup.
2. Ready windows overlap by **≥ 5 min**.
3. **Detour ≤ 5 km of road**: the extra road km the cab drives to drop the second rider. Road km between the two drops comes from Ola Maps; each rider's own trip too.
4. **Saving > 0%** for both: SCab never shows an option worse than riding alone. (No rupee minimum.)
5. Women-only respected: if either trip is women-only, both riders are female.
6. Never show two people to each other again after a **declined** request, or a declined / cancelled / timed-out match.

### 6.2 Order of options
**Biggest saving first**, then the smaller detour. Up to 10 shown.

### 6.3 Estimates
Fares come from the **region** (§9.2). For India: base **₹150**, **₹24/km**. They are used only to work out the saving **percentage**.
- Solo fare ≈ base + per-km × road km of the rider's own trip.
- Shared fare ≈ base + per-km × (road km from the meeting point to the farther drop + detour km).
- Detour km = (meeting point → nearer drop) + (nearer drop → farther drop) − (meeting point → farther drop), all in road km.
- Saving % = 1 − shared ÷ (both solo fares). Both riders save the same % (§8.6).

### 6.4 Requests
- **Send request** → the other rider sees it with **Accept / Decline**.
- Reply time: **5 min** if either ride is live, **6 hours** between two scheduled rides, and never past either ride's window.
- **Accept** → re-checks the rules, then the match is **confirmed** straight away. Every other request on both rides closes.
- **Decline** → never shown to each other again. **No reply in time** → the request expires (they can ask again).
- A request closes by itself if either ride matches someone else, is cancelled, expires, or stops fitting (e.g. after a delay).
- There is **no auto-accept**: every match is two people saying yes.

### 6.5 Near-miss offers
If someone compatible will be ready **shortly after** a rider's wait ends (up to 20 min), they see:

> *"Wait 12 more min and you may save up to 47%. A rider going 2 km from your drop will be ready at 8:47 PM."*

Tapping **Wait** extends their wait (total wait max 60 min); that rider then appears in the options.

---

## 7. On the day (scheduled riders)

| Button | Who | When | What happens |
|---|---|---|---|
| **Flight delayed?** | Airport | Before "I'm out" | Rider enters the new landing time. Window moves. |
| **Landed** | Airport | From landing time | Tells the co-rider (status only). |
| **I'm out** | Airport | From landing time | Window becomes now → now + wait. |
| **I'm ready** | Address | From 1 h before "Leave at" | Window becomes now → now + wait. |

If a change breaks a pending request, the request closes and the rider sees the updated options. A **confirmed** match never ends automatically. Both see: *"Riya will be out at 8:50, 15 min after your wait ends."* Options: **Wait for her** (extends wait) or **Find someone else**.

---

## 8. After a match

### 8.1 What riders see
- The **meeting point**: the terminal's cab pickup area, or the first poster's pickup address.
- Who walks: *"Walk 400 m to meet at Forum Mall, Koramangala"* / *"Your co-rider walks to you."*
- Saving: *"You may save up to 47%"* (a percentage only).
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
| **Find someone else** | Before booking | Both go back to choosing from options; never shown to each other again |
| **Cancel trip** | Any time before completion | Your trip ends; co-rider goes back to "looking". After booking it counts as a **late cancellation** on your profile |

### 8.10 Statuses

**Trip:** `open` (posted, choosing) → `matched` → `completed`, or `cancelled` / `expired`

**Request:** `pending` → `accepted` / `declined` / `withdrawn` / `expired`, or `closed` (a ride matched, ended or stopped fitting)

**Trip stage (scheduled):** `scheduled` → `landed` (airport only) → `out` ("I'm out" / "I'm ready")

**Match:** `confirmed` → `booked` → `completed`, or `cancelled` (`proposed` only on matches from before v5)

**Why a match was cancelled:** `declined`, `timeout`, `cancelled`, `window_changed`, `expired` (confirmed but never booked, closed 3 h after the windows ended)

**Fare:** `pending` → `confirmed`, or `disputed`

---

## 9. Settings (editable without code)

### 9.1 Matching rules: table `matching_settings` (one row)

| Setting | Default |
|---|---|
| min_overlap_minutes | 5 |
| max_detour_km | 5 |
| min_saving_percent | 0 (saving must also be > 0) |
| max_pickup_walk_m | 2000 (upper limit for a rider's walking choice) |
| request_minutes_live / request_minutes_scheduled | 5 / 360 |
| road_factor | 1.3 (when Ola Maps has no road distance) |
| city_speed_kmph / stop_minutes | 20 / 3 (only to store a rough extra-minutes figure) |
| exit_minutes_cabin / checked / international_extra | 15 / 35 / 30 |
| near_miss_max_minutes | 20 |

### 9.2 Places and money

| Table | What | Today |
|---|---|---|
| `regions` | Where SCab runs: country, currency, timezone, rough boundary, **fare_base**, **fare_per_km** | India: INR, Asia/Kolkata, ₹150 + ₹24/km |
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
- Push / WhatsApp notifications (needed so riders see requests without keeping the app open)
