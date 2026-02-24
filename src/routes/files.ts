import { Router, Request, Response } from 'express';
import storage from '../storage/node/sqlite.js';
import logger from '../utils/logger.js';

const router = Router();

interface FileParams {
  fileId: string;
}

interface FileErrorResponse {
  error: string;
}

/**
 * GET /api/files/:fileId
 * Serves the file content stored locally by blob ID.
 */
router.get(
  '/:fileId',
  async (req: Request<FileParams>, res: Response<Buffer | FileErrorResponse>): Promise<void> => {
    const { fileId } = req.params;
    if (!fileId) {
      res.status(400).json({ error: 'File ID is required.' });
      return;
    }

    try {
      // Ensure storage is ready
      await storage.__ensureReady();

      // Get blob metadata by ID
      const blobMeta = await storage.blobs.getById(fileId);
      if (!blobMeta) {
        res.status(404).json({ error: 'File not found.' });
        return;
      }

      // Read file content from local storage
      const buffer = storage.blobs.get(blobMeta);
      if (!buffer) {
        res.status(404).json({ error: 'File content not found.' });
        return;
      }

      // Set appropriate headers
      res.setHeader('Content-Type', blobMeta.mime || 'application/octet-stream');
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Cache-Control', 'public, max-age=3600');

      res.send(buffer);
    } catch (err) {
      logger.error('file_serve_error', { fileId, error: (err as Error).message });
      res.status(500).json({ error: 'Failed to load attachment.' });
    }
  }
);

export default router;

// CommonJS compatibility for mixed codebase
module.exports = router;
