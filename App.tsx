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
import { Activity, LogOut } from 'lucide-react';

const ETA_TICK_INTERVAL_MS = 60000; // 60 seconds — real-time tick

function AppContent() {
  const { auth, firebaseUser, medicProfile, logout, loading } = useAuth();
  const [alerts, setAlerts] = useState<PreArrivalAlert[]>(() => loadAlerts());
  const [etaSeconds, setEtaSeconds] = useState<Record<string, number>>({});

  useEffect(() => {
    if (firebaseUser) return;
    saveAlerts(alerts);
  }, [alerts, firebaseUser]);

  useEffect(() => {
    if (!auth || !firebaseUser) {
      setAlerts(loadAlerts());
      return;
    }

    if (auth.role === 'MEDIC' && medicProfile) {
      return subscribeToMedicAlerts(medicProfile.id, setAlerts);
    }

    return subscribeToHospitalAlerts(setAlerts);
  }, [auth, firebaseUser, medicProfile]);

  // Initialize etaSeconds for new alerts
  useEffect(() => {
    setEtaSeconds(prev => {
      const next = { ...prev };
      for (const a of alerts) {
        if (!(a.id in next) && a.status === 'Incoming') {
          next[a.id] = a.eta * 60; // convert minutes to seconds
        }
      }
      return next;
    });
  }, [alerts]);

  // Second-level countdown for display
  useEffect(() => {
    const timer = setInterval(() => {
      setEtaSeconds(prev => {
        const next: Record<string, number> = {};
        for (const [id, sec] of Object.entries(prev)) {
          const alert = alerts.find(a => a.id === id);
          if (alert && alert.status === 'Incoming') {
            next[id] = Math.max(0, sec - 1);
          } else {
            next[id] = sec;
          }
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [alerts]);

  // Sync eta (minutes) field from seconds countdown for persistence
  useEffect(() => {
    const timer = setInterval(() => {
      setAlerts(prev => prev.map(a => {
        if (a.status !== 'Incoming') return a;
        const sec = etaSeconds[a.id];
        if (sec != null) {
          const newEta = Math.ceil(sec / 60);
          if (newEta !== a.eta) {
            return { ...a, eta: newEta, status: sec <= 0 ? 'Incoming' : a.status };
          }
        }
        return a;
      }));
    }, ETA_TICK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [etaSeconds]);

  const addAlert = useCallback((newAlert: PreArrivalAlert) => {
    setAlerts(prev => [newAlert, ...prev]);
    if (firebaseUser) {
      void createAlertInFirestore(newAlert);
      return;
    }
    saveAlerts([newAlert, ...loadAlerts()]);
  }, [firebaseUser]);

  const updateAlert = useCallback((alertId: string, updates: Partial<PreArrivalAlert>) => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, ...updates } : a));
    if (firebaseUser) {
      void updateAlertInFirestore(alertId, updates);
    }
  }, [firebaseUser]);

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
