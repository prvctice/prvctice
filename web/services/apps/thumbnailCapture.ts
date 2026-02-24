/**
 * Thumbnail Capture
 *
 * Captures a screenshot of rendered app HTML as a data URL.
 * Uses html2canvas (transitive dependency via jspdf) to render
 * the app in a hidden iframe and capture it as a PNG.
 *
 * Thumbnail capture is non-critical -- failures return an empty string.
 */

import html2canvas from 'html2canvas';

/**
 * Render app HTML in a hidden iframe and capture a screenshot.
 *
 * @param html - Full HTML source of the app
 * @param width - Viewport width in pixels
 * @param height - Viewport height in pixels
 * @returns Data URL string (image/png) or empty string on failure
 */
export async function captureAppThumbnail(
  html: string,
  width: number,
  height: number
): Promise<string> {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    iframe.style.width = `${width}px`;
    iframe.style.height = `${height}px`;
    iframe.style.border = 'none';

    document.body.appendChild(iframe);

    // Strip scripts -- thumbnails only need visual rendering, not JS execution.
    // This prevents "prvctice is not defined" errors from app code.
    const staticHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '');

    // Wait for iframe to load content
    await new Promise<void>((resolve) => {
      iframe.addEventListener('load', () => resolve(), { once: true });
      iframe.srcdoc = staticHtml;
    });

    // Wait for rendering to settle (rAF + 500ms timeout)
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 500);
      });
    });

    const body = iframe.contentDocument?.body;
    if (!body) {
      document.body.removeChild(iframe);
      return '';
    }

    const canvas = await html2canvas(body, {
      width,
      height,
      scale: 0.5,
      useCORS: false,
      logging: false,
    });

    const dataUrl = canvas.toDataURL('image/png', 0.7);

    document.body.removeChild(iframe);

    return dataUrl;
  } catch {
    // Thumbnail capture is non-critical -- silently return empty
    return '';
  }
}
