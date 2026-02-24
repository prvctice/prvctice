/* eslint-disable import/extensions */
const assert = require('assert');
const { describe, test } = require('node:test');

const { routeRequest } = require('../../src/services/requestRouter');

describe('requestRouter', () => {
  describe('routeRequest', () => {
    describe('default routing (no explicit mode)', () => {
      test('routes to chat_text when no images', () => {
        const result = routeRequest({ text: 'Hello world' });
        assert.strictEqual(result.task, 'chat_text');
        assert.strictEqual(result.uiModal, 'text');
        assert.ok(result.reason.includes('text chat'));
      });

      test('routes to chat_vision when images array has items', () => {
        const result = routeRequest({
          text: 'What is in this image?',
          images: [{ data: 'base64data', mimeType: 'image/png' }],
        });
        assert.strictEqual(result.task, 'chat_vision');
        assert.ok(result.reason.includes('Images attached'));
      });

      test('routes to chat_vision when attachments have image mimeType', () => {
        const result = routeRequest({
          text: 'Describe this',
          attachments: [{ mimeType: 'image/jpeg', path: '/tmp/test.jpg' }],
        });
        assert.strictEqual(result.task, 'chat_vision');
      });

      test('routes to chat_text when attachments are not images', () => {
        const result = routeRequest({
          text: 'Read this PDF',
          attachments: [{ mimeType: 'application/pdf', path: '/tmp/test.pdf' }],
        });
        assert.strictEqual(result.task, 'chat_text');
      });

      test('handles empty input', () => {
        const result = routeRequest({});
        assert.strictEqual(result.task, 'chat_text');
      });

      test('handles undefined input', () => {
        const result = routeRequest();
        assert.strictEqual(result.task, 'chat_text');
      });
    });

    describe('explicit mode override', () => {
      test('uses explicit chat_text mode', () => {
        const result = routeRequest({
          text: 'Hello',
          explicitMode: 'chat_text',
        });
        assert.strictEqual(result.task, 'chat_text');
      });

      test('uses explicit chat_vision mode', () => {
        const result = routeRequest({
          text: 'Hello',
          explicitMode: 'chat_vision',
        });
        assert.strictEqual(result.task, 'chat_vision');
      });

      test('ignores auto mode (uses default routing)', () => {
        const result = routeRequest({
          text: 'Hello',
          images: [{ data: 'base64' }],
          explicitMode: 'auto',
        });
        assert.strictEqual(result.task, 'chat_vision');
      });

      test('maps image_generate to chat_vision when images present', () => {
        const result = routeRequest({
          explicitMode: 'image_generate',
          images: [{ data: 'base64' }],
        });
        assert.strictEqual(result.task, 'chat_vision');
      });

      test('maps image_generate to chat_text when no images', () => {
        const result = routeRequest({
          explicitMode: 'image_generate',
        });
        assert.strictEqual(result.task, 'chat_text');
      });

      test('maps image_edit to chat_vision when images present', () => {
        const result = routeRequest({
          explicitMode: 'image_edit',
          images: [{ data: 'base64' }],
        });
        assert.strictEqual(result.task, 'chat_vision');
      });
    });

    describe('provider suggestion', () => {
      test('includes provider in result', () => {
        const result = routeRequest({
          text: 'Hello',
          provider: 'openai',
        });
        assert.strictEqual(result.provider, 'openai');
      });

      test('normalizes provider to lowercase', () => {
        const result = routeRequest({
          text: 'Hello',
          provider: 'OPENAI',
        });
        assert.strictEqual(result.provider, 'openai');
      });

      test('handles missing provider', () => {
        const result = routeRequest({ text: 'Hello' });
        assert.strictEqual(result.provider, '');
      });
    });

    describe('model suggestions', () => {
      test('suggests model for chat_vision', () => {
        const result = routeRequest({
          images: [{ data: 'base64' }],
        });
        assert.strictEqual(result.task, 'chat_vision');
        assert.ok(result.model);
      });

      test('does not suggest model for chat_text', () => {
        const result = routeRequest({ text: 'Hello' });
        assert.strictEqual(result.task, 'chat_text');
        assert.strictEqual(result.model, undefined);
      });
    });

    describe('image detection', () => {
      test('detects images in images array', () => {
        const result = routeRequest({
          images: [{ mimeType: 'image/png' }],
        });
        assert.strictEqual(result.task, 'chat_vision');
      });

      test('detects images in attachments with image/ mimeType', () => {
        const result = routeRequest({
          attachments: [{ mimeType: 'IMAGE/PNG' }], // uppercase
        });
        assert.strictEqual(result.task, 'chat_vision');
      });

      test('handles empty images array', () => {
        const result = routeRequest({ images: [] });
        assert.strictEqual(result.task, 'chat_text');
      });

      test('handles null attachments', () => {
        const result = routeRequest({ attachments: null });
        assert.strictEqual(result.task, 'chat_text');
      });

      test('handles attachments without mimeType', () => {
        const result = routeRequest({
          attachments: [{ path: '/tmp/file' }],
        });
        assert.strictEqual(result.task, 'chat_text');
      });
    });
  });
});
