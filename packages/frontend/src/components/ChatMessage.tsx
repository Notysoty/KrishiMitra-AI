import React from 'react';

export interface ChatMessageData {
  id: string;
  role: 'user' | 'ai';
  text: string;
  confidence?: number;
  citations?: { title: string; url: string }[];
  disclaimer?: string;
  safetyRefusal?: string;
  imageUrl?: string;
  classification?: {
    diseaseName: string;
    confidence: number;
    recommendations: string[];
    alternativeDiagnoses: { name: string; confidence: number }[];
  };
}

function getConfidenceLabel(score: number): { label: string; color: string } {
  if (score > 0.7) return { label: 'High', color: '#2e7d32' };
  if (score >= 0.5) return { label: 'Medium', color: '#f9a825' };
  return { label: 'Low', color: '#c62828' };
}

const userBubble: React.CSSProperties = {
  alignSelf: 'flex-end',
  backgroundColor: '#dcf8c6',
  borderRadius: '12px',
  padding: '8px 12px',
  maxWidth: '80%',
  marginBottom: '8px',
};

const aiBubble: React.CSSProperties = {
  alignSelf: 'flex-start',
  backgroundColor: '#ffffff',
  border: '1px solid #e0e0e0',
  borderRadius: '12px',
  padding: '8px 12px',
  maxWidth: '80%',
  marginBottom: '8px',
};

const refusalStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  backgroundColor: '#ffebee',
  border: '1px solid #ef9a9a',
  borderRadius: '12px',
  padding: '8px 12px',
  maxWidth: '80%',
  marginBottom: '8px',
};

export const ChatMessage: React.FC<{ message: ChatMessageData }> = ({ message }) => {
  if (message.safetyRefusal) {
    return (
      <div style={refusalStyle} data-testid="safety-refusal">
        <span role="img" aria-label="warning" style={{ marginRight: '6px' }}>⚠️</span>
        <span>{message.safetyRefusal}</span>
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div style={userBubble} data-testid="user-message">
        {message.imageUrl && (
          <img src={message.imageUrl} alt="uploaded" style={{ maxWidth: '200px', borderRadius: '8px', marginBottom: '4px', display: 'block' }} />
        )}
        {message.text && <div>{message.text}</div>}
      </div>
    );
  }

  const conf = message.confidence != null ? getConfidenceLabel(message.confidence) : null;

  return (
    <div style={aiBubble} data-testid="ai-message">
      <div>{message.text}</div>

      {conf && (
        <span
          data-testid="confidence-badge"
          style={{
            display: 'inline-block',
            marginTop: '4px',
            padding: '2px 8px',
            borderRadius: '8px',
            fontSize: '11px',
            fontWeight: 600,
            color: '#fff',
            backgroundColor: conf.color,
          }}
        >
          {conf.label} ({Math.round(message.confidence! * 100)}%)
        </span>
      )}

      {message.confidence != null && message.confidence < 0.7 && (
        <div data-testid="uncertainty-message" style={{ marginTop: '6px', padding: '6px 10px', backgroundColor: '#fff3e0', borderRadius: '6px', fontSize: '12px', color: '#e65100' }}>
          ⚠️ I am uncertain about this answer. Please consult a local agricultural expert.
        </div>
      )}

      {message.citations && message.citations.length > 0 && (
        <div data-testid="citations" style={{ marginTop: '6px', fontSize: '12px' }}>
          <strong>Sources:</strong>
          <ul style={{ margin: '2px 0 0 16px', padding: 0 }}>
            {message.citations.map((c, i) => (
              <li key={i}>
                <a href={c.url} target="_blank" rel="noopener noreferrer">{c.title}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {message.disclaimer && (
        <div data-testid="disclaimer" style={{ marginTop: '6px', fontSize: '11px', fontStyle: 'italic', color: '#757575' }}>
          {message.disclaimer}
        </div>
      )}

      {message.classification && (
        <div data-testid="classification-result" style={{ marginTop: '8px', padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
          <div><strong>Disease:</strong> {message.classification.diseaseName}</div>
          <div><strong>Confidence:</strong> {Math.round(message.classification.confidence * 100)}%</div>
          {message.classification.confidence < 0.6 && (
            <div data-testid="uncertain-diagnosis" style={{ marginTop: '4px', padding: '6px 10px', backgroundColor: '#fff3e0', borderRadius: '6px', fontSize: '12px', color: '#e65100' }}>
              ⚠️ Uncertain diagnosis. Please consult a local agronomist for accurate identification.
            </div>
          )}
          <div style={{ marginTop: '4px' }}>
            <strong>Recommendations:</strong>
            <ul style={{ margin: '2px 0 0 16px', padding: 0 }}>
              {message.classification.recommendations.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
          {message.classification.alternativeDiagnoses.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              <strong>Alternatives:</strong>
              <ul style={{ margin: '2px 0 0 16px', padding: 0 }}>
                {message.classification.alternativeDiagnoses.map((a, i) => (
                  <li key={i}>{a.name} ({Math.round(a.confidence * 100)}%)</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
