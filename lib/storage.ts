import {
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { PreArrivalAlert } from '../types';

const ALERTS_COLLECTION = 'medlinkAlerts';
const ALERTS_KEY = 'medlink_alerts';

// ── Firestore helpers ────────────────────────────────────────

/**
 * Write a new alert to Firestore.
 * Called by the medic on transmit.
 */
export async function createAlertInFirestore(alert: PreArrivalAlert): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, ALERTS_COLLECTION), {
      ...alert,
      transmittedAt: Date.now(),
    });
    return docRef.id;
  } catch (err) {
    console.warn('Firestore createAlert failed, falling back to localStorage', err);
    // Fallback: save to localStorage
    const existing = loadAlerts();
    saveAlerts([alert, ...existing]);
    return alert.id;
  }
}

/**
 * Update an existing alert in Firestore.
 */
export async function updateAlertInFirestore(alertId: string, updates: Partial<PreArrivalAlert>): Promise<void> {
  try {
    const docRef = doc(db, ALERTS_COLLECTION, alertId);
    await updateDoc(docRef, updates as any);
  } catch (err) {
    console.warn('Firestore updateAlert failed', err);
  }
}

/**
 * Subscribe to alerts filtered for a medic (by medicId).
 * Feature 6, instruction D: role-split subscriptions.
 */
export function subscribeToMedicAlerts(
  medicId: string,
  onUpdate: (alerts: PreArrivalAlert[]) => void
): Unsubscribe {
  try {
    const q = query(
      collection(db, ALERTS_COLLECTION),
      where('medicId', '==', medicId),
      orderBy('transmittedAt', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
      const alerts: PreArrivalAlert[] = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
      } as PreArrivalAlert));
      onUpdate(alerts);
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
 * Feature 6, instruction D: role-split subscriptions.
 */
export function subscribeToHospitalAlerts(
  onUpdate: (alerts: PreArrivalAlert[]) => void
): Unsubscribe {
  try {
    const q = query(
      collection(db, ALERTS_COLLECTION),
      orderBy('transmittedAt', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
      const alerts: PreArrivalAlert[] = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
      } as PreArrivalAlert));
      onUpdate(alerts);
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
