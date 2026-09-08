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

All routes are versioned under `/api/v1`. Mobile apps stay installed on old
versions for months, so a breaking change will ship as `/api/v2` while v1 keeps
serving.

## Status

Built and tested: configuration, logging, Firebase Admin, error contract,
authentication, RBAC, validation, rate limiting, money maths, delivery OTP,
and the users module.

Not built yet: stores, products, orders, payments, wallets, notifications,
promotions, reports. Until orders and payments land here, the web client's
direct-to-Firestore checkout remains the live path, with the three holes above
still open.
