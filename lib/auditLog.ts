/**
 * Non-PHI Audit Log
 * 
 * Writes audit events to a separate `auditLogs` Firestore collection.
 * Never stores actual patient data — only action metadata.
 * Logs are kept for 30 days (enforced by a separate Cloud Function or manual cleanup).
 */
import { collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';

export type AuditAction =
  | 'alert_created'
  | 'alert_viewed'
  | 'status_updated'
  | 'alert_acknowledged'
  | 'bed_assigned'
  | 'vitals_updated';

export interface AuditLogEntry {
  userId: string;
  action: AuditAction;
  alertId: string;
  timestamp: number; // epoch ms
  role: 'medic' | 'hospital' | 'system';
  metadata?: Record<string, string>; // optional non-PHI context (e.g. { newStatus: 'Arrived' })
}

/**
 * Write an audit event to Firestore.
 * Fails silently — audit logging should never block the main workflow.
 */
export async function logAuditEvent(
  userId: string,
  action: AuditAction,
  alertId: string,
  role: 'medic' | 'hospital' | 'system',
  metadata?: Record<string, string>
): Promise<void> {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      userId,
      action,
      alertId,
      timestamp: Date.now(),
      role,
      ...(metadata ? { metadata } : {}),
    });
  } catch (err) {
    // Audit logging should never throw or block UI
    console.warn('Audit log write failed:', err);
  }
}
