# Woodsmith Admin Manual

This guide is for the owner or studio operator using the private browser dashboard.

It explains exactly how to log in, manage requests, communicate with buyers, and use the current feature set safely.

## 1. How to log in

1. Open your live site in the browser.
2. Go to `/studio/login`.
3. Enter the studio password.
4. Click **Enter Studio**.

If the password is correct, you are redirected into `/studio`.

If the password is wrong, the page shows an error.

## 2. What you see on the dashboard

The dashboard shows:

- **Total requests**
- **Commission briefs**
- **Shop inquiries**
- **Open dossiers**

Below that, it shows a table of all requests. Each row links into that request's management page.

Think of the dashboard as your inbox plus workload summary.

## 3. How to open a request

1. Log into `/studio`.
2. Find the row for the buyer or reference number.
3. Click the reference number.
4. You will land on `/studio/request/REFERENCE`.

That page is the full management screen for that one buyer.

## 4. What is on a request page

Each request page has two big parts.

## A. Project summary

This shows:

- reference number
- project or piece name
- current status
- current stage
- client information
- original message
- public note, if one exists
- internal note, if one exists
- full timeline

## B. Studio controls

This is the editable form where you manage the request.

## 5. What each control does

## Status

This is the main buyer-facing headline.

Use it to answer:

**What broad state is this project in right now?**

Good examples:

- `Brief received`
- `Quoted`
- `Awaiting deposit`
- `In progress`
- `Ready for delivery`
- `Delivered`
- `Closed`

## Stage

This is a more specific progress phrase.

Use it to answer:

**What exact step is happening right now?**

Good examples:

- `Reviewing brief`
- `Preparing quote`
- `Awaiting approval`
- `Queued for build`
- `Building`
- `Finishing`
- `Delivery planning`

Important: buyers can see this field too, so keep it professional and understandable.

## Public note

This is a persistent note visible to the buyer on their dossier.

Use it for things the buyer should keep seeing, such as:

- current next step
- current quote/delivery note
- material or finish confirmation
- measurement reminder

## Internal note

This is private to the studio dashboard.

Use it for:

- personal reminders
- internal scheduling notes
- pricing thoughts
- anything not meant for the buyer

## Timeline message

This appends a dated update into the history.

Use it for one-off events or messages like:

- `Quote sent by email today.`
- `Walnut stock selected; milling begins next week.`
- `Buyer confirmed final finish sample.`
- `Delivery moved to Friday at 2 PM.`

## Visibility

This controls whether the timeline message is:

- **Public to buyer**
- **Studio only**

If you are not comfortable with the buyer seeing it, choose **Studio only**.

## Save Request

This saves the request fields and appends the timeline message if you entered one.

## 6. The safest way to update a request

A good habit is:

1. update **Status** if the buyer-facing state has changed
2. update **Stage** if the operational step has changed
3. update **Public note** only if there is standing information the buyer should keep seeing
4. update **Internal note** for your private context
5. add a **Timeline message** only when there is a real event worth logging
6. choose the correct visibility
7. click **Save Request**

This keeps the dossier readable instead of cluttered.

## 7. What the buyer sees

The buyer dossier page shows:

- the project title
- the current status
- the current stage
- client and project details
- the original inquiry
- the studio public note
- all public timeline updates
- a form for the buyer to post a follow-up update

The buyer does **not** see:

- internal notes
- private studio timeline updates

## 8. Recommended operating rules

## Rule 1: keep status broad

Status should read like a headline, not a diary entry.

Good:

- `In progress`
- `Ready for delivery`

Not ideal:

- `Waiting for hinge delivery and maybe checking shop humidity`

## Rule 2: keep stage specific but buyer-safe

Good:

- `Finishing`
- `Delivery planning`

Not ideal:

- `Need to recut panel because first attempt cupped`

That kind of note belongs in the internal note, not in stage.

## Rule 3: use public note for the current standing instruction

Good use:

- `Final finish sample approved. Build scheduled to begin next week.`
- `Delivery window will be confirmed after crating quote returns.`

## Rule 4: use timeline for dated events

Good use:

- `Quote sent today.`
- `Deposit received.`
- `Bench assembled; finishing starts tomorrow.`

## Rule 5: use internal note for the truth you need privately

Good use:

- internal cost reminders
- supplier follow-up notes
- your own to-do list for that job

## 9. A clean workflow for common situations

## New commission brief arrives

Recommended action:

- **Status**: `Brief received`
- **Stage**: `Reviewing brief`
- **Public note**: optional short note like `Thanks. The brief is under review and the next step is a quote.`
- **Timeline message**: optional public welcome/update

## Quote has been sent

Recommended action:

- **Status**: `Quoted`
- **Stage**: `Awaiting approval`
- **Public note**: `Quote sent. Reply with any revisions or approval questions.`
- **Timeline message**: public note that the quote was sent

## Deposit is needed

Recommended action:

- **Status**: `Awaiting deposit`
- **Stage**: `Awaiting deposit`
- **Public note**: `Production scheduling begins once the deposit is received.`

## Project enters production

Recommended action:

- **Status**: `In progress`
- **Stage**: `Building`
- **Public note**: `Materials are in hand and build work is underway.`
- **Timeline message**: public if buyer would appreciate an update, private if it is just for your own log

## Finish work is underway

Recommended action:

- **Status**: `In progress`
- **Stage**: `Finishing`

## Delivery is being arranged

Recommended action:

- **Status**: `Ready for delivery`
- **Stage**: `Delivery planning`
- **Public note**: `The piece is ready. Final delivery timing is being coordinated.`

## Project is complete

Recommended action:

- **Status**: `Delivered`
- **Stage**: `Completed`
- after any final wrap-up, move to:
- **Status**: `Closed`
- **Stage**: `Archived`

This matters because the dashboard only stops counting a dossier as open when status becomes `Delivered` or `Closed`.

## 10. How to use the system for real sales work

Woodsmith is best used like this:

1. let the public forms collect serious leads
2. use the dossier as the central shared record
3. send quotes, invoices, or payment requests through your preferred outside system
4. record those milestones back into the dossier

Examples of useful public timeline messages:

- `Quote sent by email today.`
- `Deposit received; project is now scheduled.`
- `Material selection confirmed.`
- `Finishing is complete; delivery planning begins this week.`

Examples of useful private timeline messages:

- `Need to reorder felt pads before delivery.`
- `Buyer asked for alternate second quote; hold until Friday.`
- `Shop time blocked next Tuesday for milling.`

## 11. What not to expect from the current admin

This admin is not a full e-commerce back office.

You cannot currently use it to:

- capture online payments
- issue invoices automatically
- manage shipping labels
- manage product inventory counts automatically
- upload media from the browser
- add new site pages from the browser
- edit journal content from the browser

It is a dossier-and-communication admin, not a full retail ERP or Shopify replacement.

## 12. Privacy and sharing guidance

## Dossier links

Do not treat dossier links as publicly shareable. Share them only with the buyer and trusted collaborators.

## Public vs private writing

Before saving, ask:

- would I be comfortable with the buyer seeing this?

If yes, it can be a public note or public timeline message.

If no, it should live in:

- **Internal note**, or
- a **Studio only** timeline entry

## Shared studio password

The current audited system uses one studio password for the dashboard.

Best practice:

- only share it with true admins
- change it if someone should no longer have access

## 13. Troubleshooting for the owner

## I cannot log in

Most likely causes:

- wrong password
- the site admin password was changed on the server
- your session expired

Try again from `/studio/login`.

## I saved a request but the buyer says they do not see my message

Possible causes:

- the message was saved as **Studio only** instead of **Public to buyer**
- you updated **Internal note** instead of **Public note**
- you changed the status but not the public-facing note you meant to update

## My dashboard count looks wrong

Make sure completed projects use status exactly `Delivered` or `Closed`.

## I need to add a new piece to the portfolio

That is not currently a browser-admin task. It requires SSH/file or developer work.

## 14. The simplest good habit set

If you want the easiest reliable routine:

- use **Status** for the headline
- use **Stage** for the buyer-safe step
- use **Public note** for the current standing instruction
- use **Internal note** for your private context
- use **Timeline messages** for dated events
- mark finished work as `Delivered` and later `Closed`

That alone will keep the system clear and professional.
