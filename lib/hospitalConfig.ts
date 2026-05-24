/**
 * Hospital Configuration
 * Configurable constants for hospital resources, contact info, and prep times.
 * Replace with real values before production.
 */

// Replace with real number before production
export const DEMO_HOSPITAL_PHONE = '+919999999999';

export const HOSPITAL_CONFIG = {
  name: 'St. Jude Memorial Hospital',
  phone: DEMO_HOSPITAL_PHONE,
  emergencyDept: 'ER Department',

  // Feature 25: Available beds for AI assignment
  beds: ['4B', '5A', 'Trauma Bay 1', 'Trauma Bay 2', 'ICU-1', 'ICU-3', 'ER-1', 'ER-3'],

  // Feature 25: On-call staff for AI assignment
  onCallStaff: {
    doctors: [
      { name: 'Dr. Sharma', specialty: 'Cardiology' },
      { name: 'Dr. Patel', specialty: 'Trauma' },
      { name: 'Dr. Singh', specialty: 'Neurology' },
      { name: 'Dr. Chen', specialty: 'Emergency Medicine' },
    ],
    nurseTeams: ['Nurse Team A', 'Nurse Team B', 'Nurse Team C'],
  },

  // Feature 23: Prep window times in minutes by severity and type
  prepTimes: {
    Critical: {
      Cardiac: 10,
      Stroke: 9,
      Trauma: 8,
      Respiratory: 7,
      Other: 8,
    },
    Serious: {
      Cardiac: 6,
      Stroke: 6,
      Trauma: 6,
      Respiratory: 6,
      Other: 6,
    },
    Stable: {
      Cardiac: 4,
      Stroke: 4,
      Trauma: 4,
      Respiratory: 4,
      Other: 4,
    },
  } as Record<string, Record<string, number>>,

  // Feature 22: Case-type preparation checklists
  prepChecklists: {
    Cardiac: [
      'Cath lab notification',
      'Cardiology team standby',
      '12-lead ECG ready',
      'Crash cart at bay',
    ],
    Stroke: [
      'CT scanner clear',
      'Neurology notified',
      'tPA protocol ready',
      'Time of symptom onset recorded',
    ],
    Trauma: [
      'Trauma bay prepped',
      'Blood bank notification',
      'Surgical team standby',
      'Massive transfusion protocol ready',
    ],
    Respiratory: [
      'Ventilator prepared',
      'Respiratory team notified',
      'Intubation tray ready',
    ],
    Other: [
      'ER bay prepared',
      'On-call team notified',
    ],
  } as Record<string, string[]>,
};

// ── Shared resource data ────────────────────────────────────
// These should eventually come from a Firestore `hospitalResources` collection.
// For now they live here as the single source of truth for beds and staff.

export interface BedItem {
  id: string;
  room: string;
  type: 'ICU' | 'General' | 'Emergency';
  status: 'Available' | 'Cleaning' | 'Occupied';
}

export interface StaffMember {
  id: string;
  name: string;
  specialization?: string;
  available: boolean;
}

export const INITIAL_BEDS: BedItem[] = [
  { id: 'B101', room: 'ICU-1', type: 'ICU', status: 'Available' },
  { id: 'B102', room: 'ICU-2', type: 'ICU', status: 'Occupied' },
  { id: 'B103', room: 'ICU-3', type: 'ICU', status: 'Available' },
  { id: 'B201', room: 'ER-1', type: 'Emergency', status: 'Available' },
  { id: 'B202', room: 'ER-2', type: 'Emergency', status: 'Cleaning' },
  { id: 'B203', room: 'ER-3', type: 'Emergency', status: 'Available' },
  { id: 'B301', room: 'GEN-1', type: 'General', status: 'Available' },
  { id: 'B302', room: 'GEN-2', type: 'General', status: 'Available' },
  { id: 'B303', room: 'GEN-3', type: 'General', status: 'Occupied' },
];

export const DOCTORS: StaffMember[] = [
  { id: 'D001', name: 'Dr. Amanda Chen', specialization: 'Cardiology', available: true },
  { id: 'D002', name: 'Dr. James Parker', specialization: 'Emergency Medicine', available: true },
  { id: 'D003', name: 'Dr. Lisa Thompson', specialization: 'Neurology', available: true },
  { id: 'D004', name: 'Dr. Robert Martinez', specialization: 'Orthopedics', available: false },
  { id: 'D005', name: 'Dr. Sarah Johnson', specialization: 'Trauma Surgery', available: true },
];

export const NURSES: StaffMember[] = [
  { id: 'N001', name: 'Nurse Emily Roberts', available: true },
  { id: 'N002', name: 'Nurse Michael Lee', available: true },
  { id: 'N003', name: 'Nurse Jennifer White', available: false },
  { id: 'N004', name: 'Nurse David Brown', available: true },
  { id: 'N005', name: 'Nurse Maria Garcia', available: true },
];
