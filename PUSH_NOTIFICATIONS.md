# Push notifications

Every notification is **stored first** and pushed second. The in-app inbox
works whether or not push is configured, which is why the system has run
without push all along — a phone that never buzzes still shows the same list
of what happened.

**Push is off in production and stays off until it is deliberately switched
on.** `PUSH_PROVIDER` defaults to `off`, and the deployment sets it to `off`
explicitly. Nothing in this document changes that.

## Who is told what

| Moment | Customer | Kitchen | Drivers |
|---|---|---|---|
| Order placed | — | **New order** | — |
| Kitchen accepts | Making your order | — | **Delivery available** |
| A driver claims it | — | **A driver is coming** | the rest: **Delivery taken** |
| Food collected | On the way | **Order collected** | — |
| Delivered | Delivered | **Delivered**, with the payout released | — |
| Cancelled | Cancelled, with what it cost | — | — |

Rules that hold throughout:

- **A notification never carries the delivery code.** Pushes land on lock
  screens, and the code is the customer's proof the food reached them.
- **One moment, one notification per person.** They are keyed to the person,
  the order and the moment, so a retried request does not buzz anyone twice.
- **An order already spoken for gets a private offer** to its own driver
  rather than a broadcast, so drivers are not invited to race for work that
  is not on offer.
- **Nothing here can fail an order.** A kitchen accepting, a driver
  delivering: those happened whether or not a phone heard about it. Errors
  are logged, never thrown back into the order flow.

## Which device gets it

A device is registered against **the account it is signed in as** — taken
from the verified token, never from the request body — and **the app it is
running**. One person can order dinner as a customer and drive deliveries on
the same phone; each install has its own token, and the app field is what
keeps a delivery offer out of the app they order with.

Installs that registered before the app field existed have no app recorded
and are sent everything their account is entitled to, so an older install
goes quiet for nobody.

No endpoint hands a device token back to any client, including its owner.

## What happens when a push arrives

| App state | Android | iOS | Web |
|---|---|---|---|
| **Foreground** | handled in-app: the driver app shows it at the bottom of the screen; the kitchen app refreshes its queue instead, because a banner over the queue it is already watching is noise | same, but iOS shows no system banner while the app is open | same; the service worker does not show its own banner for a foreground message |
| **Background** | system notification; tapping it opens the app through `onMessageOpenedApp` | same | the service worker shows it; a click opens the app at `/?order=<id>`, because the browser has no "initial message" to hand over |
| **Terminated** | system notification; tapping launches the app and the push is read from `getInitialMessage()` | same, **once APNs is configured** | the service worker shows it if the browser is running |

### Platform limitations worth knowing

- **iOS needs APNs set up for the Firebase project.** Until it is, asking for
  a token fails. That failure is caught and logged, and the in-app inbox is
  unaffected — so an iOS build is usable but silent.
- **Web needs a VAPID key**, passed at build time as
  `--dart-define=FCM_VAPID_KEY=...`. Without one the app does not ask for
  notification permission at all, which is deliberate: asking for permission
  you cannot use trains people to say no.
- **Android 13 and later** require the notification permission at runtime.
  Refusing it is survivable; nothing else stops working.
- **A terminated app on either platform cannot run code** until the person
  taps the notification. Anything that must happen without a tap has to
  happen on the server.
- **The web service worker pins Firebase JS SDK 12.18.0** to match
  `firebase_core_web`'s supported version. Update the two together, or
  messaging stops working on the web.

## Switching it on (not done)

1. Set `PUSH_PROVIDER=fcm` on the API project and redeploy, so the setting is
   read at start-up.
2. For the web app only, add `FCM_VAPID_KEY` to the app builds — Firebase
   console → Project settings → Cloud Messaging → Web Push certificates.
3. For iOS, upload an APNs key in the same place.

Android needs neither of the last two: the service-account credentials the
API already has are enough.

## Seeing a notification with push off

Every app has the same inbox - the bell in the top bar, and a list behind it.
That is what makes the system usable before push is switched on, and it is
the only way a kitchen or a driver can see any of this today. Until the inbox
moved into the shared package, those two apps had no way to show a
notification at all.

Tapping one is the app's own business: the customer app opens the order,
because that is the screen with the delivery code on it; the kitchen and
driver apps mark it read and leave you where you are, because their queue and
board are already the screens the work lives on.

## Testing it on a phone

With push still off, the inbox proves the whole chain:

1. Install the three APKs and sign in — customer on one device, kitchen and
   driver on another, or sign in and out on one.
2. Place an order from the customer app.
3. The kitchen's inbox should show **New order**; the customer's should not.
4. Accept it in the kitchen app; every driver's inbox should show **Delivery
   available**, and the customer's **Making your order**.
5. Claim it from one driver account. The other drivers should show **Delivery
   taken**; the kitchen, **A driver is coming**.

Once push is switched on, the same five steps should also buzz the phones,
and the table above says what to expect in each app state.
