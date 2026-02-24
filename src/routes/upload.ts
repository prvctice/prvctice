import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { getExtension, renameFile, deleteFile, type MulterFile } from '../utils/fileUtils.js';
import storage from '../storage/node/sqlite.js';
import logger from '../utils/logger.js';

const router = Router();

/*
 * Determine a writable directory for temporary uploads.
 *  – In the packaged Electron build everything inside the asar archive is
 *    read-only, so we fall back to `app.getPath('userData')` which is always
 *    writable for the current user.
 *  – In development (plain `electron .` or `npm start`) we keep using the
 *    repository-local `uploads` folder so existing tooling keeps working.
 */
let uploadsDir: string;
// Determine uploads directory - check for Electron environment
if (process.versions.electron) {
  // Running under Electron - use userData path
  // Dynamic import to avoid bundling electron in web builds
  import('electron')
    .then(({ app }) => {
      if (app?.getPath) {
        uploadsDir = path.join(app.getPath('userData'), 'uploads');
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
    })
    .catch(() => {
      // Fallback already set
    });
  // Set initial fallback while async import resolves
  uploadsDir = path.resolve(__dirname, '../../uploads');
} else {
  // Not running inside Electron (e.g. unit tests or plain Node execution)
  uploadsDir = path.resolve(__dirname, '../../uploads');
}

// Ensure the directory exists before Multer tries to write to it.
fs.mkdirSync(uploadsDir, { recursive: true });

// Restrict file uploads to 10MB and allow only image, audio, or video files
const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb): void => {
    const ok = /^(image|audio|video)\//.test(file.mimetype);
    if (ok) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type.'));
    }
  },
});

// Extend Request interface for multer
interface MulterRequest extends Request {
  file?: Express.Multer.File;
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
}

interface UploadResponse {
  success?: boolean;
  fileId?: string;
  filename?: string;
  mime?: string;
  size?: number;
  error?: string;
  details?: string;
}

interface MultiUploadResponse {
  success?: boolean;
  files?: Array<{
    fileId: string;
    filename: string;
    mime: string;
    size: number;
  }>;
  errors?: Array<{
    filename: string;
    error: string;
  }>;
  error?: string;
  details?: Array<{ filename: string; error: string }>;
}

// Handle upload with explicit error handling for file size
router.post(
  '/',
  (req: Request, res: Response, next: NextFunction): void => {
    upload.single('image')(req, res, function (err: unknown) {
      if (err) {
        const multerErr = err as { code?: string; message?: string };
        // Multer error for file size limit
        if (multerErr.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({ error: 'Payload Too Large: file exceeds 10MB limit.' });
          return;
        }
        res.status(400).json({ error: multerErr.message });
        return;
      }
      next();
    });
  },
  async (req: MulterRequest, res: Response<UploadResponse>): Promise<void> => {
    const file = req.file;
    if (!file) {
      logger.warn('upload_no_file');
      res.status(400).json({ error: 'No file uploaded.' });
      return;
    }

    try {
      const extension = getExtension(file.mimetype);
      if (!extension) {
        logger.warn('upload_unsupported_type', { mimetype: file.mimetype });
        res.status(400).json({ error: 'Unsupported file type.' });
        return;
      }

      // Rename file to include extension
      const multerFile: MulterFile = {
        path: file.path,
        originalname: file.originalname,
        mimetype: file.mimetype,
      };
      const newFilePath = await renameFile(multerFile, extension);

      // Read file and store in local blob storage
      const buffer = fs.readFileSync(newFilePath);
      const blobDoc = await storage.blobs.put(buffer, file.mimetype);

      if (!blobDoc || !blobDoc.id) {
        throw new Error('Failed to store file locally.');
      }

      res.json({
        success: true,
        fileId: blobDoc.id,
        filename: file.originalname,
        mime: file.mimetype,
        size: blobDoc.size,
      });

      // Clean up temp file
      deleteFile(newFilePath);
    } catch (error) {
      logger.error('upload_failed', { error: (error as Error).message || String(error) });
      res
        .status(500)
        .json({ error: 'Failed to upload the file.', details: (error as Error).message });
    }
  }
);

// ---------------------------------------------------------------------------
// Multiple file upload (images[])
// ---------------------------------------------------------------------------
// Accept up to 10 files under field name "images". Each file is validated
// using the same fileFilter and size limits as the single upload endpoint.
router.post(
  '/multiple',
  (req: Request, res: Response, next: NextFunction): void => {
    upload.array('images', 10)(req, res, function (err: unknown) {
      if (err) {
        const multerErr = err as { code?: string; message?: string };
        if (multerErr.code === 'LIMIT_FILE_SIZE') {
          res
            .status(413)
            .json({ error: 'Payload Too Large: one or more files exceed 10MB limit.' });
          return;
        }
        res.status(400).json({ error: multerErr.message });
        return;
      }
      next();
    });
  },
  async (req: MulterRequest, res: Response<MultiUploadResponse>): Promise<void> => {
    const filesRaw = req.files;
    // Handle both array and object formats from multer
    const files = Array.isArray(filesRaw) ? filesRaw : [];
    if (!files.length) {
      res.status(400).json({ error: 'No files uploaded.' });
      return;
    }

    const results: Array<{
      fileId: string;
      filename: string;
      mime: string;
      size: number;
    }> = [];
    const errors: Array<{ filename: string; error: string }> = [];

    for (const file of files) {
      try {
        const extension = getExtension(file.mimetype);
        if (!extension) {
          throw new Error(`Unsupported file type: ${file.mimetype}`);
        }
        const multerFile: MulterFile = {
          path: file.path,
          originalname: file.originalname,
          mimetype: file.mimetype,
        };
        const newFilePath = await renameFile(multerFile, extension);
        try {
          // Read file and store in local blob storage
          const buffer = fs.readFileSync(newFilePath);
          const blobDoc = await storage.blobs.put(buffer, file.mimetype);
          if (!blobDoc || !blobDoc.id) {
            throw new Error('Failed to store file locally.');
          }
          results.push({
            fileId: blobDoc.id,
            filename: file.originalname,
            mime: file.mimetype,
            size: blobDoc.size ?? 0,
          });
        } finally {
          // Best-effort cleanup of temporary file
          try {
            deleteFile(newFilePath);
          } catch (_) {
            // Ignore cleanup errors
          }
        }
      } catch (e) {
        errors.push({ filename: file.originalname, error: (e as Error).message });
      }
    }

    if (results.length === 0) {
      res.status(500).json({ error: 'Failed to upload files.', details: errors });
      return;
    }
    res.json({ success: true, files: results, errors });
  }
);

export default router;

// CommonJS compatibility for mixed codebase
module.exports = router;
