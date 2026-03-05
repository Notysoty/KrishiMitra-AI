import { ResumableUpload } from './ResumableUpload';

describe('ResumableUpload', () => {
  let upload: ResumableUpload;

  beforeEach(() => {
    upload = new ResumableUpload();
  });

  describe('initUpload', () => {
    it('should create an upload session with a unique id', () => {
      const meta = upload.initUpload('photo.jpg', 5, 5_000_000);

      expect(meta.uploadId).toBeDefined();
      expect(meta.fileName).toBe('photo.jpg');
      expect(meta.totalChunks).toBe(5);
      expect(meta.completedChunks).toEqual([]);
      expect(meta.totalSize).toBe(5_000_000);
    });
  });

  describe('markChunkComplete', () => {
    it('should track completed chunks', () => {
      const meta = upload.initUpload('file.bin', 4, 4000);

      upload.markChunkComplete(meta.uploadId, 0);
      upload.markChunkComplete(meta.uploadId, 2);

      const updated = upload.getUpload(meta.uploadId)!;
      expect(updated.completedChunks).toEqual([0, 2]);
    });

    it('should not duplicate chunk indices', () => {
      const meta = upload.initUpload('file.bin', 3, 3000);

      upload.markChunkComplete(meta.uploadId, 1);
      upload.markChunkComplete(meta.uploadId, 1);

      const updated = upload.getUpload(meta.uploadId)!;
      expect(updated.completedChunks).toEqual([1]);
    });

    it('should throw for invalid chunk index', () => {
      const meta = upload.initUpload('file.bin', 3, 3000);

      expect(() => upload.markChunkComplete(meta.uploadId, -1)).toThrow('Invalid chunk index');
      expect(() => upload.markChunkComplete(meta.uploadId, 3)).toThrow('Invalid chunk index');
    });

    it('should throw for unknown upload id', () => {
      expect(() => upload.markChunkComplete('unknown', 0)).toThrow('Upload session not found');
    });
  });

  describe('getNextChunk', () => {
    it('should return the first incomplete chunk', () => {
      const meta = upload.initUpload('file.bin', 4, 4000);
      upload.markChunkComplete(meta.uploadId, 0);
      upload.markChunkComplete(meta.uploadId, 1);

      expect(upload.getNextChunk(meta.uploadId)).toBe(2);
    });

    it('should return null when all chunks are complete', () => {
      const meta = upload.initUpload('file.bin', 2, 2000);
      upload.markChunkComplete(meta.uploadId, 0);
      upload.markChunkComplete(meta.uploadId, 1);

      expect(upload.getNextChunk(meta.uploadId)).toBeNull();
    });
  });

  describe('isComplete', () => {
    it('should return false when chunks are missing', () => {
      const meta = upload.initUpload('file.bin', 3, 3000);
      upload.markChunkComplete(meta.uploadId, 0);

      expect(upload.isComplete(meta.uploadId)).toBe(false);
    });

    it('should return true when all chunks are done', () => {
      const meta = upload.initUpload('file.bin', 2, 2000);
      upload.markChunkComplete(meta.uploadId, 0);
      upload.markChunkComplete(meta.uploadId, 1);

      expect(upload.isComplete(meta.uploadId)).toBe(true);
    });
  });

  describe('removeUpload', () => {
    it('should remove the upload session', () => {
      const meta = upload.initUpload('file.bin', 2, 2000);
      expect(upload.removeUpload(meta.uploadId)).toBe(true);
      expect(upload.getUpload(meta.uploadId)).toBeNull();
    });

    it('should return false for unknown id', () => {
      expect(upload.removeUpload('nope')).toBe(false);
    });
  });
});
