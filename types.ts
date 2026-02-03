
export enum CaseSeverity {
  CRITICAL = 'Critical',
  SERIOUS = 'Serious',
  STABLE = 'Stable'
}

export enum EmergencyType {
  CARDIAC = 'Cardiac',
  TRAUMA = 'Trauma',
  STROKE = 'Stroke',
  RESPIRATORY = 'Respiratory',
  OTHER = 'Other'
}

export enum DutyStatus {
  ON_DUTY = 'On Duty',
  EN_ROUTE = 'En Route',
  AVAILABLE = 'Available',
  OFF_DUTY = 'Off Duty'
}

export interface Vitals {
  heartRate: number;
  bloodPressure: string;
  spo2: number;
  timestamp: string;
}

export interface PreArrivalAlert {
  id: string;
  patientName: string;
  patientAge: string;
  severity: CaseSeverity;
  type: EmergencyType;
  eta: number; // minutes
  vitals: Vitals[];
  treatments: string[];
  notes: string;
  medicId: string;
  ambulanceUnit: string;
  timestamp: string;
  imageUrl?: string;
  status: 'Incoming' | 'Arrived' | 'Handed Over';
}

export interface MedicProfile {
  id: string;
  name: string;
  role: string;
  certification: string;
  unit: string;
  dutyStatus: DutyStatus;
  voicePreferences: {
    language: string;
    autoSubmit: boolean;
  };
}

export type Role = 'MEDIC' | 'HOSPITAL';
