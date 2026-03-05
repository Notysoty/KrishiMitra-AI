import React, { useState, useRef, useCallback } from 'react';

interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
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
}

const VOICE_COMMANDS: Record<string, string> = {
  'check prices': 'check_prices',
  'weather forecast': 'weather_forecast',
  'my alerts': 'my_alerts',
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

export const VoiceInput: React.FC<VoiceInputProps> = ({ onTranscript, onVoiceCommand, disabled }) => {
  const [recording, setRecording] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [showFallback, setShowFallback] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const supported = getSpeechRecognition() !== null;

  const handleError = useCallback(() => {
    setRecording(false);
    setFailedAttempts((prev) => {
      const next = prev + 1;
      if (next >= 2) {
        setShowFallback(true);
      }
      return next;
    });
  }, []);

  const toggle = useCallback(() => {
    if (!supported) return;

    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }

    const SpeechRec = getSpeechRecognition()!;
    const recognition = new SpeechRec();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setFailedAttempts(0);
      setShowFallback(false);

      const command = matchVoiceCommand(transcript);
      if (command && onVoiceCommand) {
        onVoiceCommand(command);
      } else {
        onTranscript(transcript);
      }
    };

    recognition.onend = () => setRecording(false);
    recognition.onerror = handleError;

    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  }, [recording, supported, onTranscript, onVoiceCommand, handleError]);

  const dismissFallback = useCallback(() => {
    setShowFallback(false);
    setFailedAttempts(0);
  }, []);

  const buttonStyle: React.CSSProperties = {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    border: 'none',
    cursor: supported && !disabled ? 'pointer' : 'not-allowed',
    backgroundColor: recording ? '#c62828' : '#1976d2',
    color: '#fff',
    fontSize: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: !supported || disabled ? 0.5 : 1,
    position: 'relative' as const,
  };

  return (
    <div>
      <button
        data-testid="voice-input-btn"
        style={buttonStyle}
        onClick={toggle}
        disabled={!supported || disabled}
        aria-label={recording ? 'Stop recording' : 'Start voice input'}
        title={!supported ? 'Speech recognition not supported' : recording ? 'Stop recording' : 'Start voice input'}
      >
        🎤
        {recording && (
          <span
            data-testid="recording-indicator"
            style={{
              position: 'absolute',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: '#f44336',
              top: '-2px',
              right: '-2px',
            }}
          />
        )}
      </button>
      {showFallback && (
        <div data-testid="voice-fallback" style={{ marginTop: '4px', padding: '6px 10px', backgroundColor: '#fff3e0', borderRadius: '6px', fontSize: '12px', color: '#e65100' }}>
          Voice input failed. Please type your message instead.
          <button onClick={dismissFallback} style={{ marginLeft: '8px', fontSize: '11px', cursor: 'pointer', border: 'none', background: 'none', textDecoration: 'underline', color: '#e65100' }} data-testid="dismiss-fallback">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
};
