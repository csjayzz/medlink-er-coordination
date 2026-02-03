import type { PreArrivalAlert } from '../types';

const ALERTS_KEY = 'medlink_alerts';
const AUTH_KEY = 'medlink_auth';

export interface StoredAuth {
  role: 'MEDIC' | 'HOSPITAL';
  medicId?: string;
  medicName?: string;
  unit?: string;
  certification?: string;
}

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

export function loadAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

export function saveAuth(auth: StoredAuth | null): void {
  try {
    if (auth) localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    else localStorage.removeItem(AUTH_KEY);
  } catch (e) {
    console.warn('Failed to persist auth', e);
  }
}
