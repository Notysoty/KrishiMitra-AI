import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceInput } from './VoiceInput';

describe('VoiceInput', () => {
  const originalSpeechRecognition = (window as any).SpeechRecognition;
  const originalWebkit = (window as any).webkitSpeechRecognition;

  afterEach(() => {
    (window as any).SpeechRecognition = originalSpeechRecognition;
    (window as any).webkitSpeechRecognition = originalWebkit;
  });

  it('renders disabled when SpeechRecognition is not supported', () => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
    const onTranscript = jest.fn();
    render(<VoiceInput onTranscript={onTranscript} />);
    const btn = screen.getByTestId('voice-input-btn');
    expect(btn).toBeDisabled();
  });

  it('renders enabled when SpeechRecognition is supported', () => {
    (window as any).SpeechRecognition = jest.fn().mockImplementation(() => ({
      start: jest.fn(),
      stop: jest.fn(),
      onresult: null,
      onend: null,
      onerror: null,
      continuous: false,
      interimResults: false,
    }));
    const onTranscript = jest.fn();
    render(<VoiceInput onTranscript={onTranscript} />);
    const btn = screen.getByTestId('voice-input-btn');
    expect(btn).not.toBeDisabled();
  });

  it('starts recording on click and calls onTranscript', async () => {
    const user = userEvent.setup();
    const mockInstance = {
      start: jest.fn(),
      stop: jest.fn(),
      onresult: null as any,
      onend: null as any,
      onerror: null as any,
      continuous: false,
      interimResults: false,
    };
    (window as any).SpeechRecognition = jest.fn().mockImplementation(() => mockInstance);
    const onTranscript = jest.fn();
    render(<VoiceInput onTranscript={onTranscript} />);

    await user.click(screen.getByTestId('voice-input-btn'));
    expect(mockInstance.start).toHaveBeenCalled();

    // Simulate result
    mockInstance.onresult({ results: { 0: { 0: { transcript: 'test speech' } } } });
    expect(onTranscript).toHaveBeenCalledWith('test speech');
  });

  it('shows recording indicator when active', async () => {
    const user = userEvent.setup();
    const mockInstance = {
      start: jest.fn(),
      stop: jest.fn(),
      onresult: null as any,
      onend: null as any,
      onerror: null as any,
      continuous: false,
      interimResults: false,
    };
    (window as any).SpeechRecognition = jest.fn().mockImplementation(() => mockInstance);
    render(<VoiceInput onTranscript={jest.fn()} />);

    await user.click(screen.getByTestId('voice-input-btn'));
    expect(screen.getByTestId('recording-indicator')).toBeInTheDocument();
  });

  it('is disabled when disabled prop is true', () => {
    (window as any).SpeechRecognition = jest.fn();
    render(<VoiceInput onTranscript={jest.fn()} disabled />);
    expect(screen.getByTestId('voice-input-btn')).toBeDisabled();
  });

  it('supports webkitSpeechRecognition', () => {
    delete (window as any).SpeechRecognition;
    (window as any).webkitSpeechRecognition = jest.fn().mockImplementation(() => ({
      start: jest.fn(),
      stop: jest.fn(),
      onresult: null,
      onend: null,
      onerror: null,
      continuous: false,
      interimResults: false,
    }));
    render(<VoiceInput onTranscript={jest.fn()} />);
    expect(screen.getByTestId('voice-input-btn')).not.toBeDisabled();
  });

  // Req 6.5: Fallback to text after 2 failed STT attempts
  it('shows fallback message after 2 failed speech attempts', async () => {
    const user = userEvent.setup();
    const mockInstance = {
      start: jest.fn(),
      stop: jest.fn(),
      onresult: null as any,
      onend: null as any,
      onerror: null as any,
      continuous: false,
      interimResults: false,
    };
    (window as any).SpeechRecognition = jest.fn().mockImplementation(() => mockInstance);
    const { act } = require('@testing-library/react');
    render(<VoiceInput onTranscript={jest.fn()} />);

    // First attempt - trigger error
    await user.click(screen.getByTestId('voice-input-btn'));
    await act(async () => { mockInstance.onerror(); });
    expect(screen.queryByTestId('voice-fallback')).not.toBeInTheDocument();

    // Second attempt - trigger error again
    await user.click(screen.getByTestId('voice-input-btn'));
    await act(async () => { mockInstance.onerror(); });
    expect(screen.getByTestId('voice-fallback')).toHaveTextContent('Voice input failed. Please type your message instead.');
  });

  it('dismisses fallback message when dismiss is clicked', async () => {
    const user = userEvent.setup();
    const mockInstance = {
      start: jest.fn(),
      stop: jest.fn(),
      onresult: null as any,
      onend: null as any,
      onerror: null as any,
      continuous: false,
      interimResults: false,
    };
    (window as any).SpeechRecognition = jest.fn().mockImplementation(() => mockInstance);
    const { act } = require('@testing-library/react');
    render(<VoiceInput onTranscript={jest.fn()} />);

    // Trigger 2 errors
    await user.click(screen.getByTestId('voice-input-btn'));
    await act(async () => { mockInstance.onerror(); });
    await user.click(screen.getByTestId('voice-input-btn'));
    await act(async () => { mockInstance.onerror(); });
    expect(screen.getByTestId('voice-fallback')).toBeInTheDocument();

    await user.click(screen.getByTestId('dismiss-fallback'));
    expect(screen.queryByTestId('voice-fallback')).not.toBeInTheDocument();
  });

  // Req 6.6: Voice commands for common actions
  it('triggers voice command for "check prices"', async () => {
    const user = userEvent.setup();
    const mockInstance = {
      start: jest.fn(),
      stop: jest.fn(),
      onresult: null as any,
      onend: null as any,
      onerror: null as any,
      continuous: false,
      interimResults: false,
    };
    (window as any).SpeechRecognition = jest.fn().mockImplementation(() => mockInstance);
    const onTranscript = jest.fn();
    const onVoiceCommand = jest.fn();
    render(<VoiceInput onTranscript={onTranscript} onVoiceCommand={onVoiceCommand} />);

    await user.click(screen.getByTestId('voice-input-btn'));
    mockInstance.onresult({ results: { 0: { 0: { transcript: 'check prices' } } } });
    expect(onVoiceCommand).toHaveBeenCalledWith('check_prices');
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('triggers voice command for "weather forecast"', async () => {
    const user = userEvent.setup();
    const mockInstance = {
      start: jest.fn(),
      stop: jest.fn(),
      onresult: null as any,
      onend: null as any,
      onerror: null as any,
      continuous: false,
      interimResults: false,
    };
    (window as any).SpeechRecognition = jest.fn().mockImplementation(() => mockInstance);
    const onVoiceCommand = jest.fn();
    render(<VoiceInput onTranscript={jest.fn()} onVoiceCommand={onVoiceCommand} />);

    await user.click(screen.getByTestId('voice-input-btn'));
    mockInstance.onresult({ results: { 0: { 0: { transcript: 'weather forecast' } } } });
    expect(onVoiceCommand).toHaveBeenCalledWith('weather_forecast');
  });

  it('falls back to onTranscript for non-command speech', async () => {
    const user = userEvent.setup();
    const mockInstance = {
      start: jest.fn(),
      stop: jest.fn(),
      onresult: null as any,
      onend: null as any,
      onerror: null as any,
      continuous: false,
      interimResults: false,
    };
    (window as any).SpeechRecognition = jest.fn().mockImplementation(() => mockInstance);
    const onTranscript = jest.fn();
    const onVoiceCommand = jest.fn();
    render(<VoiceInput onTranscript={onTranscript} onVoiceCommand={onVoiceCommand} />);

    await user.click(screen.getByTestId('voice-input-btn'));
    mockInstance.onresult({ results: { 0: { 0: { transcript: 'what fertilizer for rice' } } } });
    expect(onTranscript).toHaveBeenCalledWith('what fertilizer for rice');
    expect(onVoiceCommand).not.toHaveBeenCalled();
  });
});
