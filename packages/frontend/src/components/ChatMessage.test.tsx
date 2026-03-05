import React from 'react';
import { render, screen } from '@testing-library/react';
import { ChatMessage, ChatMessageData } from './ChatMessage';

describe('ChatMessage', () => {
  it('renders user message right-aligned with green background', () => {
    const msg: ChatMessageData = { id: '1', role: 'user', text: 'Hello' };
    render(<ChatMessage message={msg} />);
    const el = screen.getByTestId('user-message');
    expect(el).toHaveTextContent('Hello');
    expect(el.style.backgroundColor).toBe('rgb(220, 248, 198)');
  });

  it('renders AI message with text', () => {
    const msg: ChatMessageData = { id: '2', role: 'ai', text: 'AI response here' };
    render(<ChatMessage message={msg} />);
    expect(screen.getByTestId('ai-message')).toHaveTextContent('AI response here');
  });

  it('shows high confidence badge (green) for score > 0.7', () => {
    const msg: ChatMessageData = { id: '3', role: 'ai', text: 'Advice', confidence: 0.85 };
    render(<ChatMessage message={msg} />);
    const badge = screen.getByTestId('confidence-badge');
    expect(badge).toHaveTextContent('High (85%)');
    expect(badge.style.backgroundColor).toBe('rgb(46, 125, 50)');
  });

  it('shows medium confidence badge (yellow) for score 0.5-0.7', () => {
    const msg: ChatMessageData = { id: '4', role: 'ai', text: 'Advice', confidence: 0.6 };
    render(<ChatMessage message={msg} />);
    const badge = screen.getByTestId('confidence-badge');
    expect(badge).toHaveTextContent('Medium (60%)');
    expect(badge.style.backgroundColor).toBe('rgb(249, 168, 37)');
  });

  it('shows low confidence badge (red) for score < 0.5', () => {
    const msg: ChatMessageData = { id: '5', role: 'ai', text: 'Advice', confidence: 0.3 };
    render(<ChatMessage message={msg} />);
    const badge = screen.getByTestId('confidence-badge');
    expect(badge).toHaveTextContent('Low (30%)');
    expect(badge.style.backgroundColor).toBe('rgb(198, 40, 40)');
  });

  it('renders citations as clickable links', () => {
    const msg: ChatMessageData = {
      id: '6',
      role: 'ai',
      text: 'Info',
      citations: [{ title: 'ICAR Paper', url: 'https://icar.org.in/example' }],
    };
    render(<ChatMessage message={msg} />);
    const citationsEl = screen.getByTestId('citations');
    const link = citationsEl.querySelector('a');
    expect(link).toHaveTextContent('ICAR Paper');
    expect(link).toHaveAttribute('href', 'https://icar.org.in/example');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders disclaimer in italic', () => {
    const msg: ChatMessageData = { id: '7', role: 'ai', text: 'Info', disclaimer: 'Consult an expert.' };
    render(<ChatMessage message={msg} />);
    const disc = screen.getByTestId('disclaimer');
    expect(disc).toHaveTextContent('Consult an expert.');
    expect(disc.style.fontStyle).toBe('italic');
  });

  it('renders safety refusal with warning styling', () => {
    const msg: ChatMessageData = { id: '8', role: 'ai', text: '', safetyRefusal: 'Cannot provide this advice.' };
    render(<ChatMessage message={msg} />);
    const el = screen.getByTestId('safety-refusal');
    expect(el).toHaveTextContent('Cannot provide this advice.');
    expect(el.style.backgroundColor).toBe('rgb(255, 235, 238)');
  });

  it('renders classification results', () => {
    const msg: ChatMessageData = {
      id: '9',
      role: 'ai',
      text: 'Detected: Late Blight',
      classification: {
        diseaseName: 'Late Blight',
        confidence: 0.82,
        recommendations: ['Apply fungicide'],
        alternativeDiagnoses: [{ name: 'Early Blight', confidence: 0.12 }],
      },
    };
    render(<ChatMessage message={msg} />);
    const result = screen.getByTestId('classification-result');
    expect(result).toHaveTextContent('Late Blight');
    expect(result).toHaveTextContent('82%');
    expect(result).toHaveTextContent('Apply fungicide');
    expect(result).toHaveTextContent('Early Blight');
  });

  it('renders user message with image', () => {
    const msg: ChatMessageData = { id: '10', role: 'user', text: 'Check this', imageUrl: 'blob:test' };
    render(<ChatMessage message={msg} />);
    const img = screen.getByAltText('uploaded');
    expect(img).toHaveAttribute('src', 'blob:test');
  });

  // Req 5.4: Uncertainty message when confidence < 70%
  it('shows uncertainty message when confidence is below 70%', () => {
    const msg: ChatMessageData = { id: '11', role: 'ai', text: 'Some advice', confidence: 0.55 };
    render(<ChatMessage message={msg} />);
    expect(screen.getByTestId('uncertainty-message')).toHaveTextContent(
      'I am uncertain about this answer. Please consult a local agricultural expert.'
    );
  });

  it('does not show uncertainty message when confidence is above 70%', () => {
    const msg: ChatMessageData = { id: '12', role: 'ai', text: 'Good advice', confidence: 0.85 };
    render(<ChatMessage message={msg} />);
    expect(screen.queryByTestId('uncertainty-message')).not.toBeInTheDocument();
  });

  // Req 7.3: Uncertain diagnosis when classification confidence < 60%
  it('shows uncertain diagnosis message when classification confidence is below 60%', () => {
    const msg: ChatMessageData = {
      id: '13',
      role: 'ai',
      text: 'Detected: Unknown',
      classification: {
        diseaseName: 'Unknown Spot',
        confidence: 0.45,
        recommendations: ['Monitor closely'],
        alternativeDiagnoses: [],
      },
    };
    render(<ChatMessage message={msg} />);
    expect(screen.getByTestId('uncertain-diagnosis')).toHaveTextContent(
      'Uncertain diagnosis. Please consult a local agronomist for accurate identification.'
    );
  });

  it('does not show uncertain diagnosis when classification confidence is above 60%', () => {
    const msg: ChatMessageData = {
      id: '14',
      role: 'ai',
      text: 'Detected: Late Blight',
      classification: {
        diseaseName: 'Late Blight',
        confidence: 0.82,
        recommendations: ['Apply fungicide'],
        alternativeDiagnoses: [],
      },
    };
    render(<ChatMessage message={msg} />);
    expect(screen.queryByTestId('uncertain-diagnosis')).not.toBeInTheDocument();
  });
});
