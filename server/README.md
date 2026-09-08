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
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run build       # emit dist/
npm start           # run the build
```

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
| POST   | `/orders/:id/complete`| assigned driver    | Confirm with delivery code |

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

**Lifecycle.** `pending -> confirmed -> preparing -> ready -> picked_up ->
delivered`, with cancellation allowed at defined points. Who may make each
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

All routes are versioned under `/api/v1`. Mobile apps stay installed on old
versions for months, so a breaking change will ship as `/api/v2` while v1 keeps
serving.

## Status

Built and tested: configuration, logging, Firebase Admin, error contract,
authentication, RBAC, validation, rate limiting, money maths, delivery codes,
and the users, stores, products, and orders modules. 69 tests.

Not built yet: payments, wallets, notifications, promotions, reports.

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
