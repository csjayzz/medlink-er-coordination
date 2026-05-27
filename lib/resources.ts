import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Unsubscribe,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import { BedItem, DOCTORS, INITIAL_BEDS, NURSES, StaffMember } from './hospitalConfig';

const BEDS_COLLECTION = 'hospitalBeds';
const STAFF_COLLECTION = 'hospitalStaff';
const BEDS_STORAGE_KEY = 'medlink_hospital_beds';
const STAFF_STORAGE_KEY = 'medlink_hospital_staff';

let bedsSeedAttempted = false;
let staffSeedAttempted = false;

function sortBeds(beds: BedItem[]): BedItem[] {
  return [...beds].sort((a, b) => a.room.localeCompare(b.room));
}

function sortStaff(staff: StaffMember[]): StaffMember[] {
  return [...staff].sort((a, b) => {
    if (a.role !== b.role) return a.role.localeCompare(b.role);
    return a.name.localeCompare(b.name);
  });
}

function loadFromStorage<T>(key: string): T[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveToStorage<T>(key: string, value: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('Failed to persist hospital resources locally', err);
  }
}

async function seedBedsOnce(): Promise<void> {
  if (!isFirebaseConfigured || bedsSeedAttempted) return;
  bedsSeedAttempted = true;
  try {
    await Promise.all(
      INITIAL_BEDS.map(bed => setDoc(doc(db, BEDS_COLLECTION, bed.id), bed, { merge: true }))
    );
  } catch (err) {
    console.warn('Failed to seed default beds', err);
  }
}

async function seedStaffOnce(): Promise<void> {
  if (!isFirebaseConfigured || staffSeedAttempted) return;
  staffSeedAttempted = true;
  try {
    await Promise.all(
      [...DOCTORS, ...NURSES].map(member => setDoc(doc(db, STAFF_COLLECTION, member.id), member, { merge: true }))
    );
  } catch (err) {
    console.warn('Failed to seed default staff', err);
  }
}

export function subscribeToHospitalBeds(onUpdate: (beds: BedItem[]) => void): Unsubscribe {
  if (!isFirebaseConfigured) {
    onUpdate(sortBeds(loadFromStorage<BedItem>(BEDS_STORAGE_KEY) ?? INITIAL_BEDS));
    return () => {};
  }

  const q = query(collection(db, BEDS_COLLECTION), orderBy('room'));
  return onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      onUpdate(sortBeds(INITIAL_BEDS));
      void seedBedsOnce();
      return;
    }

    const beds = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data(),
    })) as BedItem[];
    onUpdate(sortBeds(beds));
  }, (err) => {
    console.warn('Hospital beds subscription failed, using local fallback', err);
    onUpdate(sortBeds(loadFromStorage<BedItem>(BEDS_STORAGE_KEY) ?? INITIAL_BEDS));
  });
}

export function subscribeToHospitalStaff(onUpdate: (staff: StaffMember[]) => void): Unsubscribe {
  if (!isFirebaseConfigured) {
    onUpdate(sortStaff(loadFromStorage<StaffMember>(STAFF_STORAGE_KEY) ?? [...DOCTORS, ...NURSES]));
    return () => {};
  }

  const q = query(collection(db, STAFF_COLLECTION), orderBy('name'));
  return onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      onUpdate(sortStaff([...DOCTORS, ...NURSES]));
      void seedStaffOnce();
      return;
    }

    const staff = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data(),
    })) as StaffMember[];
    onUpdate(sortStaff(staff));
  }, (err) => {
    console.warn('Hospital staff subscription failed, using local fallback', err);
    onUpdate(sortStaff(loadFromStorage<StaffMember>(STAFF_STORAGE_KEY) ?? [...DOCTORS, ...NURSES]));
  });
}

export async function upsertHospitalBed(bed: BedItem): Promise<void> {
  if (!isFirebaseConfigured) {
    const existing = loadFromStorage<BedItem>(BEDS_STORAGE_KEY) ?? INITIAL_BEDS;
    const next = sortBeds([...existing.filter(item => item.id !== bed.id), bed]);
    saveToStorage(BEDS_STORAGE_KEY, next);
    return;
  }
  await setDoc(doc(db, BEDS_COLLECTION, bed.id), bed, { merge: true });
}

export async function deleteHospitalBed(bedId: string): Promise<void> {
  if (!isFirebaseConfigured) {
    const existing = loadFromStorage<BedItem>(BEDS_STORAGE_KEY) ?? INITIAL_BEDS;
    saveToStorage(BEDS_STORAGE_KEY, existing.filter(item => item.id !== bedId));
    return;
  }
  await deleteDoc(doc(db, BEDS_COLLECTION, bedId));
}

export async function upsertHospitalStaff(member: StaffMember): Promise<void> {
  if (!isFirebaseConfigured) {
    const existing = loadFromStorage<StaffMember>(STAFF_STORAGE_KEY) ?? [...DOCTORS, ...NURSES];
    const next = sortStaff([...existing.filter(item => item.id !== member.id), member]);
    saveToStorage(STAFF_STORAGE_KEY, next);
    return;
  }
  await setDoc(doc(db, STAFF_COLLECTION, member.id), member, { merge: true });
}

export async function deleteHospitalStaff(staffId: string): Promise<void> {
  if (!isFirebaseConfigured) {
    const existing = loadFromStorage<StaffMember>(STAFF_STORAGE_KEY) ?? [...DOCTORS, ...NURSES];
    saveToStorage(STAFF_STORAGE_KEY, existing.filter(item => item.id !== staffId));
    return;
  }
  await deleteDoc(doc(db, STAFF_COLLECTION, staffId));
}
