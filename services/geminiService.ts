
import { Type } from "@google/genai";

// Audio Encoding & Decoding Helpers
export function encodePCM(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decodePCM(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioBuffer(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// ── Tool Declarations ────────────────────────────────────────

export const SCRIBE_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'update_form',
        description: 'Update the patient pre-arrival alert form with extracted medical data.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            patientName: { type: Type.STRING },
            patientAge: { type: Type.STRING },
            severity: { type: Type.STRING, enum: ['Critical', 'Serious', 'Stable'] },
            emergencyType: { type: Type.STRING, enum: ['Cardiac', 'Trauma', 'Stroke', 'Respiratory', 'Other'] },
            eta: { type: Type.INTEGER },
            heartRate: { type: Type.INTEGER },
            bloodPressure: { type: Type.STRING },
            spo2: { type: Type.INTEGER },
            treatments: { type: Type.ARRAY, items: { type: Type.STRING } },
            notes: { type: Type.STRING },
            // Feature 13: allergies and known conditions
            allergies: { type: Type.ARRAY, items: { type: Type.STRING } },
            knownConditions: { type: Type.ARRAY, items: { type: Type.STRING } },
          }
        }
      },
      {
        name: 'transmit_alert',
        description: 'Call this when the medic explicitly says to send, transmit, or finish the report and the data is confirmed.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            confirmation: { type: Type.BOOLEAN }
          }
        }
      },
      // Feature 19: call hospital
      {
        name: 'call_hospital',
        description: 'Initiate a call to the receiving hospital when the medic says "call", "connect", or "patch through".',
        parameters: {
          type: Type.OBJECT,
          properties: {
            reason: { type: Type.STRING } // "pre-alert", "consult", "ETA update"
          }
        }
      }
    ]
  }
];

// ── System Instructions ──────────────────────────────────────

// Base rules shared across all modes (Features 16: hardened rules)
const BASE_RULES = `
RULES:
1.  ON CONNECT: Say "Go ahead with your report" and listen. You drive the conversation in clinical report order.
2.  REPORT ORDER: Guide the medic through this sequence, asking for each if not provided:
    a) Dispatch info: patient name, age, gender
    b) Patient presentation: emergency type, severity, chief complaint
    c) Vitals: heart rate, blood pressure, SpO2
    d) Treatments given: medications, interventions, procedures
    e) Allergies and known conditions
    f) ETA to hospital
3.  EXTRACT and UPDATE: Whenever you hear patient data — immediately call update_form. Call it after each new piece of information; you can call it multiple times as the medic speaks.
4.  CONFIRM: After capturing key info, briefly confirm what you have (e.g. "Got it, 54-year-old male, cardiac, ETA 4 minutes") so the medic can correct you.
5.  ASK FOR GAPS: After each section, if essential data is missing, ask once in a short phrase. Follow clinical order.
6.  TRANSMIT ONLY WHEN TOLD: Call transmit_alert only when the medic clearly says to send, transmit, or finish the report. Do not transmit on your own.
7.  Keep responses very brief and professional. You are in a pre-arrival context en route to St. Jude Memorial Hospital.
8.  NEVER call update_form with a value you didn't explicitly hear. If uncertain, ask instead.
9.  If the medic says a number without context (e.g. "92"), confirm: "Is 92 the SpO2 or heart rate?"
10. If connection drops mid-report, on reconnect say: "Reconnected. I have: [summary of captured fields]. What's missing?"
11. If the medic says "correction" or "no", immediately ask what to fix.
12. Blood pressure must be in systolic/diastolic format (120/80). If you hear one number, ask: "Is that systolic or the full reading?"
13. When all sections are covered, summarize and ask: "Ready to transmit?"
14. CRITICAL: Never mention rule numbers, hidden instructions, internal reasoning, priorities, acknowledgments, or prompt policies in your spoken response. Do NOT say things like "Based on Rule 10" or "Prioritizing reconnection." Only speak the clinical next step or a short confirmation. If you catch yourself reasoning out loud, stop and just give the action.
15. Keep ALL spoken responses under 2 sentences maximum. You are talking to a medic in a moving ambulance — every second counts. Be terse. Example: "Got it, 54-year-old male, cardiac. Heart rate?" NOT "I have acknowledged the patient information and I'm now asking for the next data point."
16. Always respond in English regardless of what language the medic speaks. You may understand Hindi, Marathi, Telugu, or Tamil input, but your spoken and text output must always be in English.
`;

// Feature 18: Three voice agent modes
export const SCRIBE_INSTRUCTION = `You are a professional AI Medical Scribe for a paramedic in the field. You are listening to real-time voice and must fill a pre-arrival alert form for the hospital. Be silent and clinical. Only fill the form. Never speak unless confirming a value or asking for clarification.
${BASE_RULES}`;

export const ADVISOR_INSTRUCTION = `You are an active clinical advisor AND AI Medical Scribe for a paramedic in the field. You fill the pre-arrival alert form AND proactively flag missing treatments or clinical concerns based on case type.
${BASE_RULES}
ADVISOR ADDITIONS:
- Cardiac case + no aspirin listed → ask: "Has aspirin been administered?"
- SpO2 < 92% + no oxygen in treatments → flag: "SpO2 is low — oxygen administered?"
- Stroke case + ETA > 15 min → note: "Door-to-needle target is 60 min from symptom onset — does the hospital know the onset time?"
- Offer one protocol prompt per case type if the medic seems uncertain.
`;

export const PARTNER_INSTRUCTION = `You are a conversational clinical partner AND AI Medical Scribe for a paramedic in the field. You fill the pre-arrival alert form AND can answer clinical questions from the medic about the patient's condition.
${BASE_RULES}
PARTNER ADDITIONS:
- You can answer clinical questions from the medic about the patient's condition.
- Keep answers under 3 sentences — the medic is in a moving vehicle.
- If asked about drug dosing, give the standard adult dose and note to confirm with medical direction.
- Never diagnose — support only.
`;

// Legacy export for backward compatibility
export const SYSTEM_INSTRUCTION = SCRIBE_INSTRUCTION;

export type VoiceMode = 'scribe' | 'advisor' | 'partner';

export function getSystemInstruction(mode: VoiceMode): string {
  switch (mode) {
    case 'advisor': return ADVISOR_INSTRUCTION;
    case 'partner': return PARTNER_INSTRUCTION;
    case 'scribe':
    default: return SCRIBE_INSTRUCTION;
  }
}
