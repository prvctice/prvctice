import { Router, Request, Response } from 'express';
import multer from 'multer';
import FormData from 'form-data';
import fetch from 'node-fetch';
import {
  markUserProvidedKey,
  hasUserProvidedAnyKey,
  type SessionWithKeys,
} from '../utils/sessionKeys.js';
import logger from '../utils/logger.js';

/**
 * Select the effective OpenAI API key.
 * Inlined from utils/apiKey.ts to avoid importing the openai package.
 */
function selectApiKey(
  userApiKey: string | null | undefined,
  options: { session?: SessionWithKeys | null; trialActive?: boolean } = {}
): string | null {
  const { trialActive = false } = options;
  const envApiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || null;
  if (typeof userApiKey === 'string' && userApiKey.trim() !== '') {
    const trimmed = userApiKey.trim();
    const matchesEnv = envApiKey && trimmed === envApiKey;
    if (matchesEnv && !trialActive) {
      return null;
    }
    return trimmed;
  }
  if (!trialActive) {
    return null;
  }
  return envApiKey || null;
}

const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } });

const router = Router();

// Extend express-session
declare module 'express-session' {
  interface SessionData {
    openaiApiKey?: string;
  }
}

interface TranscribeBody {
  openaiApiKey?: string;
  apiKey?: string;
}

interface StatusResponse {
  available: boolean;
  reason: string | null;
}

interface TranscribeResponse {
  text?: string;
  error?: string;
  code?: string;
}

interface TranscribeOptions {
  session?: SessionWithKeys;
}

/**
 * Check if transcription is available (requires OpenAI key)
 */
function isTranscriptionAvailable(opts: TranscribeOptions = {}): boolean {
  const { session } = opts;

  // Check for OpenAI key from various sources
  const sessionKey = session?.openaiApiKey;
  const envKey = !hasUserProvidedAnyKey(session as SessionWithKeys)
    ? process.env.OPENAI_API_KEY
    : null;

  return !!(sessionKey || envKey);
}

/**
 * GET /api/transcribe/status
 * Returns whether transcription is available
 */
router.get('/status', (req: Request, res: Response<StatusResponse>): void => {
  const available = isTranscriptionAvailable({
    session: req.session as unknown as SessionWithKeys,
  });
  res.json({
    available,
    reason: available ? null : 'Transcription requires an OpenAI API key',
  });
});

// Extend Express Request with multer file
interface MulterRequest extends Request<object, TranscribeResponse, TranscribeBody> {
  file?: Express.Multer.File;
}

/**
 * POST /api/transcribe
 * Accepts an audio file upload and returns a Whisper transcription.
 */
router.post(
  '/',
  upload.single('audio'),
  async (req: MulterRequest, res: Response<TranscribeResponse>): Promise<void> => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'no-audio-file' });
        return;
      }

      const normalize = (value: unknown): string | null =>
        typeof value === 'string' && value.trim() ? value.trim() : null;
      const headerKey =
        normalize(req.get?.('x-openai-key')) || normalize(req.headers?.['x-openai-key']);
      const explicitKey =
        normalize(req.body?.openaiApiKey) || normalize(req.body?.apiKey) || headerKey || null;
      const sessionKey = normalize(req.session?.openaiApiKey);
      const candidateKey = explicitKey || sessionKey || null;
      const effectiveKey = selectApiKey(candidateKey, {
        session: req.session as unknown as SessionWithKeys,
      });

      if (!effectiveKey) {
        // Return 503 with clear message about transcription requirements
        res.status(503).json({
          error:
            'Transcription requires an OpenAI API key. Add one in Settings to enable speech-to-text.',
          code: 'transcription_unavailable',
        });
        return;
      }

      if (explicitKey && req.session) {
        try {
          req.session.openaiApiKey = explicitKey;
          markUserProvidedKey(req.session as unknown as SessionWithKeys, 'openai');
        } catch (err) {
          logger.debug('transcribe_session_key_save_failed', { error: (err as Error).message });
        }
      }

      // Build multipart form to call OpenAI Whisper API
      const form = new FormData();
      form.append('file', file.buffer, { filename: file.originalname || 'speech.webm' });
      form.append('model', 'whisper-1');
      form.append('language', 'en');
      form.append('temperature', '0');

      // Send request to OpenAI
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${effectiveKey}`,
          ...form.getHeaders(),
        },
        body: form,
      });

      const data = (await response.json()) as { text?: string; error?: { message?: string } };
      if (!response.ok) {
        logger.error('whisper_transcription_error', { error: data.error?.message || 'unknown' });
        res.status(500).json({ error: data.error?.message || 'transcription-failed' });
        return;
      }
      res.json({ text: data.text });
    } catch (err) {
      logger.error('whisper_transcription_error', { error: (err as Error).message || String(err) });
      res.status(500).json({ error: 'transcription-failed' });
    }
  }
);

export default router;

// CommonJS compatibility for mixed codebase
module.exports = router;
