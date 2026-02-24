/**
 * Storage Connector
 *
 * Per-app namespaced IndexedDB with 5MB quota enforcement.
 * Uses the same app:{appId}:{key} prefix pattern as the Phase 1 storage API.
 */

import { kvGet, kvSet, kvRemove } from '@web/storage/storage.js';
import type { ConnectorHandler } from './types';

// ==================== CONSTANTS ====================

const MAX_QUOTA_BYTES = 50 * 1024 * 1024; // 50MB per app
const META_SIZE_SUFFIX = '__meta:size';
const META_KEYS_SUFFIX = '__meta:keys';

// ==================== HELPERS ====================

function appKey(appId: string, key: string): string {
  return `app:${appId}:${key}`;
}

function metaSizeKey(appId: string): string {
  return appKey(appId, META_SIZE_SUFFIX);
}

function metaKeysKey(appId: string): string {
  return appKey(appId, META_KEYS_SUFFIX);
}

function estimateSize(value: unknown): number {
  return JSON.stringify(value).length * 2; // UTF-16 char width
}

async function getTrackedKeys(appId: string): Promise<string[]> {
  const keys = await kvGet<string[]>(metaKeysKey(appId));
  return keys ?? [];
}

async function setTrackedKeys(appId: string, keys: string[]): Promise<void> {
  await kvSet(metaKeysKey(appId), keys);
}

async function getCurrentSize(appId: string): Promise<number> {
  const size = await kvGet<number>(metaSizeKey(appId));
  return size ?? 0;
}

async function setCurrentSize(appId: string, size: number): Promise<void> {
  await kvSet(metaSizeKey(appId), size);
}

// ==================== HANDLER ====================

async function handle(
  method: string,
  params: Record<string, unknown>,
  appId: string
): Promise<unknown> {
  switch (method) {
    case 'get': {
      const key = params.key as string;
      if (typeof key !== 'string') throw new Error('Missing key parameter');
      return kvGet(appKey(appId, key));
    }

    case 'set': {
      const key = params.key as string;
      if (typeof key !== 'string') throw new Error('Missing key parameter');
      const value = params.value;

      const newValueSize = estimateSize(value);
      const currentSize = await getCurrentSize(appId);
      const existingValue = await kvGet(appKey(appId, key));
      const oldValueSize = existingValue !== undefined ? estimateSize(existingValue) : 0;
      const projectedSize = currentSize - oldValueSize + newValueSize;

      if (projectedSize > MAX_QUOTA_BYTES) {
        throw new Error('Storage quota exceeded (50MB)');
      }

      await kvSet(appKey(appId, key), value);
      await setCurrentSize(appId, projectedSize);

      // Track key in meta keys list
      const keys = await getTrackedKeys(appId);
      if (!keys.includes(key)) {
        await setTrackedKeys(appId, [...keys, key]);
      }

      return true;
    }

    case 'delete': {
      const key = params.key as string;
      if (typeof key !== 'string') throw new Error('Missing key parameter');

      const existingValue = await kvGet(appKey(appId, key));
      if (existingValue !== undefined) {
        const oldValueSize = estimateSize(existingValue);
        const currentSize = await getCurrentSize(appId);
        await kvRemove(appKey(appId, key));
        await setCurrentSize(appId, Math.max(0, currentSize - oldValueSize));

        // Remove from tracked keys
        const keys = await getTrackedKeys(appId);
        await setTrackedKeys(
          appId,
          keys.filter((k) => k !== key)
        );
      }

      return true;
    }

    case 'keys': {
      return getTrackedKeys(appId);
    }

    case 'usage': {
      const currentSize = await getCurrentSize(appId);
      return { used: currentSize, max: MAX_QUOTA_BYTES };
    }

    case 'clear': {
      const keys = await getTrackedKeys(appId);
      for (const key of keys) {
        await kvRemove(appKey(appId, key));
      }
      await setTrackedKeys(appId, []);
      await setCurrentSize(appId, 0);
      return true;
    }

    default:
      throw new Error(`Unknown storage method: ${method}`);
  }
}

export const storageConnector: ConnectorHandler = {
  tier: 'frontend',
  handle,
};
