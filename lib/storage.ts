import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { encryptAlertPHI, decryptAlertPHI, exportSessionKey, importKey } from './crypto';
import type { PreArrivalAlert } from '../types';

const ALERTS_COLLECTION = 'medlinkAlerts';
const ALERTS_KEY = 'medlink_alerts';

// ── Firestore helpers ────────────────────────────────────────

/**
 * Write a new alert to Firestore — encrypts PHI fields before write.
 * Called by the medic on transmit.
 */
export async function createAlertInFirestore(alert: PreArrivalAlert): Promise<string> {
  try {
    const transmittedAt = alert.transmittedAt ?? Date.now();
    const encrypted = await encryptAlertPHI({ ...alert, transmittedAt });
    // Store the session encryption key alongside the alert so the hospital
    // (a different browser/session) can decrypt the PHI fields.
    // NOTE: In production this key would be exchanged via Cloud KMS or a
    //       server-side key-management endpoint — not stored in the document.
    const keyB64 = await exportSessionKey();
    encrypted._encryptionKey = keyB64;
    await setDoc(doc(db, ALERTS_COLLECTION, alert.id), encrypted);
    return alert.id;
  } catch (err) {
    console.warn('Firestore createAlert failed, falling back to localStorage', err);
    // Fallback: save to localStorage (unencrypted — local only, no network exposure)
    const existing = loadAlerts();
    saveAlerts([alert, ...existing]);
    return alert.id;
  }
}

/**
 * Update an existing alert in Firestore.
 * Re-encrypts any PHI fields in the update payload.
 */
export async function updateAlertInFirestore(alertId: string, updates: Partial<PreArrivalAlert>): Promise<void> {
  try {
    // Only encrypt if the update contains PHI fields
    const phiFields = ['patientName', 'patientAge', 'notes', 'treatments', 'allergies', 'vitals'];
    const hasPHI = Object.keys(updates).some(k => phiFields.includes(k));
    const payload = hasPHI ? await encryptAlertPHI(updates as Record<string, any>) : updates;
    if (hasPHI) {
      // Attach the current session key so the hospital can decrypt updated fields
      (payload as any)._encryptionKey = await exportSessionKey();
    }
    const docRef = doc(db, ALERTS_COLLECTION, alertId);
    await updateDoc(docRef, payload as any);
  } catch (err) {
    console.warn('Firestore updateAlert failed', err);
  }
}

/**
 * Subscribe to alerts filtered for a medic (by medicId).
 * Decrypts PHI fields after reading from Firestore.
 */
export function subscribeToMedicAlerts(
  medicId: string,
  onUpdate: (alerts: PreArrivalAlert[]) => void
): Unsubscribe {
  try {
    const q = query(
      collection(db, ALERTS_COLLECTION),
      where('medicId', '==', medicId)
    );
    return onSnapshot(q, async (snapshot) => {
      const rawDocs = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
      }));
      // Decrypt all PHI fields using the stored encryption key
      const alerts = await Promise.all(
        rawDocs.map(async (d) => {
          try {
            const raw = d as Record<string, any>;
            const key = raw._encryptionKey ? await importKey(raw._encryptionKey as string) : undefined;
            const decrypted = await decryptAlertPHI(raw, key);
            delete (decrypted as any)._encryptionKey; // don't leak key to UI
            return decrypted;
          } catch {
            return d as any;
          }
        })
      );
      const sortedAlerts = (alerts as PreArrivalAlert[]).sort(
        (a, b) => (b.transmittedAt ?? 0) - (a.transmittedAt ?? 0)
      );
      onUpdate(sortedAlerts);
    }, (err) => {
      console.warn('Firestore medic subscription error, using localStorage fallback', err);
      onUpdate(loadAlerts().filter(a => a.medicId === medicId));
    });
  } catch (err) {
    console.warn('Firestore subscription setup failed, using localStorage', err);
    onUpdate(loadAlerts().filter(a => a.medicId === medicId));
    return () => {}; // no-op unsubscribe
  }
}

/**
 * Subscribe to ALL alerts for hospital dashboard.
 * Decrypts PHI fields after reading from Firestore.
 */
export function subscribeToHospitalAlerts(
  onUpdate: (alerts: PreArrivalAlert[]) => void
): Unsubscribe {
  try {
    const q = query(
      collection(db, ALERTS_COLLECTION),
      orderBy('transmittedAt', 'desc')
    );
    return onSnapshot(q, async (snapshot) => {
      const rawDocs = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
      }));
      // Decrypt all PHI fields using the key the medic stored in the document
      const alerts = await Promise.all(
        rawDocs.map(async (d) => {
          try {
            const raw = d as Record<string, any>;
            const key = raw._encryptionKey ? await importKey(raw._encryptionKey as string) : undefined;
            const decrypted = await decryptAlertPHI(raw, key);
            delete (decrypted as any)._encryptionKey; // don't leak key to UI
            return decrypted;
          } catch {
            return d as any;
          }
        })
      );
      onUpdate(alerts as PreArrivalAlert[]);
    }, (err) => {
      console.warn('Firestore hospital subscription error, using localStorage fallback', err);
      onUpdate(loadAlerts());
    });
  } catch (err) {
    console.warn('Firestore subscription setup failed, using localStorage', err);
    onUpdate(loadAlerts());
    return () => {};
  }
}

// ── localStorage fallback (kept for offline / demo mode) ─────

export function loadAlerts(): PreArrivalAlert[] {
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PreArrivalAlert[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAlerts(alerts: PreArrivalAlert[]): void {
  try {
    localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
  } catch (e) {
    console.warn('Failed to persist alerts', e);
  }
}
