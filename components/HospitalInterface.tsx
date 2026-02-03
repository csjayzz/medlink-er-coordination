
import React, { useState } from 'react';
import { PreArrivalAlert, CaseSeverity } from '../types';
import { Activity, Clock, Shield, Search, AlertTriangle, ArrowUpRight, Bed, Users, Phone, ImageIcon } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface HospitalInterfaceProps {
  alerts: PreArrivalAlert[];
  onUpdateAlert: (alertId: string, updates: Partial<PreArrivalAlert>) => void;
}

const HospitalInterface: React.FC<HospitalInterfaceProps> = ({ alerts, onUpdateAlert }) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(() => alerts[0]?.id ?? null);
  const selectedAlert = selectedAlertId
    ? (alerts.find(a => a.id === selectedAlertId) ?? null)
    : null;

  const incomingAlerts = alerts
    .filter(a => a.status === 'Incoming')
    .filter(a => !searchFilter.trim() || [a.patientName, a.ambulanceUnit, a.medicId].some(s => s?.toLowerCase().includes(searchFilter.toLowerCase())))
    .sort((a, b) => {
      const severityOrder = { [CaseSeverity.CRITICAL]: 0, [CaseSeverity.SERIOUS]: 1, [CaseSeverity.STABLE]: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

  const updateStatus = (alertId: string, status: 'Incoming' | 'Arrived' | 'Handed Over') => {
    onUpdateAlert(alertId, { status });
    if (selectedAlertId === alertId && status !== 'Incoming') {
      setSelectedAlertId(incomingAlerts.find(a => a.id !== alertId)?.id ?? null);
    }
  };

  const latestVitals = (selectedAlert?.vitals && selectedAlert.vitals.length > 0)
    ? selectedAlert.vitals[selectedAlert.vitals.length - 1]
    : {
        heartRate: '--',
        bloodPressure: '--/--',
        spo2: '--',
        timestamp: '--'
      };

  return (
    <div className="flex h-[calc(100vh-64px)] bg-slate-50 overflow-hidden">
      {/* Sidebar: Queue */}
      <div className="w-80 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-slate-800">Inbound Queue</h2>
            <span className="bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
              {incomingAlerts.length} Active
            </span>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              placeholder="Filter by name or unit..." 
              className="w-full bg-slate-50 border border-slate-100 py-2 pl-9 pr-4 rounded-lg text-sm focus:outline-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {incomingAlerts.map(alert => (
            <button
              key={alert.id}
              onClick={() => setSelectedAlertId(alert.id)}
              className={`w-full p-4 border-b border-slate-50 text-left transition-colors hover:bg-slate-50 ${selectedAlertId === alert.id ? 'bg-blue-50/50 border-l-4 border-l-blue-600' : ''}`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold text-slate-400">Unit: {alert.ambulanceUnit}</span>
                <span className="flex items-center gap-1 text-blue-600 text-xs font-bold">
                  <Clock className="w-3 h-3" /> {alert.eta}m
                </span>
              </div>
              <h3 className="font-bold text-slate-800">{alert.patientName}, {alert.patientAge}</h3>
              <div className="flex items-center gap-2 mt-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  alert.severity === CaseSeverity.CRITICAL ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'
                }`}>
                  {alert.severity}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">{alert.type}</span>
              </div>
            </button>
          ))}
          {incomingAlerts.length === 0 && (
            <div className="p-6 text-center text-slate-400 text-sm">No incoming cases. New alerts will appear here.</div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {selectedAlert ? (
          <div className="p-8">
            <div className="flex justify-between items-start mb-8">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold text-slate-900">{selectedAlert.patientName}</h1>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    selectedAlert.severity === CaseSeverity.CRITICAL ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-blue-100 text-blue-600'
                  }`}>
                    {selectedAlert.severity} Triage
                  </span>
                </div>
                <div className="flex items-center gap-4 text-slate-500 font-medium">
                  <span className="flex items-center gap-1.5"><Users className="w-4 h-4" /> {selectedAlert.patientAge} years old</span>
                  <span className="flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {selectedAlert.type} Emergency</span>
                  <span className="flex items-center gap-1.5"><Shield className="w-4 h-4" /> Medic: {selectedAlert.medicId}</span>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-6">
                 <div className="text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">ETA</p>
                    <p className="text-3xl font-black text-blue-600">{selectedAlert.eta}<span className="text-sm font-bold">min</span></p>
                 </div>
                 <div className="w-[1px] h-12 bg-slate-100 hidden sm:block"></div>
                 <div className="flex flex-wrap gap-2 items-center">
                   <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status</span>
                   <select 
                     value={selectedAlert.status} 
                     onChange={e => updateStatus(selectedAlert.id, e.target.value as 'Incoming' | 'Arrived' | 'Handed Over')}
                     className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 focus:outline-blue-500"
                   >
                     <option value="Incoming">Incoming</option>
                     <option value="Arrived">Arrived</option>
                     <option value="Handed Over">Handed Over</option>
                   </select>
                 </div>
                 <button className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all">
                    <Phone className="w-4 h-4" /> Contact Medic
                 </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6 mb-8">
              {/* Vitals Cards */}
              <div className="col-span-2 grid grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Heart Rate</p>
                  <div className="flex items-end gap-2">
                    <p className="text-4xl font-bold text-slate-900">{latestVitals.heartRate}</p>
                    <span className="text-slate-400 font-bold mb-1">BPM</span>
                    {Number(latestVitals.heartRate) > 100 && <ArrowUpRight className="w-5 h-5 text-red-500 mb-1" />}
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Blood Pressure</p>
                  <div className="flex items-end gap-2">
                    <p className="text-4xl font-bold text-slate-900">{latestVitals.bloodPressure}</p>
                    <span className="text-slate-400 font-bold mb-1">mmHg</span>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Oxygen (SpO2)</p>
                  <div className="flex items-end gap-2">
                    <p className="text-4xl font-bold text-slate-900">{latestVitals.spo2}%</p>
                    <span className={`${Number(latestVitals.spo2) < 92 ? 'text-red-500' : 'text-emerald-500'} font-bold mb-1`}>
                      {Number(latestVitals.spo2) < 92 ? 'Critical' : 'Stable'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Resource Management - state-driven from incoming count */}
              <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl">
                 <h3 className="font-bold flex items-center gap-2 mb-4">
                   <Bed className="w-5 h-5 text-blue-400" /> ER Capacity
                 </h3>
                 <div className="space-y-4">
                    <div className="flex justify-between items-center">
                       <span className="text-slate-400 text-sm">Inbound Cases</span>
                       <span className="font-bold text-emerald-400">{alerts.filter(a => a.status === 'Incoming').length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                       <span className="text-slate-400 text-sm">Arrived / Handed Over</span>
                       <span className="font-bold text-slate-300">{alerts.filter(a => a.status !== 'Incoming').length}</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full">
                       <div 
                         className="bg-emerald-400 h-full rounded-full transition-all" 
                         style={{ width: `${Math.min(100, (alerts.filter(a => a.status === 'Incoming').length / 6) * 100)}%` }}
                       />
                    </div>
                 </div>
                 <button className="w-full mt-6 bg-blue-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-blue-500 transition-all">
                   Pre-Assign Bed & Team
                 </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-6">
                {/* Trends Graph */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-6">Vitals Trend Indicator</h3>
                  <div className="h-64">
                    {selectedAlert.vitals && selectedAlert.vitals.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={selectedAlert.vitals}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="timestamp" hide />
                          <YAxis hide domain={['auto', 'auto']} />
                          <Tooltip 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                          <Line type="monotone" dataKey="heartRate" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} />
                          <Line type="monotone" dataKey="spo2" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-300 italic text-sm">No data points yet</div>
                    )}
                  </div>
                </div>

                {/* Image Preview */}
                {selectedAlert.imageUrl && (
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-blue-500" /> Attached Field Data
                    </h3>
                    <div className="aspect-video rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                      <img src={selectedAlert.imageUrl} className="w-full h-full object-contain" alt="ECG / Field Photo" />
                    </div>
                  </div>
                )}
              </div>

              {/* Treatment and Notes */}
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-4">Field Treatments</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedAlert.treatments.map((t, idx) => (
                      <span key={idx} className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-sm font-semibold">
                        {t}
                      </span>
                    ))}
                    {selectedAlert.treatments.length === 0 && <span className="text-slate-400 italic">No treatments reported</span>}
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-2">Paramedic Notes</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    {selectedAlert.notes || "No additional notes provided by field team."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
             <Activity className="w-16 h-16 mb-4 opacity-20" />
             <p className="text-lg font-medium text-center">{alerts.length === 0 ? "No alerts yet. Alerts will appear when medics transmit from the field." : "Select an incoming case for details"}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default HospitalInterface;
