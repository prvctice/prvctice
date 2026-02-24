import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import mime from 'mime-types';
import logger from './logger.js';

export interface MulterFile {
  path: string;
  originalname?: string;
  mimetype: string;
}

export function getExtension(mimetype: string): string | false {
  return mime.extension(mimetype);
}

/**
 * Rename an uploaded file asynchronously to include proper extension.
 * @param file - Multer file object
 * @param extension - File extension without dot
 * @returns new file path
 */
export async function renameFile(file: MulterFile, extension: string): Promise<string> {
  const newFilePath = `${file.path}.${extension}`;
  await fsPromises.rename(file.path, newFilePath);
  return newFilePath;
}

export function deleteFile(filePath: string): void {
  fs.unlink(filePath, (err) => {
    if (err)
      logger.error('file_delete_failed', {
        filePath,
        error: (err as Error).message || String(err),
      });
  });
}

// CommonJS compatibility for mixed codebase
module.exports = { getExtension, renameFile, deleteFile };
