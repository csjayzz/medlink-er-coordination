import React, { useState, useEffect } from 'react';
import { PreArrivalAlert, CaseSeverity } from '../types';
import { Activity, Clock, Shield, Search, AlertTriangle, ArrowUpRight, Bed, Users, Phone, ImageIcon, X, Filter, CheckCircle, AlertCircle, UserCheck, Home, ChevronRight, Stethoscope, FileText } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Additional types for PreAssign functionality
interface Patient {
  id: string;
  name: string;
  age: number;
  gender: 'M' | 'F';
  severity: 'Critical' | 'High' | 'Medium';
  condition: string;
  eta: number;
  status: 'Waiting' | 'Assigned';
  assignedBed?: string;
  assignedTeam?: {
    doctor: string;
    nurse: string;
  };
}

interface BedItem {
  id: string;
  room: string;
  type: 'ICU' | 'General' | 'Emergency';
  status: 'Available' | 'Cleaning' | 'Occupied';
}

interface StaffMember {
  id: string;
  name: string;
  specialization?: string;
  available: boolean;
}

interface Assignment {
  bedId: string;
  doctorId: string;
  nurseId: string;
  notes: string;
  specialInstructions: string[];
}

// Mock Data for PreAssign
const initialPatients: Patient[] = [
  { id: 'P001', name: 'John Anderson', age: 58, gender: 'M', severity: 'Critical', condition: 'Cardiac Arrest', eta: 8, status: 'Waiting' },
  { id: 'P002', name: 'Sarah Mitchell', age: 34, gender: 'F', severity: 'High', condition: 'Severe Trauma', eta: 12, status: 'Waiting' },
  { id: 'P003', name: 'Michael Brown', age: 45, gender: 'M', severity: 'Medium', condition: 'Fracture', eta: 18, status: 'Waiting' },
  { id: 'P004', name: 'Emily Davis', age: 67, gender: 'F', severity: 'Critical', condition: 'Stroke', eta: 6, status: 'Waiting' },
  { id: 'P005', name: 'Robert Wilson', age: 29, gender: 'M', severity: 'High', condition: 'Respiratory Distress', eta: 15, status: 'Waiting' }
];

const mockBeds: BedItem[] = [
  { id: 'B101', room: 'ICU-1', type: 'ICU', status: 'Available' },
  { id: 'B102', room: 'ICU-2', type: 'ICU', status: 'Occupied' },
  { id: 'B103', room: 'ICU-3', type: 'ICU', status: 'Available' },
  { id: 'B201', room: 'ER-1', type: 'Emergency', status: 'Available' },
  { id: 'B202', room: 'ER-2', type: 'Emergency', status: 'Cleaning' },
  { id: 'B203', room: 'ER-3', type: 'Emergency', status: 'Available' },
  { id: 'B301', room: 'GEN-1', type: 'General', status: 'Available' },
  { id: 'B302', room: 'GEN-2', type: 'General', status: 'Available' },
  { id: 'B303', room: 'GEN-3', type: 'General', status: 'Occupied' }
];

const mockDoctors: StaffMember[] = [
  { id: 'D001', name: 'Dr. Amanda Chen', specialization: 'Cardiology', available: true },
  { id: 'D002', name: 'Dr. James Parker', specialization: 'Emergency Medicine', available: true },
  { id: 'D003', name: 'Dr. Lisa Thompson', specialization: 'Neurology', available: true },
  { id: 'D004', name: 'Dr. Robert Martinez', specialization: 'Orthopedics', available: false },
  { id: 'D005', name: 'Dr. Sarah Johnson', specialization: 'Trauma Surgery', available: true }
];

const mockNurses: StaffMember[] = [
  { id: 'N001', name: 'Nurse Emily Roberts', available: true },
  { id: 'N002', name: 'Nurse Michael Lee', available: true },
  { id: 'N003', name: 'Nurse Jennifer White', available: false },
  { id: 'N004', name: 'Nurse David Brown', available: true },
  { id: 'N005', name: 'Nurse Maria Garcia', available: true }
];

// Assignment Modal Component
const AssignmentModal: React.FC<{
  patient: Patient | null;
  beds: BedItem[];
  doctors: StaffMember[];
  nurses: StaffMember[];
  onClose: () => void;
  onConfirm: (assignment: Assignment) => void;
}> = ({ patient, beds, doctors, nurses, onClose, onConfirm }) => {
  const [selectedBed, setSelectedBed] = useState<string>('');
  const [selectedDoctor, setSelectedDoctor] = useState<string>('');
  const [selectedNurse, setSelectedNurse] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [specialInstructions, setSpecialInstructions] = useState<string[]>([]);

  if (!patient) return null;

  const availableBeds = beds.filter(b => b.status === 'Available');
  const suggestedBed = availableBeds.find(b => 
    (patient.severity === 'Critical' && b.type === 'ICU') ||
    (patient.severity === 'High' && b.type === 'Emergency')
  ) || availableBeds[0];

  const handleInstructionToggle = (instruction: string) => {
    setSpecialInstructions(prev =>
      prev.includes(instruction) ? prev.filter(i => i !== instruction) : [...prev, instruction]
    );
  };

  const handleConfirm = () => {
    if (!selectedBed || !selectedDoctor || !selectedNurse) {
      alert('Please select bed, doctor, and nurse');
      return;
    }
    onConfirm({ bedId: selectedBed, doctorId: selectedDoctor, nurseId: selectedNurse, notes, specialInstructions });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Assign Bed & Team</h2>
            <p className="text-slate-400 text-sm">Patient: {patient.name} • {patient.severity} Priority</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-2">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-slate-800 rounded-2xl p-6">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <Bed className="w-5 h-5 text-blue-400" />
              Bed Assignment
            </h3>
            {suggestedBed && !selectedBed && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-4">
                <p className="text-blue-400 text-sm font-semibold mb-2">💡 Suggested Bed</p>
                <button onClick={() => setSelectedBed(suggestedBed.id)} className="text-white font-medium hover:underline">
                  {suggestedBed.room} ({suggestedBed.type})
                </button>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              {availableBeds.map(bed => (
                <button
                  key={bed.id}
                  onClick={() => setSelectedBed(bed.id)}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    selectedBed === bed.id ? 'border-blue-500 bg-blue-500/20' : 'border-slate-700 bg-slate-750 hover:border-slate-600'
                  }`}
                >
                  <div className="text-white font-bold mb-1">{bed.room}</div>
                  <div className={`text-xs px-2 py-1 rounded-full inline-block ${
                    bed.type === 'ICU' ? 'bg-red-500/20 text-red-400' :
                    bed.type === 'Emergency' ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-600 text-slate-300'
                  }`}>
                    {bed.type}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-800 rounded-2xl p-6">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-400" />
              Team Assignment
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-slate-300 text-sm font-semibold mb-2 block">Assigned Doctor</label>
                <select value={selectedDoctor} onChange={(e) => setSelectedDoctor(e.target.value)}
                  className="w-full bg-slate-750 border border-slate-700 text-black rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500">
                  <option value="">Select a doctor...</option>
                  {doctors.filter(d => d.available).map(doc => (
                    <option key={doc.id} value={doc.id}>{doc.name} - {doc.specialization}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-slate-300 text-sm font-semibold mb-2 block">Assigned Nurse</label>
                <select value={selectedNurse} onChange={(e) => setSelectedNurse(e.target.value)}
                  className="w-full bg-slate-750 border border-slate-700 text-black rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500">
                  <option value="">Select a nurse...</option>
                  {nurses.filter(n => n.available).map(nurse => (
                    <option key={nurse.id} value={nurse.id}>{nurse.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-2xl p-6">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-400" />
              Notes & Special Instructions
            </h3>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any special notes for the medical team..."
              className="w-full bg-slate-750 border border-slate-700 text-black rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 mb-4 min-h-[100px]" />
            <div className="space-y-2">
              <p className="text-slate-300 text-sm font-semibold mb-2">Special Requirements</p>
              {['Isolation Required', 'Oxygen Support', 'Cardiac Monitor', 'Fall Risk'].map(instruction => (
                <label key={instruction} className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={specialInstructions.includes(instruction)}
                    onChange={() => handleInstructionToggle(instruction)}
                    className="w-5 h-5 rounded border-slate-700 bg-slate-750 text-blue-500 focus:ring-blue-500" />
                  <span className="text-slate-300 text-sm">{instruction}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-700 p-6 flex gap-4">
          <button onClick={onClose} className="flex-1 bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-700 transition-all">
            Cancel
          </button>
          <button onClick={handleConfirm}
            className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-500 transition-all flex items-center justify-center gap-2">
            <CheckCircle className="w-5 h-5" />
            Confirm Assignment
          </button>
        </div>
      </div>
    </div>
  );
};

// PreAssign Page Component
const PreAssignBedTeam: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [patients, setPatients] = useState<Patient[]>(initialPatients);
  const [beds, setBeds] = useState<BedItem[]>(mockBeds);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('All');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showToast, setShowToast] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const filteredPatients = patients.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSeverity = severityFilter === 'All' || p.severity === severityFilter;
    return matchesSearch && matchesSeverity;
  });

  const stats = {
    incomingCases: patients.filter(p => p.status === 'Waiting').length,
    bedsAvailable: beds.filter(b => b.status === 'Available').length,
    bedsOccupied: beds.filter(b => b.status === 'Occupied').length,
    teamsAvailable: mockDoctors.filter(d => d.available).length
  };

  const handleAssignment = (patientId: string, assignment: Assignment) => {
    const doctor = mockDoctors.find(d => d.id === assignment.doctorId);
    const nurse = mockNurses.find(n => n.id === assignment.nurseId);
    const bed = beds.find(b => b.id === assignment.bedId);

    setPatients(prev => prev.map(p =>
      p.id === patientId ? { ...p, status: 'Assigned' as const, assignedBed: bed?.room, assignedTeam: { doctor: doctor?.name || '', nurse: nurse?.name || '' } } : p
    ));
    setBeds(prev => prev.map(b => b.id === assignment.bedId ? { ...b, status: 'Occupied' as const } : b));
    setToastMessage(`Successfully assigned ${bed?.room} to patient`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
    setSelectedPatient(null);
  };

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'Critical': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'High': return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'Medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="bg-slate-900 border-b border-slate-800 p-6">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-4">
            <button onClick={onBack} className="flex items-center gap-2 hover:text-white transition-colors">
              <Home className="w-4 h-4" />
              <span>Dashboard</span>
            </button>
            <ChevronRight className="w-4 h-4" />
            <span>ER Capacity</span>
            <ChevronRight className="w-4 h-4" />
            <span className="text-white">Pre-Assign Bed & Team</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Pre-Assign Bed & Team</h1>
              <p className="text-slate-400">Manage incoming ER cases and allocate beds & medical staff in advance</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-slate-400 text-sm">Current Time</div>
                <div className="text-xl font-bold">{currentTime.toLocaleTimeString()}</div>
                <div className="text-slate-400 text-sm">{currentTime.toLocaleDateString()}</div>
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:border-blue-500">
                  <option value="All">All Cases</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto p-6">
        <div className="grid grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <Activity className="w-10 h-10 text-blue-200" />
              <div className="bg-blue-500/30 rounded-full px-3 py-1 text-sm font-bold">Live</div>
            </div>
            <div className="text-4xl font-black mb-1">{stats.incomingCases}</div>
            <div className="text-blue-100 font-semibold">Incoming Cases</div>
          </div>
          <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <Bed className="w-10 h-10 text-emerald-200" />
              <CheckCircle className="w-6 h-6 text-emerald-200" />
            </div>
            <div className="text-4xl font-black mb-1">{stats.bedsAvailable}</div>
            <div className="text-emerald-100 font-semibold">Beds Available</div>
          </div>
          <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <Bed className="w-10 h-10 text-red-200" />
              <AlertCircle className="w-6 h-6 text-red-200" />
            </div>
            <div className="text-4xl font-black mb-1">{stats.bedsOccupied}</div>
            <div className="text-red-100 font-semibold">Beds Occupied</div>
          </div>
          <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <Stethoscope className="w-10 h-10 text-purple-200" />
              <UserCheck className="w-6 h-6 text-purple-200" />
            </div>
            <div className="text-4xl font-black mb-1">{stats.teamsAvailable}</div>
            <div className="text-purple-100 font-semibold">Teams Available</div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-2xl p-4 mb-6 flex items-center gap-4">
          <Search className="w-5 h-5 text-slate-400" />
          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by patient name or ID..."
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-slate-500" />
        </div>

        <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-300 uppercase tracking-wider">Patient ID</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-300 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-300 uppercase tracking-wider">Age / Gender</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-300 uppercase tracking-wider">Condition</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-300 uppercase tracking-wider">Severity</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-300 uppercase tracking-wider">ETA</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-300 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-300 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredPatients.sort((a, b) => {
                  const severityOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2 };
                  return severityOrder[a.severity] - severityOrder[b.severity] || a.eta - b.eta;
                }).map(patient => (
                  <tr key={patient.id} className={`hover:bg-slate-800/50 transition-colors ${patient.severity === 'Critical' ? 'bg-red-950/20' : ''}`}>
                    <td className="px-6 py-4 font-mono text-sm text-slate-300">{patient.id}</td>
                    <td className="px-6 py-4 font-semibold">{patient.name}</td>
                    <td className="px-6 py-4 text-slate-300">{patient.age} / {patient.gender}</td>
                    <td className="px-6 py-4 text-slate-300">{patient.condition}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getSeverityColor(patient.severity)}`}>
                        {patient.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-blue-400 font-bold">
                        <Clock className="w-4 h-4" />
                        {patient.eta} min
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {patient.status === 'Assigned' ? (
                        <div className="text-emerald-400 font-semibold flex items-center gap-2">
                          <CheckCircle className="w-4 h-4" />
                          Assigned
                          <div className="text-xs text-slate-400">{patient.assignedBed}</div>
                        </div>
                      ) : (
                        <span className="text-orange-400 font-semibold">Waiting</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {patient.status === 'Waiting' ? (
                        <button onClick={() => setSelectedPatient(patient)}
                          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold transition-all">
                          Assign
                        </button>
                      ) : (
                        <button disabled className="bg-slate-800 text-slate-500 px-4 py-2 rounded-xl font-bold cursor-not-allowed">
                          Assigned
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredPatients.length === 0 && (
            <div className="p-12 text-center text-slate-400">
              <Activity className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg">No patients match your search criteria</p>
            </div>
          )}
        </div>
      </div>

      {selectedPatient && (
        <AssignmentModal patient={selectedPatient} beds={beds} doctors={mockDoctors} nurses={mockNurses}
          onClose={() => setSelectedPatient(null)}
          onConfirm={(assignment) => handleAssignment(selectedPatient.id, assignment)} />
      )}

      {showToast && (
        <div className="fixed bottom-6 right-6 bg-emerald-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 z-50">
          <CheckCircle className="w-6 h-6" />
          <span className="font-semibold">{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

interface HospitalInterfaceProps {
  alerts: PreArrivalAlert[];
  onUpdateAlert: (alertId: string, updates: Partial<PreArrivalAlert>) => void;
  etaSeconds: Record<string, number>;
  formatEta: (alertId: string) => string;
  isImminent: (alertId: string) => boolean;
}

const HospitalInterface: React.FC<HospitalInterfaceProps> = ({ alerts, onUpdateAlert, etaSeconds, formatEta, isImminent }) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(() => alerts[0]?.id ?? null);
  const [currentView, setCurrentView] = useState<'dashboard' | 'preassign'>('dashboard');
  
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

  const getLatestVitals = (alert: PreArrivalAlert) => {
    if (alert.vitals && alert.vitals.length > 0) {
      return alert.vitals[alert.vitals.length - 1];
    }
    return {
      heartRate: '--',
      bloodPressure: '--/--',
      spo2: '--',
      timestamp: '--'
    };
  };

  const latestVitals = (selectedAlert?.vitals && selectedAlert.vitals.length > 0)
    ? selectedAlert.vitals[selectedAlert.vitals.length - 1]
    : {
        heartRate: '--',
        bloodPressure: '--/--',
        spo2: '--',
        timestamp: '--'
      };

  // If PreAssign view is active, show that instead
  if (currentView === 'preassign') {
    return <PreAssignBedTeam onBack={() => setCurrentView('dashboard')} />;
  }

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
            (() => {
              const queueVitals = getLatestVitals(alert);
              const reportCount = alert.attachments?.length ?? 0;
              return (
            <button
              key={alert.id}
              onClick={() => setSelectedAlertId(alert.id)}
              className={`w-full p-4 border-b border-slate-50 text-left transition-colors hover:bg-slate-50 ${selectedAlertId === alert.id ? 'bg-blue-50/50 border-l-4 border-l-blue-600' : ''}`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold text-slate-400">Unit: {alert.ambulanceUnit}</span>
                <span className="flex items-center gap-1 text-blue-600 text-xs font-bold">
                  <Clock className="w-3 h-3" /> {formatEta(alert.id)}
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
              <div className="mt-2 text-[10px] text-slate-500 font-medium flex flex-wrap gap-x-3 gap-y-1">
                <span>HR {queueVitals.heartRate}</span>
                <span>BP {queueVitals.bloodPressure}</span>
                <span>SpO2 {queueVitals.spo2}%</span>
                {reportCount > 0 && <span className="text-blue-600">{reportCount} Report{reportCount > 1 ? 's' : ''}</span>}
                {alert.notes && <span className="text-slate-400">Details Added</span>}
              </div>
            </button>
              );
            })()
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
                  <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> Vitals @ {latestVitals.timestamp}</span>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-6">
                 <div className="text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">ETA</p>
                    <p className="text-3xl font-black text-blue-600">{formatEta(selectedAlert.id)}</p>
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
                 <button 
                   onClick={() => setCurrentView('preassign')}
                   className="w-full mt-6 bg-blue-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-blue-500 transition-all"
                 >
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
                {(selectedAlert.attachments ?? []).length > 0 && (
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" /> Attached Reports
                    </h3>
                    <div className="space-y-2">
                      {(selectedAlert.attachments ?? []).map((file, idx) => (
                        <a
                          key={`${file.name}-${idx}`}
                          href={file.dataUrl}
                          download={file.name}
                          className="w-full flex items-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-sm text-slate-700"
                        >
                          <FileText className="w-4 h-4 text-blue-500" />
                          <span className="font-medium truncate">{file.name}</span>
                        </a>
                      ))}
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
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-2">Case Data Received</h3>
                  <div className="text-sm text-slate-600 space-y-1">
                    <p><span className="font-semibold text-slate-700">Emergency Type:</span> {selectedAlert.type}</p>
                    <p><span className="font-semibold text-slate-700">ETA:</span> {selectedAlert.eta} min</p>
                    <p><span className="font-semibold text-slate-700">Details Field:</span> {selectedAlert.notes ? 'Provided' : 'Not provided'}</p>
                    <p><span className="font-semibold text-slate-700">Image:</span> {selectedAlert.imageUrl ? 'Attached' : 'Not attached'}</p>
                    <p><span className="font-semibold text-slate-700">Reports:</span> {(selectedAlert.attachments ?? []).length}</p>
                  </div>
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
