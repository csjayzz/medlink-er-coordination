import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

admin.initializeApp();
const firestore = admin.firestore();

/**
 * Feature 5: Set custom role claim on a user.
 * Called after user creation to assign 'medic' or 'hospital' role.
 * Only admins should call this — in production, add admin-check logic.
 */
export const setUserRole = onCall(async (request) => {
  const { uid, role } = request.data as { uid: string; role: 'medic' | 'hospital' };

  if (!uid || !role) {
    throw new HttpsError('invalid-argument', 'uid and role are required');
  }
  if (!['medic', 'hospital'].includes(role)) {
    throw new HttpsError('invalid-argument', 'role must be "medic" or "hospital"');
  }

  // TODO: Add admin verification before production
  // e.g. check request.auth?.token?.admin === true

  await admin.auth().setCustomUserClaims(uid, { role });
  return { success: true, uid, role };
});

/**
 * Feature 9: TTL Cloud Function — delete alerts older than 24 hours.
 * Runs every hour. Deletes medlinkAlerts docs where transmittedAt is > 24h ago.
 */
export const cleanupExpiredAlerts = onSchedule('every 60 minutes', async () => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
  const snapshot = await firestore
    .collection('medlinkAlerts')
    .where('transmittedAt', '<', cutoff)
    .get();

  if (snapshot.empty) {
    console.log('No expired alerts to clean up.');
    return;
  }

  const batch = firestore.batch();
  let count = 0;
  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
    count++;
    // Firestore batch limit is 500
    if (count % 500 === 0) {
      await batch.commit();
    }
  }
  if (count % 500 !== 0) {
    await batch.commit();
  }
  console.log(`Deleted ${count} expired alert(s).`);
});
