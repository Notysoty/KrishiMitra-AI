/**
 * Resumable file upload tracker.
 * Tracks completed chunks so uploads can resume from the last successful chunk.
 *
 * Requirements: 31.7
 */

import { v4 as uuid } from 'uuid';
import { UploadChunkMeta } from '../../types/resilience';

export class ResumableUpload {
  private uploads = new Map<string, UploadChunkMeta>();

  /**
   * Initialise a new upload session.
   */
  initUpload(fileName: string, totalChunks: number, totalSize: number): UploadChunkMeta {
    const meta: UploadChunkMeta = {
      uploadId: uuid(),
      fileName,
      totalChunks,
      completedChunks: [],
      totalSize,
    };
    this.uploads.set(meta.uploadId, meta);
    return meta;
  }

  /**
   * Mark a chunk as completed.
   */
  markChunkComplete(uploadId: string, chunkIndex: number): UploadChunkMeta {
    const meta = this.uploads.get(uploadId);
    if (!meta) throw new Error(`Upload session not found: ${uploadId}`);
    if (chunkIndex < 0 || chunkIndex >= meta.totalChunks) {
      throw new Error(`Invalid chunk index ${chunkIndex} for upload with ${meta.totalChunks} chunks`);
    }
    if (!meta.completedChunks.includes(chunkIndex)) {
      meta.completedChunks.push(chunkIndex);
      meta.completedChunks.sort((a, b) => a - b);
    }
    return { ...meta };
  }

  /**
   * Get the next chunk index that needs to be uploaded.
   */
  getNextChunk(uploadId: string): number | null {
    const meta = this.uploads.get(uploadId);
    if (!meta) throw new Error(`Upload session not found: ${uploadId}`);

    for (let i = 0; i < meta.totalChunks; i++) {
      if (!meta.completedChunks.includes(i)) return i;
    }
    return null; // all chunks complete
  }

  /**
   * Check if the upload is complete.
   */
  isComplete(uploadId: string): boolean {
    const meta = this.uploads.get(uploadId);
    if (!meta) throw new Error(`Upload session not found: ${uploadId}`);
    return meta.completedChunks.length === meta.totalChunks;
  }

  /**
   * Get upload metadata.
   */
  getUpload(uploadId: string): UploadChunkMeta | null {
    const meta = this.uploads.get(uploadId);
    return meta ? { ...meta } : null;
  }

  /**
   * Remove a completed or cancelled upload session.
   */
  removeUpload(uploadId: string): boolean {
    return this.uploads.delete(uploadId);
  }
}
