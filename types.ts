
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
  capturedAt?: number; // epoch ms — used for trend chart ordering
}

export interface AlertAttachment {
  name: string;
  mimeType: string;
  dataUrl: string;
  uploadedAt: string;
}

export interface TimelineEntry {
  action: string;
  timestamp: number; // epoch ms
  actor: string;     // e.g. "Medic Unit 7", "MedLink", "Dr. Sharma", "System"
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
  transmittedAt?: number;  // epoch ms — used for Firestore TTL + ordering
  imageUrl?: string;
  attachments?: AlertAttachment[];
  status: 'Incoming' | 'Arrived' | 'Handed Over';
  allergies?: string[];
  knownConditions?: string[];
  timeline?: TimelineEntry[];
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
