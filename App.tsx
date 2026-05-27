import React, { useState, useEffect, useCallback } from 'react';
import { PreArrivalAlert } from './types';
import MedicInterface from './components/MedicInterface';
import HospitalInterface from './components/HospitalInterface';
import LoginPage from './components/LoginPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import {
  createAlertInFirestore,
  loadAlerts,
  saveAlerts,
  subscribeToHospitalAlerts,
  subscribeToMedicAlerts,
  updateAlertInFirestore,
} from './lib/storage';
import { isFirebaseConfigured } from './lib/firebase';
import { Activity, LogOut } from 'lucide-react';

const ETA_TICK_INTERVAL_MS = 1000;

function AppContent() {
  const { auth, firebaseUser, medicProfile, logout, loading } = useAuth();
  const [alerts, setAlerts] = useState<PreArrivalAlert[]>(() => loadAlerts());
  const [etaSeconds, setEtaSeconds] = useState<Record<string, number>>({});

  const getAlertEtaSeconds = useCallback((alert: PreArrivalAlert, nowMs: number) => {
    const fallbackTargetAt = alert.transmittedAt != null
      ? alert.transmittedAt + alert.eta * 60 * 1000
      : nowMs + alert.eta * 60 * 1000;
    const targetAt = alert.etaTargetAt ?? fallbackTargetAt;
    return Math.max(0, Math.ceil((targetAt - nowMs) / 1000));
  }, []);

  const addAlert = useCallback((newAlert: PreArrivalAlert) => {
    setAlerts(prev => [newAlert, ...prev]);
    if (isFirebaseConfigured && firebaseUser) {
      void createAlertInFirestore(newAlert);
    }
  }, [firebaseUser]);

  const updateAlert = useCallback((alertId: string, updates: Partial<PreArrivalAlert>) => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, ...updates } : a));
    if (isFirebaseConfigured && firebaseUser) {
      void updateAlertInFirestore(alertId, updates);
    }
  }, [firebaseUser]);

  // Persist alerts to localStorage in demo mode (no Firebase)
  useEffect(() => {
    if (firebaseUser) return; // Firebase mode — Firestore handles persistence
    saveAlerts(alerts);
  }, [alerts, firebaseUser]);

  // Subscribe to alerts from Firestore (Firebase mode) or load from localStorage (demo mode)
  useEffect(() => {
    if (!auth) {
      setAlerts([]);
      return;
    }

    // Firebase mode: subscribe to Firestore
    if (isFirebaseConfigured && firebaseUser) {
      if (auth.role === 'MEDIC' && medicProfile) {
        return subscribeToMedicAlerts(medicProfile.id, setAlerts);
      }
      return subscribeToHospitalAlerts(setAlerts);
    }

    // Demo mode: load from localStorage
    // Don't reset alerts if we already have them in state (e.g. created this session)
    const persisted = loadAlerts();
    if (persisted.length > 0) {
      setAlerts(persisted);
    }
  }, [auth, firebaseUser, medicProfile]);

  // Shared ETA countdown derived from one absolute target so hospital and medic stay in sync.
  useEffect(() => {
    const timer = setInterval(() => {
      const nowMs = Date.now();
      setEtaSeconds(() => {
        const next: Record<string, number> = {};
        for (const alert of alerts) {
          if (alert.status === 'Incoming') {
            next[alert.id] = getAlertEtaSeconds(alert, nowMs);
          }
        }
        return next;
      });
    }, 1000);

    const nowMs = Date.now();
    setEtaSeconds(() => {
      const next: Record<string, number> = {};
      for (const alert of alerts) {
        if (alert.status === 'Incoming') {
          next[alert.id] = getAlertEtaSeconds(alert, nowMs);
        }
      }
      return next;
    });

    return () => clearInterval(timer);
  }, [alerts, getAlertEtaSeconds]);

  // Auto-transition overdue incoming alerts so Medic moves them to History and Hospital to Arrived.
  useEffect(() => {
    const overdue = alerts.filter(alert => {
      if (alert.status !== 'Incoming') return false;
      const remaining = etaSeconds[alert.id];
      return remaining != null ? remaining <= 0 : alert.eta <= 0;
    });

    overdue.forEach(alert => {
      updateAlert(alert.id, {
        status: 'Arrived',
        eta: 0,
      });
    });
  }, [alerts, etaSeconds, updateAlert]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 font-medium">Loading MedLink...</p>
        </div>
      </div>
    );
  }

  if (!auth) {
    return <LoginPage />;
  }

  // Helper: format seconds to mm:ss
  const formatEta = (alertId: string): string => {
    const sec = etaSeconds[alertId];
    if (sec == null || sec <= 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const isImminent = (alertId: string): boolean => {
    const sec = etaSeconds[alertId];
    return sec != null && sec <= 0;
  };

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold">M</div>
          <span className="font-bold text-slate-800 tracking-tight">MEDLINK</span>
          <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-medium">
            {auth.role === 'MEDIC' ? 'FIELD-OPS' : 'COMMAND-CENTER'}
          </span>
          {medicProfile && (
            <span className="text-xs text-slate-500 truncate max-w-[120px]" title={medicProfile.name}>
              {medicProfile.name}
            </span>
          )}
        </div>

        <button
          onClick={logout}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 text-sm font-medium"
        >
          <LogOut className="w-4 h-4" />
          Log Out
        </button>
      </header>

      <main>
        {auth.role === 'MEDIC' && medicProfile ? (
          <MedicInterface
            medic={medicProfile}
            alerts={alerts.filter(a => a.medicId === medicProfile.id)}
            onNewAlert={addAlert}
            onUpdateAlert={updateAlert}
            etaSeconds={etaSeconds}
            formatEta={formatEta}
            isImminent={isImminent}
          />
        ) : (
          <HospitalInterface
            alerts={alerts}
            onUpdateAlert={updateAlert}
            etaSeconds={etaSeconds}
            formatEta={formatEta}
            isImminent={isImminent}
          />
        )}
      </main>
    </div>
  );
}

const App: React.FC = () => (
  <AuthProvider>
    <AppContent />
  </AuthProvider>
);

export default App;
