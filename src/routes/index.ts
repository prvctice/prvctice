/**
 * Aggregator router for all API sub-routes.
 * This groups feature-specific routers under a single versioned mount-point
 * (e.g. /api/v1/chat, /api/v1/files) to keep the public surface area tidy
 * and future-proof breaking changes with semantic versioning.
 */

import { Router } from 'express';

const router = Router();

// Feature routers – add new feature routes here.
// Note: These imports use .js extensions for ESM compatibility with tsc output
import chatRouter from './chat/index.js';
import filesRouter from './files.js';
import configRouter from './config.js';
import routeRouter from './route.js';
import dispatchRouter from './dispatch.js';
import openrouterRouter from './openrouter.js';
import lmstudioRouter from './lmstudio.js';
import suggestRouter from './suggest.js';
import connectorRouter from './connectors/index.js';
import generateAppRouter from './generate-app.js';
import iterateAppRouter from './iterate-app.js';
import suggestAppRouter from './suggest-app.js';
import searchRouter from './search.js';
import mediaRouter from './media.js';

router.use('/chat', chatRouter);
router.use('/files', filesRouter);
router.use('/config', configRouter);
router.use('/route', routeRouter);
router.use('/dispatch', dispatchRouter);
router.use('/openrouter', openrouterRouter);
router.use('/lmstudio', lmstudioRouter);
router.use('/suggest', suggestRouter);
router.use('/connectors', connectorRouter);
router.use('/generate-app', generateAppRouter);
router.use('/iterate-app', iterateAppRouter);
router.use('/suggest-app', suggestAppRouter);
router.use('/search', searchRouter);
router.use('/media', mediaRouter);

export default router;

// CommonJS compatibility for mixed codebase
module.exports = router;
