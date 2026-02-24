// tumblrService.ts
import axios from 'axios';
import logger from '../utils/logger.js';

const TUMBLR_API_KEY = process.env.TUMBLR_API_KEY;

export interface TumblrImage {
  url: string | null;
  caption: string;
}

interface TumblrPhotoSize {
  url: string;
}

interface TumblrPhoto {
  alt_sizes?: TumblrPhotoSize[];
}

interface TumblrPost {
  type: string;
  'photo-url-1280'?: string;
  'photo-caption'?: string;
  photos?: TumblrPhoto[];
  body?: string;
}

interface TumblrApiResponse {
  meta: {
    status: number;
    msg?: string;
  };
  response: TumblrPost[];
}

/**
 * Given a Tumblr post, return a candidate image URL.
 * - If the post is of type "photo", try legacy field or photos array.
 * - If the post is of type "text" and has a "body", extract the first <img> src.
 */
function extractImageUrlFromPost(post: TumblrPost): string | null {
  if (post.type === 'photo') {
    if (post['photo-url-1280']) {
      return post['photo-url-1280'];
    } else if (post.photos && post.photos.length > 0) {
      const firstPhoto = post.photos[0];
      if (firstPhoto?.alt_sizes && firstPhoto.alt_sizes.length > 0) {
        // Assume the first element is the largest available.
        const firstAltSize = firstPhoto.alt_sizes[0];
        return firstAltSize?.url ?? null;
      }
    }
  } else if (post.type === 'text' && post.body) {
    // Use regex to extract the src attribute from the first <img> tag in the body.
    const match = post.body.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Searches Tumblr posts by tag and returns up to "limit" image objects.
 * The function requests extra posts and then filters by checking if an image URL can be extracted.
 */
export async function searchTumblrImages(query: string, limit: number = 8): Promise<TumblrImage[]> {
  // Convert query to lowercase as Tumblr normalizes tags.
  const encodedTag = encodeURIComponent(query.toLowerCase());
  // Request extra posts so we can filter out ones without images.
  const url = `https://api.tumblr.com/v2/tagged?tag=${encodedTag}&api_key=${TUMBLR_API_KEY}&limit=${limit * 2}`;
  logger.debug('Tumblr API request prepared for tag', { tag: query.toLowerCase() });

  const response = await axios.get<TumblrApiResponse>(url);
  if (response.data.meta.status !== 200) {
    throw new Error(`Tumblr API error: ${response.data.meta.msg}`);
  }

  const posts = response.data.response;

  // Map each post to an image object if an image can be extracted.
  const images: TumblrImage[] = posts
    .map((post) => {
      const imageUrl = extractImageUrlFromPost(post);
      // Use photo-caption if available (for photo posts), or empty string.
      const caption = post['photo-caption'] || '';
      return { url: imageUrl, caption };
    })
    // Filter out posts where no image URL was found.
    .filter((imgObj): imgObj is TumblrImage & { url: string } => imgObj.url !== null);

  // Take only the first "limit" results.
  const selectedImages = images.slice(0, limit);

  logger.debug(`Found ${selectedImages.length} images for query "${query}"`);
  return selectedImages;
}

export default { searchTumblrImages };
