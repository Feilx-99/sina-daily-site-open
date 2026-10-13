import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { addDays, isFillableDate, todayShanghai } from "@/lib/domain";
import { PHOTO_BYTE_LIMIT, compressForStorage, photoBlobKey, photoExpired, photoThumbKey } from "@/lib/server/photos";
import { deletePhoto, getPhoto, loadData, saveReport, uploadPhoto } from "@/lib/server/store";

const session = { id: "test", accessId: "admin", role: "admin" as const, departmentId: null, expiresAt: "2099-01-01T00:00:00.000Z" };
const root = process.cwd();
const dir = mkdtempSync(path.join(tmpdir(), "photo-storage-"));

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function blobFile(key: string) {
  return path.join(dir, ".local-blobs", "property-daily-data", encodeURIComponent(key));
}

async function noisyJpeg(width: number, height: number, quality: number) {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i += 3) { raw[i] = i % 251; raw[i + 1] = (i * 3) % 251; raw[i + 2] = (i * 7) % 251; }
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality }).toBuffer();
}

async function main() {
  delete process.env.NETLIFY;
  delete process.env.NETLIFY_BLOBS_CONTEXT;
  delete process.env.SITE_ID;
  delete process.env.NETLIFY_API_TOKEN;
  delete process.env.NETLIFY_AUTH_TOKEN;
  process.chdir(dir);
  const today = todayShanghai();
  assert(photoExpired(addDays(today, -31), today), "31 days is past retention");
  assert(!photoExpired(addDays(today, -30), today), "exactly 30 days still keeps the full image");
  assert(photoBlobKey("abc") === "photos/abc", "full key");
  assert(photoThumbKey("abc") === "photos/abc.thumb", "thumb key");

  const small = await sharp({ create: { width: 24, height: 24, channels: 3, background: "#336699" } }).jpeg({ quality: 70 }).toBuffer();
  const kept = await compressForStorage(small, "image/jpeg");
  assert(kept.contentType === "image/jpeg" && kept.bytes.equals(small), "small jpeg should be stored unchanged");

  const webp = await sharp({ create: { width: 24, height: 24, channels: 3, background: "#993333" } }).webp({ quality: 70 }).toBuffer();
  const keptWebp = await compressForStorage(webp, "image/webp");
  assert(keptWebp.contentType === "image/webp" && keptWebp.bytes.equals(webp), "small webp should be stored unchanged");

  const big = await noisyJpeg(2400, 1800, 95);
  assert(big.length > PHOTO_BYTE_LIMIT, `fixture should exceed 1.5MB, got ${big.length}`);
  const compressed = await compressForStorage(big, "image/jpeg");
  assert(compressed.contentType === "image/jpeg" && compressed.bytes.length <= PHOTO_BYTE_LIMIT, `compressed to ${compressed.bytes.length}`);

  const oldDate = addDays(today, -40);
  const oldReport = await saveReport(session, { reportDate: oldDate, departmentId: "qh_customer", reporterName: "测试", routineStatus: "normal", notes: "", confirmedZero: false, metrics: {} }, false);
  const uploaded = await uploadPhoto(session, oldReport.id, new File([new Uint8Array(big)], "现场.jpg", { type: "image/jpeg" }), "旧照片");
  const fullPath = blobFile(photoBlobKey(uploaded.id));
  const thumbPath = blobFile(photoThumbKey(uploaded.id));
  assert(statSync(fullPath).size <= PHOTO_BYTE_LIMIT, "stored full image is over 1.5MB");
  assert(statSync(thumbPath).size > 0 && statSync(thumbPath).size < statSync(fullPath).size, "thumbnail should be smaller than the full image");

  await loadData(session, oldDate);
  assert(!exists(fullPath), "full blob should be removed after the report date is older than 30 days");
  assert(statSync(thumbPath).size > 0, "thumbnail remains after archival");
  const archivedFull = await getPhoto(session, uploaded.id, "full");
  const archivedThumb = await getPhoto(session, uploaded.id, "thumb");
  assert(archivedFull && archivedThumb, "archived photo should still render");
  assert(archivedFull.contentType === "image/jpeg" && archivedFull.object.byteLength === archivedThumb.object.byteLength, "detail falls back to the thumbnail");

  const recent = await saveReport(session, { reportDate: today, departmentId: "qh_engineering", reporterName: "测试", routineStatus: "normal", notes: "", confirmedZero: false, metrics: {} }, false);
  const tiny = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#228855" } }).jpeg({ quality: 60 }).toBuffer();
  let lastId = "";
  for (let index = 0; index < 6; index++) {
    const photo = await uploadPhoto(session, recent.id, new File([new Uint8Array(tiny)], `n${index}.jpg`, { type: "image/jpeg" }), "");
    lastId = photo.id;
    assert(statSync(blobFile(photoBlobKey(photo.id))).size === tiny.length, "under-limit jpeg was rewritten");
  }
  let rejected = false;
  try { await uploadPhoto(session, recent.id, new File([new Uint8Array(tiny)], "extra.jpg", { type: "image/jpeg" }), ""); }
  catch (error) { rejected = error instanceof Error && error.message.includes("最多上传6张"); }
  assert(rejected, "the 7th photo should be rejected");

  rmSync(blobFile(photoThumbKey(lastId)));
  const regenerated = await getPhoto(session, lastId, "thumb");
  assert(regenerated && statSync(blobFile(photoThumbKey(lastId))).size > 0, "missing thumbnail is generated on access");
  assert(statSync(blobFile(photoBlobKey(lastId))).size === tiny.length, "generating a thumbnail must not remove a recent full image");

  rmSync(blobFile(photoBlobKey(lastId)));
  const fallback = await getPhoto(session, lastId, "full");
  assert(fallback && fallback.object.byteLength > 0, "a photo that only has a thumbnail still opens");

  await deletePhoto(session, lastId);
  assert(!exists(blobFile(photoBlobKey(lastId))) && !exists(blobFile(photoThumbKey(lastId))), "delete removes both blobs");
  const names = readdirSync(path.join(dir, ".local-blobs", "property-daily-data"));
  assert(names.some((name) => decodeURIComponent(name).startsWith("photos/")), "other photo blobs were kept");

  assert(isFillableDate(today, today) && !isFillableDate(addDays(today, -1), today) && !isFillableDate(addDays(today, 1), today), "department fill window is today only");
  const department = { id: "dept", accessId: "qh_security", role: "department" as const, departmentId: "qh_security", expiresAt: "2099-01-01T00:00:00.000Z" };
  const yesterday = addDays(today, -1);
  let blockedSave = false;
  try { await saveReport(department, { reportDate: yesterday, departmentId: "qh_security", reporterName: "部门", routineStatus: "normal", notes: "", confirmedZero: false, metrics: {} }, false); }
  catch (error) { blockedSave = error instanceof Error && error.message.includes("今天"); }
  assert(blockedSave, "department cannot save a draft for yesterday");
  const past = await saveReport(session, { reportDate: yesterday, departmentId: "qh_security", reporterName: "管理员", routineStatus: "normal", notes: "", confirmedZero: false, metrics: {} }, false);
  let blockedUpload = false;
  try { await uploadPhoto(department, past.id, new File([new Uint8Array(tiny)], "past.jpg", { type: "image/jpeg" }), ""); }
  catch (error) { blockedUpload = error instanceof Error && error.message.includes("今天"); }
  assert(blockedUpload, "department cannot upload a photo to yesterday");
  const own = await saveReport(department, { reportDate: today, departmentId: "qh_security", reporterName: "部门", routineStatus: "normal", notes: "", confirmedZero: true, metrics: {} }, true);
  assert(own.status === "submitted", "department can still submit today");
  console.log("photo storage checks passed");
}

function exists(file: string) {
  try { statSync(file); return true; } catch { return false; }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { process.chdir(root); rmSync(dir, { recursive: true, force: true }); });
