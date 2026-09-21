/**
 * Make an existing account an admin - the way to create the first one.
 *
 * Inside the API, only an admin can change a role, so a fresh deployment has
 * no way to get its first admin. Editing `role` on the user's document in the
 * Firebase console is not enough either: sign-up already put a "customer"
 * claim in the account's token, and the API trusts the claim over the
 * document. This sets both, then signs the account out everywhere so its next
 * sign-in carries the admin claim.
 *
 * The person signs up in the web app first, as a normal customer; this only
 * promotes an account that already exists.
 *
 * Dry run by default - it prints who it would promote and changes nothing.
 * Pass --apply to actually write.
 *
 *   node scripts/grant-admin.mjs someone@example.com            # dry run
 *   node scripts/grant-admin.mjs someone@example.com --apply    # for real
 *
 * Credentials and project as for migrate-delivery-codes.mjs: set
 * FIREBASE_PROJECT_ID, and GOOGLE_APPLICATION_CREDENTIALS or
 * FIREBASE_SERVICE_ACCOUNT_JSON (or the emulator hosts, locally).
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const apply = process.argv.includes('--apply');
const email = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const projectId = process.env.FIREBASE_PROJECT_ID;

if (!email) {
  console.error('Usage: node scripts/grant-admin.mjs <email> [--apply]');
  process.exit(1);
}
if (!projectId) {
  console.error('Set FIREBASE_PROJECT_ID to the project to change.');
  process.exit(1);
}

const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const inlineKey = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

const app = initializeApp(
  usingEmulator
    ? { projectId }
    : {
        projectId,
        credential: inlineKey
          ? cert(JSON.parse(inlineKey))
          : applicationDefault(),
      },
);
const auth = getAuth(app);
const db = getFirestore(app);

let user;
try {
  user = await auth.getUserByEmail(email);
} catch (error) {
  if (error.code === 'auth/user-not-found') {
    console.error(
      `No account for ${email} in ${projectId}. Sign up in the web app first.`,
    );
    process.exit(1);
  }
  throw error;
}

const profileRef = db.collection('users').doc(user.uid);
const profile = await profileRef.get();

console.log(`Project:        ${projectId}${usingEmulator ? ' (emulator)' : ''}`);
console.log(`Account:        ${email} (${user.uid})`);
console.log(`Profile role:   ${profile.exists ? profile.get('role') : 'no profile yet'}`);
console.log(`Token claim:    ${user.customClaims?.role ?? 'none'}`);

if (!apply) {
  console.log('\nDry run - nothing was written. Re-run with --apply to promote.');
  process.exit(0);
}

// Claim first: it is what the API checks. Should the document write then
// fail, re-running is safe and finishes the job.
await auth.setCustomUserClaims(user.uid, {
  ...(user.customClaims ?? {}),
  role: 'admin',
});

// createdAt is set only for a profile that does not exist yet: the People
// page orders by it, and a user without it is left out of the list.
await profileRef.set(
  {
    role: 'admin',
    email,
    updatedAt: FieldValue.serverTimestamp(),
    ...(profile.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  },
  { merge: true },
);

// The token they hold now still says their old role.
await auth.revokeRefreshTokens(user.uid);

console.log(`\n${email} is now an admin. They must sign in again to use it.`);
