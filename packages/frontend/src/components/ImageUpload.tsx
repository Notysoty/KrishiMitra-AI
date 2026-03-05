import React, { useState, useRef } from 'react';
import { classifyImage, ClassificationResult, checkImageQuality } from '../services/apiClient';

export interface ImageUploadProps {
  onClassification?: (result: ClassificationResult, file: File, previewUrl: string) => void;
}

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export const ImageUpload: React.FC<ImageUploadProps> = ({ onClassification }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qualityWarning, setQualityWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined) => {
    setError(null);
    setResult(null);
    setPreview(null);
    setQualityWarning(null);

    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Only JPEG and PNG images are accepted');
      return;
    }

    if (file.size > MAX_SIZE) {
      setError('Image must be smaller than 5MB');
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);

    // Check image quality
    try {
      const quality = await checkImageQuality(file);
      if (!quality.acceptable) {
        setQualityWarning(quality.message || 'Please retake the photo with better lighting and focus on the affected area');
      }
    } catch {
      // Continue even if quality check fails
    }

    setLoading(true);

    try {
      const res = await classifyImage(file);
      setResult(res);
      onClassification?.(res, file, url);
    } catch {
      setError('Classification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const btnStyle: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #ccc',
    cursor: 'pointer',
    backgroundColor: '#fff',
    fontSize: '14px',
    marginRight: '8px',
  };

  return (
    <div data-testid="image-upload">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png"
        style={{ display: 'none' }}
        data-testid="file-input"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        style={{ display: 'none' }}
        data-testid="camera-input"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <button style={btnStyle} onClick={() => fileRef.current?.click()} data-testid="upload-btn">
        📁 Upload Image
      </button>
      <button style={btnStyle} onClick={() => cameraRef.current?.click()} data-testid="camera-btn">
        📷 Camera
      </button>

      {error && (
        <div data-testid="upload-error" style={{ color: '#c62828', marginTop: '8px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {qualityWarning && (
        <div data-testid="quality-warning" style={{ marginTop: '8px', padding: '6px 10px', backgroundColor: '#fff3e0', borderRadius: '6px', fontSize: '12px', color: '#e65100' }}>
          ⚠️ {qualityWarning}
        </div>
      )}

      {preview && (
        <div style={{ marginTop: '8px' }}>
          <img data-testid="image-preview" src={preview} alt="preview" style={{ maxWidth: '200px', borderRadius: '8px' }} />
        </div>
      )}

      {loading && <div data-testid="upload-loading" style={{ marginTop: '8px' }}>Classifying...</div>}

      {result && (
        <div data-testid="classification-result" style={{ marginTop: '8px', padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
          <div><strong>Disease:</strong> {result.diseaseName}</div>
          <div><strong>Confidence:</strong> {Math.round(result.confidence * 100)}%</div>
          <div style={{ marginTop: '4px' }}>
            <strong>Recommendations:</strong>
            <ul style={{ margin: '2px 0 0 16px', padding: 0 }}>
              {result.recommendations.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
          {result.alternativeDiagnoses.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              <strong>Alternatives:</strong>
              <ul style={{ margin: '2px 0 0 16px', padding: 0 }}>
                {result.alternativeDiagnoses.map((a, i) => (
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
