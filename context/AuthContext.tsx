import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  User,
} from 'firebase/auth';
import { auth as firebaseAuth } from '../lib/firebase';
import { MedicProfile, DutyStatus } from '../types';

export type AppRole = 'MEDIC' | 'HOSPITAL';

export interface StoredAuth {
  role: AppRole;
  medicId?: string;
  medicName?: string;
  unit?: string;
  certification?: string;
}

interface AuthState {
  auth: StoredAuth | null;
  firebaseUser: User | null;
  medicProfile: MedicProfile | null;
  loading: boolean;
  login: (email: string, password: string, role: AppRole) => Promise<void>;
  register: (email: string, password: string, role: AppRole, medic?: { name: string; unit?: string; certification?: string }) => Promise<void>;
  logout: () => Promise<void>;
  /** Legacy login for demo/offline mode when Firebase is not configured */
  demoLogin: (role: AppRole, medic?: { id: string; name: string; unit?: string; certification?: string }) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [auth, setAuth] = useState<StoredAuth | null>(null);
  const [loading, setLoading] = useState(true);

  // Listen for Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      setFirebaseUser(user);

      if (user) {
        // Read custom claims for role
        const tokenResult = await user.getIdTokenResult();
        const role = (tokenResult.claims.role as string)?.toUpperCase() as AppRole | undefined;

        if (role === 'MEDIC' || role === 'HOSPITAL') {
          setAuth({
            role,
            medicId: user.uid,
            medicName: user.displayName || user.email?.split('@')[0] || 'Field Medic',
            unit: (tokenResult.claims.unit as string) || undefined,
            certification: (tokenResult.claims.certification as string) || undefined,
          });
        } else {
          // No role claim set yet — default to MEDIC for now
          // In production, the setUserRole Cloud Function should be called after registration
          setAuth({
            role: 'MEDIC',
            medicId: user.uid,
            medicName: user.displayName || user.email?.split('@')[0] || 'Field Medic',
          });
        }
      } else {
        setAuth(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
      await signInWithEmailAndPassword(firebaseAuth, email, password);
      // onAuthStateChanged will pick up the user and set auth
    } catch (err) {
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
      const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      // After registration, call the setUserRole Cloud Function to set custom claims
      // For now, we set a local auth state; the Cloud Function should be called separately
      setAuth({
        role,
        medicId: cred.user.uid,
        medicName: medic?.name || email.split('@')[0],
        unit: medic?.unit,
        certification: medic?.certification,
      });
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const logout = async () => {
    await signOut(firebaseAuth);
    setAuth(null);
    setFirebaseUser(null);
  };

  /** Demo login for when Firebase credentials are not yet configured */
  const demoLogin = (role: AppRole, medic?: { id: string; name: string; unit?: string; certification?: string }) => {
    if (role === 'MEDIC' && medic) {
      setAuth({
        role: 'MEDIC',
        medicId: medic.id,
        medicName: medic.name,
        unit: medic.unit,
        certification: medic.certification,
      });
    } else {
      setAuth({ role: 'HOSPITAL' });
    }
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
