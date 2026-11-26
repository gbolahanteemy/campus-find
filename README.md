# Campus Lost & Found

A website where people upload items they find on campus, and students who lost something submit proof that it's theirs. Security reviews the proof and gives the owner a 6-digit pickup code.

## Files (keep them all in this one folder)

| File | What it does |
|---|---|
| `index.html` | Page structure |
| `style.css` | Look and colours (white and navy blue) |
| `core.js` | Shared code used by both pages (Firebase setup, sign-in window, helpers, scroll animation) |
| `app.js` | The student website (`index.html`) |
| `admin.html` + `admin.js` | The admin dashboard, kept separate from the student site |
| `settings.js` | Your school's details: email ending, locations, categories, WhatsApp number |
| `firebase-config.js` | Connects to your Firebase project (already filled in) |
| `firestore.rules` | Database security rules, pasted into Firebase |
| `manifest.webmanifest`, `admin.webmanifest`, `sw.js`, `icons/` | Make the site installable as a phone app |
| `vercel.json` | Optional: makes `/admin` work as well as `/admin.html` on Vercel |

## Getting it running

1. **Use this folder only.** Delete or rename your old project folders so you don't open the wrong one.
2. **Publish the rules.** Go to Firebase → **Firestore Database** → **Rules**, replace everything with the contents of `firestore.rules`, and click **Publish**.
3. **Turn on both sign-in methods.** Go to Firebase → **Authentication** → **Sign-in method** and check that **Google** and **Email/Password** both say *Enabled*.
4. **Open the site.** Open this folder in VS Code, right-click `index.html`, and choose **Open with Live Server**. Don't double-click the file.
5. **Make yourself an admin.** Open **admin.html** (with Live Server: `http://127.0.0.1:5500/admin.html`; online: `https://lost-and-found-2b862.web.app/admin.html`) and sign in. It says "No admin access" and shows your user ID, with a **Copy** button. In Firebase → **Firestore Database** → **Data**, open the `admins` collection (or create it), add a document whose **Document ID** is that ID, give it any field (e.g. `role` = `security`), and save. Refresh admin.html and the dashboard appears.

## The admin dashboard (admin.html)

- It isn't linked anywhere on the student website. Only people who know the address go there.
- Students who find it see "No admin access". The database rules block them from reading claims, profiles or reports anyway.
- Bookmark it on the security office computer.

If something is wrong, a red banner at the top of the page says what (a missing file, the wrong apiKey, and so on).

> `firebase-config.js` was typed from your screenshot. If you see "The apiKey in firebase-config.js is wrong", copy the `apiKey` line again from Firebase → Project settings → Your apps → Config.

## Your school settings (`settings.js`)

- `allowedEmailDomains`: e.g. `["student.unilag.edu.ng", "unilag.edu.ng"]` to allow only school emails. Leave `[]` to allow anyone. To enforce it in the database too, edit `schoolEmail()` in `firestore.rules` and publish again.
- `securityWhatsApp`: e.g. `"2348012345678"`. This shows a "Message security" button on approved claims.
- `locations`, `categories`, `sensitiveCategories`, `longUnclaimedDays`.

## Where student data is stored

- **Firebase → Authentication → Users:** every account (email, sign-in method, sign-up date, last sign-in).
- **Firebase → Firestore Database → `users`:** one document per person, with name, matric/staff number, department, level, phone, email, joined date and last sign-in. New users must complete this profile before using the site.
- Only the student and admins can read a profile (enforced by `firestore.rules`).
- Admins can see everyone in **admin.html → Students**, search them, and click **Download CSV (Excel)**.
- This is personal data, so tell students what you collect and why. Nigeria's Data Protection Act 2023 expects that.

## Features

- **Sign in** with Google or email and password (with email confirmation and "Forgot password"). Everything except the home page requires sign-in.
- **Report found:** photo, category, place, and where the item is kept, followed by a "Saved!" screen.
- **Found items:** search, category chips, location filter, and Waiting / Returned / All tabs.
- **Report lost:** when a similar item is uploaded, a red dot appears on **My stuff** and a banner on the home page.
- **Claim with proof:** only security sees the proof and the claimant's contact details.
- **Pickup code:** approving a claim creates a 6-digit code. Security checks it before handing the item over.
- **Privacy blur:** ID cards, ATM cards and documents are blurred until a claim is approved.
- **Share on WhatsApp** and **Report this post**.
- **Scroll animation:** sections and item cards fade in as you scroll.
- **Admin dashboard (admin.html):** this week's numbers, claims to review, items awaiting pickup, reported posts, and long-unclaimed items (with an Archive button).

## Using it on a phone (install as an app)

The site works in any phone browser, and students can also **install it like an app** with its own icon. No app store is needed.

- **Android (Chrome):** open the site, tap the menu (☰), then **Install app**. Or use Chrome's ⋮ menu, then **Add to Home screen**.
- **iPhone (Safari):** open the site, tap the menu (☰), then **Install app** to see the steps: tap the **Share** button, then **Add to Home Screen**.
- **Security staff:** open `admin.html` and tap **Install** to get a separate **CF Admin** app that opens straight to the dashboard.

Installing only works on the live site (https), or on your computer through Live Server.

## Putting it online

Run `npm install -g firebase-tools`, then `firebase login`, then `firebase init hosting` (public directory: `.`, single-page app: **No**, don't overwrite `index.html`), then `firebase deploy`.
Your site will be at **https://lost-and-found-2b862.web.app**.
