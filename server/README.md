# LokshinEats API

REST API for the LokshinEats ecosystem — the customer, driver, and vendor
Flutter apps, and the web admin dashboard, all talk to this service.

It runs Node/Express over the existing Firestore database using the Firebase
Admin SDK, so no data migration is needed and existing Firebase Auth accounts
keep working unchanged.

## Why this exists

The web app talked to Firestore directly from the browser, which meant the
client decided things only a server may decide:

- **Payments were simulated.** `services/paymentService.ts` resolved every
  payment as successful after a `setTimeout` and invented a transaction id,
  then checkout wrote `paymentStatus: 'paid'` onto the order. Any client could
  mint a paid order.
- **The client computed its own payouts.** Checkout ran the commission split in
  the browser and wrote `vendorPayout`, `driverPayout`, and `platformEarnings`
  straight onto the order document.
- **The delivery code was generated in the browser** with `Math.random`, stored
  in plaintext where the assigned driver could read it, and compared
  client-side — so a driver could confirm a delivery that never happened.

This service is the trusted party that closes those holes. The Admin SDK
bypasses Firestore security rules by design; the rules are then free to deny
clients any write to money-bearing collections.

**All three are now closed.** Checkout, the vendor order pages and the driver
pages all go through this API: `app/checkout/page.tsx` sends a store id,
product ids with quantities, an address and a payment method and nothing else,
and every order write from a vendor or driver is an API call. The rules deny
clients order creation outright and allow only the customer's review flags on
an update, and delivery codes live in a collection no client can read.

Reads still come from Firestore, so the order feeds stay live. It was only the
writes that were dangerous.

## Layout

```
src/
  config/      env validation, logging, Firebase Admin init
  lib/         framework-free helpers (money, OTP, pagination, errors)
  middleware/  auth, RBAC, validation, rate limiting, error boundary
  modules/     one folder per feature: model, repository, service, routes
```

Each module splits four ways, so business rules stay testable and storage
stays swappable:

| File              | Responsibility                                  |
|-------------------|-------------------------------------------------|
| `*.model.ts`      | Types, Zod schemas, Firestore -> API serialisers |
| `*.repository.ts` | The only layer that touches Firestore            |
| `*.service.ts`    | Business rules and invariants                    |
| `*.routes.ts`     | HTTP surface, wiring, status codes               |

## Running it

```bash
npm install
cp .env.example .env   # then fill in FIREBASE_PROJECT_ID and credentials
npm run dev
```

Credentials resolve in this order: `FIREBASE_SERVICE_ACCOUNT_JSON` (inline
JSON), then `GOOGLE_APPLICATION_CREDENTIALS` (path to a key file), then
Application Default Credentials. On Cloud Run there is nothing to configure.

```bash
npm run typecheck        # source and tests
npm test                 # unit tests — fast, no emulator needed
npm run test:integration  # against the Firestore emulator
npm run test:all         # both
npm run build            # emit dist/
npm start                # run the build
```

## Testing

Two suites, split by what they need.

**Unit tests** (`npm test`) cover pure logic — schemas, the order lifecycle
table, audience-scoped serialisation, money arithmetic. They need nothing but
Node and run in a few seconds.

**Integration tests** (`npm run test:integration`) run against the Firestore
and Auth emulators, and come in two kinds.

*Service-level* tests cover what only exists once transactions and document
ids are real: that a replayed settlement does not pay a vendor twice, that a
balance always equals the sum of its ledger, that two drivers accepting the
same order produce exactly one winner, and that concurrent wrong delivery
codes each burn an attempt instead of racing the counter.

Those tests earn their keep. The emulator caught a bug the unit suite could
not see: `clearPending` was composing two `credit()` calls inside one
transaction, and Firestore requires every read in a transaction to precede
every write — so `settleDelivery` would have failed on every real delivery.

*HTTP route* tests drive the real Express app with **real Firebase ID tokens**
minted from the Auth emulator — created, given a role claim, then signed in
over the Identity Toolkit REST API, exactly as a client does. Every request
goes through the genuine `verifyIdToken`, so a forged token with the right
shape but no signature is rejected by the same code production uses.

That distinction matters. A unit test can prove `toOrder` hides the delivery
code from a driver; only a route test proves the handler actually asks for the
driver's view. The same applies to every guard: the schema refusing an
`ownerId` is one claim, the route deriving it from the caller is another.

Route tests assert the security boundary, not just the happy path — a customer
cannot refund themselves, credit their own wallet, place an order at a price
they chose, or reach an admin list; a vendor cannot edit another vendor's menu
or use the admin store route; a driver cannot mark an order delivered without
the customer's code, and never receives that code in any response. Requests
that should be invisible return 404 rather than 403, so ids cannot be probed.

One test walks the whole promotion flow: a plain customer registers a store,
gets `meta.tokenRefreshRequired`, signs in again, and the new token reaches a
vendor-only route the old one could not.

*Security-rules* tests (`src/rules/`) are the only ones that exercise what a
**browser** can do. Every other test goes through the API, which uses the
Admin SDK and bypasses rules entirely — so a rule could be wide open and the
rest of the suite would still be green. A browser can no longer create an
order, claim a delivery, advance a status or confirm one; what a client may
still write directly is the customer's four review flags and the admin
console's operational reset, and these tests pin exactly that boundary.

They are split in two. One half asserts properties that hold. The other,
`documented holes`, asserts what the rules currently *allow and should not* —
those tests pass today and will fail the moment a rule is tightened, which is
deliberate: the failure is the signal to come back and flip the assertion,
rather than leaving a stale test that silently passes forever.

See **Known rules gaps** below for what they found.

The suite requires a JRE (the Firestore emulator is a Java process) and
nothing else; `firebase-tools` is a dev dependency, so a clean checkout can
run it. `npm run test:integration` starts both emulators, runs the tests, and
shuts them down. `npm run emulator` starts them to keep around.

Integration tests refuse to run unless `FIRESTORE_EMULATOR_HOST` and
`FIREBASE_AUTH_EMULATOR_HOST` are set, so the helpers that wipe the database
and the account list between tests can never point at a real project. When the
emulators are in use the Admin SDK is initialised without credentials at all,
which means no contributor or CI job needs a service-account key.

On Windows the Firestore emulator's JVM often survives the shutdown signal and
leaves port 8080 held, which made every second run fail with "port taken". A
pretest step clears ports 8080 and 9099 — but only after reading each
process's command line and confirming it really is a Firebase emulator;
anything else holding those ports is reported and left alone.

## Deploying

Two supported paths. Vercel needs no Firebase billing, which is why it is
first; Cloud Run is the better long-term fit but requires the Blaze plan.

### Vercel (no Firebase billing needed)

`api/index.ts` exports the Express app as a serverless function, and
`vercel.json` rewrites every path to it so the app's own router still owns the
URL space. `src/index.ts` — the one that calls `listen()` — is not used here.

```bash
cd server
npx vercel login
npx vercel link          # create or select the project
npx vercel --prod
```

Set these in the project's environment variables before the first deploy:

| Variable | Value |
|----------|-------|
| `FIREBASE_PROJECT_ID` | `kasieats-34391` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | the whole service-account key, as JSON |
| `PAYMENT_PROVIDER` | `sandbox` |
| `ALLOW_SANDBOX_PAYMENTS` | `true` |
| `CORS_ORIGINS` | the web app's origin |

Generate the key in the Firebase console under Project settings → Service
accounts → Generate new private key. It is a credential: paste it into
Vercel's encrypted environment variables, never into the repository.

Three things to know before choosing this:

- **Application Default Credentials do not exist off Google infrastructure**,
  which is why the service-account key is required here and not on Cloud Run.
- **Rate limiting becomes per-instance.** `express-rate-limit` keeps counters
  in memory, and each serverless instance has its own. The limits still blunt
  an attacker hammering a warm instance, but they are not a global budget.
  A shared store (Redis, Upstash) is the fix when that matters.
- **Vercel's Hobby tier is for non-commercial use.** A food-delivery platform
  taking real orders is commercial, so a live LokshinEats belongs on Pro.
  Hobby is fine for staging and for proving the deployment works.

Cold starts add latency to the first request after idle; for an app where the
customer is already waiting on a kitchen, that is unlikely to matter.

### Cloud Run

The better fit once billing is on: same Google project, so a service account
attached to the service supplies credentials with nothing to configure, no
key to manage, and a long-lived process where the in-memory rate limiter
behaves as designed.

**Cloud Run requires billing (the Blaze plan) on the project.** The free Spark
plan cannot run it — which is also why the Storage-backed photo uploads have
been inert since August.

`Dockerfile` is host-agnostic and also runs on Render, Fly or a plain VM.

```bash
# One-time: install the Google Cloud SDK, then
gcloud auth login
gcloud config set project kasieats-34391

gcloud run deploy lokshineats-api   --source server   --region europe-west1   --allow-unauthenticated   --set-env-vars FIREBASE_PROJECT_ID=kasieats-34391   --set-env-vars PAYMENT_PROVIDER=sandbox   --set-env-vars ALLOW_SANDBOX_PAYMENTS=true   --set-env-vars CORS_ORIGINS=https://kasieats-34391.web.app
```

`--allow-unauthenticated` refers to Cloud Run's own IAM layer, not to this
API: every route still requires a Firebase ID token. Without it, browsers
could not reach the service at all.

`ALLOW_SANDBOX_PAYMENTS=true` is required while the sandbox provider is the
one configured — the provider refuses to construct under `NODE_ENV=production`
otherwise, which is deliberate. Drop it the moment a live provider is wired,
so a misconfiguration cannot silently accept fake payments.

The service account Cloud Run runs as needs Firestore read/write and the
`roles/firebaseauth.admin` permission to verify tokens and set role claims.

### Order of operations

Deploying the API alone is safe — nothing points at it yet. The rest must
follow in this order, because each step depends on the previous one:

1. **API** (this service).
2. **Web app**, built with `NEXT_PUBLIC_API_BASE_URL` set to the deployed URL.
   `NEXT_PUBLIC_` values are inlined at build time, so this must be set for the
   build, not at runtime.
3. **Rules and indexes** — `firebase deploy --only firestore:rules,firestore:indexes`.
   Rules deny client order writes, which breaks ordering for anyone still on
   the old bundle, so this cannot go first. Missing indexes break the driver's
   available-orders query in production while passing every local test.
4. **Delivery-code migration** — `scripts/migrate-delivery-codes.mjs`, after
   the API is live, since it relies on the API's inline-code fallback.

### Verifying a deployment

```bash
curl https://<service-url>/api/v1/health          # {"status":"ok","version":"v1"}
curl https://<service-url>/api/v1/orders/mine     # 401 with the error contract
```

The startup log states the payment provider and whether it is live. Check for
`"live":false` — that is the sandbox, and it means no real money moves.

## Authentication

Clients sign in with Firebase Auth as they already do, then send the resulting
ID token:

```
Authorization: Bearer <firebase-id-token>
```

The token is verified against Google's public keys with revocation checking, so
a signed-out or disabled account stops working immediately rather than at the
token's natural expiry.

Roles (`customer`, `driver`, `vendor`, `admin`) live in a Firebase custom
claim, which travels inside the verified token and costs no database read.
Accounts predating claims fall back to their `users/{uid}` document once, and
the claim is backfilled. **After a role change a client must force-refresh its
ID token** before the new role takes effect; role-changing responses say so in
`meta.tokenRefreshRequired`.

## Response shape

Success:

```json
{ "data": { }, "nextCursor": null }
```

Failure — every error, including rate limiting and validation:

```json
{ "error": { "code": "validation_failed", "message": "Some fields are invalid.",
             "details": { "phone": "Enter a valid South African mobile number." },
             "requestId": "..." } }
```

Codes are stable strings (`bad_request`, `validation_failed`, `unauthenticated`,
`forbidden`, `not_found`, `conflict`, `unprocessable`, `rate_limited`,
`internal`) so clients can branch on them without parsing prose.

Lists are cursor-paginated. Pass `?limit=` and the `nextCursor` from the
previous page; `nextCursor: null` means the end. Firestore has no cheap offset,
and cursors stay constant-cost however deep a customer's order history goes.

## Endpoints

### Users

| Method | Path              | Access        | Purpose                          |
|--------|-------------------|---------------|----------------------------------|
| POST   | `/users/me`       | authenticated | Complete a profile after sign-up |
| GET    | `/users/me`       | authenticated | Read own profile                 |
| PATCH  | `/users/me`       | authenticated | Update own profile               |
| GET    | `/users`          | admin         | List users (`?role=`, paginated) |
| GET    | `/users/:id`      | admin         | Read any user                    |
| PATCH  | `/users/:id/role` | admin         | Assign a role                    |

Sign-up itself stays in Firebase Auth on the client; this module owns the
profile document and the role that authorises every other endpoint.

`role` is not accepted on the self-service profile endpoints — a customer who
could PATCH their own role to `admin` would own the platform. `POST /users/me`
allows only `customer` or `driver`: vendor accounts are promoted when their
store is approved, and admin is granted out of band.

### Stores

| Method | Path            | Access        | Purpose                        |
|--------|-----------------|---------------|--------------------------------|
| GET    | `/stores`       | public        | Browse (`?city=`, `?cuisine=`, `?openOnly=true`) |
| GET    | `/stores/:id`   | public        | Read one store                 |
| POST   | `/stores`       | authenticated | Register a store               |
| GET    | `/stores/mine`  | vendor        | The caller's own store         |
| PATCH  | `/stores/mine`  | vendor        | Update own store, open/close   |
| PATCH  | `/stores/:id`   | admin         | Edit any store                 |

Registering a store is what promotes an account to the vendor role, so
`POST /stores` cannot require that role first. The response sets
`meta.tokenRefreshRequired`.

`ownerId`, `rating`, and `reviewCount` are absent from every client-writable
schema: ownership comes from the verified token, and the two rating fields are
derived from reviews. Vendor writes resolve the caller's own store from their
uid, so no write route takes a store id that decides what gets modified.

### Products

| Method | Path             | Access       | Purpose                       |
|--------|------------------|--------------|-------------------------------|
| GET    | `/products`      | public       | Browse (`?storeId=`, `?category=`, `?availableOnly=true`) |
| GET    | `/products/:id`  | public       | Read one product              |
| GET    | `/products/mine` | vendor       | Own menu, including hidden items |
| POST   | `/products`      | vendor       | Add a menu item               |
| PATCH  | `/products/:id`  | vendor (own) | Edit a menu item              |
| DELETE | `/products/:id`  | vendor (own) | Remove a menu item            |

`storeId` is never accepted from a request — it comes from the caller's own
store. Writes to another vendor's product return 404 rather than 403, so an id
cannot be probed to learn whether it exists.

The product document is the authority on price. Once order pricing lands, an
order's cost is computed from these records rather than from anything the
client sends.

### Orders

| Method | Path                  | Access             | Purpose                    |
|--------|-----------------------|--------------------|----------------------------|
| POST   | `/orders`             | customer           | Place an order             |
| GET    | `/orders/mine`        | customer           | Own order history          |
| GET    | `/orders/store`       | vendor             | Orders for own store       |
| GET    | `/orders/assigned`    | driver             | Own deliveries             |
| GET    | `/orders/available`   | driver             | Unclaimed queue            |
| GET    | `/orders`             | admin              | Every order                |
| GET    | `/orders/:id`         | party to the order | Read one order             |
| PATCH  | `/orders/:id/status`  | party to the order | Advance the lifecycle      |
| POST   | `/orders/:id/accept`  | driver             | Claim an order             |
| POST   | `/orders/:id/release` | assigned driver    | Return it to the pool      |
| POST   | `/orders/:id/complete`| assigned driver    | Confirm with delivery code |
| POST   | `/orders/:id/cash-handover` | assigned driver | Record cash given to vendor |
| POST   | `/orders/:id/cash-receipt`  | owning vendor   | Confirm or dispute it       |

**The client no longer prices its own order.** `POST /orders` accepts a store
id, a list of product ids and quantities, an address, and a payment method —
nothing else. The schema is strict, so sending `total`, `subtotal`,
`vendorPayout`, `paymentStatus`, or `deliveryCode` is a validation error rather
than a silently ignored field. The server reads prices from the product
records, takes the delivery fee from the store, enforces the store's minimum,
computes the split, and asserts that every cent the customer pays lands in
exactly one bucket.

`paymentStatus` is always `pending` at creation, card orders included. Only the
payments module may change it.

**Lifecycle.** `pending -> preparing -> ready -> picked_up -> delivered`, with
cancellation allowed at defined points. The vendor dashboard's "Accept Order"
goes straight from `pending` to `preparing`; `confirmed` remains reachable
because orders already in the database use it and drivers can claim it. Who may make each
transition is a table in `order.model.ts` rather than scattered conditionals,
so it can be read in one place and is tested exhaustively. `delivered` is
unreachable through `PATCH /:id/status` by any role — it exists only behind
the delivery-code endpoint.

Access is by relationship, not role: the customer who placed it, the vendor
who owns the store, the assigned driver, or an admin. Everyone else gets 404
rather than 403, so order ids cannot be probed.

**Delivery codes.** Generated with a CSPRNG and returned only to the order's
own customer (and admins) — driver and vendor responses omit the field
entirely, including the legacy `deliveryOTP` key on older documents. The
driver submits a code they were never sent; the server compares it in constant
time inside a transaction that also increments a per-order attempt counter, so
parallel guesses cannot race past the limit of 5. A wrong code returns 422 with
`details.attemptsRemaining`.

The code is stored in plaintext rather than hashed, because the customer has
to re-read it at the door long after ordering, which a one-way hash cannot
serve. At-rest protection therefore rests on the collection being
Admin-SDK-only. The realistic attacker is the assigned driver, not someone who
has already breached the database.

**Concurrency.** Accepting an order and every status change run in a Firestore
transaction that re-reads the order first. Two drivers accepting at the same
moment both see `driverId === null`, but only one transaction commits; the
other is told the order is taken.

### Payments

| Method | Path                                  | Access   | Purpose            |
|--------|---------------------------------------|----------|--------------------|
| POST   | `/payments`                           | customer | Start a charge     |
| POST   | `/payments/:id/verify`                | customer | Settle if it worked|
| GET    | `/payments/mine`                      | customer | Own payments       |
| GET    | `/payments/:id`                       | customer | Read one payment   |
| GET    | `/payments`                           | admin    | All payments       |
| POST   | `/payments/:id/refund`                | admin    | Refund and reverse |
| POST   | `/payments/sandbox/:ref/complete`     | sandbox  | Resolve a test charge |

**An order becomes paid only because the provider said so.** `POST /payments`
takes an order id and nothing else — the amount comes from the order the
server priced. `POST /:id/verify` asks the provider, server to server, what
happened, and compares the amount actually captured against the order total.
A mismatch is refused and logged rather than settled, so a R1 charge cannot
close a R500 order.

Verification is idempotent: a client may poll it after returning from a
redirect, and a duplicate call settles nothing twice.

Providers are adapters behind a two-method interface (`initiate`, `verify`).
Adding Paystack or PayShap means writing one more adapter and registering it
in `payment.bootstrap.ts`; nothing above that line changes.

The **sandbox provider** implements the full path without moving real money,
so the rest of the system could be built before a merchant account exists. It
is deliberately not the old simulated service: a sandbox charge starts
`pending` and stays there until something explicitly resolves it, so no code
written against it can come to depend on payments always succeeding. It also
refuses to construct when `NODE_ENV=production` unless
`ALLOW_SANDBOX_PAYMENTS=true`, which means a misconfigured production deploy
fails at boot rather than quietly accepting fake money.

### Wallets

| Method | Path                        | Access | Purpose            |
|--------|-----------------------------|--------|--------------------|
| GET    | `/wallets/me`               | any    | Own balances       |
| GET    | `/wallets/me/transactions`  | any    | Own ledger         |
| GET    | `/wallets/:id`              | admin  | Any wallet         |
| GET    | `/wallets/:id/transactions` | admin  | Any ledger         |
| POST   | `/wallets/:id/credit`       | admin  | Refund, bonus, fix |

One wallet shape serves all three roles — a vendor's takings, a driver's
earnings, and a customer's refunds are the same ledger with different entry
types. There is no endpoint that lets anyone move their own balance.

Two records back a wallet: `wallets/{uid}` holds the running balances, and
`walletTransactions` is an append-only ledger. **The ledger is the source of
truth and the balance is a cache of it** — if they disagree, the balance can
be rebuilt by summing the ledger. Storing only a balance would make a wrong
number impossible to explain later.

Balances split into `pending` and `available` because money is earned before
it can be spent. A vendor's share lands in pending when the order is paid for,
and clears to available only once delivery is confirmed — paying out money
that might still be refunded is how a platform ends up chasing vendors.

Money moves at two moments:

- **Payment verified** — vendor share to pending, platform commission and
  delivery share to available.
- **Delivery confirmed** — driver earnings to available, vendor's pending
  balance released. Cash orders are settled here too, since that is the moment
  the money actually changes hands.

The platform's own earnings live in a wallet under a reserved `platform` id
rather than being inferred as whatever is left over, so a settlement either
balances or visibly does not.

Every credit is **idempotent by construction**: a ledger entry's document id
is derived from the order, wallet, and reason that caused it, so a retried
verification or a replayed webhook writes to the same id and changes nothing.
Refunds are written as new compensating entries, never by editing history.

**Claiming.** A driver may claim at `confirmed`, `preparing` or `ready`, so
they can head to the store while the food is still being made. Claiming a
`ready` order counts as collecting it and moves straight to `picked_up`.
Releasing is allowed only before collection — once the food is in the driver's
hands, unwinding it needs an admin.

**Cash settlement.** On a cash order the driver records handing the vendor
their money, and the vendor confirms or disputes it. The amount is computed
server-side from the order, never sent by the driver, because it is what they
owe.

All routes are versioned under `/api/v1`. Mobile apps stay installed on old
versions for months, so a breaking change will ship as `/api/v2` while v1 keeps
serving.

## Status

Built and tested: configuration, logging, Firebase Admin, error contract,
authentication, RBAC, validation, rate limiting, money maths, delivery codes,
and the users, stores, products, orders, payments, and wallets modules.
354 tests — 99 unit, 255 against the emulators (73 of those on the rules).

Not built yet: withdrawals, notifications, promotions, reports, reviews,
driver profiles and location. No live payment provider — sandbox only, by
design, so nothing blocks on merchant-account approval.

Settlement is covered end to end against a real database: pricing, payment
verification, wallet credits and their idempotency, delivery confirmation,
refunds, and the two concurrency cases. Every route is now also covered over
HTTP with real ID tokens, asserting who is turned away as well as who gets
through.

Gaps worth naming: no test exercises an expired or revoked token (the emulator
mints only fresh ones), and rate limiting is skipped under `NODE_ENV=test` so
its thresholds are unverified.

## Known rules gaps

`firebase/firestore.rules` now has tests, and they confirmed the following.
None of these are reachable through this API, which validates every one of
them — they are reachable from the **browser**, because the web app still
writes to Firestore directly. Each has a matching test in `src/rules/`.

One of them, admin self-escalation, has since been fixed; the rest are open.

**Good news first.** `wallets`, `walletTransactions`, `payments`, and
`sandboxPayments` appear nowhere in the rules, and `rules_version = '2'`
denies anything unmatched. No client — not even an admin — can read a wallet
balance or forge a payment record. That default is doing real work, and there
are tests pinning it so a future rule cannot open it by accident.

### Fixed: admin self-escalation

**Was:** `users` let a user write their own document with no field
restriction, and `isAdmin()` reads the role straight back out of that
document — so one write of `{ role: 'admin' }` granted admin for every other
rule, including deleting any order and reading every user profile.

**Now:** the `users` rule is split into create/update/delete and refuses to
write the `admin` value. Thirteen tests pin it, covering the smuggled-field
case, a full overwrite, and delete-then-recreate.

Two behaviours it deliberately preserves, each with its own test:

- Self-assigning `vendor` or `driver` still works. The web app's registration
  pages write those from the browser, and breaking them would have taken out
  vendor sign-up.
- An existing admin can still edit their own profile. The naive fix — a flat
  `role != 'admin'` check — locks every admin out of their own record, because
  the document still says `admin` after an unrelated edit. The rule instead
  allows a write whose role is *unchanged*, or whose new role is not admin.

Granting admin still works the way it always did: through the Firebase
console or the Admin SDK, both of which bypass rules.

> **Not live until deployed.** Firestore enforces only what is deployed:
> `firebase deploy --only firestore:rules`

### Fixed: clients can no longer create orders

**Was:** order creation checked only that `customerId` matched the caller, so a
browser could mint an order with any total, any payout figures, and
`paymentStatus: 'paid'`.

**Now:** `allow create: if false`. Orders come only from `POST /api/v1/orders`,
which prices them from the product records. No field restriction would have
made client creation safe — the prices have to come from the catalogue, which
a rule cannot read affordably.

This became possible because the web checkout moved onto the API; nothing in
the app calls `addDoc` on `orders` any more.

> **Deploy order matters.** This rule breaks ordering for anyone still running
> the old checkout bundle. Deploy the API first, then the web app built with
> `NEXT_PUBLIC_API_BASE_URL` pointing at it, and only then the rules.

### Fixed: the money fields really are frozen

**Was:** the update rule let the customer, the assigned driver, and the store
owner each write *any* field on an order — so a customer could rewrite `total`
and `paymentStatus` after checkout, and a driver could set
`deliveryOTPVerified` themselves and close a delivery that never happened.

**Now:** the vendor and driver order pages call the API, so those branches are
gone. The only client update permitted is the customer's four review flags
(`reviewed`, `ratingGiven`, `driverRated`, `driverRatingGiven`), plus the admin
console's operational reset. Claiming, releasing, advancing status, confirming
delivery and settling cash all go through endpoints that check the caller and
the transition.

### Fixed: drivers can no longer read delivery codes

**Was:** the code lived on the order document, and drivers must be able to read
their own and unclaimed orders for the live feeds. Rules cannot hide a field,
so a driver could see the code and submit it without meeting the customer.

**Now:** codes live in `orderSecrets/{orderId}`, which matches no security rule
and is therefore denied to every client — including the customer, and including
admins. The API reads it to verify a delivery, and attaches it to
`GET /orders/:id` for the order's own customer alone. The customer's order page
fetches it from there instead of from Firestore.

Orders placed before the split still carry the code inline, and the API falls
back to reading it there so historical deliveries stay closable. Those remain
visible to their driver until migrated:

```bash
FIREBASE_PROJECT_ID=<project> node scripts/migrate-delivery-codes.mjs          # dry run
FIREBASE_PROJECT_ID=<project> node scripts/migrate-delivery-codes.mjs --apply
```

It copies each inline code into `orderSecrets` and removes the inline fields.
Safe to re-run: an existing secret is never overwritten.

**A vendor can take another vendor's product.** The `products` rule checks the
*incoming* `storeId`, never the existing one, so rewriting `storeId` to a
store you own moves someone else's menu item into your store.

**A vendor cannot delete their own product.** Not a hole — the opposite.
`allow write` covers delete, but on a delete `request.resource` is null, so
evaluating `request.resource.data.storeId` errors and the rule denies
everyone. Menu deletion from the browser cannot work at all.

All three of the original holes are now closed on this side. What remains is
smaller: a vendor can still set their own store's rating, nobody can delete a
product, and the customer's review flow and the admin console still write to
`orders` directly — both deliberately allowed, and both narrowed to specific
fields.

**The three holes are closed on this side but not yet live.** The web app still
checks out directly against Firestore, so both paths currently exist. Closing
them for real needs two more things:

1. The web checkout moved onto `POST /api/v1/orders` and
   `POST /api/v1/payments`.
2. `firebase/firestore.rules` tightened in the same change to deny client
   writes to `orders`, `payments`, `wallets`, and `walletTransactions`, and to
   deny client reads of the delivery code. The Admin SDK bypasses rules, so
   this API keeps working when they do.

Until both land, the old exploitable path stays open alongside the new one.
