# SportzArena mobile

Expo SDK **57** app (`apps/mobile`) for Owner + Staff. Same Supabase Auth + live API as web. Payments use **Cashfree** (not Razorpay).

## Attractiveness stack (2026)

- React Navigation bottom tabs: **Home / Book / Sales / More** + native stack for ops screens
- **Manrope** via `@expo-google-fonts/manrope`
- Ionicons module tiles + selection haptics
- EAS profiles in `eas.json` (`development` / `preview` / `production`)
- Production builds freeze API to `https://api.sportsarena.team` and disable cleartext HTTP

## Feature parity



| Area | Owner (mobile) | Staff (mobile) |
|------|----------------|----------------|
| Login / OTP / set password | Yes | Yes |
| Booking / walk-in / beverages | Yes | Yes |
| Coaching / Membership / Invoice | Yes | Yes |
| Manage Menu (inventory + courts + rates) | Yes | Yes |
| **Sales Report** (all staff + owner bills) | Yes | Hidden |
| Profile edit | Yes | Read-only |
| **Staff invite / remove** | Yes (Profile → Staff) | — |
| **Razorpay subscribe / renew / upgrade** | Yes | Ask owner |
| Add / manage sports | Yes | — |

Staff bills saved on mobile appear in the **Owner Sales Report** (web and mobile) because both use the same `/ops` APIs and arena.

## Store release note

Expo Go is for development. Play Store / App Store need an **EAS production build** (`eas build`). Razorpay checkout on mobile uses an in-app WebView against the same `/subscriptions/checkout` + `/subscriptions/verify` APIs as web.

## Fix “Cannot reach API / timed out after 12s”

Your root `.env` should be:

```env
API_URL=http://10.242.206.137:4000
```

Use your **PC Wi‑Fi IPv4** (run `ipconfig` → Wi‑Fi → IPv4).  
**Correct:** `http://` + LAN IP + **colon** + `4000`  
**Wrong:** `http://127.0.0.1:4000` on a physical phone (that is the phone itself, not your PC)

Then:

1. PC and phone on the **same Wi‑Fi**. Turn **mobile data OFF** while testing.
2. `npm run dev:api` running (`listening on 0.0.0.0:4000`).
3. Restart Expo after any `.env` change.
4. On the phone Safari, open `http://<PC-IP>:4000/subscriptions/plans` — you should see JSON.
5. Windows Firewall: allow **Node.js** inbound.

### iPhone + Expo Go (QR not connecting)

iPhone Camera often fails for Expo QR codes. Do this instead:

1. Install **Expo Go** from the App Store.
2. On PC: stop Metro, then run from `apps/mobile`:

```bash
npm run start:tunnel
```

3. Open **Expo Go** → **Scan QR code** (not the Camera app).
4. Keep iPhone on the **same Wi‑Fi** as the PC (mobile data off).
5. After `.env` API_URL change, fully reload Expo Go (shake → Reload).

Tunnel delivers the JS bundle. The phone still needs to reach `API_URL` for login/data. If Safari cannot open `http://<PC-IP>:4000/subscriptions/plans`, use Option D (Cloudflare) below.

## First-time experience (Play Store / App Store)

Same flow as **web** — no separate Create account form:

1. Landing → **Log in / Start free trial**
2. Login → **Email OTP** (default) or **Password**
3. New owners: OTP → set password → arena/sports
4. Staff: Owner invites under Profile → Staff, then same login

## How to test (when phone Wi‑Fi cannot reach API)

LAN / Cloudflare often fails on home routers. Use one of these instead.

### Option A — Expo Web on your PC (fastest, works now)

Same mobile screens, API on localhost — no phone networking:

```bash
# Terminal 1 — API already on :4000 is fine
# Terminal 2
cd apps/mobile
# .env should have: API_URL=http://127.0.0.1:4000
npx expo start --web -c
```

Opens in Chrome on the PC. You can test login, booking, sales, staff here.

### Option B — Physical Android + USB (best real-phone test)

1. Install [Android platform-tools](https://developer.android.com/tools/releases/platform-tools) and unzip.
2. Phone: enable **Developer options** → **USB debugging**. Plug into PC.
3. In that folder:

```bash
adb devices
adb reverse tcp:4000 tcp:4000
```

4. In root `.env`: `API_URL=http://127.0.0.1:4000`
5. `cd apps/mobile` → `npx expo start --tunnel -c` → open in Expo Go.

The phone’s `127.0.0.1:4000` is forwarded to your PC API. No Wi‑Fi to PC needed.

### Option C — Android Emulator

```env
API_URL=http://10.0.2.2:4000
```

Then `npx expo start` and press `a` (needs Android Studio emulator).

### Option D — Cloudflare tunnel (if A–C not possible)

```bash
npx cloudflared tunnel --url http://127.0.0.1:4000
```

Paste the `https://….trycloudflare.com` URL into `.env` `API_URL` **or** into the app’s Cannot reach API field → Save & retry.

### Why mobile does not look identical to web

Functions match. **Layout is React Native**, not the website CSS — not a pixel copy.

## Open on your phone (Expo Go)

Do **not** open `http://localhost:8081` in Chrome. Do **not** look for “Enter URL” first — many Expo Go builds hide that.

The home screen text **“npx expo start”** is only a hint. You open the project by **scanning a QR code**.

### Android (Expo Go)

1. Open **Expo Go**.
2. Tap **Scan QR code** (bottom or center — camera icon).
3. Point the camera at the QR in your **PC terminal**, or at `apps/mobile/assets/expo-go-qr.png` opened full-screen on the PC.
4. Wait for “Downloading JavaScript bundle…” → SportzArena landing → Log in.

If you only see “Start a development server with npx expo start” and no Scan button:
- Update Expo Go from the Play Store, or  
- Tap the **search** / **Projects** tab, or the **+** menu — some versions put **Enter URL** there.

### iPhone

1. Open the built-in **Camera** app (not Expo Go first).
2. Scan the QR → tap **Open in Expo Go**.

### Manual URL (if your Expo Go has it)

Some Android builds: Expo Go → profile / “…” → **Enter URL manually** → paste the tunnel `exp://…exp.direct` URL from the terminal.

(Tunnel URL changes each time you restart Expo — scan QR instead when possible.)

## Run Expo so the QR appears on PC

In a normal Cursor/VS Code terminal (interactive):

```bash
cd apps/mobile
npx expo start --tunnel --port 8083
```

You should see a big QR in that terminal. Scan it with Expo Go.

### If you see “Request timed out”

1. URL must use a **colon** before the port: `exp://192.168.1.9:8082`  
   Not a dot: `exp://192.168.1.9.8082` (that will never connect).
2. Run **only one** Expo (`Ctrl+C` extra terminals). Prefer port **8081**.

## Login

- **Password** — staff account created on mobile/web Profile → Staff (or password set via SQL / Dashboard).
- **Email OTP** — only for emails already invited (`shouldCreateUser: false`). Needs Resend domain for non-account inboxes.

### After login stuck on “Loading your arena…”

Login (Supabase) worked; the phone cannot reach the **API** at `API_URL`.

1. Keep `npm run dev:api` running (should say `listening on 0.0.0.0:4000`).
2. In root `.env`: `API_URL=http://YOUR_PC_LAN_IP:4000` (same Wi‑Fi as the phone).
3. Restart Expo after changing `.env` (`npx expo start --tunnel -c`).
4. Windows Firewall: allow **Node.js** / TCP **4000** inbound when prompted.
5. After ~12s you should see an error with the API URL instead of infinite loading.
