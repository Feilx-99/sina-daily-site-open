import sharp from "sharp";
import { daysBetween, isDateKey, todayShanghai } from "@/lib/domain";

/** 存进 Blobs 的原图上限。上传入口仍允许 10MB，服务端压到这个大小以内。 */
export const PHOTO_BYTE_LIMIT = Math.floor(1.5 * 1024 * 1024);
/** 每个部门（账号）每天最多张数，和填报页一致。 */
export const MAX_PHOTOS_PER_DAY = 6;
/** 日报日期早于今天超过这么多天，就只保留缩略图。照片本身没有单独的上传日期。 */
export const PHOTO_ARCHIVE_DAYS = 30;

/** 原图：`photos/{id}`。已有数据沿用这个键，不改名、不覆盖成别的格式以外的迁移。 */
export const photoBlobKey = (id: string) => `photos/${id}`;
/** 缩略图：`photos/{id}.thumb`，始终是 JPEG。和原图键不同，删除原图不会带走缩略图。 */
export const photoThumbKey = (id: string) => `photos/${id}.thumb`;

export function photoExpired(reportDate: string, today = todayShanghai()) {
  return isDateKey(reportDate) && isDateKey(today) && daysBetween(reportDate, today) > PHOTO_ARCHIVE_DAYS;
}

export function jpegFileName(fileName: string) {
  const trimmed = fileName.trim() || "photo";
  return `${trimmed.replace(/\.[^.]+$/, "")}.jpg`;
}

const decode = (input: Buffer) => sharp(input, { failOn: "none", animated: false, limitInputPixels: 40_000_000 });

async function encodeJpegUnderLimit(input: Buffer) {
  const meta = await decode(input).rotate().metadata();
  let longEdge = Math.min(2560, Math.max(meta.width ?? 1600, meta.height ?? 1600, 1));
  let quality = 82;
  let best: Buffer | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    best = await decode(input)
      .rotate()
      .resize({ width: longEdge, height: longEdge, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (best.length <= PHOTO_BYTE_LIMIT) return best;
    if (quality > 54) quality -= 8;
    else longEdge = Math.round(longEdge * 0.72);
    if (longEdge < 480) break;
  }
  return best ?? input;
}

/**
 * 已经是 JPEG/WebP 且不超过 1.5MB 的文件原样保存，避免再编码把体积变大。
 * PNG 会尝试转成 JPEG；只有转完更大时才保留原文件。超过上限的一律压成 JPEG。
 */
export async function compressForStorage(input: Buffer, contentType: string) {
  const reusable = contentType === "image/jpeg" || contentType === "image/webp" || contentType === "image/png";
  if ((contentType === "image/jpeg" || contentType === "image/webp") && input.length <= PHOTO_BYTE_LIMIT) return { bytes: input, contentType };
  let encoded: Buffer;
  try { encoded = await encodeJpegUnderLimit(input); }
  catch { if (reusable && input.length <= PHOTO_BYTE_LIMIT) return { bytes: input, contentType }; throw new Error("无法处理这张照片，请换一张JPG、PNG或WebP。"); }
  if (input.length <= PHOTO_BYTE_LIMIT && encoded.length >= input.length && (contentType === "image/png" || contentType === "image/jpeg" || contentType === "image/webp")) {
    return { bytes: input, contentType };
  }
  if (encoded.length > PHOTO_BYTE_LIMIT) throw new Error("照片压缩后仍超过1.5MB，请换一张较小的照片。");
  return { bytes: encoded, contentType: "image/jpeg" };
}

export async function makeThumbnail(input: Buffer) {
  const thumb = await decode(input)
    .rotate()
    .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 68, mozjpeg: true })
    .toBuffer();
  if (thumb.length <= input.length) return thumb;
  try {
    const meta = await decode(input).metadata();
    const edge = Math.max(meta.width ?? 0, meta.height ?? 0);
    if (meta.format === "jpeg" && edge > 0 && edge <= 480) return input;
  } catch { /* 原图不是可直接复用的小 JPEG，继续用压出来的缩略图 */ }
  if (thumb.length <= PHOTO_BYTE_LIMIT) return thumb;
  return decode(input)
    .rotate()
    .resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 50, mozjpeg: true })
    .toBuffer();
}
