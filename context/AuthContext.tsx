import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  User,
} from 'firebase/auth';
import { auth as firebaseAuth } from '../lib/firebase';
import { isFirebaseConfigured } from '../lib/firebase';
import { MedicProfile, DutyStatus } from '../types';

export type AppRole = 'MEDIC' | 'HOSPITAL';

export interface StoredAuth {
  role: AppRole;
  medicId?: string;
  medicName?: string;
  unit?: string;
  certification?: string;
}

const AUTH_STORAGE_KEY = 'medlink_auth';

/** Persist auth to localStorage so demo sessions survive refresh */
function persistAuth(auth: StoredAuth) {
  try { localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth)); } catch {}
}
function loadPersistedAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.role === 'MEDIC' || parsed.role === 'HOSPITAL')) return parsed;
    return null;
  } catch { return null; }
}
function clearPersistedAuth() {
  try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch {}
}

interface AuthState {
  auth: StoredAuth | null;
  firebaseUser: User | null;
  medicProfile: MedicProfile | null;
  loading: boolean;
  login: (email: string, password: string, role: AppRole) => Promise<void>;
  register: (email: string, password: string, role: AppRole, medic?: { name: string; unit?: string; certification?: string }) => Promise<void>;
  logout: () => Promise<void>;
  demoLogin: (role: AppRole, medic?: { id: string; name: string; unit?: string; certification?: string }) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  // Initialize auth from localStorage so demo sessions survive refresh
  const [auth, setAuth] = useState<StoredAuth | null>(() => loadPersistedAuth());
  const [loading, setLoading] = useState(isFirebaseConfigured); // only show loader if Firebase is configured
  // Track the role the user selected on login/register form (since Firebase claims may not be set)
  const [pendingRole, setPendingRole] = useState<AppRole | null>(null);

  // Listen for Firebase Auth state changes — only when Firebase is configured
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      setFirebaseUser(user);

      if (user) {
        // Read custom claims for role
        const tokenResult = await user.getIdTokenResult();
        const claimRole = (tokenResult.claims.role as string)?.toUpperCase() as AppRole | undefined;

        // Priority: 1) Firebase custom claims, 2) pendingRole from login/register, 3) persisted auth
        const resolvedRole = (claimRole === 'MEDIC' || claimRole === 'HOSPITAL')
          ? claimRole
          : pendingRole || loadPersistedAuth()?.role || 'MEDIC';

        const newAuth: StoredAuth = {
          role: resolvedRole,
          medicId: user.uid,
          medicName: user.displayName || user.email?.split('@')[0] || 'Field Medic',
          unit: (tokenResult.claims.unit as string) || undefined,
          certification: (tokenResult.claims.certification as string) || undefined,
        };
        setAuth(newAuth);
        persistAuth(newAuth);
        setPendingRole(null); // consumed
      } else {
        // Only clear auth if Firebase was the source (not demo mode)
        if (!loadPersistedAuth()) {
          setAuth(null);
        }
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [pendingRole]);

  const medicProfile: MedicProfile | null = useMemo(() => {
    if (!auth || auth.role !== 'MEDIC' || !auth.medicId) return null;
    return {
      id: auth.medicId,
      name: auth.medicName || 'Field Medic',
      role: 'Paramedic',
      certification: auth.certification ?? 'Paramedic',
      unit: auth.unit ?? `Unit ${auth.medicId.slice(-4)}`,
      dutyStatus: DutyStatus.EN_ROUTE,
      voicePreferences: { language: 'English (US)', autoSubmit: false },
    };
  }, [auth]);

  const login = async (email: string, password: string, role: AppRole) => {
    setLoading(true);
    try {
      // Store the role the user selected so onAuthStateChanged can use it
      setPendingRole(role);
      await signInWithEmailAndPassword(firebaseAuth, email, password);
      // onAuthStateChanged will pick up the user and set auth with the correct role
    } catch (err) {
      setPendingRole(null);
      setLoading(false);
      throw err;
    }
  };

  const register = async (
    email: string,
    password: string,
    role: AppRole,
    medic?: { name: string; unit?: string; certification?: string }
  ) => {
    setLoading(true);
    try {
      // Store the role the user selected
      setPendingRole(role);
      const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      
      // Call setUserRole Cloud Function to set custom claims
      // If Cloud Functions are not deployed, this will fail — that's OK,
      // the pendingRole fallback in onAuthStateChanged handles it
      try {
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const functions = getFunctions();
        const setUserRole = httpsCallable(functions, 'setUserRole');
        await setUserRole({ uid: cred.user.uid, role: role.toLowerCase() });
        // Force token refresh to pick up new claims
        await cred.user.getIdToken(true);
      } catch (cfErr) {
        console.warn('Cloud Function setUserRole unavailable — using local role fallback. Deploy Cloud Functions for production.', cfErr);
        // Fallback: set auth locally with the selected role
        const newAuth: StoredAuth = {
          role,
          medicId: cred.user.uid,
          medicName: medic?.name || email.split('@')[0],
          unit: medic?.unit,
          certification: medic?.certification,
        };
        setAuth(newAuth);
        persistAuth(newAuth);
      }
    } catch (err) {
      setPendingRole(null);
      setLoading(false);
      throw err;
    }
  };

  const logout = async () => {
    try { await signOut(firebaseAuth); } catch {}
    setAuth(null);
    setFirebaseUser(null);
    clearPersistedAuth();
    setPendingRole(null);
  };

  /** Demo login for when Firebase credentials are not yet configured */
  const demoLogin = (role: AppRole, medic?: { id: string; name: string; unit?: string; certification?: string }) => {
    const newAuth: StoredAuth = role === 'MEDIC' && medic
      ? { role: 'MEDIC', medicId: medic.id, medicName: medic.name, unit: medic.unit, certification: medic.certification }
      : { role };
    setAuth(newAuth);
    persistAuth(newAuth);
    setLoading(false);
  };

  const value: AuthState = { auth, firebaseUser, medicProfile, loading, login, register, logout, demoLogin };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
