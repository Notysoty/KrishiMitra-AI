import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ChatPage } from './ChatPage';
import { I18nProvider } from '../i18n';

const mockSendMessage = jest.fn();
const mockClassifyImage = jest.fn();
const mockTextToSpeech = jest.fn();
const mockCheckImageQuality = jest.fn();

jest.mock('../services/apiClient', () => ({
  sendMessage: (...args: any[]) => mockSendMessage(...args),
  classifyImage: (...args: any[]) => mockClassifyImage(...args),
  textToSpeech: (...args: any[]) => mockTextToSpeech(...args),
  checkImageQuality: (...args: any[]) => mockCheckImageQuality(...args),
}));

beforeEach(() => {
  delete (window as any).SpeechRecognition;
  delete (window as any).webkitSpeechRecognition;
  mockSendMessage.mockReset();
  mockClassifyImage.mockReset();
  mockTextToSpeech.mockReset();
  mockCheckImageQuality.mockReset();
  mockSendMessage.mockResolvedValue({
    text: 'Mock AI response',
    confidence: 0.85,
    citations: [{ title: 'Source', url: 'https://example.com' }],
    disclaimer: 'AI disclaimer text',
    safetyRefusal: undefined,
  });
  mockTextToSpeech.mockResolvedValue(new Blob([new ArrayBuffer(100)], { type: 'audio/mpeg' }));
  mockCheckImageQuality.mockResolvedValue({ acceptable: true });
});

describe('ChatPage', () => {
  const renderPage = () => render(<MemoryRouter><I18nProvider><ChatPage /></I18nProvider></MemoryRouter>);

  it('renders chat interface elements', () => {
    renderPage();
    expect(screen.getByTestId('chat-page')).toBeInTheDocument();
    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    expect(screen.getByTestId('send-btn')).toBeInTheDocument();
    expect(screen.getByTestId('message-list')).toBeInTheDocument();
  });

  it('sends a message and displays AI response', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByTestId('chat-input'), 'What fertilizer for rice?');
    await user.click(screen.getByTestId('send-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('user-message')).toHaveTextContent('What fertilizer for rice?');
    });

    await waitFor(() => {
      expect(screen.getByTestId('ai-message')).toHaveTextContent('Mock AI response');
    });

    expect(screen.getByTestId('confidence-badge')).toBeInTheDocument();
    expect(screen.getByTestId('citations')).toBeInTheDocument();
    expect(screen.getByTestId('disclaimer')).toBeInTheDocument();
  });

  it('sends message on Enter key', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByTestId('chat-input'), 'Hello{enter}');

    await waitFor(() => {
      expect(screen.getByTestId('user-message')).toHaveTextContent('Hello');
    });
  });

  it('does not send empty messages', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId('send-btn'));
    expect(screen.queryByTestId('user-message')).not.toBeInTheDocument();
  });

  it('displays safety refusal messages', async () => {
    mockSendMessage.mockResolvedValueOnce({
      text: '',
      confidence: 0,
      citations: [],
      disclaimer: '',
      safetyRefusal: 'Cannot provide this advice.',
    });

    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByTestId('chat-input'), 'unsafe query');
    await user.click(screen.getByTestId('send-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('safety-refusal')).toHaveTextContent('Cannot provide this advice.');
    });
  });

  it('toggles image upload panel', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByTestId('image-upload-panel')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('image-upload-toggle'));
    expect(screen.getByTestId('image-upload-panel')).toBeInTheDocument();
    await user.click(screen.getByTestId('image-upload-toggle'));
    expect(screen.queryByTestId('image-upload-panel')).not.toBeInTheDocument();
  });

  it('has voice input button', () => {
    renderPage();
    expect(screen.getByTestId('voice-input-btn')).toBeInTheDocument();
  });

  it('handles API error gracefully', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('Network error'));

    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByTestId('chat-input'), 'test');
    await user.click(screen.getByTestId('send-btn'));

    await waitFor(() => {
      expect(screen.getByText(/could not reach the assistant/i)).toBeInTheDocument();
    });
  });

  // Req 6.2: TTS audio playback button for AI responses
  it('shows listen button for AI responses', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByTestId('chat-input'), 'Hello');
    await user.click(screen.getByTestId('send-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('ai-message')).toBeInTheDocument();
    });

    const listenBtn = screen.getByText('🔊 Listen');
    expect(listenBtn).toBeInTheDocument();
  });
});
