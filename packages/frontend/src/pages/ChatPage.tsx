import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage, ChatMessageData } from '../components/ChatMessage';
import { VoiceInput } from '../components/VoiceInput';
import { ImageUpload } from '../components/ImageUpload';
import { sendMessage, ClassificationResult, textToSpeech } from '../services/apiClient';

let msgId = 0;
const nextId = () => `msg-${++msgId}`;

export const ChatPage: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages]);

  const playAudio = useCallback(async (messageId: string, text: string) => {
    try {
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingAudio(messageId);
      const audioBlob = await textToSpeech(text);
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setPlayingAudio(null);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setPlayingAudio(null);
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch {
      setPlayingAudio(null);
    }
  }, []);

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;

    const userMsg: ChatMessageData = { id: nextId(), role: 'user', text: msg };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await sendMessage(msg);
      const aiMsg: ChatMessageData = {
        id: nextId(),
        role: 'ai',
        text: res.text,
        confidence: res.confidence,
        citations: res.citations,
        disclaimer: res.disclaimer,
        safetyRefusal: res.safetyRefusal,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'ai', text: 'Sorry, something went wrong. Please try again.' },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleVoiceTranscript = (text: string) => {
    setInput(text);
  };

  const handleVoiceCommand = (command: string) => {
    const commandMessages: Record<string, string> = {
      check_prices: 'Show me current market prices for my crops',
      weather_forecast: 'What is the weather forecast for my area?',
      my_alerts: 'Show me my recent alerts',
    };
    const msg = commandMessages[command] || command;
    handleSend(msg);
  };

  const handleClassification = (result: ClassificationResult, _file: File, previewUrl: string) => {
    const userMsg: ChatMessageData = { id: nextId(), role: 'user', text: 'Image uploaded for disease classification', imageUrl: previewUrl };
    const aiMsg: ChatMessageData = {
      id: nextId(),
      role: 'ai',
      text: `Detected: ${result.diseaseName}`,
      confidence: result.confidence,
      classification: result,
      disclaimer: 'AI classification may not be 100% accurate. Consult an agronomist for confirmation.',
      citations: [],
    };
    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setShowImageUpload(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    maxWidth: '600px',
    margin: '0 auto',
    fontFamily: 'sans-serif',
  };

  const headerStyle: React.CSSProperties = {
    padding: '12px 16px',
    backgroundColor: '#1976d2',
    color: '#fff',
    fontWeight: 600,
    fontSize: '18px',
  };

  const messagesStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f0f0f0',
  };

  const inputBarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderTop: '1px solid #e0e0e0',
    backgroundColor: '#fff',
  };

  const textInputStyle: React.CSSProperties = {
    flex: 1,
    padding: '8px 12px',
    borderRadius: '20px',
    border: '1px solid #ccc',
    fontSize: '14px',
    outline: 'none',
  };

  const sendBtnStyle: React.CSSProperties = {
    padding: '8px 16px',
    borderRadius: '20px',
    border: 'none',
    backgroundColor: '#1976d2',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
    opacity: sending ? 0.6 : 1,
  };

  const imgBtnStyle: React.CSSProperties = {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    backgroundColor: '#fff',
    fontSize: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div style={containerStyle} data-testid="chat-page">
      <div style={headerStyle}>AI Assistant</div>

      <div style={messagesStyle} data-testid="message-list">
        {messages.map((m) => (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column' }}>
            <ChatMessage message={m} />
            {m.role === 'ai' && m.text && !m.safetyRefusal && (
              <button
                data-testid={`play-audio-${m.id}`}
                onClick={() => playAudio(m.id, m.text)}
                disabled={playingAudio === m.id}
                style={{
                  alignSelf: 'flex-start',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: '#1976d2',
                  padding: '2px 4px',
                  marginBottom: '4px',
                }}
                aria-label="Play audio response"
              >
                {playingAudio === m.id ? '⏸️ Playing...' : '🔊 Listen'}
              </button>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {showImageUpload && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid #e0e0e0' }} data-testid="image-upload-panel">
          <ImageUpload onClassification={handleClassification} />
        </div>
      )}

      <div style={inputBarStyle}>
        <button
          style={imgBtnStyle}
          onClick={() => setShowImageUpload((v) => !v)}
          data-testid="image-upload-toggle"
          aria-label="Upload image"
        >
          📷
        </button>
        <div style={{ position: 'relative' }}>
          <VoiceInput onTranscript={handleVoiceTranscript} onVoiceCommand={handleVoiceCommand} />
        </div>
        <input
          style={textInputStyle}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          data-testid="chat-input"
          disabled={sending}
        />
        <button style={sendBtnStyle} onClick={() => handleSend()} disabled={sending} data-testid="send-btn">
          Send
        </button>
      </div>
    </div>
  );
};
