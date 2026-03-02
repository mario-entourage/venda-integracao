'use client';

import { useState, useEffect, useRef } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  Firestore,
} from 'firebase/firestore';
import type { OcrData } from '@/types/anvisa';
import type { Client } from '@/types/client';
import type { Doctor } from '@/types/doctor';
import { nameMatches, crmMatches, anvisaDateToSalesDate } from '@/lib/anvisa-matching-utils';

// ─── Types matching VENDA's data model for prescription lookups ─────────────

type SalesPrescription = {
  id: string;
  prescriptionDate: string | null;
  clientId: string;
  doctorId: string;
  orderId: string;
  products: Array<{ productName: string }>;
  createdAt: any;
};

type SalesOrder = {
  id: string;
  anvisaStatus: string;
  createdById: string;
  createdAt: any;
};

type SalesUser = {
  id: string;
  email: string;
};

export interface PrescriptionMatch {
  prescriptionId: string;
  clientId: string;
  clientName: string;
  doctorId: string;
  doctorName: string;
  doctorState: string;
  prescriptionDate: string;
  products: string[];
  createdByEmail: string;
  createdAt: string;
  anvisaSubmitted: boolean;
}

// ─── VENDA collection names (no prefix — these are the real VENDA collections) ──

const SI_COLLECTIONS = {
  clients: 'clients',
  doctors: 'doctors',
  prescriptions: 'prescriptions',
  orders: 'orders',
  users: 'users',
} as const;

// ─── Hook output ────────────────────────────────────────────────────────────

export interface SalesIntegrationCheckResult {
  isChecking: boolean;
  hasChecked: boolean;
  prescriptionMatches: PrescriptionMatch[];
  clientMatches: Client[];
  clientExactMatch: Client | null;
  doctorMatches: Doctor[];
  doctorExactMatch: Doctor | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchDoc<T>(
  firestore: Firestore,
  collectionName: string,
  docId: string,
): Promise<T | null> {
  try {
    const snap = await getDoc(doc(firestore, collectionName, docId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as T;
  } catch {
    return null;
  }
}

// ─── Check 1: Duplicate prescription detection ─────────────────────────────

async function checkPrescriptionDuplicates(
  firestore: Firestore,
  patientName: string,
  prescriptionDateSales: string,
  doctorName: string,
): Promise<PrescriptionMatch[]> {
  const prescriptionsQuery = query(
    collection(firestore, SI_COLLECTIONS.prescriptions),
    where('prescriptionDate', '==', prescriptionDateSales),
  );

  const snap = await getDocs(prescriptionsQuery);
  if (snap.empty) return [];

  const matches: PrescriptionMatch[] = [];

  for (const prescDoc of snap.docs) {
    const presc = { id: prescDoc.id, ...prescDoc.data() } as SalesPrescription;

    const [client, doctor] = await Promise.all([
      fetchDoc<Client>(firestore, SI_COLLECTIONS.clients, presc.clientId),
      fetchDoc<Doctor>(firestore, SI_COLLECTIONS.doctors, presc.doctorId),
    ]);

    if (!client || !doctor) continue;

    const patientMatch = nameMatches(patientName, client.fullName);
    const doctorMatch = nameMatches(doctorName, doctor.fullName);

    if (!patientMatch && !doctorMatch) continue;

    let anvisaSubmitted = false;
    let createdByEmail = '';
    let createdAt = '';

    if (presc.orderId) {
      const order = await fetchDoc<SalesOrder>(firestore, SI_COLLECTIONS.orders, presc.orderId);
      if (order) {
        anvisaSubmitted = !!(
          order.anvisaStatus &&
          order.anvisaStatus !== 'pending' &&
          order.anvisaStatus !== ''
        );

        if (order.createdAt) {
          try {
            const d = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
            createdAt = d.toISOString();
          } catch {
            /* skip */
          }
        }

        if (order.createdById) {
          const user = await fetchDoc<SalesUser>(firestore, SI_COLLECTIONS.users, order.createdById);
          if (user) createdByEmail = user.email;
        }
      }
    }

    if (!createdAt && presc.createdAt) {
      try {
        const d = presc.createdAt.toDate ? presc.createdAt.toDate() : new Date(presc.createdAt);
        createdAt = d.toISOString();
      } catch {
        /* skip */
      }
    }

    matches.push({
      prescriptionId: presc.id,
      clientId: presc.clientId,
      clientName: client.fullName,
      doctorId: presc.doctorId,
      doctorName: doctor.fullName,
      doctorState: doctor.state || '',
      prescriptionDate: presc.prescriptionDate || '',
      products: (presc.products || []).map((p) => p.productName),
      createdByEmail,
      createdAt,
      anvisaSubmitted,
    });
  }

  return matches;
}

// ─── Check 2: Similar client detection ──────────────────────────────────────

async function checkClientMatches(
  firestore: Firestore,
  patientName: string | undefined,
  patientCpf: string | undefined,
): Promise<{ matches: Client[]; exactMatch: Client | null }> {
  let exactMatch: Client | null = null;
  const matches: Client[] = [];

  if (patientCpf) {
    const cpfDigits = patientCpf.replace(/\D/g, '');
    if (cpfDigits.length >= 11) {
      const cpfQuery = query(
        collection(firestore, SI_COLLECTIONS.clients),
        where('document', '==', patientCpf),
        where('active', '==', true),
      );
      const snap = await getDocs(cpfQuery);

      if (snap.empty && cpfDigits) {
        const cpfQuery2 = query(
          collection(firestore, SI_COLLECTIONS.clients),
          where('document', '==', cpfDigits),
          where('active', '==', true),
        );
        const snap2 = await getDocs(cpfQuery2);
        if (!snap2.empty) {
          exactMatch = { id: snap2.docs[0].id, ...snap2.docs[0].data() } as Client;
        }
      } else if (!snap.empty) {
        exactMatch = { id: snap.docs[0].id, ...snap.docs[0].data() } as Client;
      }
    }
  }

  if (patientName) {
    const allClientsQuery = query(
      collection(firestore, SI_COLLECTIONS.clients),
      where('active', '==', true),
    );
    const snap = await getDocs(allClientsQuery);

    for (const clientDoc of snap.docs) {
      const client = { id: clientDoc.id, ...clientDoc.data() } as Client;
      if (exactMatch && client.id === exactMatch.id) continue;
      if (nameMatches(patientName, client.fullName)) {
        matches.push(client);
      }
    }
  }

  return { matches: matches.slice(0, 10), exactMatch };
}

// ─── Check 3: Similar doctor detection ──────────────────────────────────────

async function checkDoctorMatches(
  firestore: Firestore,
  doctorName: string | undefined,
  doctorCrm: string | undefined,
): Promise<{ matches: Doctor[]; exactMatch: Doctor | null }> {
  let exactMatch: Doctor | null = null;
  const matches: Doctor[] = [];

  if (doctorCrm) {
    const crmDigits = doctorCrm.replace(/\D/g, '');
    if (crmDigits) {
      const allDoctorsQuery = query(
        collection(firestore, SI_COLLECTIONS.doctors),
        where('active', '==', true),
      );
      const snap = await getDocs(allDoctorsQuery);
      for (const docSnap of snap.docs) {
        const doctor = { id: docSnap.id, ...docSnap.data() } as Doctor;
        if (crmMatches(doctorCrm, doctor.crm)) {
          exactMatch = doctor;
          break;
        }
      }
    }
  }

  if (doctorName) {
    const allDoctorsQuery = query(
      collection(firestore, SI_COLLECTIONS.doctors),
      where('active', '==', true),
    );
    const snap = await getDocs(allDoctorsQuery);

    for (const docSnap of snap.docs) {
      const doctor = { id: docSnap.id, ...docSnap.data() } as Doctor;
      if (exactMatch && doctor.id === exactMatch.id) continue;
      if (nameMatches(doctorName, doctor.fullName)) {
        matches.push(doctor);
      }
    }
  }

  return { matches: matches.slice(0, 10), exactMatch };
}

// ─── Main hook ──────────────────────────────────────────────────────────────

export function useSalesIntegrationCheck(
  ocrData: Partial<OcrData> | null,
  firestore: Firestore | null,
): SalesIntegrationCheckResult {
  const [isChecking, setIsChecking] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [prescriptionMatches, setPrescriptionMatches] = useState<PrescriptionMatch[]>([]);
  const [clientMatches, setClientMatches] = useState<Client[]>([]);
  const [clientExactMatch, setClientExactMatch] = useState<Client | null>(null);
  const [doctorMatches, setDoctorMatches] = useState<Doctor[]>([]);
  const [doctorExactMatch, setDoctorExactMatch] = useState<Doctor | null>(null);
  const hasRun = useRef(false);

  useEffect(() => {
    if (!ocrData || !firestore || hasRun.current) return;

    const hasPrescriptionData =
      ocrData.patientName && ocrData.prescriptionDate && ocrData.doctorName;
    const hasPatientData = ocrData.patientName || ocrData.patientCpf;
    const hasDoctorData = ocrData.doctorName || ocrData.doctorCrm;

    if (!hasPrescriptionData && !hasPatientData && !hasDoctorData) return;

    hasRun.current = true;
    setIsChecking(true);

    const run = async () => {
      try {
        const results = await Promise.allSettled([
          hasPrescriptionData
            ? checkPrescriptionDuplicates(
                firestore,
                ocrData.patientName!,
                anvisaDateToSalesDate(ocrData.prescriptionDate!),
                ocrData.doctorName!,
              )
            : Promise.resolve([]),

          hasPatientData
            ? checkClientMatches(firestore, ocrData.patientName, ocrData.patientCpf)
            : Promise.resolve({ matches: [] as Client[], exactMatch: null }),

          hasDoctorData
            ? checkDoctorMatches(firestore, ocrData.doctorName, ocrData.doctorCrm)
            : Promise.resolve({ matches: [] as Doctor[], exactMatch: null }),
        ]);

        if (results[0].status === 'fulfilled') {
          setPrescriptionMatches(results[0].value as PrescriptionMatch[]);
        }

        if (results[1].status === 'fulfilled') {
          const clientResult = results[1].value as {
            matches: Client[];
            exactMatch: Client | null;
          };
          setClientMatches(clientResult.matches);
          setClientExactMatch(clientResult.exactMatch);
        }

        if (results[2].status === 'fulfilled') {
          const doctorResult = results[2].value as {
            matches: Doctor[];
            exactMatch: Doctor | null;
          };
          setDoctorMatches(doctorResult.matches);
          setDoctorExactMatch(doctorResult.exactMatch);
        }
      } catch (err) {
        console.error('Sales Integration check failed:', err);
      } finally {
        setIsChecking(false);
        setHasChecked(true);
      }
    };

    run();
  }, [ocrData, firestore]);

  return {
    isChecking,
    hasChecked,
    prescriptionMatches,
    clientMatches,
    clientExactMatch,
    doctorMatches,
    doctorExactMatch,
  };
}
