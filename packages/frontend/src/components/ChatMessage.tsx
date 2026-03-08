import React from 'react';

// Lightweight inline markdown renderer — no external deps needed
function inlineRender(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 5px', borderRadius: '3px', fontSize: '0.88em', fontFamily: 'monospace' }}>{part.slice(1, -1)}</code>;
    return part;
  });
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('### ')) {
      elements.push(<h4 key={i} style={{ margin: '10px 0 4px', fontWeight: 600, fontSize: '0.95em' }}>{line.slice(4)}</h4>);
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={i} style={{ margin: '10px 0 4px', fontWeight: 700, fontSize: '1em' }}>{line.slice(3)}</h3>);
    } else if (line.match(/^[-*] /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*] /)) { items.push(lines[i].slice(2)); i++; }
      elements.push(<ul key={`ul-${i}`} style={{ margin: '4px 0', paddingLeft: '18px' }}>{items.map((it, j) => <li key={j}>{inlineRender(it)}</li>)}</ul>);
      continue;
    } else if (line.match(/^\d+\. /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) { items.push(lines[i].replace(/^\d+\. /, '')); i++; }
      elements.push(<ol key={`ol-${i}`} style={{ margin: '4px 0', paddingLeft: '18px' }}>{items.map((it, j) => <li key={j}>{inlineRender(it)}</li>)}</ol>);
      continue;
    } else if (line.trim() === '') {
      if (elements.length > 0) elements.push(<br key={`br-${i}`} />);
    } else {
      elements.push(<p key={i} style={{ margin: '3px 0', lineHeight: 1.55 }}>{inlineRender(line)}</p>);
    }
    i++;
  }
  return elements;
}

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


export const ChatMessage: React.FC<{ message: ChatMessageData }> = ({ message }) => {
  if (message.safetyRefusal) {
    return (
      <div className="chat-bubble refusal" data-testid="safety-refusal">
        <span role="img" aria-label="warning" style={{ marginRight: '6px' }}>⚠️</span>
        <span>{message.safetyRefusal}</span>
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="chat-bubble user" data-testid="user-message">
        {message.imageUrl && (
          <img src={message.imageUrl} alt="uploaded" style={{ maxWidth: '200px', borderRadius: '8px', marginBottom: '4px', display: 'block' }} />
        )}
        {message.text && <div>{message.text}</div>}
      </div>
    );
  }

  return (
    <div className="chat-bubble ai" data-testid="ai-message">
      <div>{renderMarkdown(message.text)}</div>

      {message.citations && message.citations.length > 0 && (
        <div data-testid="citations" style={{ marginTop: '6px', fontSize: '0.75rem' }}>
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

      {message.classification && (
        <div data-testid="classification-result" className="classification-card">
          <div><strong>Disease:</strong> {message.classification.diseaseName}</div>
          <div><strong>Confidence:</strong> {Math.round(message.classification.confidence * 100)}%</div>
          {message.classification.confidence < 0.6 && (
            <div data-testid="uncertain-diagnosis" className="uncertainty-box">
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
