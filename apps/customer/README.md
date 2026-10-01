# LokshinEats — customer app

Flutter app for customers: browse township kitchens, order, pay, track the
delivery. Talks to the LokshinEats REST API in `../../server`.

**There is no mock data anywhere in this app.** Every screen shows what the
API returns, so an empty database looks empty rather than looking populated.

## Running it

The API must be running first — see `../../server/README.md`, and the "Local
stack" notes for bringing up the emulators with seed data.

```bash
flutter run --dart-define=API_BASE_URL=http://localhost:4000
```

On an Android emulator the host machine is `10.0.2.2`, not `localhost`:

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000
```

For web, the API's `CORS_ORIGINS` must include the origin Flutter serves from.

```bash
flutter analyze
flutter test
flutter build web --release --dart-define=API_BASE_URL=https://your-api-host
```

`API_BASE_URL` is read at build time, so a release binary is pinned to the
environment it was compiled against. A release build still pointing at
localhost throws at startup rather than looking like a network outage to every
customer.

## Layout

Feature-first, so everything one screen needs sits together rather than being
scattered across four top-level folders by technical role:

```
lib/
  core/
    config/    build-time configuration
    network/   API client and the error contract
    theme/     Material 3 light and dark
    utils/     formatting
  features/
    stores/
      models/        API shapes
      repositories/  the only layer that knows the API exists
      providers/     dependency wiring and async state
      pages/         screens
      widgets/       parts of those screens
  shared/widgets/    loading, error and empty states
```

## State management

Riverpod, doing two jobs: dependency injection — the HTTP client and each
repository are constructed once and read by whatever needs them — and async
state, where `AsyncValue` forces every screen to handle loading, error and
data rather than quietly forgetting one.

The choice between Riverpod and BLoC was open; Riverpod won on less
boilerplate for the same guarantees, and because its provider overrides make
widget tests trivial to set up with a fake repository.

## Talking to the API

`ApiClient` carries requests, unwraps the `{ data }` envelope, and turns
failures into `ApiException` with the API's stable error `code`. Messages come
from the server, which writes them for customers, so the app shows them rather
than inventing vaguer wording.

Authentication uses Firebase Auth: `ApiClient.tokenProvider` returns the
current ID token, refreshed automatically, and the API verifies it with the
Admin SDK. There is no second session to keep in step.

Browsing stays public, so the app is usable signed-out; an account is needed
to order. Two facts are tracked separately, because they can disagree: whether
there is a Firebase session, and whether the API has a profile for it. A
sign-up interrupted between the two leaves an account with no profile, which
the account screen offers to finish rather than treating as an error.

Nothing the app sends ever includes a price. Ordering will carry product ids
and quantities, and the server prices it from its own records — so a stale
price on screen becomes a corrected total, never an underpayment.

## Design

The palette continues the brand the web app already uses rather than inventing
a second identity for the same product: LokshinEats orange, with clay, maize
and a warm charcoal around it, and warm neutrals throughout because a food app
rendered in cool grey makes the food look worse.

Both light and dark are built from one seed so they stay recognisably the same
product, with the brand colour pinned so the seed algorithm cannot drift it.
`themeMode` follows the device.

Amounts use the `en_ZA` locale, so decimals render the South African way —
`R89,99`. Whole amounts drop the decimals entirely (`R20 delivery`).

## Running against the emulators

```bash
flutter run \
  --dart-define=API_BASE_URL=http://localhost:4000 \
  --dart-define=USE_FIREBASE_EMULATORS=true
```

The API must be pointed at the same emulators, or the tokens minted here will
not verify against the live project it checks them with. Firebase shows a
banner in the app when the emulator is in use.

`flutterfire configure` reused the Android, iOS and web apps already
registered in the project — it created nothing new. It wrote
`android/app/google-services.json` but no iOS plist, since it only emits that
on macOS; iOS reads its configuration from `lib/firebase_options.dart`, which
does carry the iOS app id. Neither file is a secret: both ship inside every
build, exactly like the web config the Next.js app already commits.

Restarting the Auth emulator invalidates any session the app is holding, and
the API then rejects its token as invalid — clear the browser's site data (or
reinstall the app) rather than hunting for a bug.

## What works

Browsing kitchens and reading a menu against the real API: search, an open-now
filter, pull to refresh, per-category menu grouping, and loading, error and
empty states on every screen.

Accounts: sign up, sign in, password reset, sign out, and the profile the API
authorises against. `role` is never sent — the API assigns it, and rejects any
attempt to choose one.

Nineteen tests cover the wiring with a fake repository, plus the form
validators and the error mapping, since a validator that rejects a valid SA
mobile number or a banner that leaks `wrong-password` at a customer are both
silent until they happen to someone.

Not built yet: cart, checkout, payment, order tracking, wallet, notifications,
reviews. The "add to cart" button says so rather than pretending to work.
