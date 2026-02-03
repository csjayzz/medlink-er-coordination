
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { MedicProfile, PreArrivalAlert, DutyStatus, CaseSeverity, EmergencyType, Vitals } from '../types';
import { 
  User, Clipboard, Plus, Mic, X, Check, Activity, Clock, MapPin, Shield, Phone, Camera,
  AlertTriangle, AlertCircle, CheckCircle, ChevronLeft, Volume2, Send, Square, Image as ImageIcon
} from 'lucide-react';
import { 
  encodePCM, 
  decodePCM, 
  decodeAudioBuffer, 
  SCRIBE_TOOLS, 
  SYSTEM_INSTRUCTION 
} from '../services/geminiService';

type ViewMode = 'DASH' | 'PROFILE' | 'CREATE_ALERT' | 'VOICE_AGENT' | 'ALERT_DETAIL' | 'ALERT_EDIT';

interface MedicInterfaceProps {
  medic: MedicProfile;
  alerts: PreArrivalAlert[];
  onNewAlert: (alert: PreArrivalAlert) => void;
  onUpdateAlert: (alertId: string, updates: Partial<PreArrivalAlert>) => void;
}

const MedicInterface: React.FC<MedicInterfaceProps> = ({ medic, alerts, onNewAlert, onUpdateAlert }) => {
  const [activeTab, setActiveTab] = useState<'DASH' | 'PROFILE'>('DASH');
  const [viewMode, setViewMode] = useState<ViewMode>('DASH');
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [lastCreatedAlertId, setLastCreatedAlertId] = useState<string | null>(null);
  const [isCreatingAlert, setIsCreatingAlert] = useState(false);
  const [isVoiceAgentActive, setIsVoiceAgentActive] = useState(false);
  
  const [transcript, setTranscript] = useState("");
  const [agentResponse, setAgentResponse] = useState("Standing by. Describe the patient's condition...");
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  
  const [formData, setFormData] = useState<Partial<PreArrivalAlert>>({
    patientName: "",
    patientAge: "",
    severity: CaseSeverity.STABLE,
    type: EmergencyType.CARDIAC,
    eta: 8,
    vitals: [{ heartRate: 0, bloodPressure: "", spo2: 0, timestamp: "" }],
    treatments: ["Oxygen", "IV Access"],
    notes: "",
    imageUrl: ""
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
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
          onopen: () => {
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

            const source = audioContextRef.current!.createMediaStreamSource(streamRef.current!);
            const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob = {
                data: encodePCM(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromise.then(session => {
                if (session) session.sendRealtimeInput({ media: pcmBlob });
              }).catch(() => {});
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.destination);
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
                    const newVitals = [...(prev.vitals || [])];
                    if (newVitals.length === 0) {
                      newVitals.push({ heartRate: 0, bloodPressure: "", spo2: 0, timestamp: "" });
                    }
                    const latest = { ...newVitals[0] };
                    if (args.heartRate) latest.heartRate = Number(args.heartRate);
                    if (args.bloodPressure) latest.bloodPressure = String(args.bloodPressure);
                    if (args.spo2) latest.spo2 = Number(args.spo2);
                    latest.timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    newVitals[0] = latest;

                    const next = {
                      ...prev,
                      patientName: args.patientName || prev.patientName,
                      patientAge: args.patientAge || prev.patientAge,
                      severity: args.severity ? (args.severity as CaseSeverity) : prev.severity,
                      type: args.emergencyType ? (args.emergencyType as EmergencyType) : prev.type,
                      eta: args.eta != null ? Number(args.eta) : prev.eta,
                      notes: args.notes || prev.notes,
                      treatments: args.treatments || prev.treatments,
                      vitals: newVitals
                    };
                    formDataRef.current = next;
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
                }
              }
          },
          onerror: (e) => {
            console.error("Live API Error:", e);
            setAgentResponse("Connection Interrupted. Please check your signal.");
          },
          onclose: () => {
            setIsLiveConnected(false);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
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
      imageUrl: current.imageUrl
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
      treatments: ["Oxygen", "IV Access"],
      notes: "",
      imageUrl: ""
    };
    formDataRef.current = empty;
    setFormData(empty);
    setTranscript("");
    setAgentResponse("Standing by. Describe the patient's condition...");
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
              {selectedAlert.vitals?.[0] && (
                <>
                  <div className="bg-slate-50 p-4 rounded-xl text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">HR</p>
                    <p className="text-xl font-black text-slate-800">{selectedAlert.vitals[0].heartRate}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">BP</p>
                    <p className="text-xl font-black text-slate-800">{selectedAlert.vitals[0].bloodPressure}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">SpO2</p>
                    <p className="text-xl font-black text-slate-800">{selectedAlert.vitals[0].spo2}%</p>
                  </div>
                </>
              )}
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
              <div><label className="text-[10px] font-black text-slate-400 uppercase block mb-1">HR</label><input type="number" value={formData.vitals?.[0]?.heartRate ?? ""} onChange={e => setFormData(prev => ({ ...prev, vitals: [{ ...(prev.vitals?.[0] ?? { heartRate: 0, bloodPressure: "", spo2: 0, timestamp: "" }), heartRate: Number(e.target.value) || 0 }] }))} className="w-full bg-slate-50 border p-2 rounded-xl" /></div>
              <div><label className="text-[10px] font-black text-slate-400 uppercase block mb-1">BP</label><input type="text" value={formData.vitals?.[0]?.bloodPressure ?? ""} onChange={e => setFormData(prev => ({ ...prev, vitals: [{ ...(prev.vitals?.[0] ?? { heartRate: 0, bloodPressure: "", spo2: 0, timestamp: "" }), bloodPressure: e.target.value }] }))} className="w-full bg-slate-50 border p-2 rounded-xl" /></div>
              <div><label className="text-[10px] font-black text-slate-400 uppercase block mb-1">SpO2</label><input type="number" value={formData.vitals?.[0]?.spo2 ?? ""} onChange={e => setFormData(prev => ({ ...prev, vitals: [{ ...(prev.vitals?.[0] ?? { heartRate: 0, bloodPressure: "", spo2: 0, timestamp: "" }), spo2: Number(e.target.value) || 0 }] }))} className="w-full bg-slate-50 border p-2 rounded-xl" /></div>
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
          </div>
          <button onClick={stopLiveSession} className="text-white/50 text-xs font-bold uppercase tracking-widest hover:text-white transition-colors flex items-center gap-2">
            <X className="w-4 h-4" /> Cancel
          </button>
        </div>

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
           <div className="flex items-center gap-2 mb-8 h-32">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="w-2 bg-blue-500 rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(59,130,246,0.5)]" 
                     style={{ 
                       height: isLiveConnected ? `${20 + Math.random() * 100}px` : '10px',
                       opacity: isLiveConnected ? 1 : 0.2
                     }}></div>
              ))}
           </div>
           <div className="text-center">
              <p className="text-blue-500 font-black text-[11px] uppercase tracking-[0.4em] mb-2">AI NATIVE VOICE AGENT</p>
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
                  <p className="text-3xl font-black text-white">{formData.vitals?.[0]?.bloodPressure || '---'}</p>
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
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Full Name</label>
                <input 
                  type="text" 
                  value={formData.patientName || ""}
                  onChange={e => handleManualInput('patientName', e.target.value)}
                  placeholder="Full Name"
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-slate-800 font-medium"
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Age</label>
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
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-6">
              <Activity className="w-5 h-5 text-blue-500" />
              <h3 className="font-bold text-slate-800">Vital Signs</h3>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl text-center">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">HR</p>
                <p className="text-2xl font-black text-slate-800">{formData.vitals?.[0]?.heartRate || '---'}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl text-center">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">BP</p>
                <p className="text-2xl font-black text-slate-800">{formData.vitals?.[0]?.bloodPressure || '---'}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl text-center">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">SpO2</p>
                <p className="text-2xl font-black text-slate-800">{(formData.vitals?.[0]?.spo2) ? formData.vitals[0].spo2 + "%" : '---'}</p>
              </div>
            </div>
          </div>

          <div className="bg-[#05090f] rounded-3xl p-8 shadow-2xl border border-blue-900/30 flex flex-col items-center text-white relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600"></div>
            <Clock className="w-8 h-8 text-blue-500 mb-3" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">ETA TO ST. JUDE</p>
            <h2 className="text-6xl font-black tracking-tighter mb-2">0{formData.eta}:42</h2>
            <div className="flex items-center gap-2 text-blue-500 text-sm font-black">
              <MapPin className="w-4 h-4" /> Active Navigation
            </div>
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
              >
                <Mic className="w-7 h-7" />
              </button>
              <button className="flex-1 bg-slate-100 text-slate-500 font-bold rounded-[24px] flex items-center justify-center hover:bg-slate-200 active:scale-[0.98] transition-all">
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
              {alerts.map(alert => (
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
                        <MapPin className="w-3.5 h-3.5 text-blue-500" /> ST. JUDE ER
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Live ETA</p>
                      <p className="text-4xl font-black text-blue-600 tracking-tighter tabular-nums">{alert.eta}<span className="text-[10px] ml-0.5 uppercase tracking-widest font-black opacity-40">Min</span></p>
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
              {alerts.length === 0 && (
                <div className="text-center py-20 bg-white rounded-[40px] border border-dashed border-slate-200">
                  <Clipboard className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-400 font-bold">No missions on record</p>
                </div>
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
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Native Live AI</p>
                  <p className="font-black text-slate-800 text-xl">V2.5-ACTIVE</p>
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
