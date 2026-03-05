import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageUpload } from './ImageUpload';

const mockClassifyImage = jest.fn().mockResolvedValue({
  diseaseName: 'Late Blight',
  confidence: 0.82,
  recommendations: ['Apply fungicide'],
  alternativeDiagnoses: [{ name: 'Early Blight', confidence: 0.12 }],
});

const mockCheckImageQuality = jest.fn().mockResolvedValue({ acceptable: true });

jest.mock('../services/apiClient', () => ({
  classifyImage: (...args: any[]) => mockClassifyImage(...args),
  checkImageQuality: (...args: any[]) => mockCheckImageQuality(...args),
}));

const mockCreateObjectURL = jest.fn().mockReturnValue('blob:mock-url');
global.URL.createObjectURL = mockCreateObjectURL;

function createFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

describe('ImageUpload', () => {
  beforeEach(() => {
    mockClassifyImage.mockClear();
    mockCheckImageQuality.mockClear();
    mockCreateObjectURL.mockClear();
    mockCreateObjectURL.mockReturnValue('blob:mock-url');
    mockClassifyImage.mockResolvedValue({
      diseaseName: 'Late Blight',
      confidence: 0.82,
      recommendations: ['Apply fungicide'],
      alternativeDiagnoses: [{ name: 'Early Blight', confidence: 0.12 }],
    });
    mockCheckImageQuality.mockResolvedValue({ acceptable: true });
  });

  it('renders upload and camera buttons', () => {
    render(<ImageUpload />);
    expect(screen.getByTestId('upload-btn')).toBeInTheDocument();
    expect(screen.getByTestId('camera-btn')).toBeInTheDocument();
  });

  it('accepts jpeg and png files', () => {
    render(<ImageUpload />);
    const input = screen.getByTestId('file-input');
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png');
  });

  it('shows error for invalid file type', async () => {
    render(<ImageUpload />);
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = createFile('test.gif', 1024, 'image/gif');
    input.removeAttribute('accept');
    await act(async () => {
      await userEvent.upload(input, file);
    });
    expect(screen.getByTestId('upload-error')).toHaveTextContent('Only JPEG and PNG images are accepted');
  });

  it('shows error for file exceeding 5MB', async () => {
    render(<ImageUpload />);
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = createFile('big.jpg', 6 * 1024 * 1024, 'image/jpeg');
    await act(async () => {
      await userEvent.upload(input, file);
    });
    expect(screen.getByTestId('upload-error')).toHaveTextContent('Image must be smaller than 5MB');
  });

  it('shows preview and classification result for valid image', async () => {
    const onClassification = jest.fn();
    render(<ImageUpload onClassification={onClassification} />);
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = createFile('plant.jpg', 1024, 'image/jpeg');

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(screen.getByTestId('classification-result')).toBeInTheDocument();
    });

    expect(screen.getByTestId('image-preview')).toHaveAttribute('src', 'blob:mock-url');
    expect(screen.getByTestId('classification-result')).toHaveTextContent('Late Blight');
    expect(screen.getByTestId('classification-result')).toHaveTextContent('82%');
    expect(screen.getByTestId('classification-result')).toHaveTextContent('Apply fungicide');
    expect(onClassification).toHaveBeenCalled();
  });

  it('camera input has capture attribute', () => {
    render(<ImageUpload />);
    const cameraInput = screen.getByTestId('camera-input');
    expect(cameraInput).toHaveAttribute('capture', 'environment');
  });

  it('handles classification error', async () => {
    mockClassifyImage.mockRejectedValueOnce(new Error('Network error'));

    render(<ImageUpload />);
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = createFile('plant.jpg', 1024, 'image/jpeg');
    await act(async () => {
      await userEvent.upload(input, file);
    });

    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toHaveTextContent('Classification failed');
    });
  });

  // Req 7.9: Poor image quality detection prompt
  it('shows quality warning when image quality is poor', async () => {
    mockCheckImageQuality.mockResolvedValueOnce({
      acceptable: false,
      issue: 'blur',
      message: 'Please retake the photo with better lighting and focus on the affected area',
    });

    render(<ImageUpload />);
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = createFile('blurry.jpg', 1024, 'image/jpeg');
    await act(async () => {
      await userEvent.upload(input, file);
    });

    await waitFor(() => {
      expect(screen.getByTestId('quality-warning')).toHaveTextContent(
        'Please retake the photo with better lighting and focus on the affected area'
      );
    });
  });

  it('does not show quality warning when image quality is acceptable', async () => {
    render(<ImageUpload />);
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = createFile('good.jpg', 1024, 'image/jpeg');
    await act(async () => {
      await userEvent.upload(input, file);
    });

    await waitFor(() => {
      expect(screen.getByTestId('classification-result')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('quality-warning')).not.toBeInTheDocument();
  });
});
