# Deploying LokshinEats

This covers the first production launch of the REST API, the web app and the
Firestore rules and indexes. At launch the platform is **cash on delivery
only**. The Firebase project is `kasieats-34391`. Never rename it: every
account, token and document belongs to it.

Everything below that needs a login is yours to run: Vercel, the Firebase
CLI and the Firebase console. The service-account key never goes into git, a
chat or a ticket.

## The order, and why

| # | Step | Why here |
|---|------|----------|
| 1 | Firestore **indexes** | Additive, takes minutes to build, and the API's lists fail without them. |
| 2 | **API** on Vercel | Nothing else works without it. Harmless while nothing calls it. |
| 3 | **Web app** on Vercel | Switches customers onto the API. |
| 4 | Firestore **rules** | The new rules shut the old web app out of direct writes. They must go live *after* step 3, or the site that is live today breaks. |
| 5 | **Delivery-code migration** | Moves old orders' codes out of reach of drivers. |
| 6 | **First admin** | A fresh deployment has none. |

> **Warning — merging to `master` deploys the web app.** If the web
> project on Vercel builds from `master`, merging `feat/rest-api` is step 3,
> whenever you do it. Do not merge until steps 1–2 are done and checked.

---

## 0. Before you start

- Get a service-account key: Firebase console → Project settings → Service
  accounts → *Generate new private key*. Keep the downloaded `.json` file
  somewhere outside the repository.
- Install and log in to the Firebase CLI yourself (`firebase login`).
- Optional, needs the Blaze plan: take a backup first with
  `gcloud firestore export gs://<bucket>/pre-launch`.

## 1. Firestore indexes

From the repository root:

```bash
firebase deploy --only firestore:indexes --project kasieats-34391
```

If it asks whether to delete indexes that are in the project but not in the
file, answer **No**. Then wait until every index shows **Enabled** under
Firebase console → Firestore → Indexes. Until then, the API returns errors
for the affected lists.

`server/src/config/deploy.test.ts` lists every query shape the API issues.
The emulator never enforces indexes, so that test is the only thing that
catches a missing one.

## 2. The API (new Vercel project)

Create a **new** project from the same GitHub repository:

- **Root Directory:** `server`
- **Framework Preset:** Other. `server/vercel.json` already routes every
  path to `api/index.ts`.
- **Production Branch** (Settings → Git): `feat/rest-api` until it is
  merged, then `master`. `server/` does not exist on `master` yet.

Environment variables (Production):

| Name | Value |
|------|-------|
| `FIREBASE_PROJECT_ID` | `kasieats-34391` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | The *whole contents* of the key file. Mark it **Sensitive**. |
| `PAYMENT_PROVIDER` | `none`. Cash only; card and EFT orders are refused. |
| `CORS_ORIGINS` | The web app's origin(s), comma-separated, no trailing slash. For example `https://lokshineats.vercel.app,https://www.lokshineats.co.za` |
| `PUSH_PROVIDER` | `off` for launch. The in-app inbox still works. |

**Do not set `NODE_ENV`.** Vercel runs functions in production mode by
itself. If you set it during the build as well, the install skips
devDependencies, including TypeScript, and the build fails.

`CORS_ORIGINS` needs the web app's address, which you may not know until
step 3. Put in the address you expect. You can change it later: edit the
variable, then **Redeploy** the API, because variables are read at start-up.

The API refuses to start in production with an empty `CORS_ORIGINS`, or with
no credentials. Look in the deployment's logs for
`Invalid production configuration` and the reason.

### Check it

With `API` set to the project's URL:

```bash
curl -s $API/health
```

```bash
curl -s $API/api/v1/config
```

The first returns 200. The second must return
`{"data":{"paymentMethods":["cash"]}}`. If it lists `yoco` or `ozow`,
`PAYMENT_PROVIDER` is not `none`. Stop and fix that before going further.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: https://not-us.example" $API/health
```

That must print `403`. In the Vercel logs, the API's log lines must show
`"env":"production"`.

## 3. The web app

In the existing web project (Root Directory: the repository root), set these
Production environment variables:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_API_BASE_URL` | The API's URL from step 2, for example `https://lokshineats-api.vercel.app` |
| `NEXT_PUBLIC_USE_FIREBASE_EMULATORS` | Unset, or `false` |

`NEXT_PUBLIC_*` values are baked in at build time. Changing one does nothing
until the web app is **rebuilt**.

**Preview first (recommended).** Vercel builds a preview of `feat/rest-api`
at a fixed branch address, like
`https://<project>-git-feat-rest-api-<team>.vercel.app`. Add that address to
the API's `CORS_ORIGINS` and redeploy the API. Then walk through the checks
below on the preview. When it works, merge `feat/rest-api` into `master` to
go live, and switch the API project's Production Branch to `master`.

In Firebase console → Authentication → Settings → **Authorized domains**,
add the web app's domain(s), so that password-reset links return to the
site.

### Check it, on the real site

1. Sign up as a new customer, then sign out and back in.
2. Browse restaurants, filter by city and cuisine, and open a menu. Each
   filter combination has its own index.
3. At checkout, **only Cash on delivery** is offered. Place the order.
4. `/orders` shows it, and its page opens.

## 4. Firestore rules

Only once step 3 is live:

```bash
firebase deploy --only firestore:rules --project kasieats-34391
```

Then place one more cash order on the live site, to prove the web app works
under the new rules.

## 5. Delivery-code migration

Older orders keep their delivery code on the order document, which the
driver can read. From `server/`, dry run first:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json FIREBASE_PROJECT_ID=kasieats-34391 node scripts/migrate-delivery-codes.mjs
```

Read the summary. If it looks right, run the same command with `--apply` on
the end. It is safe to re-run. The API reads codes from either place, so
nothing breaks before or after.

## 6. The first admin

Only an admin can make someone an admin, so the first one has to come from a
script. Changing `role` in the Firebase console does not work: the API trusts
the role in the sign-in token, and sign-up already set that to customer.

1. Sign up on the live site with the admin's email, as a normal customer.
2. From `server/`, do a dry run:

   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json FIREBASE_PROJECT_ID=kasieats-34391 node scripts/grant-admin.mjs admin@example.com
   ```

3. Run the same command with `--apply` on the end. The account is signed out
   everywhere. When it signs in again, `/admin` opens.

After that, make every other admin, vendor or driver from the People page.

## The Flutter apps

The apps take the API's address at build time:

```bash
flutter build apk --release --dart-define=API_BASE_URL=https://lokshineats-api.vercel.app
```

A release build without `API_BASE_URL`, or one built with
`USE_FIREBASE_EMULATORS=true`, stops at startup with the reason. That is
better than shipping an app that quietly calls `localhost`. Never pass
`LOCAL_RELEASE_BUILD=true` to a build that ships: it turns this check off,
and exists only for testing release web builds on your own machine. The
phones are not browsers, so CORS does not apply to them.

Before the first driver-app release, give it its own Firebase registration:
run `flutterfire configure --project=kasieats-34391` from `apps/driver`.
Until then it borrows the customer app's.

## Rolling back

- **API:** Vercel → the API project → Deployments → an earlier deployment →
  *Instant Rollback*. On the very first launch there is nothing to roll back
  to, and nothing depends on the API until step 3.
- **Web app:** *Instant Rollback* to the last deployment from before the
  launch. If the rules (step 4) are already live, roll them back as well, or
  the old site cannot write: Firebase console → Firestore → Rules → pick the
  earlier version → *Publish*.
- **Indexes** are additive; leave them.
- **The migration** has no undo and needs none: the API reads codes from both
  places.

## Known limits at launch

- **Cash only.** Card and EFT stay off until a live provider is connected.
  That is a code change plus `PAYMENT_PROVIDER`, not a setting on its own.
- **Push notifications are off.** The notification inbox works. Turning on
  `PUSH_PROVIDER=fcm` also needs `FCM_VAPID_KEY` in the app builds.
- **Rate limits are per server instance.** Vercel can run several instances,
  so the real limit is a multiple of `RATE_LIMIT_MAX`. It is enough to stop
  one runaway client, but it is not a hard ceiling.
