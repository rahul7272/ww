import { getUrlInfo, extractUrlFromText, prepareWAMessageMedia } from "@whiskeysockets/baileys";
import { getLinkPreview } from "link-preview-js";

/**
 * Fetch rich high-quality link preview for any URL
 * Uses official WhatsApp / Facebook crawler User-Agents to prevent "Error" pages
 */
export async function generateRichLinkPreview(text, sock = null) {
  if (!text || typeof text !== "string") return null;
  const detectedUrl = extractUrlFromText(text);
  if (!detectedUrl) return null;

  const isFacebookOrMeta =
    detectedUrl.includes("facebook.com") ||
    detectedUrl.includes("fb.watch") ||
    detectedUrl.includes("fb.me") ||
    detectedUrl.includes("instagram.com");

  // User agents to try in sequence if blocked or if "Error" is returned
  const userAgents = isFacebookOrMeta
    ? [
        "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        "WhatsApp/2.24.12.78 i",
        "Twitterbot/1.0",
      ]
    : [
        "WhatsApp/2.24.12.78 i",
        "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ];

  let bestResult = null;

  for (const ua of userAgents) {
    try {
      const fetchOpts = {
        timeout: 12000,
        headers: {
          "User-Agent": ua,
          "Accept-Language": "en-US,en;q=0.9",
        },
      };

      const info = await getUrlInfo(detectedUrl, {
        thumbnailWidth: 192,
        fetchOpts,
        uploadImage: sock?.waUploadToServer,
      });

      if (info && info.title && info.title.trim().toLowerCase() !== "error") {
        bestResult = info;
        break;
      }
    } catch (err) {
      console.warn(`[LinkPreview] Attempt with UA "${ua}" failed: ${err.message}`);
    }
  }

  // Fallback to link-preview-js directly if getUrlInfo failed to get clean data
  if (!bestResult || bestResult.title?.trim().toLowerCase() === "error") {
    for (const ua of userAgents) {
      try {
        const raw = await getLinkPreview(detectedUrl, {
          headers: {
            "User-Agent": ua,
            "Accept-Language": "en-US,en;q=0.9",
          },
          followRedirects: "follow",
        });

        if (raw && raw.title && raw.title.trim().toLowerCase() !== "error") {
          const imgUrl = Array.isArray(raw.images) && raw.images.length > 0 ? raw.images[0] : null;
          bestResult = {
            "canonical-url": raw.url || detectedUrl,
            "matched-text": detectedUrl,
            title: raw.title,
            description: raw.description,
            originalThumbnailUrl: imgUrl,
          };

          // Try uploading high-quality thumbnail if socket is available
          if (sock?.waUploadToServer && imgUrl) {
            try {
              const { imageMessage } = await prepareWAMessageMedia(
                { image: { url: imgUrl } },
                {
                  upload: sock.waUploadToServer,
                  mediaTypeOverride: "thumbnail-link",
                  options: {
                    timeout: 10000,
                    headers: { "User-Agent": ua },
                  },
                }
              );
              if (imageMessage) {
                bestResult.jpegThumbnail = imageMessage.jpegThumbnail
                  ? Buffer.from(imageMessage.jpegThumbnail)
                  : undefined;
                bestResult.highQualityThumbnail = imageMessage;
              }
            } catch (upErr) {
              console.warn(`[LinkPreview] Media upload fallback error: ${upErr.message}`);
            }
          }
          break;
        }
      } catch (e) {}
    }
  }

  return bestResult;
}

export { extractUrlFromText };
export default generateRichLinkPreview;

