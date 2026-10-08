# ANS — Arc Name Service (UI Only)

## Summary
Build the complete frontend UI for ANS using realistic mock data. No contract, no deployment. All pages are fully interactive with mock state. Contract wiring happens in a separate phase after UI is approved.

## Design System
- **Mode:** Arc Dark — deep navy `#0d1b2f` canvas, glass-on-dark cards, pale blue accents
- **Fonts:** Space Grotesk (headings, name display), DM Sans (body, UI), JetBrains Mono (addresses, hashes)
- **Motion:** framer-motion spring animations — cards slide in, prices animate on change, tx states transition smoothly
- **Icons:** lucide-react only — no emojis anywhere
- **Navigation:** Top header nav on desktop, bottom tab bar on mobile (responsive)

## Pricing Reference (mock data uses these)
| Name length | 3 months | 6 months | 12 months |
|---|---|---|---|
| 3 letters | 5.00 USDC | 9.00 USDC | 15.00 USDC |
| 4 letters | 3.00 USDC | 5.50 USDC | 9.00 USDC |
| 5 letters | 1.50 USDC | 2.75 USDC | 4.50 USDC |
| 6+ letters | 0.50 USDC | 0.90 USDC | 1.50 USDC |

## Pages & Components

### Page 1 — Search (`src/pages/Search.tsx`)
- Full-viewport hero with single search input, `.arc` suffix baked in
- Subtle radial glow behind the search card
- Typing triggers mock availability check with loading shimmer
- **Available result:** green badge, registration card slides up with spring animation
- **Taken result:** red badge, shows mock owner address (monospace), expiry countdown, if mock-listed shows price + Buy button
- No other elements competing for attention on this page

### Page 2 — Register / Gift (`src/components/RegisterCard.tsx`)
- Slides up from the Search result — not a separate page, inline expansion
- Toggle at top: "For Myself" / "Gift to Someone" — pill toggle, not a dropdown
- Gift mode reveals "Gift to" input (accepts `.arc` name or address)
- Duration picker: segmented 3mo / 6mo / 12mo — price updates with a number spring animation
- Two-step flow shown inline (no modal):
  - Step 1: "Allow USDC" button — idle / loading / done states
  - Step 2: "Register name.arc" button — active only after step 1
  - Thin step progress line between them
- Success state: glass card with 2px spectral top-border strip, name displayed large, expiry date, mock explorer link (non-clickable placeholder)

### Page 3 — Send (`src/pages/Send.tsx`)
- "To" field: type `.arc` name → mock resolved address appears below with checkmark
- Amount input: large numeric input, USDC label
- Quick chips below input: 1 / 5 / 10 / 25 USDC — tap to fill
- Optional note field with character counter
- Preview row: "Sending 25.00 USDC to alice.arc (0x1a2b…3c4d)"
- Send button cycles through mock states: idle → Approving → Confirming → Sent
- Success state shows mock tx confirmation inline

### Page 4 — My Names (`src/pages/MyNames.tsx`)
- Header: "3 / 3 names used" usage pill — mix of states in mock data
- Name list (mock data: one healthy, one expiring soon, one expired):
  - **Healthy:** name, expiry date, days remaining, resolved address chip
  - **Expiring ≤ 30 days:** amber "Expiring Soon" badge, Renew button highlighted
  - **Expired:** red "Expired" badge, greyed out, note that it's claimable by others
- Per-name action row: Renew / Transfer / List for Sale / Cancel Listing
- "List for Sale" expands inline price input with Confirm button
- "Transfer" shows a permanent-action warning banner before confirming
- Empty state: illustrated empty card with "Register your first .arc name" CTA

### Page 5 — Marketplace (`src/pages/Marketplace.tsx`)
- Grid layout (2-col mobile, 3-col desktop) of mock listed names
- Filter chips at top: All / 3-letter / 4-letter / 5+ letter
- Each listing card: name large, asking price, expiry date, "Buy" ghost button
- Buy flow inline on card: expands to show "Seller receives X USDC after 2.5% fee" preview row, then Approve → Buy two-step
- Empty filter state when no names match selected length

### Page 6 — Name Profile (`src/pages/NameProfile.tsx`)
- Accessible at `/name/:nameParam` — e.g. `/name/alice`
- No wallet connection required to view
- Large name display with `.arc` suffix, owner address (monospace), expiry
- "Send Tip" button — opens Send flow pre-filled with this name
- If mock-listed: price card with "Buy this name" CTA
- If expired: "This name is available" banner with Register CTA

### Shared Components
- `src/components/TxButton.tsx` — button with idle / loading-spinner / success / error states, never fakes progress on a timer
- `src/components/DurationPicker.tsx` — 3mo/6mo/12mo segmented control, emits price on change
- `src/components/NameCard.tsx` — reusable name row/card used in My Names and Marketplace
- `src/components/NavBar.tsx` — top nav (desktop) + bottom tab bar (mobile), active tab highlight
- `src/components/AddressBadge.tsx` — truncated address in JetBrains Mono with copy-to-clipboard

### Global
- `src/App.tsx` — routing (react-router or page state), layout shell, ConnectKit wallet button in header
- `src/index.css` — Arc Dark tokens, Space Grotesk + DM Sans + JetBrains Mono loaded via index.html
- `src/mock/data.ts` — all mock names, listings, prices, wallet state in one file for easy swap-out later
- `index.html` — Google Fonts preconnect + stylesheet link

## Build Sequence
1. Set up Arc Dark design tokens in `src/index.css` + fonts in `index.html`
2. Build shared components: `TxButton`, `DurationPicker`, `AddressBadge`, `NavBar`
3. Build `Search` page — search input, available/taken result states
4. Build `RegisterCard` — For Myself/Gift toggle, duration picker, two-step inline flow, success state
5. Build `Send` page — name resolution preview, amount chips, note field, mock tx states
6. Build `MyNames` page — mixed mock states, per-name actions, list/transfer flows
7. Build `Marketplace` page — grid, filters, buy flow with fee preview
8. Build `NameProfile` page — public view, send tip pre-fill, buy if listed
9. Wire all pages into `App.tsx` with navigation and ConnectKit wallet button

## Mock Data (`src/mock/data.ts`)
- `alice.arc` — owned by connected wallet, expires in 180 days, not listed
- `bob.arc` — owned by connected wallet, expires in 18 days (expiring soon)
- `xyz.arc` — owned by connected wallet, expired 7 days ago
- `vitalik.arc` — taken by another address, expires in 247 days
- `pro.arc` — listed for sale at 120 USDC, expires in 200 days
- `defi.arc` — listed for sale at 45 USDC, expires in 90 days
- `pay.arc` — listed for sale at 200 USDC, expires in 310 days
- Wallet mock balance: 50.00 USDC

## Done When
- [ ] Arc Dark tokens and fonts applied globally — no Inter, no purple gradients
- [ ] Search page loads as the default landing screen
- [ ] Available name shows registration card with For Myself / Gift toggle
- [ ] Taken name shows owner info and expiry
- [ ] Duration picker updates price with spring animation
- [ ] Two-step register flow (Allow → Register) works with mock states
- [ ] Gift mode shows recipient input field
- [ ] Send page resolves mock `.arc` name to address, quick chips fill amount
- [ ] My Names shows all three mock states: healthy, expiring, expired
- [ ] List for Sale and Transfer flows work with mock states
- [ ] Marketplace grid renders with filter chips working
- [ ] Buy flow shows seller payout preview with 2.5% fee
- [ ] Name Profile page renders at `/name/alice` without wallet connection
- [ ] Bottom tab bar on mobile, top nav on desktop
- [ ] No emojis, no fabricated explorer links, no timer-based fake progress
