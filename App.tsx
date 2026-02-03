import React, { useState, useEffect, useCallback } from 'react';
import { PreArrivalAlert } from './types';
import MedicInterface from './components/MedicInterface';
import HospitalInterface from './components/HospitalInterface';
import LoginPage from './components/LoginPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { loadAlerts, saveAlerts } from './lib/storage';
import { Activity, LogOut } from 'lucide-react';

const ETA_TICK_INTERVAL_MS = 30000; // 30 seconds for demo

function AppContent() {
  const { auth, medicProfile, login, logout } = useAuth();
  const [alerts, setAlerts] = useState<PreArrivalAlert[]>(() => loadAlerts());

  useEffect(() => {
    saveAlerts(alerts);
  }, [alerts]);

  const addAlert = useCallback((newAlert: PreArrivalAlert) => {
    setAlerts(prev => [newAlert, ...prev]);
  }, []);

  const updateAlert = useCallback((alertId: string, updates: Partial<PreArrivalAlert>) => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, ...updates } : a));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setAlerts(prev => prev.map(a => ({
        ...a,
        eta: a.status === 'Incoming' ? Math.max(0, a.eta - 1) : a.eta,
      })));
    }, ETA_TICK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  if (!auth) {
    return <LoginPage onLogin={login} />;
  }

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
          />
        ) : (
          <HospitalInterface alerts={alerts} onUpdateAlert={updateAlert} />
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
