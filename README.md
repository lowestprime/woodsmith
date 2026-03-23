# Woodsmith Owner Guide

This guide is for the site owner using Woodsmith from the web browser.

It explains:

- what the site currently does well
- what you can manage yourself from the browser
- what still requires SSH or a developer
- how inquiries become sales conversations and active projects

This is **not** a generic CMS. Woodsmith is a self-hosted portfolio, journal, commission intake, and reservation-tracking system built for a woodworking studio.

---

## 1. What the website is for

Woodsmith combines four jobs in one place:

1. **Portfolio**: shows completed or pattern-based work
2. **Shop**: shows pieces that are available to reserve
3. **Journal**: shows written posts about process, design, and studio thinking
4. **Studio dashboard**: private admin area where you manage buyer conversations and project dossiers

The site is especially strong at **inquiry-based sales**:

- a visitor sees a piece or a commissions page
- they fill out a form
- the site creates a private reference number and dossier page
- you log into the studio dashboard and manage the conversation from there

That makes it excellent for custom work, reservations, quote-based sales, and high-touch projects.

---

## 2. What visitors can do on the public site

Visitors can:

- browse the portfolio
- view individual pieces
- browse available inventory in the shop
- read journal posts
- submit a custom commission request
- submit a reservation request for an existing piece
- revisit their project dossier using the reference link they receive
- post follow-up updates to their dossier

---

## 3. What you can do yourself from the browser

Once you log into `/studio`, you can:

- see all incoming requests in one dashboard
- see how many total requests, commission briefs, shop inquiries, and open dossiers you have
- open any request by its reference number
- update the buyer-facing status
- update the buyer-facing stage
- write a public note for the buyer
- write a private internal note for yourself
- add a timeline update and choose whether it is public or private
- log out securely

This is the part of the system you will use most often.

---

## 4. What you cannot currently change from the browser

The current version does **not** include a browser CMS for site content.

That means you cannot currently do these things from the browser alone:

- add a new portfolio piece
- change the list of available commission types
- upload new product photos
- edit the journal post library
- change the home-page featured content logic
- change wording across the site layout or navigation
- add online checkout, payment capture, shipping rates, or tax calculation

Those parts still live in code and project files.

In plain language:

- **buyer/project management is browser-based**
- **site content management is still file/code based**

---

## 5. What kind of sales workflow this site supports

Woodsmith is best understood as an **inquiry-and-dossier commerce system**, not a typical shopping cart.

### It supports well

- custom commissions
- reservation requests for finished pieces
- quote-based sales
- delivery planning conversations
- project history and milestone tracking
- one shared place for buyer follow-ups and studio updates

### It does not natively support

- add-to-cart checkout
- card processing
- Stripe/PayPal integration in the current audited code
- coupon codes
- inventory counts with automatic stock reduction
- customer accounts with passwords
- invoice creation
- shipping calculators
- taxes or payment reconciliation

If you accept payment elsewhere, use Woodsmith as the communication and status hub, then record the payment milestone in the dossier timeline.

---

## 6. How a project moves through the system

### For a custom commission

1. A visitor opens `/commissions` or a commissionable portfolio piece.
2. They submit details about project type, name, email, budget, timing, materials, dimensions, and a project brief.
3. The system creates a dossier with a reference number.
4. You log into `/studio` and open that dossier.
5. You update status, stage, notes, and timeline messages as the project moves forward.

### For an inventory reservation

1. A visitor opens a piece that is available now.
2. They submit a reservation note.
3. The system creates a dossier for that inquiry.
4. You use the dossier to confirm availability, discuss finish/shipping details, and close the sale.

---

## 7. Your most important pages

## Public pages

- `/` — home page
- `/portfolio` — all work
- `/shop` — available pieces
- `/journal` — writing
- `/commissions` — commission intake

## Buyer pages

- `/requests/REFERENCE` — buyer dossier page for a specific request

## Private owner/admin pages

- `/studio/login` — login page
- `/studio` — dashboard
- `/studio/request/REFERENCE` — request management page

---

## 8. What a dossier is

A dossier is the shared record for one buyer inquiry or reservation.

Each dossier includes:

- a unique reference number
- the project title or piece name
- the client name and email
- optional phone, city, budget, timeline, materials, and dimensions
- the original buyer note
- the current status
- the current stage
- public notes from the studio
- timeline updates from buyer and studio

Think of it as the single living project page for that conversation.

---

## 9. What the fields mean in practice

## Status

A short buyer-facing headline for where the project stands.

Examples:

- `Brief received`
- `Quoted`
- `Awaiting deposit`
- `In progress`
- `Ready for delivery`
- `Delivered`
- `Closed`

## Stage

A slightly more specific buyer-facing progress label.

Examples:

- `Reviewing brief`
- `Preparing quote`
- `Awaiting approval`
- `Queued for build`
- `Building`
- `Finishing`
- `Delivery planning`

Important: this field is visible to the buyer, so do not treat it as private internal shorthand.

## Public note

A standing note the buyer should see whenever they open the dossier.

Use it for:

- current next steps
- material decisions
- delivery notes
- quote or deposit reminders

## Internal note

A private note only visible in the studio dashboard.

Use it for:

- your own reminders
- cost thoughts
- internal scheduling detail
- anything that should not be shown to the buyer

## Timeline message

A dated update appended to the history.

Use it for:

- progress updates
- decision logs
- delivery arrangements
- buyer questions and your answers

When writing a timeline message from the studio, you choose whether it is:

- **public** — visible to the buyer
- **private** — visible only in the studio dashboard

---

## 10. Recommended status system for consistency

Use a small, fixed vocabulary so the dashboard stays clean and buyers get predictable wording.

## Recommended statuses

- `Brief received`
- `Quoted`
- `Awaiting deposit`
- `Scheduled`
- `In progress`
- `Ready for delivery`
- `Delivered`
- `Closed`

## Recommended stages

- `Reviewing brief`
- `Preparing quote`
- `Awaiting approval`
- `Awaiting deposit`
- `Queued for build`
- `Building`
- `Finishing`
- `Delivery planning`
- `Completed`
- `Archived`

Important detail: the dashboard's “Open dossiers” count stops counting a project as open only when status is exactly `Delivered` or `Closed`.

---

## 11. The best daily routine for the owner

A simple reliable routine:

1. open `/studio`
2. check new requests
3. open each active dossier
4. update status/stage where needed
5. send one clear public timeline update when there is buyer-relevant progress
6. keep private internal notes current
7. mark finished projects as `Delivered` and later `Closed`

This keeps the site useful both for you and for the buyer.

---

## 12. The best way to use Woodsmith for actual sales

Because the site is inquiry-based, the best sales use is:

- let the site qualify and collect serious inquiries
- use the dossier as the official project thread
- send quotes or payment requests through your preferred external payment/invoicing method
- record key milestones back into the dossier

A practical sequence looks like this:

1. buyer submits a brief
2. you review the dossier
3. you update the status to show the project is under review
4. you send a quote externally
5. you log `Quote sent` or similar in the dossier
6. after approval/deposit, you move the project to `Scheduled` or `In progress`
7. you post build updates as public timeline messages
8. when delivery is complete, you set status to `Delivered`
9. after final wrap-up, you set status to `Closed`

---

## 13. Important limitations and privacy expectations

### Dossier links should be treated carefully

A dossier page contains buyer information and allows buyer follow-ups from that page.

Practical rule:

- only share a dossier link with the buyer and trusted collaborators
- do not publish dossier links openly

### Studio login is one shared password

The current audited system uses one studio password, not separate staff accounts.

Practical rule:

- keep the password strong
- only share it with people who should truly manage all requests
- change it if access needs to be revoked

---

## 14. When you need SSH or developer help

You need SSH or file/code help when you want to:

- add or swap product photos
- add a new portfolio piece
- add or edit a journal post
- change public navigation or layout
- change piece availability labels or lead times
- change the list of commission options
- add payments or checkout features
- change the deployment itself

---

## 15. What success looks like

Woodsmith is working well when:

- visitors can browse work clearly
- serious buyers submit complete briefs
- every inquiry becomes a dossier immediately
- you can manage all buyer conversations from `/studio`
- buyers always know the current project state without needing scattered email threads

---

## 16. Related file

For exact browser-admin instructions, read `admin.md`.
