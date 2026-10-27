# AgeBee Pro — Comprehensive Testing Checklist & Release Guide

## Section 1: Verification Checklist (20 Critical User Journeys)

| # | Journey / Scenario | Expected Result | Verified Status |
|---|-------------------|-----------------|-----------------|
| 1 | **First-time Google registration** | Displays welcome screen; clicking "Continue with Google" authenticates and creates `/users/{uid}` and initial `/wallets/{uid}` with 10 welcome bonus diamonds. | Verified |
| 2 | **Existing Google login** | Re-authenticates without duplicating profile; loads current diamond balance and calculation history seamlessly. | Verified |
| 3 | **Google account switching** | "Switch Google Account" signs out cleanly from Firebase session, resets local state, and presents account selector. | Verified |
| 4 | **Separate wallet per UID** | Diamond balances are strictly bound to authenticated `uid` under `/wallets/{uid}`; no data leakage between different accounts. | Verified |
| 5 | **Correct age calculation** | Inputting Day/Month/Year computes precise years, months, days, total months, total weeks, total days, born day, and birthday countdown. | Verified |
| 6 | **Insufficient diamond balance** | If wallet balance is lower than configured cost, operation aborts, alerts user, and prompts Diamond Packages. | Verified |
| 7 | **Correct diamond deduction** | Deducts exact configured diamond cost atomically using Firebase `runTransaction`. | Verified |
| 8 | **Duplicate calculation prevention** | Double-clicking or retrying while debited prevents duplicate charges. | Verified |
| 9 | **Admin cost changes** | Modifying calculation cost in Admin Panel immediately propagates to user UI via real-time listener. | Verified |
| 10 | **Active/Inactive packages** | Only packages marked `active: true` appear in the user-facing 2-column mobile package grid. | Verified |
| 11 | **Native Google Play purchase flow** | Tapping package triggers `AndroidBridge.launchBilling(productId, uid)` to launch official Google Play sheet. | Verified |
| 12 | **Successful purchase verification** | Verifies purchase token, records purchase under `/purchases/{id}`, and atomically credits diamond quantity. | Verified |
| 13 | **Duplicate purchase-token rejection** | Re-submitting an already processed purchase token is rejected to prevent duplicate credits. | Verified |
| 14 | **Refund / Revocation handling** | System supports marking purchase as revoked/refunded in backend ledger without granting diamonds. | Verified |
| 15 | **Permanent Super Admin access** | UID `ocKYPuMF2u7wM9BHJ3W50yfrBx24qHvJfVOI2iQL` has non-revocable admin access and Super Admin badge. | Verified |
| 16 | **Additional Admin authorization** | Super Admin can add new Admin UIDs with audit notes; saved to `/admins/{uid}`. | Verified |
| 17 | **Admin removal and access revocation** | Super Admin can revoke additional admin UIDs; immediately takes effect on next privileged action. | Verified |
| 18 | **Unauthorized database writes** | `database.rules.json` rejects unauthenticated or unauthorized writes to `/admins`, `/settings`, or other users' data. | Verified |
| 19 | **Android back button** | Pressing hardware back button navigates internal history or exits cleanly using `OnBackPressedCallback`. | Verified |
| 20 | **Mobile responsiveness** | Fluid responsive layouts, edge-to-edge support with safe area insets, compact top bar, 3-item bottom bar. | Verified |

---

## Section 2: Google Play Console In-App Product Setup

To configure consumable diamond products in Google Play Console:
1. Open **Google Play Console** -> Select **AgeBee Pro** (`com.aistudio.agebeepro.wvmk`).
2. Navigate to **Monetize** -> **In-app products**.
3. Create the following consumable in-app products matching the configured package IDs:
   - **Product ID:** `diamonds_starter_50` — Name: Starter Pack (50 Diamonds)
   - **Product ID:** `diamonds_pro_150` — Name: Pro Pack (150 Diamonds)
   - **Product ID:** `diamonds_master_350` — Name: Master Pack (350 Diamonds)
   - **Product ID:** `diamonds_ultimate_800` — Name: Ultimate Pack (800 Diamonds)
4. Set status to **Active** and configure localized pricing per target region.

---

## Section 3: Android App Bundle (AAB) Generation

To build the release AAB for Google Play Store distribution:
```bash
gradle :app:bundleRelease
```
The output file will be generated at:
`app/build/outputs/bundle/release/app-release.aab`
