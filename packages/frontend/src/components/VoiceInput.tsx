import React, { useState, useRef, useCallback } from 'react';
import { speechToText } from '../services/apiClient';

interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionConstructor {
  new(): SpeechRecognitionInstance;
}

interface WindowWithSpeech extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

export interface VoiceInputProps {
  onTranscript: (text: string) => void;
  onVoiceCommand?: (command: string) => void;
  disabled?: boolean;
  language?: string;
}

const VOICE_COMMANDS: Record<string, string> = {
  'check prices': 'check_prices',
  'weather forecast': 'weather_forecast',
  'my alerts': 'my_alerts',
};

// BCP-47 language codes for Web Speech API
const LANG_MAP: Record<string, string> = {
  hi: 'hi-IN', mr: 'mr-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', en: 'en-IN',
};

function matchVoiceCommand(text: string): string | null {
  const lower = text.toLowerCase().trim();
  for (const [phrase, command] of Object.entries(VOICE_COMMANDS)) {
    if (lower.includes(phrase)) return command;
  }
  return null;
}

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  const w = window as WindowWithSpeech;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({ onTranscript, onVoiceCommand, disabled, language = 'en' }) => {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const failCountRef = useRef(0);
  const nativeSpeechSupported = getSpeechRecognition() !== null;

  const handleTranscript = useCallback((transcript: string) => {
    setShowFallback(false);
    const command = matchVoiceCommand(transcript);
    if (command && onVoiceCommand) {
      onVoiceCommand(command);
    } else {
      onTranscript(transcript);
    }
  }, [onTranscript, onVoiceCommand]);

  // ── MediaRecorder → AWS Transcribe (backend) ──────────────────
  const startMediaRecorder = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setProcessing(true);
        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const transcript = await speechToText(audioBlob);
          if (transcript) handleTranscript(transcript);
          else setShowFallback(true);
        } catch {
          setShowFallback(true);
        } finally {
          setProcessing(false);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setRecording(true);
    } catch {
      setShowFallback(true);
    }
  }, [handleTranscript]);

  // ── Web Speech API (browser-native) ──────────────────────────
  const startNativeSpeech = useCallback(() => {
    const SpeechRec = getSpeechRecognition()!;
    const recognition = new SpeechRec();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = LANG_MAP[language] ?? 'en-IN';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      handleTranscript(event.results[0][0].transcript);
    };
    recognition.onend = () => setRecording(false);
    recognition.onerror = () => {
      setRecording(false);
      failCountRef.current += 1;
      if (failCountRef.current >= 2) {
        setShowFallback(true);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  }, [language, handleTranscript, startMediaRecorder]);

  const toggle = useCallback(() => {
    if (recording) {
      recognitionRef.current?.stop();
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }

    if (nativeSpeechSupported) {
      startNativeSpeech();
    } else {
      startMediaRecorder();
    }
  }, [recording, nativeSpeechSupported, startNativeSpeech, startMediaRecorder]);

  const canRecord = nativeSpeechSupported || (typeof navigator !== 'undefined' && !!navigator.mediaDevices);

  return (
    <div>
      <button
        data-testid="voice-input-btn"
        className={`voice-btn ${recording ? 'recording' : processing ? 'processing' : 'idle'}`}
        onClick={toggle}
        disabled={!canRecord || disabled || processing}
        aria-label={recording ? 'Stop recording' : processing ? 'Processing...' : 'Start voice input'}
        title={!canRecord ? 'Microphone not available' : recording ? 'Stop recording' : processing ? 'Processing audio...' : 'Start voice input'}
      >
        {processing ? '⏳' : '🎤'}
        {recording && <span data-testid="recording-indicator" className="recording-dot" />}
      </button>
      {showFallback && (
        <div data-testid="voice-fallback" className="alert-box alert-warning" style={{ marginTop: '4px', fontSize: '0.75rem' }}>
          Voice input failed. Please type your message instead.
          <button onClick={() => setShowFallback(false)} className="btn btn-ghost btn-sm" style={{ marginLeft: '8px', textDecoration: 'underline' }} data-testid="dismiss-fallback">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
};
