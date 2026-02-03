
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
            notes: { type: Type.STRING }
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
      }
    ]
  }
];

export const SYSTEM_INSTRUCTION = `You are a professional AI Medical Scribe for a paramedic in the field. You are listening to real-time voice and must fill a pre-arrival alert form for the hospital.

RULES:
1. EXTRACT and UPDATE: Whenever you hear patient name, age, vitals (heart rate, blood pressure, SpO2), emergency type (Cardiac, Trauma, Stroke, Respiratory, Other), severity (Critical, Serious, Stable), ETA in minutes, treatments given, or notes — immediately call update_form with that data. Call update_form after each new piece of information; you can call it multiple times as the medic speaks.
2. CONFIRM: After capturing key info, briefly confirm what you have (e.g. "Got it, 54-year-old male, cardiac, ETA 4 minutes") so the medic can correct you.
3. ASK FOR GAPS: If something essential is missing (e.g. no vitals, no severity, no ETA), ask once in a short phrase (e.g. "What's the current heart rate?" or "Severity?").
4. TRANSMIT ONLY WHEN TOLD: Call transmit_alert only when the medic clearly says to send, transmit, or finish the report (e.g. "send it", "transmit", "that's it", "go ahead and send"). Do not transmit on your own.
5. Keep responses very brief and professional. You are in a pre-arrival context en route to St. Jude Memorial Hospital.`;
