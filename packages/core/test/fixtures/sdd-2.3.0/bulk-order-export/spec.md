---
status: Draft
owner: "PM (bulk-order-export)"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-09"
feature_size: "L"
---

# Spec — bulk-order-export

> **Glossary:** [CONTEXT](./CONTEXT.md) (feature) · [CONTEXT](../../../CONTEXT.md) (project-wide)
> **Reference module / docs / channels used:** `README.md` (project docs — «What exists today» and «Next feature: bulk order export»).

## 1. Context

Shop owners and managers close their books from order data, but today the admin panel only shows orders on screen; there is no way to get a period's orders into a spreadsheet for accounting. Staff copy rows by hand or ask an engineer for a one-off extract, which is slow, error-prone and leaks customer data through ad-hoc channels.

The trigger is the accounting cycle: the shop now handles up to ~200k orders in a period, which makes manual copying impossible and makes a "build it while I wait" download unreliable. Accounting needs a repeatable, self-service extract with a fixed column layout.

Committed approach: an owner or manager picks a date range and one or more order statuses in the admin panel and requests an order export; the export file is built in the background, the requester is emailed a download link when it is ready, and every export (in progress, ready, failed, expired) is visible in an Exports list. Export files and their links expire 7 days after they become ready; one export may cover at most one year; each staff user may have only one export queued or running at a time. Every calendar date in this feature (the date-range boundaries, both inclusive; "today"; the daily request limit; the created at column) is read in the shop's configured timezone, Europe/Kyiv. The ideation suite was skipped at `easy` depth — this approach comes straight from the raw idea (ledger A2).

Traceability: the README states the existing staff roles (`owner`, `manager`, `support`), the order statuses (pending, paid, shipped, cancelled, refunded), the expected volume (~200k orders) and that the shop already runs background work and transactional email; this feature reuses those capabilities rather than introducing new ones.

## 2. Goals

- Owners and managers get a period's orders into their accounting tool without engineering help or manual copying.
- Large exports complete reliably in the background without blocking the person who asked, and the requester learns about the result (ready or failed) without having to watch the screen.
- Customer data in export files stays limited to the people allowed to export it and disappears on a fixed schedule.

## 3. Non-goals

- Formats other than a comma-separated file (spreadsheet workbooks, PDF) — accounting tools import comma-separated files and one format keeps the column contract simple.
- Configurable or per-item columns — the ten export columns are fixed so accounting imports stay stable; per-item detail is a separate future need.
- Scheduled or recurring exports — the need is an on-demand period close; scheduling adds lifecycle rules nobody has asked for yet.
- Cancelling a queued or running export — exports finish within minutes and a stuck export ends as failed (AC-13), freeing the requester to try again; cancel adds a state for little value.

## 4. User stories

### US-01: Request an order export

**As a** manager
**I want** to pick a date range and one or more order statuses and request an order export
**So that** I get exactly the orders accounting needs for the period without copying them by hand

### US-02: Get notified when the export finishes

**As a** manager
**I want** to receive an email with a download link when my export file is ready (or a notice when it failed)
**So that** I can leave the admin panel while a large export is built and still pick it up promptly

### US-03: Browse my past exports

**As a** manager
**I want** to see my past and in-progress order exports in an Exports list with their filter, export status and expiry
**So that** I can re-download a recent file or see why an export is not ready without searching my inbox

### US-04: Oversee every staff user's exports

**As an** owner
**I want** to request exports myself and see every staff user's order exports, including who requested each one
**So that** I know which customer data has left the admin panel and can retrieve any recent file for accounting

### US-05: Keep support out of exports

**As a** support
**I want** the export capability to be unavailable to me
**So that** bulk customer data only reaches the roles the shop has authorised to handle it

### US-06: Handle an expired export

**As a** manager
**I want** to be told plainly when an export has expired and be able to request a fresh one
**So that** an old email link never leaves me stuck

## 5. Acceptance criteria

### AC-01 (US-01, US-04) — happy path

**Given** a signed-in owner or manager with no order export queued or running
**When** they select a date range of one month and the statuses paid and shipped and request an export
**Then** the system records a new order export with export status queued and that staff user as requester, confirms the request, and the export appears at the top of their Exports list with its date range and statuses

### AC-02 (US-02) — happy path

**Given** a manager's order export is queued
**When** the system finishes building its export file
**Then** the export status becomes ready, the manager receives an email naming the date range, statuses and number of orders with a download link, and the downloaded file holds a header row plus one row per order created in the range whose current order status is one of the selected statuses, with the export columns in this order: order id, created at, status, customer email, item count, subtotal, tax, shipping, total, currency

### AC-02b (US-02) — domain invariant (export file value formats)

**Given** a ready order export
**When** the requester opens its export file in a spreadsheet or accounting import
**Then** the file is UTF-8 text with comma separators; the header row holds the column names exactly as listed in AC-02; created at is the order's creation date and time in the shop timezone with its UTC offset (for example 2026-03-05T14:30:00+02:00); status is the lowercase order status name (for example paid); subtotal, tax, shipping and total are plain decimal numbers in the order's own currency as stored, with a dot as decimal separator and no currency symbol or thousands separator; currency is the three-letter currency code (for example UAH)

### AC-03 (US-02) — happy path (no matching orders)

**Given** a manager requests an export for a date range in which no order has one of the selected statuses
**When** the system finishes the export
**Then** the export status becomes ready, the email states that the export contains zero orders, and the export file holds only the header row

### AC-04 (US-01) — error

**Given** a signed-in manager on the export request form
**When** the manager picks a start date later than the end date, or an end date in the future, and requests the export
**Then** the system blocks the request and shows the manager that the start date must be on or before the end date and the end date must not be later than today, where "today" is the current date in the shop timezone

### AC-05 (US-01) — error

**Given** a signed-in manager on the export request form
**When** the manager clears every order status and requests the export
**Then** the system blocks the request and shows the manager that at least one order status must be selected

### AC-06 (US-01) — domain invariant

**Given** a signed-in manager on the export request form
**When** the manager selects a date range whose end date is later than the day before the same calendar date one year after the start date (for example 2025-01-01 to 2026-01-01) and requests the export
**Then** the system blocks the request and tells the manager that one export can cover at most one year, suggesting splitting the period into several exports; the longest accepted range runs from the start date to the day before the same date one year later (for example 2025-01-01 to 2025-12-31, or 2024-03-01 to 2025-02-28)

### AC-07 (US-01) — domain invariant

**Given** a manager already has an order export with export status queued or running
**When** the manager requests another export
**Then** the system blocks the new request and tells the manager that only one export can be in progress at a time and when the current one was requested; once that export is ready or failed, the one-in-progress rule no longer blocks a new request (the daily request limit in AC-16 still applies)

### AC-08 (US-05) — authorization

**Given** a signed-in support
**When** the support opens the Orders area or tries to reach the Exports list or the export request form directly
**Then** the export action and the Exports list are not offered, and any direct attempt to request, list or download an export is denied with a message that exporting orders is limited to owners and managers

### AC-09 (US-03) — authorization

**Given** two managers, A and B, where B has a ready order export
**When** manager A opens the Exports list or follows B's download link
**Then** A's Exports list shows only A's own exports, and the attempt to use B's link is treated as if the export does not exist, so A cannot learn that B's export exists or what it contains

### AC-10 (US-04) — happy path

**Given** a signed-in owner and ready order exports requested by two different managers
**When** the owner opens the Exports list
**Then** the owner sees every staff user's exports with the requester's name, date range, statuses, export status, number of orders and expiry, and can download any export that is ready

### AC-11 (US-03) — happy path

**Given** a manager with exports in each export status
**When** the manager opens the Exports list
**Then** each export shows its requested time, date range, statuses, export status, number of orders (once known) and expiry time; a download action is offered only for ready exports, and failed exports show that the export failed and that a new one can be requested

### AC-12 (US-06) — domain invariant

**Given** a manager's order export became ready more than 7 days ago
**When** the manager follows the emailed download link or opens the export in the Exports list
**Then** the system does not provide the file, shows the export status as expired and tells the manager that export files are available for 7 days and a new export can be requested for the same period

### AC-12b (US-06, US-03) — domain invariant (expired exports leave the list)

**Given** a manager's order export has been expired for 30 days
**When** the manager (or an owner) opens the Exports list
**Then** that export no longer appears in the Exports list; until then it is listed with export status expired and no download action

### AC-13 (US-02) — error (processing failure)

**Given** a manager's order export is queued or running
**When** the system cannot complete the export file, or the export has been queued or running for more than 60 minutes since it was requested
**Then** the export status becomes failed, the manager receives an email saying the export could not be completed and can be requested again, and the failed export no longer counts as the manager's one export in progress

### AC-14 (US-02) — cross-context

**Given** a manager requested an order export and an owner then changes that staff user's role to support (or deactivates the staff user)
**When** the former manager follows the download link
**Then** the system denies the download because the staff user is no longer allowed to export orders, and an owner can still see and download the export from the Exports list until it expires

### AC-14b (US-02, US-04) — cross-context (role lost while in progress)

**Given** a manager's order export is queued or running and an owner then changes that staff user's role to support (or deactivates the staff user)
**When** the system finishes the export
**Then** the export still becomes ready (or failed) and is visible to owners in the Exports list, but the former manager receives no email with a download link or export details

### AC-15 (US-02) — cross-context

**Given** an order created inside the export's date range changes its order status (for example from paid to refunded) after the export was requested, or while the file is being built
**When** the system builds the export file
**Then** every order is included or excluded, and its status column filled, according to its order status at the single moment the build starts, so the file is a consistent snapshot as of that moment; the number of orders shown in the email and the Exports list equals the number of data rows in the file

### AC-16 (US-01) — domain invariant

**Given** a manager has already had 20 order export requests accepted today (the current calendar day in the shop timezone, counting every accepted request whatever its later outcome, and not counting requests the system blocked) and none is in progress
**When** the manager requests another export
**Then** the system blocks the request and tells the manager that at most 20 exports can be requested per day and that requesting will be possible again from midnight in the shop timezone

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Request acknowledgement p95 (submit request → confirmation shown) | ≤ 1 000 ms | admin request latency metric for the export request action |
| Exports list load p95 | ≤ 500 ms for up to 100 visible exports | admin request latency metric for the Exports list |
| Build time for a 200 000-order export (request → ready) | ≤ 10 min p95 | job duration metric per export, sliced by order count |
| Ready → email sent | ≤ 2 min p95 | timestamp delta between export ready and email accepted by the relay |
| Export success rate | ≥ 99% of exports reach ready (not failed) per 30 days | export status counts per 30-day window |
| Data accuracy | 100% — row count equals the number of matching orders as of the moment the build starts (AC-15); monetary values equal the stored order amounts to the cent | automated reconciliation check in the integration test suite + row count recorded per export |
| Impact on storefront | storefront checkout p95 latency rises ≤ 10% while an export is running | storefront latency metric compared with and without a running export in a load test |
| Retention | 100% of download attempts refused once an export is 7 days past ready; 100% of expired export files deleted within 24 h after expiry | refused-download count after expiry + daily audit of stored files past expiry |

## 6.1 Security / privacy

- **Data classification:** confidential — export files contain customer email addresses and per-order financial amounts in bulk.
- **Personal data touched:** no new personal-data fields are collected; the existing customer email is copied into export files (sensitivity: personal contact data). Each order export also records its requester, filter, export status, timestamps and order count (internal).
- **AuthZ/AuthN impact:** new capability «export orders», granted to owner and manager only. Every request, list and download checks the caller's current role at that moment (not the role at request time). A manager sees and downloads only exports they requested; an owner sees and downloads all exports. The download link alone never grants access — it works only for a signed-in staff user allowed to see that export.
- **Abuse cases:**
  - Cross-user access (manager opens another manager's export): hide existence — respond as if the export does not exist, so export ids reveal nothing.
  - Forwarded or leaked email link: useless without a signed-in owner or the requesting manager; expires 7 days after ready regardless.
  - Role downgrade after request: download denied once the role no longer carries the capability (AC-14).
  - Spam / load abuse (repeatedly requesting one-year exports): capped by one export in progress per staff user plus at most 20 export requests per staff user per day.
  - Formula injection via customer-entered text in the file: in the text columns (customer email, status, currency), any cell value that starts with `=`, `+`, `-`, `@`, a tab or a carriage return is written with a single leading apostrophe so opening the file never executes it; the value is otherwise unchanged. Numeric columns (order id, item count, monetary amounts) are written as plain numbers and are not altered.
- **Security review:** Required — new authorization capability and bulk export of personal data.

## 7. Metrics / KPIs

- **Self-service period exports** — baseline: 0 (no export exists), target: ≥ 1 ready export per month per shop within 60 days of launch.
- **Manual extract requests to engineering** — baseline: TBD (measurement plan: count engineering requests tagged "order export" over the 30 days before launch), target: 0 within 60 days of launch.
- **Export success rate** — baseline: 0 (new), target: ≥ 99% of exports reach ready within 30 days of launch.
- **Time from request to download link (p95, up to 200 000 orders)** — baseline: none (new), target: ≤ 12 min within 30 days of launch.

## 8. Open questions

- [x] Which timezone defines the date-range day boundaries? **Resolved (clarify, 2026-10-09):** the shop's configured timezone (Europe/Kyiv), both ends inclusive; the same timezone governs "today" (AC-04), the daily request limit (AC-16) and the created at column (AC-02b) — see §1. — owner: PM
- [x] How long does an expired export stay visible in the Exports list? **Resolved (clarify, 2026-10-09):** listed as expired for 30 days after it expired, then it disappears (AC-12b). — owner: PM
- [x] Is a daily cap of 20 export requests per staff user right for real accounting use? **Resolved (clarify, 2026-10-09):** keep 20 per staff user per calendar day in the shop timezone (AC-16). — owner: Tech Lead
- [ ] How does the Exports list behave beyond 100 exports (an owner sees every staff user's exports for up to 37 days after ready)? Default now: newest requested first, 100 exports per page with a way to reach older pages. — owner: Tech Lead, due: before sdd:api
