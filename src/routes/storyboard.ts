import { Router, Request, Response, NextFunction } from 'express';
import { getMoodBoardImages } from '../services/moodBoardService.js';
import { searchYouTube } from '../services/youtubeService.js';
import logger from '../utils/logger.js';

const router = Router();

interface StoryboardQuery {
  query?: string;
}

interface StoryboardResponse {
  images: string[];
  videos: string[];
}

/**
 * GET /api/storyboard
 * Query params: query (string)
 * Returns a combined list of mood board images and YouTube video URLs.
 */
router.get(
  '/',
  async (
    req: Request<object, StoryboardResponse, object, StoryboardQuery>,
    res: Response<StoryboardResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const query = req.query.query || '';
      // Fetch mood board images and YouTube results in parallel
      const [moodboardResult, videosRaw] = await Promise.all([
        getMoodBoardImages({ query, count: 6 }),
        searchYouTube(query, 5),
      ]);
      // Extract just URLs
      const images = moodboardResult.images.map((item) => item.url);
      const videos = videosRaw.map((item) => item.url);
      res.json({ images, videos });
    } catch (err) {
      logger.error('storyboard_fetch_failed', { error: (err as Error).message || String(err) });
      next(err);
    }
  }
);

export default router;

// CommonJS compatibility for mixed codebase
module.exports = router;
