import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { MedicProfile, DutyStatus } from '../types';
import { loadAuth, saveAuth, type StoredAuth } from '../lib/storage';

interface AuthState {
  auth: StoredAuth | null;
  medicProfile: MedicProfile | null;
  login: (role: 'MEDIC' | 'HOSPITAL', medic?: { id: string; name: string; unit?: string; certification?: string }) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(() => loadAuth());

  useEffect(() => {
    saveAuth(auth);
  }, [auth]);

  const medicProfile: MedicProfile | null = useMemo(() => {
    if (!auth || auth.role !== 'MEDIC' || !auth.medicId || !auth.medicName) return null;
    return {
      id: auth.medicId,
      name: auth.medicName,
      role: 'Paramedic',
      certification: auth.certification ?? 'Paramedic',
      unit: auth.unit ?? `Unit ${auth.medicId.slice(-2)}`,
      dutyStatus: DutyStatus.EN_ROUTE,
      voicePreferences: { language: 'English (US)', autoSubmit: false },
    };
  }, [auth]);

  const login = (role: 'MEDIC' | 'HOSPITAL', medic?: { id: string; name: string; unit?: string; certification?: string }) => {
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
  };

  const logout = () => setAuth(null);

  const value: AuthState = { auth, medicProfile, login, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
