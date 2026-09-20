# lokshineats_core

What every LokshinEats app needs and none of them should own a private copy of:

- `network/` — the API client and the typed errors it throws.
- `auth/` — Firebase sign-in, the API profile behind it, and the form fields
  and providers that drive both.
- `theme/` — the shared Material 3 theme and the status colours.
- `config/` — build-time configuration (`--dart-define`).
- `firebase/` — start-up, including pointing at the emulators.
- `widgets/`, `utils/` — loading and error states, money formatting.

App-specific screens stay in the app. The rule of thumb: if the customer,
driver and vendor apps would all write the same code, it belongs here — an API
client that drifts between apps is how one of them starts sending the wrong
thing.

Each app declares which role it signs people up as, by overriding
`signUpRoleProvider` in its `ProviderScope`.
