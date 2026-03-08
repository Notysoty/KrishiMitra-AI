import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage, ChatMessageData } from '../components/ChatMessage';
import { VoiceInput } from '../components/VoiceInput';
import { ImageUpload } from '../components/ImageUpload';
import { sendMessage, ClassificationResult, textToSpeech, ConversationMessage } from '../services/apiClient';
import { useLanguage, useTranslation } from '../i18n';
import { getUser } from '../services/authClient';

interface FarmContext {
  farmName: string;
  state: string;
  district: string;
  soilType: string;
  irrigationType: string;
  crops: { cropType: string; status: string }[];
}

function loadFarmContext(): FarmContext | null {
  try {
    const raw = localStorage.getItem('krishimitra_farm_profile');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

let msgId = 0;
const nextId = () => `msg-${++msgId}`;

export const ChatPage: React.FC = () => {
  const { language } = useLanguage();
  const { t } = useTranslation();
  const user = getUser();
  const farm = loadFarmContext();
  const activeCrops = farm?.crops?.filter((c) => c.status !== 'harvested').map((c) => c.cropType) ?? [];
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages]);

  const playAudio = useCallback(async (messageId: string, text: string) => {
    try {
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
      // Build conversation history from last 10 message pairs (20 messages)
      const history: ConversationMessage[] = messages.slice(-20).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));
      const farmCtx = farm
        ? {
            farmName: farm.farmName,
            state: farm.state,
            district: farm.district,
            soilType: farm.soilType,
            irrigationType: farm.irrigationType,
            crops: activeCrops,
          }
        : undefined;
      const res = await sendMessage(msg, language, history, farmCtx, user?.name);
      const aiMsgId = nextId();
      const aiMsg: ChatMessageData = {
        id: aiMsgId,
        role: 'ai',
        text: res.text,
        confidence: res.confidence,
        citations: res.citations,
        disclaimer: res.disclaimer,
        safetyRefusal: res.safetyRefusal,
      };
      setMessages((prev) => [...prev, aiMsg]);
      // Auto-play TTS in voice mode
      if (voiceMode && res.text && !res.safetyRefusal) {
        playAudio(aiMsgId, res.text);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'ai',
          text: 'Sorry, I could not reach the assistant right now. Please check your connection and try again.',
        },
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

  return (
    <div className="chat-container" style={{ height: 'calc(100vh - 56px)' }} data-testid="chat-page">
      <div className="section-header-light">
        <span>🌾</span> {t('aiAssistant')}
      </div>

      {(farm || user?.name) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px',
          background: 'var(--primary-50)', borderBottom: '1px solid var(--primary-100)',
          fontSize: '0.78rem', color: 'var(--primary-700)', flexWrap: 'wrap',
        }}>
          <span style={{ fontWeight: 600 }}>🌾 Context:</span>
          {user?.name && user.name !== 'Farmer' && <span>{user.name}</span>}
          {farm?.state && <span>📍 {farm.district ? `${farm.district}, ` : ''}{farm.state}</span>}
          {activeCrops.length > 0 && <span>🌱 {activeCrops.join(', ')}</span>}
          {farm?.soilType && <span>🏔️ {farm.soilType} soil</span>}
          {farm?.irrigationType && <span>💧 {farm.irrigationType}</span>}
          <span style={{ marginLeft: 'auto', opacity: 0.6 }}>AI uses this context</span>
        </div>
      )}

      <div className="chat-messages" data-testid="message-list">
        {messages.length === 0 && !sending && (
          <div className="chat-welcome">
            <div className="chat-welcome-icon">🌾</div>
            <h3 className="chat-welcome-title">{t('aiAssistant')}</h3>
            <p className="chat-welcome-subtitle">Ask me anything about your crops, market prices, weather, or government schemes.</p>
            <div className="chat-suggestions">
              {[
                { icon: '🦠', text: 'My crop leaves have yellow spots. What disease is it?' },
                { icon: '📊', text: 'What are today\'s tomato prices at APMC?' },
                { icon: '🌧️', text: 'Will it rain this week in my area?' },
                { icon: '📋', text: 'Which PM-KISAN scheme am I eligible for?' },
              ].map((s) => (
                <button key={s.text} className="chat-suggestion-chip" onClick={() => handleSend(s.text)}>
                  <span>{s.icon}</span> {s.text}
                </button>
              ))}
            </div>
          </div>
        )}
        {sending && (
          <div className="chat-typing-indicator">
            <span /><span /><span />
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column' }}>
            <ChatMessage message={m} />
            {m.role === 'ai' && m.text && !m.safetyRefusal && (
              <button
                data-testid={`play-audio-${m.id}`}
                onClick={() => playAudio(m.id, m.text)}
                disabled={playingAudio === m.id}
                className="listen-btn"
                aria-label="Play audio response"
              >
                {playingAudio === m.id ? `⏸️ ${t('playing')}` : `🔊 ${t('listen')}`}
              </button>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {showImageUpload && (
        <div className="chat-upload-panel" data-testid="image-upload-panel" style={{ padding: '12px 16px', borderTop: `1px solid var(--gray-200)` }}>
          <ImageUpload onClassification={handleClassification} />
        </div>
      )}

      <div className="chat-input-bar">
        <button
          className="img-btn"
          onClick={() => setShowImageUpload((v) => !v)}
          data-testid="image-upload-toggle"
          aria-label="Upload image"
        >
          📷
        </button>
        <button
          className={`voice-btn ${voiceMode ? 'recording' : 'idle'}`}
          onClick={() => setVoiceMode((v) => !v)}
          title={voiceMode ? 'Voice mode ON — AI will speak responses' : 'Enable voice mode'}
          aria-label="Toggle voice mode"
          style={{ fontSize: '0.75rem', padding: '6px 10px', borderRadius: 'var(--radius-md)' }}
        >
          {voiceMode ? '🔊' : '🔈'}
        </button>
        <VoiceInput onTranscript={handleVoiceTranscript} onVoiceCommand={handleVoiceCommand} language={language} />
        <input
          className="chat-text-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('typeMessage')}
          data-testid="chat-input"
          disabled={sending}
        />
        <button className={`chat-send-btn ${sending ? 'btn-loading' : ''}`} onClick={() => handleSend()} disabled={sending} data-testid="send-btn">
          {sending ? <span className="btn-spinner" /> : '➤'}
        </button>
      </div>
    </div>
  );
};
