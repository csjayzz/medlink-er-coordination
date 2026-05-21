
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { AlertAttachment, MedicProfile, PreArrivalAlert, DutyStatus, CaseSeverity, EmergencyType, Vitals } from '../types';
import { 
  User, Clipboard, Plus, Mic, X, Check, Activity, Clock, MapPin, Shield, Phone, Camera,
  AlertTriangle, AlertCircle, CheckCircle, ChevronLeft, Volume2, Send, Square, Image as ImageIcon, FileText,
  AlertOctagon, History
} from 'lucide-react';
import { 
  encodePCM, 
  decodePCM, 
  decodeAudioBuffer, 
  SCRIBE_TOOLS, 
  SYSTEM_INSTRUCTION,
  getSystemInstruction,
  VoiceMode
} from '../services/geminiService';
import { HOSPITAL_CONFIG } from '../lib/hospitalConfig';

type ViewMode = 'DASH' | 'PROFILE' | 'CREATE_ALERT' | 'VOICE_AGENT' | 'ALERT_DETAIL' | 'ALERT_EDIT';

interface MedicInterfaceProps {
  medic: MedicProfile;
  alerts: PreArrivalAlert[];
  onNewAlert: (alert: PreArrivalAlert) => void;
  onUpdateAlert: (alertId: string, updates: Partial<PreArrivalAlert>) => void;
  etaSeconds: Record<string, number>;
  formatEta: (alertId: string) => string;
  isImminent: (alertId: string) => boolean;
}

const MedicInterface: React.FC<MedicInterfaceProps> = ({ medic, alerts, onNewAlert, onUpdateAlert, etaSeconds, formatEta, isImminent }) => {
  const [activeTab, setActiveTab] = useState<'DASH' | 'PROFILE'>('DASH');
  const [viewMode, setViewMode] = useState<ViewMode>('DASH');
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [lastCreatedAlertId, setLastCreatedAlertId] = useState<string | null>(null);
  const [isCreatingAlert, setIsCreatingAlert] = useState(false);
  const [isVoiceAgentActive, setIsVoiceAgentActive] = useState(false);
  
  // Feature 18: voice mode selection
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('scribe');
  const [showModeSelector, setShowModeSelector] = useState(false);
  
  // Feature 19: call hospital banner
  const [callBanner, setCallBanner] = useState<{ show: boolean; reason?: string }>({ show: false });

  const [transcript, setTranscript] = useState("");
  const [agentResponse, setAgentResponse] = useState("Standing by. Describe the patient's condition...");
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const emergencyTypeOptions = Object.values(EmergencyType);
  
  const TREATMENT_OPTIONS = ['Oxygen', 'IV Access', 'CPR', 'Aspirin', 'Epinephrine', 'Nitroglycerin', 'Glucose', 'Morphine', 'Atropine'];

  const [formData, setFormData] = useState<Partial<PreArrivalAlert>>({
    patientName: "",
    patientAge: "",
    severity: CaseSeverity.STABLE,
    type: EmergencyType.CARDIAC,
    eta: 8,
    vitals: [{ heartRate: 0, bloodPressure: "", spo2: 0, timestamp: "" }],
    treatments: [],
    notes: "",
    imageUrl: "",
    attachments: [],
    allergies: [],
    knownConditions: [],
  });

  // Feature 13: chip input state
  const [allergyInput, setAllergyInput] = useState('');
  const [conditionInput, setConditionInput] = useState('');

  // Feature 14: confidence tracking per field
  const [fieldConfidence, setFieldConfidence] = useState<Record<string, { source: 'voice' | 'manual'; confidence: 'confirmed' | 'inferred' }>>({
  });

  // Feature 15: live ETA countdown seconds for the form
  const [formEtaSeconds, setFormEtaSeconds] = useState<number>(8 * 60);

  // Feature 26: medic alert history tab
  const [dashSubTab, setDashSubTab] = useState<'active' | 'history'>('active');

  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const formDataRef = useRef<Partial<PreArrivalAlert>>(formData);
  const agentResponseRef = useRef<string>('');
  const speechRecognitionRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  useEffect(() => {
    agentResponseRef.current = agentResponse;
  }, [agentResponse]);

  useEffect(() => {
    return () => {
      stopLiveSession();
    };
  }, []);

  useEffect(() => {
    if (!lastCreatedAlertId) return;
    const t = setTimeout(() => setLastCreatedAlertId(null), 8000);
    return () => clearTimeout(t);
  }, [lastCreatedAlertId]);

  const handleManualInput = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Feature 14: manual edit clears inferred confidence
    setFieldConfidence(prev => ({ ...prev, [field]: { source: 'manual', confidence: 'confirmed' } }));
  };

  const handleVitalsManualInput = (field: 'heartRate' | 'bloodPressure' | 'spo2', value: string) => {
    setFormData(prev => {
      const prevVitals = prev.vitals ?? [];
      const currentVital = prevVitals.length > 0 ? prevVitals[prevVitals.length - 1] : { heartRate: 0, bloodPressure: "", spo2: 0, timestamp: "" };
      let nextValue: number | string = value;

      if (field !== 'bloodPressure') {
        const parsed = Number(value);
        nextValue = Number.isNaN(parsed) ? 0 : parsed;
      }

      const newEntry: Vitals = {
        ...currentVital,
        [field]: nextValue,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        capturedAt: Date.now(),
      };

      return {
        ...prev,
        vitals: [...prevVitals, newEntry],
      };
    });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        handleManualInput('imageUrl', reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const readFileAsDataUrl = (file: File): Promise<string> => (
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    })
  );

  const handleDocumentSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const nextAttachments = await Promise.all(files.map(async (file) => ({
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      dataUrl: await readFileAsDataUrl(file),
      uploadedAt: new Date().toISOString(),
    } satisfies AlertAttachment)));

    setFormData(prev => ({
      ...prev,
      attachments: [...(prev.attachments ?? []), ...nextAttachments],
    }));

    if (documentInputRef.current) {
      documentInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      attachments: (prev.attachments ?? []).filter((_, i) => i !== index),
    }));
  };

  const startLiveSession = async () => {
    // 1. Instant UI feedback so user always sees something when they click
    setIsVoiceAgentActive(true);
    setIsLiveConnected(false);
    setTranscript("");
    setAgentResponse("Initializing Voice Link...");

    try {
      // 2. API key check (Vite: .env or .env.local with VITE_API_KEY=your_key)
      const apiKey = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_KEY);

      if (!apiKey) {
        setAgentResponse("API key missing. Add VITE_API_KEY=your_key to a .env file in the project root and restart the dev server.");
        return;
      }
      // 3. Browser-compliant Audio Initialization
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      // Explicitly resume in case browser policy suspended it
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
      if (outputAudioContextRef.current.state === 'suspended') await outputAudioContextRef.current.resume();

      setAgentResponse("Requesting Microphone...");
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

      setAgentResponse("Connecting to Command Center...");
      const ai = new GoogleGenAI({ apiKey });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: async () => {
            setIsLiveConnected(true);
            setAgentResponse("Agent Ready. Describe the case...");

            // Live transcription of user speech via Web Speech API (browser)
            const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (SpeechRecognitionAPI) {
              try {
                const recognition = new SpeechRecognitionAPI();
                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = 'en-US';
                recognition.onresult = (event: any) => {
                  let final = '';
                  for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcriptPart = event.results[i][0].transcript;
                    if (event.results[i].isFinal) final += transcriptPart;
                  }
                  if (final) setTranscript(prev => (prev + ' ' + final).trim());
                };
                recognition.onerror = () => {};
                recognition.start();
                speechRecognitionRef.current = recognition;
              } catch (_) {}
            }

            // AudioWorkletNode — replaces deprecated createScriptProcessor
            const workletUrl = new URL('../services/pcmWorklet.ts', import.meta.url).href;
            await audioContextRef.current!.audioWorklet.addModule(workletUrl);
            const source = audioContextRef.current!.createMediaStreamSource(streamRef.current!);
            const workletNode = new AudioWorkletNode(audioContextRef.current!, 'pcm-processor');
            
            workletNode.port.onmessage = (event) => {
              const int16Buffer = event.data as ArrayBuffer;
              const pcmBlob = {
                data: encodePCM(new Uint8Array(int16Buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromise.then(session => {
                if (session) session.sendRealtimeInput({ media: pcmBlob });
              }).catch(() => {});
            };
            
            source.connect(workletNode);
            workletNode.connect(audioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const sc = message.serverContent;
            const base64Audio = sc?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioBuffer(decodePCM(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
              source.onended = () => sourcesRef.current.delete(source);
            }

            if (sc?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }

            // --- Your speech (live): user input transcription sent to the agent ---
            const msgAny = message as Record<string, unknown>;
            const scAny = sc as Record<string, unknown> | undefined;
            const inputTrans =
              (scAny?.inputTranscription as { text?: string; content?: string } | undefined)?.text
              ?? (scAny?.inputTranscription as { text?: string; content?: string } | undefined)?.content
              ?? (scAny?.input_transcription as { text?: string; content?: string } | undefined)?.text
              ?? (scAny?.input_transcription as { text?: string; content?: string } | undefined)?.content
              ?? (msgAny?.inputTranscription as { text?: string } | undefined)?.text
              ?? (msgAny?.input_transcription as { text?: string } | undefined)?.text;
            if (inputTrans && String(inputTrans).trim()) {
              setTranscript(prev => (prev + " " + String(inputTrans).trim()).trim());
            }

            // --- Agent response: only the agent's actual speech (outputTranscription only; do not use modelTurn text which includes reasoning) ---
            const outputTrans =
              (scAny?.outputTranscription as { text?: string; content?: string } | undefined)?.text
              ?? (scAny?.outputTranscription as { text?: string; content?: string } | undefined)?.content
              ?? (scAny?.output_transcription as { text?: string; content?: string } | undefined)?.text
              ?? (scAny?.output_transcription as { text?: string; content?: string } | undefined)?.content
              ?? (msgAny?.outputTranscription as { text?: string } | undefined)?.text
              ?? (msgAny?.output_transcription as { text?: string } | undefined)?.text;
            if (outputTrans && String(outputTrans).trim()) {
              setAgentResponse(String(outputTrans).trim());
              agentResponseRef.current = String(outputTrans).trim();
            }

            const functionCalls = message.toolCall?.functionCalls ?? [];
            for (const fc of functionCalls) {
                if (fc.name === 'update_form') {
                  const args = fc.args as any;
                  setFormData(prev => {
                    const prevVitals = prev.vitals ?? [];
                    const hasVitalsUpdate = args.heartRate || args.bloodPressure || args.spo2;
                    let nextVitals = prevVitals;

                    if (hasVitalsUpdate) {
                      const base = prevVitals.length > 0 ? prevVitals[prevVitals.length - 1] : { heartRate: 0, bloodPressure: "", spo2: 0, timestamp: "" };
                      const newEntry: Vitals = {
                        ...base,
                        ...(args.heartRate ? { heartRate: Number(args.heartRate) } : {}),
                        ...(args.bloodPressure ? { bloodPressure: String(args.bloodPressure) } : {}),
                        ...(args.spo2 ? { spo2: Number(args.spo2) } : {}),
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        capturedAt: Date.now(),
                      };
                      nextVitals = [...prevVitals, newEntry];
                    }

                    const next = {
                      ...prev,
                      patientName: args.patientName || prev.patientName,
                      patientAge: args.patientAge || prev.patientAge,
                      severity: args.severity ? (args.severity as CaseSeverity) : prev.severity,
                      type: args.emergencyType ? (args.emergencyType as EmergencyType) : prev.type,
                      eta: args.eta != null ? Number(args.eta) : prev.eta,
                      notes: args.notes || prev.notes,
                      treatments: args.treatments || prev.treatments,
                      vitals: nextVitals,
                      // Feature 13: allergies and conditions from AI
                      allergies: args.allergies ? [...(prev.allergies || []), ...args.allergies.filter((a: string) => !(prev.allergies || []).includes(a))] : prev.allergies,
                      knownConditions: args.knownConditions ? [...(prev.knownConditions || []), ...args.knownConditions.filter((c: string) => !(prev.knownConditions || []).includes(c))] : prev.knownConditions,
                    };
                    formDataRef.current = next;
                    return next;
                  });

                  // Feature 14: mark AI-set fields as voice/inferred
                  const aiFields = Object.keys(args).filter(k => args[k] != null);
                  setFieldConfidence(prev => {
                    const next = { ...prev };
                    for (const f of aiFields) {
                      next[f] = { source: 'voice', confidence: 'inferred' };
                    }
                    return next;
                  });

                  sessionPromise.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{ id: fc.id, name: fc.name, response: { result: "ok" } }]
                    });
                  });
                } else if (fc.name === 'transmit_alert') {
                  sessionPromise.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{ id: fc.id, name: fc.name, response: { result: "transmitting" } }]
                    });
                    setTimeout(transmitAlert, 500); 
                  });
                } else if (fc.name === 'call_hospital') {
                  // Feature 19: call hospital
                  const args = fc.args as any;
                  setCallBanner({ show: true, reason: args?.reason || 'pre-alert' });
                  window.open(`tel:${HOSPITAL_CONFIG.phone}`);
                  // Auto-dismiss banner after 8 seconds
                  setTimeout(() => setCallBanner({ show: false }), 8000);
                  sessionPromise.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{ id: fc.id, name: fc.name, response: { result: "calling" } }]
                    });
                  });
                }
              }
          },
          onerror: (e) => {
            console.error("Live API Error:", e);
            setAgentResponse("Connection Interrupted. Attempting to reconnect...");
          },
          onclose: () => {
            setIsLiveConnected(false);
            // Feature 17: On disconnect, serialize form state for recovery context
            const current = formDataRef.current;
            const summary = [
              current.patientName ? `Patient: ${current.patientName}` : null,
              current.patientAge ? `Age: ${current.patientAge}` : null,
              current.severity ? `Severity: ${current.severity}` : null,
              current.type ? `Type: ${current.type}` : null,
              current.eta ? `ETA: ${current.eta} min` : null,
              (current.vitals && current.vitals.length > 0) ? `Vitals captured: ${current.vitals.length} readings` : null,
              (current.treatments && current.treatments.length > 0) ? `Treatments: ${current.treatments.join(', ')}` : null,
              current.notes ? `Notes: ${current.notes}` : null,
            ].filter(Boolean).join(' | ');
            if (summary) {
              setAgentResponse(`Disconnected. Reconnecting with context: ${summary}`);
            }
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: { parts: [{ text: getSystemInstruction(voiceMode) }] },
          tools: SCRIBE_TOOLS as any,
          // Request transcription in messages (supported by Live API; types may not include these)
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        } as any
      });
      
      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error("Voice Initialization Failed", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      setAgentResponse(`Failed to start: ${msg}. Check mic permissions and API key.`);
    }
  };

  const stopLiveSession = () => {
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch (_) {}
      speechRecognitionRef.current = null;
    }
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch(e){}
      sessionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
    setIsVoiceAgentActive(false);
  };

  const transmitAlert = () => {
    const current = formDataRef.current;
    const finalData: PreArrivalAlert = {
      id: Math.random().toString(36).substr(2, 9),
      patientName: current.patientName || "Unknown",
      patientAge: current.patientAge || "Unknown",
      severity: (current.severity as CaseSeverity) || CaseSeverity.STABLE,
      type: (current.type as EmergencyType) || EmergencyType.OTHER,
      eta: current.eta ?? 10,
      vitals: Array.isArray(current.vitals) && current.vitals.length > 0 ? (current.vitals as Vitals[]) : [],
      treatments: Array.isArray(current.treatments) ? current.treatments : [],
      notes: current.notes || "",
      medicId: medic.id,
      ambulanceUnit: medic.unit,
      timestamp: new Date().toISOString(),
      status: 'Incoming',
      imageUrl: current.imageUrl,
      attachments: Array.isArray(current.attachments) ? current.attachments : []
    };
    onNewAlert(finalData);
    setLastCreatedAlertId(finalData.id);
    setToast("Alert transmitted successfully. It is now visible in your Field Alert History.");
    setTimeout(() => setToast(null), 5000);
    setIsCreatingAlert(false);
    setViewMode('DASH');
    stopLiveSession();
    resetForm();
  };

  const resetForm = () => {
    const empty = {
      patientName: "",
      patientAge: "",
      severity: CaseSeverity.STABLE,
      type: EmergencyType.CARDIAC,
      eta: 8,
      vitals: [{ heartRate: 0, bloodPressure: "", spo2: 0, timestamp: "" }],
      treatments: [],
      notes: "",
      imageUrl: "",
      attachments: [],
      allergies: [],
      knownConditions: [],
    };
    formDataRef.current = empty;
    setFormData(empty);
    setTranscript("");
    setAgentResponse("Standing by. Describe the patient's condition...");
    setFieldConfidence({});
    setFormEtaSeconds(8 * 60);
    setAllergyInput('');
    setConditionInput('');
  };

  const selectedAlert: PreArrivalAlert | null = selectedAlertId ? (alerts.find(a => a.id === selectedAlertId) ?? null) : null;

  if (viewMode === 'ALERT_DETAIL' && selectedAlert) {
    return (
      <div className="bg-slate-50 min-h-[calc(100vh-64px)] pb-20">
        <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3 sticky top-0 z-50 shadow-sm">
          <button onClick={() => { setViewMode('DASH'); setSelectedAlertId(null); }} className="p-1">
            <ChevronLeft className="w-6 h-6 text-slate-600" />
          </button>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight flex-1">Alert Details</h1>
          <button
            onClick={() => { setFormData(selectedAlert); setViewMode('ALERT_EDIT'); }}
            className="text-sm font-bold text-blue-600 hover:text-blue-700"
          >
            Edit
          </button>
        </div>
        <div className="p-5 max-w-2xl mx-auto space-y-6">
          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <span className={`text-[10px] uppercase font-black px-4 py-1.5 rounded-full border ${
                selectedAlert.severity === CaseSeverity.CRITICAL ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
              }`}>
                {selectedAlert.severity} · {selectedAlert.status}
              </span>
              <span className="text-[10px] font-black text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> {new Date(selectedAlert.timestamp).toLocaleString()}
              </span>
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">{selectedAlert.patientName}, {selectedAlert.patientAge}</h2>
            <p className="text-slate-500 font-medium mb-4">{selectedAlert.type} Emergency · ETA {selectedAlert.eta} min</p>
            <div className="grid grid-cols-3 gap-4 mb-4">
              {selectedAlert.vitals && selectedAlert.vitals.length > 0 && (() => {
                const latestV = selectedAlert.vitals[selectedAlert.vitals.length - 1];
                return (
                <>
                  <div className="bg-slate-50 p-4 rounded-xl text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">HR</p>
                    <p className="text-xl font-black text-slate-800">{latestV.heartRate}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">BP</p>
                    <p className="text-xl font-black text-slate-800">{latestV.bloodPressure}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">SpO2</p>
                    <p className="text-xl font-black text-slate-800">{latestV.spo2}%</p>
                  </div>
                </>
                );
              })()}
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedAlert.treatments.map((t: string, idx: number) => (
                <span key={idx} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-sm font-semibold">{t}</span>
              ))}
            </div>
            <p className="text-slate-600 text-sm">{selectedAlert.notes || "No additional notes."}</p>
            {selectedAlert.imageUrl && (
              <div className="mt-4 rounded-xl overflow-hidden border border-slate-200">
                <img src={selectedAlert.imageUrl} alt="Attachment" className="w-full h-auto max-h-64 object-contain" />
              </div>
            )}
            {(selectedAlert.attachments ?? []).length > 0 && (
              <div className="mt-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Reports & Documents</h4>
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
        </div>
      </div>
    );
  }

  if (viewMode === 'ALERT_EDIT' && selectedAlert) {
    const handleSaveEdit = () => {
      onUpdateAlert(selectedAlert.id, {
        patientName: formData.patientName ?? selectedAlert.patientName,
        patientAge: formData.patientAge ?? selectedAlert.patientAge,
        severity: (formData.severity as CaseSeverity) ?? selectedAlert.severity,
        type: (formData.type as EmergencyType) ?? selectedAlert.type,
        eta: formData.eta ?? selectedAlert.eta,
        vitals: (formData.vitals as Vitals[]) ?? selectedAlert.vitals,
        treatments: formData.treatments ?? selectedAlert.treatments,
        notes: formData.notes ?? selectedAlert.notes,
        imageUrl: formData.imageUrl ?? selectedAlert.imageUrl,
        attachments: formData.attachments ?? selectedAlert.attachments,
      });
      setToast("Alert updated.");
      setTimeout(() => setToast(null), 3000);
      setViewMode('DASH');
      setSelectedAlertId(null);
      resetForm();
    };
    return (
      <div className="bg-[#f8fafc] min-h-screen pb-24">
        <div className="bg-white px-4 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 z-50 shadow-sm">
          <button onClick={() => { setViewMode('ALERT_DETAIL'); }} className="p-1">
            <ChevronLeft className="w-6 h-6 text-slate-600" />
          </button>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight">Edit Alert</h1>
          <button onClick={handleSaveEdit} className="text-sm font-bold text-blue-600 hover:text-blue-700">Save</button>
        </div>
        <div className="p-4 space-y-6 max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-4">Patient</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Full Name</label>
                <input type="text" value={formData.patientName || ""} onChange={e => handleManualInput('patientName', e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Age</label>
                <input type="text" value={formData.patientAge || ""} onChange={e => handleManualInput('patientAge', e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-4">Triage</h3>
            <div className="grid grid-cols-3 gap-3">
              {[CaseSeverity.CRITICAL, CaseSeverity.SERIOUS, CaseSeverity.STABLE].map(s => (
                <button key={s} onClick={() => handleManualInput('severity', s)} className={`py-4 rounded-2xl border-2 font-black text-[10px] uppercase ${formData.severity === s ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-white border-slate-100 text-slate-400'}`}>{s}</button>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-4">Vitals</h3>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="text-[10px] font-black text-slate-400 uppercase block mb-1">HR</label><input type="number" value={(formData.vitals && formData.vitals.length > 0) ? formData.vitals[formData.vitals.length - 1].heartRate : ""} onChange={e => handleVitalsManualInput('heartRate', e.target.value)} className="w-full bg-slate-50 border p-2 rounded-xl" /></div>
              <div><label className="text-[10px] font-black text-slate-400 uppercase block mb-1">BP</label><input type="text" value={(formData.vitals && formData.vitals.length > 0) ? formData.vitals[formData.vitals.length - 1].bloodPressure : ""} onChange={e => handleVitalsManualInput('bloodPressure', e.target.value)} className="w-full bg-slate-50 border p-2 rounded-xl" /></div>
              <div><label className="text-[10px] font-black text-slate-400 uppercase block mb-1">SpO2</label><input type="number" value={(formData.vitals && formData.vitals.length > 0) ? formData.vitals[formData.vitals.length - 1].spo2 : ""} onChange={e => handleVitalsManualInput('spo2', e.target.value)} className="w-full bg-slate-50 border p-2 rounded-xl" /></div>
            </div>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-4">ETA (min)</h3>
            <input type="number" value={formData.eta ?? ""} onChange={e => handleManualInput('eta', Number(e.target.value) || 0)} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl" />
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-4">Notes</h3>
            <textarea value={formData.notes || ""} onChange={e => handleManualInput('notes', e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl min-h-[80px]" />
          </div>
        </div>
        {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-medium shadow-lg z-50">{toast}</div>}
      </div>
    );
  }

  if (isVoiceAgentActive) {
    return (
      <div className="fixed inset-0 bg-[#0a0f18] z-[100] flex flex-col animate-in fade-in duration-300 overflow-hidden">
        <div className="px-6 py-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${isLiveConnected ? 'bg-red-500 animate-pulse' : 'bg-slate-600'}`}></div>
            <span className="text-[11px] font-black text-white/50 uppercase tracking-[0.2em]">
              {isLiveConnected ? 'REC LIVE' : 'CONNECTING'}
            </span>
            <h2 className="text-white font-bold text-sm tracking-tight ml-4">Pre-Arrival Scribe</h2>
            {/* Feature 18: mode badge */}
            <span className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 ml-2">
              {voiceMode}
            </span>
          </div>
          <button onClick={stopLiveSession} className="text-white/50 text-xs font-bold uppercase tracking-widest hover:text-white transition-colors flex items-center gap-2">
            <X className="w-4 h-4" /> Cancel
          </button>
        </div>

        {/* Feature 19: Call Hospital Banner */}
        {callBanner.show && (
          <div className="mx-6 mb-4 bg-emerald-500/20 border border-emerald-400/30 rounded-2xl px-5 py-4 flex items-center justify-between animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-emerald-400 animate-pulse" />
              <div>
                <p className="text-emerald-300 text-sm font-bold">📞 Connecting to {HOSPITAL_CONFIG.name}…</p>
                <p className="text-emerald-400/60 text-xs">Reason: {callBanner.reason || 'pre-alert'}</p>
              </div>
            </div>
            <button onClick={() => setCallBanner({ show: false })} className="text-emerald-400/60 hover:text-white text-xs font-bold uppercase tracking-widest">
              Cancel
            </button>
          </div>
        )}

        <div className="px-6 mb-6">
           <div className="text-[11px] font-black text-blue-400 uppercase tracking-widest mb-3 flex items-center gap-2">
             <div className="w-3 h-[2px] bg-blue-400"></div> LISTENING / YOUR REPORT
           </div>
           <div className="bg-white/5 rounded-3xl p-6 border border-white/10 shadow-2xl min-h-[140px] overflow-y-auto">
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5">Your speech (live) — transcription of what you say to the agent</p>
                  <p className="text-white/90 text-base font-medium leading-relaxed min-h-[1.5em]">
                    {transcript ? (
                      <span>"{transcript}"</span>
                    ) : (
                      <span className="text-white/50 italic">Listening… speak to report the case. Your words will appear here as you talk.</span>
                    )}
                    {isLiveConnected && <span className="inline-block w-1.5 h-5 bg-blue-500 ml-1 animate-pulse align-middle rounded-sm" />}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-blue-400/80 uppercase tracking-widest mb-1.5">Agent response — transcription of what the agent says back to you</p>
                  <p className="text-white/80 text-sm leading-relaxed min-h-[1.5em]">{agentResponse}</p>
                </div>
              </div>
           </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center relative">
           <div className="absolute w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-[100px] animate-pulse"></div>
           <style>{`
             @keyframes waveformPulse {
               0%, 100% { transform: scaleY(0.15); }
               50% { transform: scaleY(1); }
             }
           `}</style>
           <div className="flex items-center gap-2 mb-8 h-32">
              {[40, 70, 55, 90, 45, 100, 60, 85, 50, 75, 65, 80].map((h, i) => (
                <div key={i} className="w-2 bg-blue-500 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                     style={{
                       height: `${h}px`,
                       opacity: isLiveConnected ? 1 : 0.2,
                       transformOrigin: 'center',
                       animation: isLiveConnected ? `waveformPulse ${1.2 + (i % 4) * 0.3}s ease-in-out ${i * 0.1}s infinite` : 'none',
                       transform: isLiveConnected ? undefined : 'scaleY(0.15)',
                     }}></div>
              ))}
           </div>
           <div className="text-center">
              <p className="text-blue-500 font-black text-[11px] uppercase tracking-[0.4em] mb-2">VOICE ASSISTANT</p>
              <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest">Low Latency Pulse Mode</p>
           </div>
        </div>

        <div className="px-6 pb-8 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-5 relative group">
               <div className="absolute top-4 right-4 text-emerald-500"><CheckCircle className="w-4 h-4" /></div>
               <p className="text-[10px] font-black text-white/30 uppercase mb-3 tracking-widest">PATIENT AGE</p>
               <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-white/20" />
                  <p className="text-3xl font-black text-white">{formData.patientAge || '---'}</p>
               </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-3xl p-5 relative group">
               <div className="absolute top-4 right-4 text-blue-500"><Activity className="w-4 h-4" /></div>
               <p className="text-[10px] font-black text-white/30 uppercase mb-3 tracking-widest">BP (MMHG)</p>
               <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-white/20" />
                  <p className="text-3xl font-black text-white">{(formData.vitals && formData.vitals.length > 0) ? formData.vitals[formData.vitals.length - 1].bloodPressure || '---' : '---'}</p>
               </div>
            </div>
          </div>

          <div className="space-y-4 pt-4">
             <button 
              onClick={stopLiveSession}
              className="w-full bg-white text-slate-900 font-black py-6 rounded-[32px] shadow-xl flex items-center justify-center gap-4 active:scale-95 transition-all text-sm uppercase tracking-widest"
             >
                <Square className="w-5 h-5 fill-slate-900" /> Stop & Review Form
             </button>
          </div>
        </div>
      </div>
    );
  }

  if (isCreatingAlert) {
    return (
      <div className="bg-[#f8fafc] min-h-screen pb-40">
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleImageSelect} 
          accept="image/*" 
          className="hidden" 
        />
        <input
          type="file"
          ref={documentInputRef}
          onChange={e => { void handleDocumentSelect(e); }}
          accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          multiple
          className="hidden"
        />
        <div className="bg-white px-4 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 z-50 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => { setViewMode('DASH'); setIsCreatingAlert(false); }} className="p-1">
              <ChevronLeft className="w-6 h-6 text-slate-600" />
            </button>
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">Create Pre-Arrival Alert</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-red-50 text-red-500 text-[10px] font-black px-3 py-1.5 rounded-full border border-red-100 flex items-center gap-1.5">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              LIVE EMR
            </span>
          </div>
        </div>

        <div className="p-4 space-y-6 max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-6">
              <User className="w-5 h-5 text-blue-500" />
              <h3 className="font-bold text-slate-800">Patient Identity</h3>
            </div>
            <div className="space-y-4">
              <div className={`relative ${fieldConfidence.patientName?.confidence === 'inferred' ? 'border-l-4 border-amber-400 pl-3' : ''}`}>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1 flex items-center gap-1">
                  Full Name
                  {fieldConfidence.patientName?.confidence === 'inferred' && (
                    <span className="text-amber-500 cursor-help" title="Set by AI — verify before transmitting">
                      <AlertOctagon className="w-3 h-3 inline" />
                    </span>
                  )}
                </label>
                <input 
                  type="text" 
                  value={formData.patientName || ""}
                  onChange={e => handleManualInput('patientName', e.target.value)}
                  placeholder="Full Name"
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-slate-800 font-medium"
                />
              </div>
              <div className="flex gap-4">
                <div className={`flex-1 ${fieldConfidence.patientAge?.confidence === 'inferred' ? 'border-l-4 border-amber-400 pl-3' : ''}`}>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1 flex items-center gap-1">
                    Age
                    {fieldConfidence.patientAge?.confidence === 'inferred' && (
                      <span className="text-amber-500 cursor-help" title="Set by AI — verify before transmitting">
                        <AlertOctagon className="w-3 h-3 inline" />
                      </span>
                    )}
                  </label>
                  <input 
                    type="text" 
                    value={formData.patientAge || ""}
                    onChange={e => handleManualInput('patientAge', e.target.value)}
                    placeholder="Age"
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl"
                  />
                </div>
                <div className="flex bg-slate-100 rounded-xl p-1 flex-1">
                  <button className="flex-1 text-[10px] font-black bg-white shadow-sm rounded-lg py-2">Yrs</button>
                  <button className="flex-1 text-[10px] font-black text-slate-400">Mos</button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-6">
              <Shield className="w-5 h-5 text-blue-500" />
              <h3 className="font-bold text-slate-800">Triage Classification</h3>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[CaseSeverity.CRITICAL, CaseSeverity.SERIOUS, CaseSeverity.STABLE].map(s => (
                <button 
                  key={s}
                  onClick={() => handleManualInput('severity', s)}
                  className={`flex flex-col items-center justify-center py-5 rounded-2xl border-2 transition-all ${formData.severity === s ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-white border-slate-100 text-slate-300'}`}
                >
                  {s === 'Critical' ? <AlertTriangle className="w-6 h-6 mb-1" /> : s === 'Serious' ? <AlertCircle className="w-6 h-6 mb-1" /> : <CheckCircle className="w-6 h-6 mb-1" />}
                  <span className="text-[10px] font-black uppercase">{s}</span>
                </button>
              ))}
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Emergency Type</label>
              <div className="flex flex-wrap gap-2">
                {emergencyTypeOptions.map(type => (
                  <button
                    key={type}
                    onClick={() => handleManualInput('type', type)}
                    className={`px-4 py-2.5 rounded-full text-xs font-bold border-2 transition-all ${
                      formData.type === type
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/25'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-500'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-6">
              <Activity className="w-5 h-5 text-blue-500" />
              <h3 className="font-bold text-slate-800">Vital Signs</h3>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {(() => {
                const lv = (formData.vitals && formData.vitals.length > 0) ? formData.vitals[formData.vitals.length - 1] : null;
                return (
                  <>
                    <div className="bg-slate-50 p-4 rounded-xl text-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">HR</p>
                      <p className="text-2xl font-black text-slate-800">{lv?.heartRate || '---'}</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl text-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">BP</p>
                      <p className="text-2xl font-black text-slate-800">{lv?.bloodPressure || '---'}</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl text-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">SpO2</p>
                      <p className="text-2xl font-black text-slate-800">{lv?.spo2 ? lv.spo2 + '%' : '---'}</p>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">HR</label>
                <input
                  type="number"
                  value={(formData.vitals && formData.vitals.length > 0) ? formData.vitals[formData.vitals.length - 1].heartRate : ""}
                  onChange={e => handleVitalsManualInput('heartRate', e.target.value)}
                  placeholder="BPM"
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">BP</label>
                <input
                  type="text"
                  value={(formData.vitals && formData.vitals.length > 0) ? formData.vitals[formData.vitals.length - 1].bloodPressure : ""}
                  onChange={e => handleVitalsManualInput('bloodPressure', e.target.value)}
                  placeholder="120/80"
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">SpO2</label>
                <input
                  type="number"
                  value={(formData.vitals && formData.vitals.length > 0) ? formData.vitals[formData.vitals.length - 1].spo2 : ""}
                  onChange={e => handleVitalsManualInput('spo2', e.target.value)}
                  placeholder="%"
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Feature 12: Treatment Chip Grid */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-emerald-500" />
                <h3 className="font-bold text-slate-800">Treatments</h3>
              </div>
              {(formData.treatments?.length || 0) > 0 && (
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                  {formData.treatments?.length} active
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {TREATMENT_OPTIONS.map(t => {
                const isActive = (formData.treatments || []).includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({
                        ...prev,
                        treatments: isActive
                          ? (prev.treatments || []).filter(x => x !== t)
                          : [...(prev.treatments || []), t],
                      }));
                    }}
                    className={`px-4 py-2 rounded-full text-xs font-bold border-2 transition-all ${
                      isActive
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300'
                    }`}
                  >
                    {isActive && <Check className="w-3 h-3 inline mr-1" />}{t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Feature 13: Allergies Chip Input */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="font-bold text-slate-800">Allergies</h3>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {(formData.allergies || []).map((a, idx) => (
                <span key={idx} className="flex items-center gap-1 bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-sm font-semibold border border-amber-200">
                  {a}
                  <button type="button" onClick={() => setFormData(prev => ({ ...prev, allergies: (prev.allergies || []).filter((_, i) => i !== idx) }))} className="ml-1 text-amber-400 hover:text-amber-600">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={allergyInput}
              onChange={e => setAllergyInput(e.target.value)}
              onKeyDown={e => {
                if ((e.key === 'Enter' || e.key === ',') && allergyInput.trim()) {
                  e.preventDefault();
                  const val = allergyInput.trim().replace(/,$/,'');
                  if (val && !(formData.allergies || []).includes(val)) {
                    setFormData(prev => ({ ...prev, allergies: [...(prev.allergies || []), val] }));
                  }
                  setAllergyInput('');
                }
              }}
              placeholder="Type allergy and press Enter..."
              className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm"
            />
          </div>

          {/* Feature 13: Known Conditions Chip Input */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-5 h-5 text-purple-500" />
              <h3 className="font-bold text-slate-800">Known Conditions</h3>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {(formData.knownConditions || []).map((c, idx) => (
                <span key={idx} className="flex items-center gap-1 bg-purple-50 text-purple-700 px-3 py-1 rounded-full text-sm font-semibold border border-purple-200">
                  {c}
                  <button type="button" onClick={() => setFormData(prev => ({ ...prev, knownConditions: (prev.knownConditions || []).filter((_, i) => i !== idx) }))} className="ml-1 text-purple-400 hover:text-purple-600">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={conditionInput}
              onChange={e => setConditionInput(e.target.value)}
              onKeyDown={e => {
                if ((e.key === 'Enter' || e.key === ',') && conditionInput.trim()) {
                  e.preventDefault();
                  const val = conditionInput.trim().replace(/,$/,'');
                  if (val && !(formData.knownConditions || []).includes(val)) {
                    setFormData(prev => ({ ...prev, knownConditions: [...(prev.knownConditions || []), val] }));
                  }
                  setConditionInput('');
                }
              }}
              placeholder="Type condition and press Enter..."
              className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm"
            />
          </div>

          {/* Feature 15: Live ETA Countdown */}
          <div className={`bg-[#05090f] rounded-3xl p-8 shadow-2xl border border-blue-900/30 flex flex-col items-center text-white relative overflow-hidden ${formEtaSeconds <= 120 ? 'ring-2 ring-red-500/50' : ''}`}>
            <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600"></div>
            <Clock className="w-8 h-8 text-blue-500 mb-3" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">ETA TO {HOSPITAL_CONFIG.name.toUpperCase()}</p>
            <h2 className={`text-6xl font-black tracking-tighter mb-2 tabular-nums ${formEtaSeconds <= 120 ? 'text-red-500 animate-pulse' : ''}`}>
              {String(Math.floor(formEtaSeconds / 60)).padStart(2, '0')}:{String(formEtaSeconds % 60).padStart(2, '0')}
            </h2>
            <div className="flex items-center gap-2 text-blue-500 text-sm font-black">
              <MapPin className="w-4 h-4" /> Active Navigation
            </div>
            <div className="mt-4 flex items-center gap-3">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Set ETA (min)</label>
              <input
                type="number"
                value={formData.eta ?? 8}
                onChange={e => {
                  const mins = Number(e.target.value) || 0;
                  handleManualInput('eta', mins);
                  setFormEtaSeconds(mins * 60);
                }}
                className="w-20 bg-white/10 border border-white/20 p-2 rounded-xl text-white text-center font-bold"
                min={0}
              />
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <Clipboard className="w-5 h-5 text-blue-500" />
              <h3 className="font-bold text-slate-800">Additional Details / Description</h3>
            </div>
            <textarea
              value={formData.notes || ""}
              onChange={e => handleManualInput('notes', e.target.value)}
              placeholder="Add any additional observations, history, or scene details..."
              className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl min-h-[120px] text-slate-700"
            />
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-6">
              <ImageIcon className="w-5 h-5 text-blue-500" />
              <h3 className="font-bold text-slate-800">Supporting Data</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 group cursor-pointer hover:bg-slate-100 transition-colors"
              >
                <Camera className="w-8 h-8 mb-2 opacity-30 group-hover:opacity-50 transition-opacity" />
                <span className="text-[10px] font-black uppercase tracking-widest text-center px-4">Add ECG / Photo</span>
              </button>
              <button
                type="button"
                onClick={() => documentInputRef.current?.click()}
                className="aspect-square bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 group cursor-pointer hover:bg-slate-100 transition-colors"
              >
                <FileText className="w-8 h-8 mb-2 opacity-30 group-hover:opacity-50 transition-opacity" />
                <span className="text-[10px] font-black uppercase tracking-widest text-center px-4">Upload Report</span>
              </button>
              {formData.imageUrl && (
                <div className="aspect-square relative rounded-2xl overflow-hidden shadow-sm group border border-slate-100">
                  <img src={formData.imageUrl} alt="Uploaded Supporting Data" className="w-full h-full object-cover" />
                  <button 
                    type="button"
                    onClick={() => handleManualInput('imageUrl', "")}
                    className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            {(formData.attachments ?? []).length > 0 && (
              <div className="mt-4 space-y-2">
                {(formData.attachments ?? []).map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                      <span className="text-sm text-slate-700 truncate">{file.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(idx)}
                      className="text-xs font-bold text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Feature 18: Voice Mode Selector */}
        <div className="fixed bottom-[100px] left-0 w-full bg-white/95 backdrop-blur-sm border-t border-slate-100 px-6 py-3 z-40">
          <div className="max-w-2xl mx-auto">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Voice Agent Mode</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'scribe' as const, label: 'Scribe', desc: 'Silent form-filler' },
                { key: 'advisor' as const, label: 'Advisor', desc: 'Flags missing treatments' },
                { key: 'partner' as const, label: 'Partner', desc: 'Answers clinical Qs' },
              ]).map(m => (
                <button
                  key={m.key}
                  onClick={() => setVoiceMode(m.key)}
                  className={`p-2.5 rounded-xl text-left border-2 transition-all ${
                    voiceMode === m.key
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-100 bg-white hover:border-blue-200'
                  }`}
                >
                  <p className={`text-xs font-bold ${voiceMode === m.key ? 'text-blue-600' : 'text-slate-700'}`}>{m.label}</p>
                  <p className="text-[10px] text-slate-400">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 p-6 shadow-2xl z-40">
           <div className="max-w-2xl mx-auto flex gap-4">
              <button 
                onClick={transmitAlert}
                className="flex-[3] bg-[#e11d48] hover:bg-[#be123c] text-white font-black py-5 rounded-[24px] flex items-center justify-center gap-3 shadow-xl active:scale-[0.98] transition-all uppercase tracking-widest text-xs"
              >
                <Send className="w-5 h-5 stroke-[3]" /> Transmit Alert
              </button>
              <button 
                type="button"
                onClick={() => startLiveSession()}
                className="flex-1 bg-blue-600 text-white font-bold rounded-[24px] flex items-center justify-center hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg animate-bounce"
                title={`Start ${voiceMode} mode`}
              >
                <Mic className="w-7 h-7" />
              </button>
              <button 
                onClick={() => {
                  window.open(`tel:${HOSPITAL_CONFIG.phone}`);
                  setCallBanner({ show: true, reason: 'manual' });
                  setTimeout(() => setCallBanner({ show: false }), 8000);
                }}
                className="flex-1 bg-slate-100 text-slate-500 font-bold rounded-[24px] flex items-center justify-center hover:bg-slate-200 active:scale-[0.98] transition-all"
              >
                <Phone className="w-6 h-6" />
              </button>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-[calc(100vh-64px)] pb-20">
      <div className="grid grid-cols-2 bg-white border-b border-slate-200 sticky top-14 z-40">
        <button 
          onClick={() => setActiveTab('DASH')}
          className={`py-4 font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === 'DASH' ? 'border-blue-600 text-blue-600 bg-blue-50/10' : 'border-transparent text-slate-400'}`}
        >
          <Clipboard className="w-4 h-4" /> Operations
        </button>
        <button 
          onClick={() => setActiveTab('PROFILE')}
          className={`py-4 font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === 'PROFILE' ? 'border-blue-600 text-blue-600 bg-blue-50/10' : 'border-transparent text-slate-400'}`}
        >
          <User className="w-4 h-4" /> Profile
        </button>
      </div>

      <div className="p-5 max-w-2xl mx-auto">
        {activeTab === 'DASH' ? (
          <div className="space-y-5">
            <div className="bg-slate-900 text-white p-6 rounded-[32px] flex justify-between items-center shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-12 bg-blue-500/10 rounded-full -mr-6 -mt-6 blur-2xl group-hover:bg-blue-500/20 transition-all"></div>
              <div className="relative z-10">
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.3em] mb-1.5">Duty Status</p>
                <p className="text-2xl font-black flex items-center gap-2.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-400 pulse-red"></span>
                  {medic.dutyStatus}
                </p>
              </div>
              <div className="text-right relative z-10">
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.3em] mb-1.5">Active Unit</p>
                <p className="font-black text-xl tracking-tight text-blue-400">{medic.unit}</p>
              </div>
            </div>

            <div className="flex items-center justify-between mt-10 mb-4 px-2">
               <h2 className="text-slate-800 font-black text-[10px] uppercase tracking-[0.15em]">Field Alert History</h2>
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{alerts.length} Missions</span>
            </div>

            <div className="space-y-4">
            {/* Feature 26: Active / History sub-tabs */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setDashSubTab('active')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  dashSubTab === 'active' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200'
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setDashSubTab('history')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  dashSubTab === 'history' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                History ({alerts.filter(a => a.status === 'Arrived' || a.status === 'Handed Over').length})
              </button>
            </div>

            {dashSubTab === 'active' ? (
              <>
                {alerts.filter(a => a.status === 'Incoming').map(alert => (
                  <div key={alert.id} className={`bg-white p-6 rounded-[32px] border shadow-sm hover:shadow-xl transition-all active:scale-[0.98] ${lastCreatedAlertId === alert.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-100'}`}>
                    <div className="flex justify-between items-start mb-4">
                      <span className={`text-[10px] uppercase font-black px-4 py-1.5 rounded-full border ${
                        alert.severity === CaseSeverity.CRITICAL ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                      }`}>
                        {alert.severity} Priority
                      </span>
                      <span className="text-[10px] font-black text-slate-400 flex items-center gap-1.5">
                         <Clock className="w-3.5 h-3.5" /> {new Date(alert.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                    <div className="flex justify-between items-end mb-4">
                      <div className="space-y-1">
                        <h3 className="font-black text-slate-900 text-xl leading-none">{alert.patientName}, {alert.patientAge}</h3>
                        <p className="text-[11px] font-black text-slate-400 flex items-center gap-1.5 tracking-tight uppercase">
                          <MapPin className="w-3.5 h-3.5 text-blue-500" /> {HOSPITAL_CONFIG.name.toUpperCase().replace('HOSPITAL', '').trim()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Live ETA</p>
                        <p className={`text-4xl font-black tracking-tighter tabular-nums ${isImminent(alert.id) ? 'text-red-600 animate-pulse' : 'text-blue-600'}`}>{formatEta(alert.id)}<span className="text-[10px] ml-0.5 uppercase tracking-widest font-black opacity-40">ETA</span></p>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                      <button onClick={() => { setSelectedAlertId(alert.id); setViewMode('ALERT_DETAIL'); }} className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-widest transition-colors">
                        Open
                      </button>
                      <button onClick={() => { setFormData(alert); setSelectedAlertId(alert.id); setViewMode('ALERT_EDIT'); }} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-widest transition-colors">
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
                {alerts.filter(a => a.status === 'Incoming').length === 0 && (
                  <div className="text-center py-20 bg-white rounded-[40px] border border-dashed border-slate-200">
                    <Clipboard className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-bold">No active missions</p>
                  </div>
                )}
              </>
            ) : (
              <>
                {alerts.filter(a => a.status === 'Arrived' || a.status === 'Handed Over').sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(alert => (
                  <div key={alert.id} className="bg-slate-50 p-6 rounded-[32px] border border-slate-200 opacity-80">
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-[10px] uppercase font-black px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                        {alert.status}
                      </span>
                      <span className="text-[10px] font-black text-slate-400 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> {new Date(alert.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                    <div className="mb-4">
                      <h3 className="font-black text-slate-600 text-lg leading-none">{alert.patientName}, {alert.patientAge}</h3>
                      <p className="text-[11px] font-bold text-slate-400 mt-1">{alert.type} · {alert.severity}</p>
                    </div>
                    <div className="pt-2 border-t border-slate-200">
                      <button onClick={() => { setSelectedAlertId(alert.id); setViewMode('ALERT_DETAIL'); }} className="w-full py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-600 font-bold text-xs uppercase tracking-widest transition-colors border border-slate-200">
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
                {alerts.filter(a => a.status === 'Arrived' || a.status === 'Handed Over').length === 0 && (
                  <div className="text-center py-20 bg-white rounded-[40px] border border-dashed border-slate-200">
                    <History className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-bold">No completed cases yet.</p>
                  </div>
                )}
              </>
            )}
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="bg-white p-12 rounded-[56px] border border-slate-100 shadow-sm text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-36 bg-slate-900 z-0"></div>
              <div className="w-32 h-32 bg-white rounded-[40px] mx-auto mb-8 flex items-center justify-center border-[8px] border-[#f8fafc] shadow-2xl relative z-10">
                <User className="w-16 h-16 text-slate-200" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 relative z-10">{medic.name}</h2>
              <p className="text-blue-600 font-black text-[11px] uppercase tracking-[0.3em] relative z-10 mt-2">{medic.certification}</p>
              
              <div className="grid grid-cols-2 gap-5 mt-14">
                <div className="bg-slate-50 p-6 rounded-[32px] text-left">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Badge Number</p>
                  <p className="font-black text-slate-800 text-xl">{medic.id}</p>
                </div>
                <div className="bg-slate-50 p-6 rounded-[32px] text-left">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Voice Workflow</p>
                  <p className="font-black text-slate-800 text-xl">Live Intake</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {activeTab === 'DASH' && viewMode === 'DASH' && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 w-full px-10 flex justify-center z-40">
           <button 
            onClick={() => { setViewMode('CREATE_ALERT'); setIsCreatingAlert(true); }}
            className="w-full max-w-sm bg-blue-600 hover:bg-blue-700 text-white font-black py-7 rounded-[40px] shadow-2xl flex items-center justify-center gap-5 active:scale-95 transition-all text-xl border-4 border-white tracking-widest"
          >
            <Plus className="w-7 h-7 stroke-[3]" /> NEW FIELD ALERT
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-5 py-3 rounded-2xl text-sm font-medium shadow-xl z-50 max-w-[90vw] text-center">
          {toast}
        </div>
      )}
    </div>
  );
};

export default MedicInterface;
