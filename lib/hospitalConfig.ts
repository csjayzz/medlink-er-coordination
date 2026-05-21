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
