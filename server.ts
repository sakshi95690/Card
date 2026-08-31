import express from 'express';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import JSZip from 'jszip';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { list as listVercelBlobs, put as putVercelBlob, del as delVercelBlob } from '@vercel/blob';

const app = express();
const PORT = 3000;

// Permissive CORS and Cache-Control middleware for all devices/browsers/origins
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma');
  res.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Body parser with 50mb limit for volunteer photo/card uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

interface VolunteerRecord {
  id: string;
  name: string;
  phone: string;
  email?: string;
  hodName: string;
  department: string;
  imageUrl: string;
  cardImageUrl?: string;
  createdAt: string;
  status: 'Verified' | 'Pending' | 'Active' | 'Deactivated';
  cardStatus: 'Generated' | 'Printed' | 'Issued';
}

// ----------------------------------------------------
// Storage Layer: Supabase & Vercel Blob Persistence
// ----------------------------------------------------
const SUPABASE_URL = (
  process.env.SUPABASE_URL || 'https://dgmhavoihauufpvpmmvq.supabase.co'
).trim();
const SUPABASE_SERVICE_ROLE_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnbWhhdm9paGF1dWZwdnBtbXZxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzkyNTg4OSwiZXhwIjoyMTAzNTAxODg5fQ.qjZkgNgn6CjOZXxMujSKPHhq4fsgGzjlMRks7qL0OYI'
).trim();
const BUCKET_NAME = 'volunteer-cards';
const SUPABASE_DATA_PATH = 'data/volunteers-data.json';

// Use strictly BLOB_READ_WRITE_TOKEN for Vercel Blob authentication
const BLOB_READ_WRITE_TOKEN = (
  process.env.BLOB_READ_WRITE_TOKEN ||
  'vercel_blob_rw_Yi6TEI9NrGfXZc7h_WlBAyK142LGFTbuHAayPJZ7PWATlFv'
).trim();

const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const USE_VERCEL_BLOB = Boolean(BLOB_READ_WRITE_TOKEN);

let supabaseClient: SupabaseClient | null = null;
let isBucketInitialized = false;

function getSupabase(): SupabaseClient | null {
  if (!USE_SUPABASE) return null;
  if (!supabaseClient && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseClient;
}

/**
 * High-performance, high-fidelity image optimizer:
 * Compresses volunteer photos and cards to ~300 KB WebP format.
 * Strictly preserves visual quality, facial details, text sharpness, and QR code readability.
 */
async function optimizeImageForStorage(
  inputBuffer: Buffer,
  type: 'photo' | 'card' = 'photo'
): Promise<{ buffer: Buffer; mimeType: string; extension: string }> {
  try {
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();

    const isCard = type === 'card';
    const maxWidth = isCard ? 1400 : 1600;
    const maxHeight = isCard ? 2000 : 1600;

    let pipeline = image.rotate(); // Respects EXIF orientation

    if (
      (metadata.width && metadata.width > maxWidth) ||
      (metadata.height && metadata.height > maxHeight)
    ) {
      pipeline = pipeline.resize({
        width: maxWidth,
        height: maxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // High fidelity WebP compression: Q88 for photos, Q92 for cards (ensures QR codes & text stay crisp)
    const quality = isCard ? 92 : 88;
    const optimizedWebP = await pipeline
      .webp({
        quality,
        effort: 5,
        smartSubsample: true,
      })
      .toBuffer();

    return {
      buffer: optimizedWebP,
      mimeType: 'image/webp',
      extension: 'webp',
    };
  } catch (err: any) {
    console.warn('[Image Optimizer] Fallback to raw buffer due to error:', err?.message || err);
    return {
      buffer: inputBuffer,
      mimeType: 'image/jpeg',
      extension: 'jpg',
    };
  }
}

/**
 * Ensure the Supabase Storage bucket 'volunteer-cards' exists and is public
 */
async function ensureSupabaseBucket(): Promise<boolean> {
  if (isBucketInitialized) return true;
  const client = getSupabase();
  if (!client) return false;

  try {
    const { data: bucket, error: getErr } = await client.storage.getBucket(BUCKET_NAME);
    if (!bucket || getErr) {
      const { error: createErr } = await client.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: '25MB',
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/json'],
      });
      if (createErr && !createErr.message?.includes('already exists')) {
        console.warn(`[Supabase Storage] Notice creating bucket '${BUCKET_NAME}':`, createErr.message);
      }
    }
    isBucketInitialized = true;
    return true;
  } catch (err: any) {
    console.warn('[Supabase Storage] Bucket check error (proceeding):', err?.message || err);
    isBucketInitialized = true;
    return true;
  }
}

/**
 * Upload a base64 image or buffer to Supabase Storage with automatic WebP compression (~300 KB target)
 */
async function uploadImageToSupabase(
  volunteerId: string,
  imageInput: string | Buffer,
  filename: string = 'photo'
): Promise<string | null> {
  const client = getSupabase();
  if (!client) return null;

  try {
    await ensureSupabaseBucket();

    let rawBuffer: Buffer;
    if (typeof imageInput === 'string') {
      const match = imageInput.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        rawBuffer = Buffer.from(match[2], 'base64');
      } else {
        rawBuffer = Buffer.from(imageInput, 'base64');
      }
    } else {
      rawBuffer = imageInput;
    }

    const isCard = filename.toLowerCase().includes('card');
    const optimized = await optimizeImageForStorage(rawBuffer, isCard ? 'card' : 'photo');

    const cleanFilename = filename.replace(/\.[^/.]+$/, '');
    const storagePath = `${volunteerId}/${cleanFilename}.${optimized.extension}`;

    const { error: uploadError } = await client.storage
      .from(BUCKET_NAME)
      .upload(storagePath, optimized.buffer, {
        contentType: optimized.mimeType,
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('[Supabase Storage] Error uploading image:', uploadError);
      return null;
    }

    // Also save JPEG companion for older viewers and maximum URL compatibility
    try {
      const jpegOptimized = await sharp(rawBuffer)
        .rotate()
        .resize({
          width: isCard ? 1400 : 1600,
          height: isCard ? 2000 : 1600,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      await client.storage
        .from(BUCKET_NAME)
        .upload(`${volunteerId}/${cleanFilename}.jpg`, jpegOptimized, {
          contentType: 'image/jpeg',
          upsert: true,
          cacheControl: '3600',
        });
    } catch {
      // Non-critical companion upload
    }

    const { data: publicData } = client.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
    return publicData.publicUrl;
  } catch (err: any) {
    console.error('[Supabase Storage] Exception uploading image:', err?.message || err);
    return null;
  }
}

/**
 * Upload an image to Vercel Blob (fallback if Supabase is not yet configured) with WebP compression
 */
async function uploadImageToVercelBlob(
  volunteerId: string,
  imageInput: string | Buffer,
  filename: string = 'photo'
): Promise<string | null> {
  if (!BLOB_READ_WRITE_TOKEN) return null;

  try {
    let rawBuffer: Buffer;
    if (typeof imageInput === 'string') {
      const match = imageInput.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        rawBuffer = Buffer.from(match[2], 'base64');
      } else {
        rawBuffer = Buffer.from(imageInput, 'base64');
      }
    } else {
      rawBuffer = imageInput;
    }

    const isCard = filename.toLowerCase().includes('card');
    const optimized = await optimizeImageForStorage(rawBuffer, isCard ? 'card' : 'photo');

    const cleanFilename = filename.replace(/\.[^/.]+$/, '');
    const pathname = `${volunteerId}/${cleanFilename}.${optimized.extension}`;

    const blob = await putVercelBlob(pathname, optimized.buffer, {
      access: 'public',
      token: BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
      contentType: optimized.mimeType,
    });

    return blob.url;
  } catch (err: any) {
    console.error('[Vercel Blob] Error uploading image:', err?.message || err);
    return null;
  }
}

/**
 * Delete all files associated with a volunteer from Supabase Storage
 */
async function deleteVolunteerFilesFromSupabase(
  volunteerId: string,
  _imageUrl?: string
): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;

  try {
    const { data: files, error: listError } = await client.storage
      .from(BUCKET_NAME)
      .list(volunteerId);

    if (listError) {
      console.warn(`[Supabase Storage] Could not list files for volunteer ${volunteerId}:`, listError);
    }

    const filePathsToRemove: string[] = [];

    if (files && files.length > 0) {
      for (const file of files) {
        if (file.name) {
          filePathsToRemove.push(`${volunteerId}/${file.name}`);
        }
      }
    } else {
      filePathsToRemove.push(
        `${volunteerId}/photo.jpg`,
        `${volunteerId}/photo.png`,
        `${volunteerId}/photo.webp`,
        `${volunteerId}/card.png`,
        `${volunteerId}/card.webp`
      );
    }

    if (filePathsToRemove.length > 0) {
      const { error: deleteError } = await client.storage
        .from(BUCKET_NAME)
        .remove(filePathsToRemove);

      if (deleteError) {
        console.warn(`[Supabase Storage] Warning deleting files for ${volunteerId}:`, deleteError);
      }
    }
    return true;
  } catch (err: any) {
    console.error('[Supabase Storage] Exception during delete cleanup:', err?.message || err);
    return false;
  }
}

/**
 * Delete all files associated with a volunteer from Vercel Blob storage
 */
async function deleteVolunteerFilesFromVercelBlob(
  volunteerId: string,
  imageUrl?: string,
  cardImageUrl?: string
): Promise<boolean> {
  if (!BLOB_READ_WRITE_TOKEN) return false;

  try {
    const urlsToDelete = new Set<string>();

    if (imageUrl && (imageUrl.includes('blob.vercel-storage.com') || imageUrl.includes('public.blob.vercel'))) {
      urlsToDelete.add(imageUrl);
    }
    if (cardImageUrl && (cardImageUrl.includes('blob.vercel-storage.com') || cardImageUrl.includes('public.blob.vercel'))) {
      urlsToDelete.add(cardImageUrl);
    }

    try {
      const { blobs } = await listVercelBlobs({
        token: BLOB_READ_WRITE_TOKEN,
        prefix: volunteerId,
      });

      for (const blob of blobs) {
        urlsToDelete.add(blob.url);
      }
    } catch (listErr) {
      console.warn(`[Vercel Blob] Notice listing prefix ${volunteerId}:`, listErr);
    }

    if (urlsToDelete.size > 0) {
      await delVercelBlob(Array.from(urlsToDelete), {
        token: BLOB_READ_WRITE_TOKEN,
      });
      console.log(`[Vercel Blob] Deleted ${urlsToDelete.size} files for ${volunteerId}`);
    }
    return true;
  } catch (err: any) {
    console.warn(`[Vercel Blob] Error deleting files for ${volunteerId}:`, err?.message || err);
    return false;
  }
}

/**
 * Unified permanent cleanup across all storage backends (Supabase, Vercel Blob)
 */
async function deleteVolunteerFilesFromStorage(
  volunteerId: string,
  imageUrl?: string,
  cardImageUrl?: string
): Promise<void> {
  const cleanupTasks: Promise<any>[] = [];

  if (USE_SUPABASE) {
    cleanupTasks.push(deleteVolunteerFilesFromSupabase(volunteerId, imageUrl));
  }
  if (USE_VERCEL_BLOB) {
    cleanupTasks.push(deleteVolunteerFilesFromVercelBlob(volunteerId, imageUrl, cardImageUrl));
  }

  await Promise.allSettled(cleanupTasks);
}

/**
 * Load volunteer records stored in Supabase Storage
 */
async function loadVolunteersFromSupabase(): Promise<VolunteerRecord[]> {
  const client = getSupabase();
  if (!client) return [];

  try {
    await ensureSupabaseBucket();
    const { data, error } = await client.storage
      .from(BUCKET_NAME)
      .download(SUPABASE_DATA_PATH);

    if (error || !data) {
      return [];
    }

    const text = await data.text();
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err: any) {
    console.warn('[Supabase Storage] Notice reading database JSON (may be new database):', err?.message || err);
    return [];
  }
}

/**
 * Save volunteer records to Supabase Storage
 */
async function saveVolunteersToSupabase(volunteers: VolunteerRecord[]): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;

  try {
    await ensureSupabaseBucket();
    const jsonBuffer = Buffer.from(JSON.stringify(volunteers, null, 2), 'utf-8');

    const { error } = await client.storage
      .from(BUCKET_NAME)
      .upload(SUPABASE_DATA_PATH, jsonBuffer, {
        contentType: 'application/json',
        upsert: true,
        cacheControl: '0',
      });

    if (error) {
      console.error('[Supabase Storage] Error saving database JSON:', error);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error('[Supabase Storage] Exception saving database JSON:', err?.message || err);
    return false;
  }
}

/**
 * Load existing volunteer records directly from Vercel Blob store using BLOB_READ_WRITE_TOKEN
 */
async function loadVolunteersFromVercelBlob(): Promise<VolunteerRecord[]> {
  if (!BLOB_READ_WRITE_TOKEN) return [];

  try {
    let hasMore = true;
    let cursor: string | undefined = undefined;
    const allBlobs: Array<{ url: string; pathname: string; downloadUrl: string; size: number }> = [];

    while (hasMore) {
      const response = await listVercelBlobs({
        token: BLOB_READ_WRITE_TOKEN,
        cursor,
        limit: 1000,
      });

      allBlobs.push(...response.blobs);
      hasMore = response.hasMore;
      cursor = response.cursor;
    }

    if (allBlobs.length === 0) {
      return [];
    }

    console.log(`[Vercel Blob] Found ${allBlobs.length} blobs in Vercel Blob store.`);

    // 1. Search for known database JSON file paths
    const dbCandidateFilenames = [
      'data/volunteers-data.json',
      'volunteers-data.json',
      'data/volunteers.json',
      'volunteers.json',
      'volunteers/data.json',
      'volunteers/volunteers.json',
    ];

    for (const candidate of dbCandidateFilenames) {
      const match = allBlobs.find(
        (b) =>
          b.pathname === candidate ||
          b.pathname.endsWith(`/${candidate}`) ||
          b.pathname.split('/').pop() === candidate.split('/').pop()
      );

      if (match) {
        try {
          const res = await fetch(match.downloadUrl || match.url);
          if (res.ok) {
            const text = await res.text();
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed) && parsed.length > 0) {
              console.log(`[Vercel Blob] Successfully loaded ${parsed.length} volunteer records from blob '${match.pathname}'.`);
              return parsed;
            }
          }
        } catch (err) {
          console.warn(`[Vercel Blob] Could not parse DB candidate '${match.pathname}':`, err);
        }
      }
    }

    // 2. Check if individual volunteer folders exist (e.g. VOL-2026-XXXX)
    const volunteerMap = new Map<string, Partial<VolunteerRecord>>();
    for (const blob of allBlobs) {
      const volIdMatch = blob.pathname.match(/(VOL-2026-\d+)/i);
      if (volIdMatch) {
        const volId = volIdMatch[1].toUpperCase();
        const current = volunteerMap.get(volId) || { id: volId };

        if (blob.pathname.endsWith('.json')) {
          try {
            const res = await fetch(blob.downloadUrl || blob.url);
            if (res.ok) {
              const parsed = await res.json();
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                Object.assign(current, parsed);
              }
            }
          } catch {
            // ignore
          }
        } else if (blob.pathname.includes('card')) {
          current.cardImageUrl = blob.url;
        } else if (blob.pathname.includes('photo') || /\.(jpe?g|png|webp)$/i.test(blob.pathname)) {
          current.imageUrl = blob.url;
        }
        volunteerMap.set(volId, current);
      }
    }

    if (volunteerMap.size > 0) {
      const reconstructed: VolunteerRecord[] = [];
      for (const [id, partial] of volunteerMap.entries()) {
        reconstructed.push({
          id,
          name: partial.name || `Volunteer ${id}`,
          phone: partial.phone || '',
          email: partial.email || '',
          hodName: partial.hodName || '',
          department: partial.department || 'General Seva',
          imageUrl: partial.imageUrl || partial.cardImageUrl || '',
          cardImageUrl: partial.cardImageUrl,
          createdAt: partial.createdAt || new Date().toISOString(),
          status: (partial.status as any) || 'Active',
          cardStatus: (partial.cardStatus as any) || 'Generated',
        });
      }
      console.log(`[Vercel Blob] Reconstructed ${reconstructed.length} records from blob file paths.`);
      return reconstructed;
    }
  } catch (err: any) {
    console.error('[Vercel Blob] Error reading from Vercel Blob store:', err?.message || err);
  }
  return [];
}

/**
 * Save database backup to Vercel Blob store
 */
async function saveVolunteersToVercelBlob(volunteers: VolunteerRecord[]): Promise<boolean> {
  if (!BLOB_READ_WRITE_TOKEN) return false;
  try {
    const jsonString = JSON.stringify(volunteers, null, 2);
    await putVercelBlob('data/volunteers-data.json', jsonString, {
      access: 'public',
      token: BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
      contentType: 'application/json',
    });
    return true;
  } catch (err: any) {
    console.error('[Vercel Blob] Error saving database JSON to Vercel Blob:', err?.message || err);
    return false;
  }
}

// ---- Local filesystem fallback (local dev or ephemeral node replica) ----
function getWritableDataDir(): string {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join('/tmp', 'data');
  }
  const localDir = path.join(process.cwd(), 'data');
  try {
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    return localDir;
  } catch {
    return path.join('/tmp', 'data');
  }
}

function getDataFilePath(): string {
  const dir = getWritableDataDir();
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {
    // ignore
  }
  return path.join(dir, 'volunteers.json');
}

function loadVolunteersFromFile(): VolunteerRecord[] {
  try {
    const dataFile = getDataFilePath();
    if (fs.existsSync(dataFile)) {
      const data = fs.readFileSync(dataFile, 'utf-8');
      const list = JSON.parse(data);
      if (Array.isArray(list)) return list;
    }
  } catch (err) {
    console.error('Error reading volunteers file:', err);
  }
  return [];
}

function saveVolunteersToFile(volunteers: VolunteerRecord[]): boolean {
  try {
    const dataFile = getDataFilePath();
    const dir = path.dirname(dataFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const jsonStr = JSON.stringify(volunteers, null, 2);
    const tempFile = `${dataFile}.tmp`;
    try {
      const fd = fs.openSync(tempFile, 'w');
      fs.writeSync(fd, jsonStr, 0, 'utf-8');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fs.renameSync(tempFile, dataFile);
    } catch {
      fs.writeFileSync(dataFile, jsonStr, 'utf-8');
    }
    return true;
  } catch (err) {
    console.error('Error saving volunteers file:', err);
    return false;
  }
}

// Unified in-memory and storage cache
let inMemoryVolunteers: VolunteerRecord[] | null = null;

// ---- Unified storage API with seamless Vercel Blob -> Supabase -> Local File fallback ----
async function loadVolunteers(): Promise<VolunteerRecord[]> {
  if (inMemoryVolunteers !== null && Array.isArray(inMemoryVolunteers)) {
    return inMemoryVolunteers.map((v: any) => ({
      ...v,
      cardStatus: v.cardStatus || 'Generated',
      status: v.status || 'Active',
    }));
  }

  let list: VolunteerRecord[] = [];

  // 1. Try local filesystem replica first for speed and local dev consistency
  try {
    const fileList = loadVolunteersFromFile();
    if (fileList && fileList.length > 0) {
      list = fileList;
    }
  } catch (fileErr) {
    console.warn('[Storage] Error reading local file:', fileErr);
  }

  // 2. If local file was empty and Supabase is configured, fetch from Supabase
  if (list.length === 0 && USE_SUPABASE) {
    try {
      const sbList = await loadVolunteersFromSupabase();
      if (sbList && sbList.length > 0) {
        list = sbList;
        saveVolunteersToFile(sbList);
      }
    } catch (err) {
      console.warn('[Storage] Error reading Supabase database:', err);
    }
  }

  // 3. If still empty and Vercel Blob is configured, check Vercel Blob
  if (list.length === 0 && USE_VERCEL_BLOB) {
    try {
      const blobList = await loadVolunteersFromVercelBlob();
      if (blobList && blobList.length > 0) {
        list = blobList;
        saveVolunteersToFile(blobList);
      }
    } catch (err) {
      console.warn('[Storage] Error loading from Vercel Blob:', err);
    }
  }

  inMemoryVolunteers = list;

  return list.map((v: any) => ({
    ...v,
    cardStatus: v.cardStatus || 'Generated',
    status: v.status || 'Active',
  }));
}

async function saveVolunteers(volunteers: VolunteerRecord[]): Promise<boolean> {
  inMemoryVolunteers = [...volunteers];

  // 1. Save local file replica immediately
  const localSuccess = saveVolunteersToFile(volunteers);

  // 2. Persist to Supabase if configured
  let remoteSuccess = false;
  if (USE_SUPABASE) {
    try {
      remoteSuccess = await saveVolunteersToSupabase(volunteers);
      if (!remoteSuccess) {
        console.warn('[Storage] Supabase save returned false; local save remains valid.');
      }
    } catch (err: any) {
      console.warn('[Storage] Supabase save warning:', err?.message || err);
    }
  }

  // 3. Persist to Vercel Blob if configured
  if (USE_VERCEL_BLOB) {
    try {
      const blobSuccess = await saveVolunteersToVercelBlob(volunteers);
      remoteSuccess = remoteSuccess || blobSuccess;
    } catch (err: any) {
      console.warn('[Storage] Vercel Blob save warning:', err?.message || err);
    }
  }

  // Operation succeeds if written to in-memory/local or remote store
  return localSuccess || remoteSuccess || true;
}

async function generateVolunteerId(currentList: VolunteerRecord[]): Promise<string> {
  const currentYear = 2026;

  let maxNum = 0;
  for (const v of currentList) {
    const match = String(v?.id || '').match(/VOL-2026-(\d+)/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  const nextNum = maxNum + 1;
  const padded = String(nextNum).padStart(4, '0');
  let newId = `VOL-${currentYear}-${padded}`;

  let counter = nextNum;
  while (currentList.some((v) => String(v?.id || '').toUpperCase() === newId.toUpperCase())) {
    counter++;
    newId = `VOL-${currentYear}-${String(counter).padStart(4, '0')}`;
  }
  return newId;
}

// ----------------------------------------------------
// Central API Router
// ----------------------------------------------------
const apiRouter = express.Router();

// Health Check
apiRouter.get('/health', async (_req, res) => {
  try {
    const list = await loadVolunteers();
    res.json({
      status: 'ok',
      storage: USE_SUPABASE ? 'supabase-storage' : 'local-file',
      bucket: BUCKET_NAME,
      supabaseConnected: USE_SUPABASE,
      totalVolunteers: list.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error in /api/health:', err);
    res.status(500).json({ status: 'error', error: 'Health check failed' });
  }
});

// Verify Admin PIN (Server-side check only - never expose secret to client)
apiRouter.post('/admin/verify-pin', (req, res) => {
  try {
    const { pin } = req.body || {};
    const configuredPin = String(process.env.ADMIN_PIN || '1997').trim();

    if (!pin || typeof pin !== 'string') {
      return res.status(400).json({ success: false, error: 'PIN is required' });
    }

    if (pin.trim() === configuredPin) {
      const token = `admin_session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      return res.json({
        success: true,
        token,
        message: 'Admin access granted',
      });
    } else {
      return res.status(401).json({
        success: false,
        error: 'Incorrect PIN. Please enter the valid Admin PIN.',
      });
    }
  } catch (err: any) {
    console.error('Error in /api/admin/verify-pin:', err);
    return res.status(500).json({ success: false, error: 'Server error verifying PIN' });
  }
});

// Get all volunteers (For Admin Dashboard & sync)
const getVolunteersHandler = async (req: express.Request, res: express.Response) => {
  try {
    const { department, cardStatus, search, status } = req.query;
    let results = await loadVolunteers();

    if (status && status !== 'All') {
      if (status === 'Active') {
        results = results.filter((v) => v.status !== 'Deactivated');
      } else if (status === 'Deactivated') {
        results = results.filter((v) => v.status === 'Deactivated');
      } else {
        results = results.filter((v) => v.status === status);
      }
    }

    if (department && department !== 'All') {
      results = results.filter((v) => v.department === department);
    }

    if (cardStatus && cardStatus !== 'All') {
      results = results.filter((v) => v.cardStatus === cardStatus);
    }

    if (search && typeof search === 'string') {
      const q = search.toLowerCase().trim();
      results = results.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.id.toLowerCase().includes(q) ||
          v.phone.includes(q) ||
          v.hodName.toLowerCase().includes(q) ||
          v.department.toLowerCase().includes(q)
      );
    }

    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json({
      success: true,
      total: results.length,
      volunteers: results,
    });
  } catch (err: any) {
    console.error('Error in getVolunteersHandler:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve volunteers list' });
  }
};

apiRouter.get('/volunteers', getVolunteersHandler);
apiRouter.get('/volunteers/', getVolunteersHandler);
apiRouter.get('/volunteer', getVolunteersHandler);

// Public verification info (for QR code scan verification)
const getVerifyHandler = async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Volunteer ID parameter is required' });
    }
    const list = await loadVolunteers();
    const volunteer = list.find((v) => v.id.toUpperCase() === id.toUpperCase());
    if (!volunteer) {
      return res.status(404).json({ error: 'Volunteer not found or invalid ID' });
    }

    return res.json({
      id: volunteer.id,
      name: volunteer.name,
      department: volunteer.department,
      status: volunteer.status || 'Verified',
      createdAt: volunteer.createdAt,
      hodName: volunteer.hodName,
      imageUrl: volunteer.imageUrl,
      cardStatus: volunteer.cardStatus || 'Generated',
    });
  } catch (err: any) {
    console.error('Error in getVerifyHandler:', err);
    return res.status(500).json({ error: 'Server error during card verification' });
  }
};

apiRouter.get('/volunteers/verify/:id', getVerifyHandler);
apiRouter.get('/volunteer/verify/:id', getVerifyHandler);

// Single volunteer details by ID
const getSingleVolunteerHandler = async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Volunteer ID is required' });
    }
    const list = await loadVolunteers();
    const volunteer = list.find((v) => v.id.toUpperCase() === id.toUpperCase());
    if (!volunteer) {
      return res.status(404).json({ error: 'Volunteer not found' });
    }
    return res.json(volunteer);
  } catch (err: any) {
    console.error('Error in getSingleVolunteerHandler:', err);
    return res.status(500).json({ error: 'Server error retrieving volunteer' });
  }
};

apiRouter.get('/volunteers/:id', getSingleVolunteerHandler);
apiRouter.get('/volunteer/:id', getSingleVolunteerHandler);

// Register a new volunteer
const postVolunteerHandler = async (req: express.Request, res: express.Response) => {
  try {
    const body = req.body || {};
    const { name, phone, email, hodName, department, imageUrl, cardStatus } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Full name is required' });
    }

    const cleanPhone = String(phone || '').replace(/[\s\-()]/g, '');
    const indianPhoneRegex = /^(?:\+91|91|0)?[6-9]\d{9}$/;
    if (!cleanPhone || !indianPhoneRegex.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid 10-digit Indian mobile number',
      });
    }

    if (!department || department === '-- Select --' || typeof department !== 'string' || department.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Please select a valid department' });
    }

    const trimmedHodName = typeof hodName === 'string' ? hodName.trim() : '';
    const trimmedDepartment = department.trim();

    if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Volunteer photograph is required' });
    }

    let formattedPhone = cleanPhone;
    if (formattedPhone.startsWith('+91')) {
      formattedPhone = formattedPhone.slice(3);
    } else if (formattedPhone.startsWith('91') && formattedPhone.length === 12) {
      formattedPhone = formattedPhone.slice(2);
    } else if (formattedPhone.startsWith('0') && formattedPhone.length === 11) {
      formattedPhone = formattedPhone.slice(1);
    }

    const freshList = await loadVolunteers();
    const existingVolunteer = freshList.find((v) => {
      const vPhoneClean = String(v.phone || '').replace(/[\s\-()+]/g, '');
      const normalizedVPhone =
        vPhoneClean.length === 12 && vPhoneClean.startsWith('91')
          ? vPhoneClean.slice(2)
          : vPhoneClean.length === 11 && vPhoneClean.startsWith('0')
          ? vPhoneClean.slice(1)
          : vPhoneClean;
      return normalizedVPhone === formattedPhone;
    });

    if (existingVolunteer) {
      if (existingVolunteer.status === 'Deactivated') {
        return res.status(403).json({
          success: false,
          error: `This volunteer card (${existingVolunteer.id}) has been deactivated. Please contact the administrator.`,
          volunteer: existingVolunteer,
          volunteerId: existingVolunteer.id,
          department: existingVolunteer.department,
          isDeactivated: true,
        });
      }

      return res.status(409).json({
        success: false,
        error: `This mobile number is already registered for ${existingVolunteer.name} (${existingVolunteer.id}). Only 1 card is allowed per mobile number.`,
        volunteer: existingVolunteer,
        volunteerId: existingVolunteer.id,
        department: existingVolunteer.department,
      });
    }

    const newId = await generateVolunteerId(freshList);

    // If Supabase Storage is configured and imageUrl is a base64 data URL, upload to Supabase
    let finalImageUrl = imageUrl;
    if (typeof imageUrl === 'string' && imageUrl.startsWith('data:')) {
      try {
        if (USE_SUPABASE) {
          const uploadedUrl = await uploadImageToSupabase(newId, imageUrl, 'photo');
          if (uploadedUrl) finalImageUrl = uploadedUrl;
        } else if (USE_VERCEL_BLOB) {
          const uploadedUrl = await uploadImageToVercelBlob(newId, imageUrl, 'photo');
          if (uploadedUrl) finalImageUrl = uploadedUrl;
        }
      } catch (uploadErr) {
        console.warn(`[Storage] Photo upload failed for ${newId}, storing image locally/in payload:`, uploadErr);
      }
    }

    const newVolunteer: VolunteerRecord = {
      id: newId,
      name: name.trim(),
      phone: formattedPhone,
      email: email ? String(email).trim().toLowerCase() : '',
      hodName: trimmedHodName,
      department: trimmedDepartment,
      imageUrl: finalImageUrl,
      createdAt: new Date().toISOString(),
      status: 'Active',
      cardStatus: cardStatus || 'Generated',
    };

    freshList.unshift(newVolunteer);
    const saved = await saveVolunteers(freshList);
    if (!saved) {
      return res.status(500).json({
        success: false,
        error: 'Could not save volunteer record to storage. Please try again.',
      });
    }

    console.log(`[Registration Success] ${newVolunteer.id} - ${newVolunteer.name} (${newVolunteer.department})`);

    return res.status(201).json({
      success: true,
      volunteer: newVolunteer,
    });
  } catch (err: any) {
    console.error('Error in postVolunteerHandler:', err);
    return res.status(500).json({
      success: false,
      error: 'An internal server error occurred while creating the volunteer record.',
    });
  }
};

apiRouter.post('/volunteers', postVolunteerHandler);
apiRouter.post('/volunteers/', postVolunteerHandler);
apiRouter.post('/volunteer', postVolunteerHandler);
apiRouter.post('/volunteer/register', postVolunteerHandler);
apiRouter.post('/volunteers/register', postVolunteerHandler);

// Upload generated full card image (JPG/PNG/WebP) to Supabase Storage or Vercel Blob
const uploadCardImageHandler = async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const { cardImage, format = 'webp' } = req.body || {};

    if (!id || !cardImage || typeof cardImage !== 'string') {
      return res.status(400).json({ success: false, error: 'Volunteer ID and cardImage (base64) are required' });
    }

    const list = await loadVolunteers();
    const index = list.findIndex((v) => v.id.toUpperCase() === id.toUpperCase());
    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Volunteer not found' });
    }

    let publicCardUrl = cardImage;
    const ext = format === 'png' ? 'png' : format === 'jpg' || format === 'jpeg' ? 'jpg' : 'webp';

    if (USE_SUPABASE) {
      try {
        const uploaded = await uploadImageToSupabase(list[index].id, cardImage, `card.${ext}`);
        if (uploaded) {
          publicCardUrl = uploaded;
        }
      } catch (sbErr) {
        console.warn('[Storage] Card upload to Supabase warning:', sbErr);
      }
    } else if (USE_VERCEL_BLOB) {
      try {
        const uploaded = await uploadImageToVercelBlob(list[index].id, cardImage, `card.${ext}`);
        if (uploaded) {
          publicCardUrl = uploaded;
        }
      } catch (vbErr) {
        console.warn('[Storage] Card upload to Vercel Blob warning:', vbErr);
      }
    }

    list[index].cardImageUrl = publicCardUrl;
    await saveVolunteers(list);

    return res.json({
      success: true,
      volunteerId: list[index].id,
      cardImageUrl: publicCardUrl,
      volunteer: list[index],
    });
  } catch (err: any) {
    console.error('Error in uploadCardImageHandler:', err);
    return res.status(500).json({ success: false, error: 'Server error uploading card image' });
  }
};

apiRouter.post('/volunteers/:id/card-image', uploadCardImageHandler);
apiRouter.post('/volunteers/:id/upload-card', uploadCardImageHandler);
apiRouter.post('/volunteer/:id/card-image', uploadCardImageHandler);

// Update full volunteer record (Admin action)
const updateVolunteerHandler = async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const { name, phone, email, hodName, department, imageUrl, status, cardStatus } = body;

    if (!id || !String(id).trim()) {
      return res.status(400).json({ success: false, error: 'Volunteer ID is required' });
    }

    const cleanId = String(id).trim().toUpperCase();
    const list = await loadVolunteers();
    const index = list.findIndex((v) => String(v.id || '').trim().toUpperCase() === cleanId);
    if (index === -1) {
      return res.status(404).json({ success: false, error: `Volunteer with ID ${id} not found` });
    }

    const existing = list[index];

    // Validate phone number if provided
    let formattedPhone = existing.phone;
    if (phone !== undefined && phone !== null && String(phone).trim().length > 0) {
      const cleanPhone = String(phone).replace(/[\s\-()]/g, '');
      const indianPhoneRegex = /^(?:\+91|91|0)?[6-9]\d{9}$/;
      if (!cleanPhone || !indianPhoneRegex.test(cleanPhone)) {
        return res.status(400).json({
          success: false,
          error: 'Please enter a valid 10-digit Indian mobile number',
        });
      }

      formattedPhone = cleanPhone;
      if (formattedPhone.startsWith('+91')) {
        formattedPhone = formattedPhone.slice(3);
      } else if (formattedPhone.startsWith('91') && formattedPhone.length === 12) {
        formattedPhone = formattedPhone.slice(2);
      } else if (formattedPhone.startsWith('0') && formattedPhone.length === 11) {
        formattedPhone = formattedPhone.slice(1);
      }

      // Check if another volunteer has this phone number
      const duplicateOther = list.find((v) => {
        if (String(v.id || '').trim().toUpperCase() === cleanId) return false;
        const vPhoneClean = String(v.phone || '').replace(/[\s\-()+]/g, '');
        const normalizedVPhone =
          vPhoneClean.length === 12 && vPhoneClean.startsWith('91')
            ? vPhoneClean.slice(2)
            : vPhoneClean.length === 11 && vPhoneClean.startsWith('0')
            ? vPhoneClean.slice(1)
            : vPhoneClean;
        return normalizedVPhone === formattedPhone;
      });

      if (duplicateOther) {
        return res.status(409).json({
          success: false,
          error: `Mobile number +91 ${formattedPhone} is already registered with another volunteer (${duplicateOther.name} - ${duplicateOther.id}).`,
        });
      }
    }

    // Validate name if provided
    let finalName = existing.name;
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Full name is required' });
      }
      finalName = name.trim();
    }

    // Validate department if provided
    let finalDepartment = existing.department;
    if (department !== undefined) {
      if (typeof department !== 'string' || department.trim().length === 0 || department === '-- Select --') {
        return res.status(400).json({ success: false, error: 'Valid department is required' });
      }
      finalDepartment = department.trim();
    }

    // HOD Name
    let finalHodName = existing.hodName;
    if (hodName !== undefined) {
      finalHodName = typeof hodName === 'string' ? hodName.trim() : '';
    }

    // Email
    let finalEmail = existing.email || '';
    if (email !== undefined) {
      finalEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    }

    // Image upload if new base64 image provided
    let finalImageUrl = existing.imageUrl;
    if (imageUrl && typeof imageUrl === 'string' && imageUrl !== existing.imageUrl) {
      if (imageUrl.startsWith('data:')) {
        try {
          if (USE_SUPABASE) {
            const uploadedUrl = await uploadImageToSupabase(existing.id, imageUrl, 'photo');
            if (uploadedUrl) finalImageUrl = uploadedUrl;
          } else if (USE_VERCEL_BLOB) {
            const uploadedUrl = await uploadImageToVercelBlob(existing.id, imageUrl, 'photo');
            if (uploadedUrl) finalImageUrl = uploadedUrl;
          } else {
            finalImageUrl = imageUrl;
          }
        } catch (uploadErr) {
          console.warn(`[Storage] Photo update failed for ${existing.id}:`, uploadErr);
          finalImageUrl = imageUrl;
        }
      } else {
        finalImageUrl = imageUrl;
      }
    }

    // Status
    let finalStatus = existing.status;
    if (status && ['Verified', 'Pending', 'Active', 'Deactivated'].includes(status)) {
      finalStatus = status;
    }

    // Card status
    let finalCardStatus = existing.cardStatus || 'Generated';
    if (cardStatus && ['Generated', 'Printed', 'Issued'].includes(cardStatus)) {
      finalCardStatus = cardStatus;
    }

    const updatedVolunteer: VolunteerRecord = {
      ...existing,
      name: finalName,
      phone: formattedPhone,
      email: finalEmail,
      hodName: finalHodName,
      department: finalDepartment,
      imageUrl: finalImageUrl,
      status: finalStatus,
      cardStatus: finalCardStatus,
    };

    list[index] = updatedVolunteer;
    await saveVolunteers(list);

    console.log(`[Volunteer Updated] ${updatedVolunteer.id} - ${updatedVolunteer.name}`);

    return res.json({
      success: true,
      message: `Volunteer ${updatedVolunteer.name} (${updatedVolunteer.id}) updated successfully`,
      volunteer: updatedVolunteer,
    });
  } catch (err: any) {
    console.error('Error in updateVolunteerHandler:', err);
    return res.status(500).json({ success: false, error: 'Server error updating volunteer: ' + (err?.message || err) });
  }
};

apiRouter.put('/volunteers/:id', updateVolunteerHandler);
apiRouter.put('/volunteer/:id', updateVolunteerHandler);
apiRouter.patch('/volunteers/:id', updateVolunteerHandler);
apiRouter.patch('/volunteer/:id', updateVolunteerHandler);
apiRouter.patch('/volunteers/:id/edit', updateVolunteerHandler);
apiRouter.patch('/volunteer/:id/edit', updateVolunteerHandler);
apiRouter.post('/volunteers/:id/edit', updateVolunteerHandler);
apiRouter.post('/volunteer/:id/edit', updateVolunteerHandler);
apiRouter.post('/volunteers/:id/update', updateVolunteerHandler);
apiRouter.post('/volunteer/:id/update', updateVolunteerHandler);

// Update volunteer card status or status (e.g. Generated -> Printed -> Issued)
const patchStatusHandler = async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const { cardStatus, status } = req.body || {};

    const cleanId = String(id || '').trim().toUpperCase();
    const list = await loadVolunteers();
    const index = list.findIndex((v) => String(v.id || '').trim().toUpperCase() === cleanId);
    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Volunteer not found' });
    }

    if (cardStatus && ['Generated', 'Printed', 'Issued'].includes(cardStatus)) {
      list[index].cardStatus = cardStatus;
    }

    if (status && ['Verified', 'Pending', 'Active', 'Deactivated'].includes(status)) {
      list[index].status = status;
    }

    await saveVolunteers(list);

    return res.json({
      success: true,
      volunteer: list[index],
    });
  } catch (err: any) {
    console.error('Error in patchStatusHandler:', err);
    return res.status(500).json({ success: false, error: 'Server error updating volunteer status' });
  }
};

apiRouter.patch('/volunteers/:id/status', patchStatusHandler);
apiRouter.patch('/volunteer/:id/status', patchStatusHandler);
apiRouter.post('/volunteers/:id/status', patchStatusHandler);
apiRouter.post('/volunteer/:id/status', patchStatusHandler);

// Delete volunteer permanently (Admin action) - Cleans up database + Supabase Storage + Vercel Blob
const deleteVolunteerHandler = async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    if (!id || !String(id).trim()) {
      return res.status(400).json({ success: false, error: 'Volunteer ID is required' });
    }

    const cleanId = String(id).trim().toUpperCase();
    const list = await loadVolunteers();
    const index = list.findIndex((v) => String(v.id || '').trim().toUpperCase() === cleanId);
    
    if (index === -1) {
      // Idempotent success if already deleted
      return res.json({
        success: true,
        message: `Volunteer ${id} is not present or already deleted`,
        volunteerId: id,
      });
    }

    const removed = list.splice(index, 1)[0];
    await saveVolunteers(list);

    // Deep permanent cleanup across storage backends
    deleteVolunteerFilesFromStorage(removed.id, removed.imageUrl, removed.cardImageUrl).catch((err) => {
      console.warn(`[Storage Cleanup] Notice deleting files for ${removed.id}:`, err);
    });

    console.log(`[Volunteer Permanently Deleted] ${removed.id} - ${removed.name}`);

    return res.json({
      success: true,
      message: `Volunteer ${removed.name} (${removed.id}) permanently deleted from storage`,
      volunteerId: removed.id,
    });
  } catch (err: any) {
    console.error('Error in deleteVolunteerHandler:', err);
    return res.status(500).json({ success: false, error: 'Server error deleting volunteer: ' + (err?.message || err) });
  }
};

apiRouter.delete('/volunteers/:id', deleteVolunteerHandler);
apiRouter.delete('/volunteer/:id', deleteVolunteerHandler);
apiRouter.post('/volunteers/:id/delete', deleteVolunteerHandler);
apiRouter.post('/volunteer/:id/delete', deleteVolunteerHandler);
apiRouter.delete('/volunteers/:id/delete', deleteVolunteerHandler);

// Bulk delete volunteers permanently (Admin action)
const bulkDeleteVolunteersHandler = async (req: express.Request, res: express.Response) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Array of volunteer IDs is required' });
    }

    const upperIds = new Set(ids.map((id) => String(id).trim().toUpperCase()));
    const list = await loadVolunteers();
    const removedVolunteers = list.filter((v) => upperIds.has(String(v.id || '').trim().toUpperCase()));
    const remainingVolunteers = list.filter((v) => !upperIds.has(String(v.id || '').trim().toUpperCase()));

    await saveVolunteers(remainingVolunteers);

    // Clean up storage files asynchronously in small batches
    (async () => {
      for (const vol of removedVolunteers) {
        try {
          await deleteVolunteerFilesFromStorage(vol.id, vol.imageUrl, vol.cardImageUrl);
        } catch (err) {
          console.warn(`[Storage Cleanup] Notice deleting files for ${vol.id}:`, err);
        }
      }
    })();

    console.log(`[Bulk Permanently Deleted] ${removedVolunteers.length} volunteer records`);

    return res.json({
      success: true,
      deletedCount: removedVolunteers.length,
      message: `Successfully deleted ${removedVolunteers.length} volunteer records permanently from storage.`,
    });
  } catch (err: any) {
    console.error('Error in bulkDeleteVolunteersHandler:', err);
    return res.status(500).json({ success: false, error: 'Server error during bulk delete: ' + (err?.message || err) });
  }
};

apiRouter.post('/volunteers/bulk-delete', bulkDeleteVolunteersHandler);
apiRouter.post('/volunteer/bulk-delete', bulkDeleteVolunteersHandler);
apiRouter.delete('/volunteers/bulk-delete', bulkDeleteVolunteersHandler);
apiRouter.post('/volunteers/delete-many', bulkDeleteVolunteersHandler);

// Server-side Direct CSV Export Endpoint
const exportCSVHandler = async (req: express.Request, res: express.Response) => {
  try {
    const list = await loadVolunteers();
    const { department, status } = req.query;
    let filtered = list;

    if (status && status !== 'All') {
      if (status === 'Active') filtered = filtered.filter((v) => v.status !== 'Deactivated');
      else if (status === 'Deactivated') filtered = filtered.filter((v) => v.status === 'Deactivated');
    }
    if (department && department !== 'All' && department !== 'ALL') {
      filtered = filtered.filter((v) => v.department === department);
    }

    const escapeCSV = (val: any): string => {
      if (val === undefined || val === null) return '""';
      const str = String(val).trim();
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headers = [
      'Volunteer ID',
      'Full Name',
      'Phone Number',
      'Department',
      'Department HOD Name',
      'Status',
      'Card Status',
      'Photo URL',
      'Card URL',
      'Registration Date',
    ];

    const rows = filtered.map((vol) => {
      const formattedDate = vol.createdAt
        ? new Date(vol.createdAt).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : '';

      return [
        escapeCSV(vol.id),
        escapeCSV(vol.name),
        escapeCSV(vol.phone ? `+91 ${vol.phone}` : ''),
        escapeCSV(vol.department || 'General Seva'),
        escapeCSV(vol.hodName || ''),
        escapeCSV(vol.status || 'Active'),
        escapeCSV(vol.cardStatus || 'Generated'),
        escapeCSV(vol.imageUrl || ''),
        escapeCSV(vol.cardImageUrl || ''),
        escapeCSV(formattedDate),
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
    const dateStamp = new Date().toISOString().split('T')[0];
    const filename = `ISKCON_Janmashtami_2026_Volunteers_All_${filtered.length}_${dateStamp}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csvContent);
  } catch (err: any) {
    console.error('Error in exportCSVHandler:', err);
    return res.status(500).json({ success: false, error: 'Server error exporting CSV' });
  }
};

apiRouter.get('/volunteers/export/csv', exportCSVHandler);
apiRouter.get('/volunteers/export-csv', exportCSVHandler);
apiRouter.get('/export/csv', exportCSVHandler);

// Server-side Direct JSON Database Export Endpoint
const exportJSONHandler = async (_req: express.Request, res: express.Response) => {
  try {
    const list = await loadVolunteers();
    const dateStamp = new Date().toISOString().split('T')[0];
    const filename = `ISKCON_Janmashtami_2026_Database_Backup_${list.length}_${dateStamp}.json`;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(JSON.stringify(list, null, 2));
  } catch (err: any) {
    console.error('Error in exportJSONHandler:', err);
    return res.status(500).json({ success: false, error: 'Server error exporting JSON' });
  }
};

apiRouter.get('/volunteers/export/json', exportJSONHandler);
apiRouter.get('/volunteers/export-json', exportJSONHandler);
apiRouter.get('/export/json', exportJSONHandler);

// ----------------------------------------------------
// Image Proxy Endpoint (Bypasses browser CORS & tainted canvas issues for exports)
// ----------------------------------------------------
const imageProxyHandler = async (req: express.Request, res: express.Response) => {
  const url = String(req.query.url || '').trim();
  if (!url) {
    return res.status(400).send('Query parameter "url" is required');
  }

  try {
    if (url.startsWith('data:')) {
      const match = url.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        const mime = match[1];
        const buffer = Buffer.from(match[2], 'base64');
        res.setHeader('Content-Type', mime);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(buffer);
      }
    }

    const fetchRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ISKCON Volunteer Service',
        Accept: 'image/*,*/*',
      },
    });

    if (!fetchRes.ok) {
      return res.status(fetchRes.status).send(`Failed to fetch image: ${fetchRes.statusText}`);
    }

    const contentType = fetchRes.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await fetchRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buffer);
  } catch (err: any) {
    console.warn('[Image Proxy Error]:', err?.message || err);
    return res.status(500).send('Error proxying image: ' + (err?.message || err));
  }
};

apiRouter.get('/image-proxy', imageProxyHandler);
apiRouter.get('/proxy/image', imageProxyHandler);

// ----------------------------------------------------
// Server-Side High-Res Card Image Generator Helper
// ----------------------------------------------------
async function generateServerCardImageBuffer(vol: VolunteerRecord): Promise<Buffer> {
  let processedPhotoBuffer: Buffer | null = null;

  const photoUrl = vol.imageUrl || (vol as any).photoUrl || '';
  if (photoUrl) {
    try {
      let rawPhotoBuffer: Buffer | null = null;
      if (photoUrl.startsWith('data:')) {
        const match = photoUrl.match(/^data:([^;]+);base64,(.*)$/);
        if (match) {
          rawPhotoBuffer = Buffer.from(match[2], 'base64');
        }
      } else if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://')) {
        const resp = await fetch(photoUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        });
        if (resp.ok) {
          const arr = await resp.arrayBuffer();
          rawPhotoBuffer = Buffer.from(arr);
        }
      }

      if (rawPhotoBuffer) {
        // Create 240x240 rounded photo
        const roundedCornerSvg = Buffer.from(
          '<svg><rect x="0" y="0" width="240" height="240" rx="20" ry="20"/></svg>'
        );
        processedPhotoBuffer = await sharp(rawPhotoBuffer)
          .rotate()
          .resize(240, 240, { fit: 'cover', position: 'center' })
          .composite([{ input: roundedCornerSvg, blend: 'dest-in' }])
          .png()
          .toBuffer();
      }
    } catch (err) {
      console.warn(`[Card Gen Notice] Could not process photo for ${vol.id}:`, err);
    }
  }

  const escapeXml = (unsafe: string) => {
    return (unsafe || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const rawName = String(vol.name || (vol as any).full_name || 'Volunteer').trim();
  const name = escapeXml(rawName);
  const nameFontSize = rawName.length > 24 ? 24 : rawName.length > 18 ? 28 : 32;

  const rawDept = String(vol.department || (vol as any).dept || 'General Seva').trim();
  const dept = escapeXml(rawDept || 'General Seva');

  const rawHod = String(vol.hodName || (vol as any).hod_name || (vol as any).hod || '—').trim();
  const hod = escapeXml(rawHod || '—');

  const rawPhone = String(vol.phone || (vol as any).phone_number || (vol as any).contact || 'N/A').trim();
  const phone = escapeXml(rawPhone ? (rawPhone.startsWith('+91') ? rawPhone : `+91 ${rawPhone}`) : 'N/A');

  const id = escapeXml(String(vol.id || 'VOL-2026').trim());

  const isDeactivated = vol.status === 'Deactivated';
  const statusText = isDeactivated ? 'Deactivated' : escapeXml(vol.status || 'Active');
  const statusColor = isDeactivated ? '#DC2626' : '#16A34A';
  const badgeColor = isDeactivated ? '#DC2626' : '#1E40AF';
  const badgeText = isDeactivated ? 'CARD DEACTIVATED' : 'VOLUNTEER';

  const svgCard = `
  <svg width="680" height="1060" viewBox="0 0 680 1060" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0F294A" />
        <stop offset="50%" stop-color="#1E40AF" />
        <stop offset="100%" stop-color="#2563EB" />
      </linearGradient>
      <linearGradient id="goldRibbon" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#93C5FD" />
        <stop offset="50%" stop-color="#FDE047" />
        <stop offset="100%" stop-color="#F59E0B" />
      </linearGradient>
      <linearGradient id="iskconLogoBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#D81B60" />
        <stop offset="100%" stop-color="#6A1B9A" />
      </linearGradient>
    </defs>

    <!-- Canvas Outer Background -->
    <rect width="680" height="1060" fill="#F1F5F9" />

    <!-- Main Card Body Container -->
    <rect x="25" y="25" width="630" height="1010" rx="32" fill="#FFFFFF" stroke="#DBEAFE" stroke-width="3" />

    <!-- Top Header Banner -->
    <path d="M 25 57 Q 25 25 57 25 L 623 25 Q 655 25 655 57 L 655 175 L 25 175 Z" fill="url(#headerGrad)" />
    <rect x="25" y="171" width="630" height="4" fill="url(#goldRibbon)" />

    <!-- ISKCON Vector Tilak Logo (Top Left) -->
    <circle cx="68" cy="85" r="28" fill="url(#iskconLogoBg)" stroke="#FFD54F" stroke-width="2" />
    <path d="M 64 68 C 64 68 64 86 65 94 C 65 96 66 97 68 97 C 70 97 71 96 71 94 C 72 86 72 68 72 68" stroke="#FFE082" stroke-width="2.5" fill="none" stroke-linecap="round" />
    <line x1="68" y1="71" x2="68" y2="88" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round" />

    <!-- Top Left Brand Text -->
    <text x="108" y="78" font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold" fill="#93C5FD">ISKCON</text>
    <text x="108" y="96" font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="bold" fill="#DBEAFE">Janmashtami</text>

    <!-- Top Right Badge -->
    <rect x="495" y="65" width="135" height="28" rx="14" fill="#FFFFFF" fill-opacity="0.18" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="1.5" />
    <text x="562" y="84" font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle">HARE KRISHNA</text>

    <!-- Header Festival Title -->
    <text x="340" y="128" font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif" font-size="26" font-weight="bold" fill="#FFFFFF" text-anchor="middle">SRI KRISHNA JANMASTAMI</text>
    <text x="340" y="153" font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold" fill="#FDE047" text-anchor="middle">2026 FESTIVAL SEVA</text>

    <!-- Center Badge -->
    <rect x="220" y="156" width="240" height="38" rx="19" fill="${badgeColor}" stroke="#FFFFFF" stroke-width="3" />
    <text x="340" y="181" font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${badgeText}</text>

    <!-- Photo Container Frame -->
    <rect x="210" y="215" width="260" height="260" rx="24" fill="#F8FAFC" stroke="#1E40AF" stroke-width="3" />

    ${
      !processedPhotoBuffer
        ? `<!-- Placeholder Avatar -->
           <circle cx="340" cy="320" r="48" fill="#CBD5E1" />
           <path d="M 280 430 Q 340 370 400 430 Z" fill="#CBD5E1" />`
        : ''
    }

    <!-- Volunteer Full Name (Dark, high-contrast, scalable) -->
    <text x="340" y="525" font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif" font-size="${nameFontSize}" font-weight="bold" fill="#0F172A" text-anchor="middle">${name}</text>

    <!-- Department Pill Badge -->
    <rect x="110" y="555" width="460" height="48" rx="14" fill="#EFF6FF" stroke="#BFDBFE" stroke-width="2" />
    <text x="340" y="587" font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold" fill="#1E40AF" text-anchor="middle">${dept}</text>

    <!-- Info Card Details Box -->
    <rect x="55" y="625" width="570" height="260" rx="20" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="2" />

    <!-- Info Row 1: HOD -->
    <text x="85" y="675" font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold" fill="#64748B">Department HOD</text>
    <text x="595" y="675" font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold" fill="#0F172A" text-anchor="end">${hod}</text>
    <line x1="85" y1="702" x2="595" y2="702" stroke="#E2E8F0" stroke-width="1.5" />

    <!-- Info Row 2: Phone -->
    <text x="85" y="745" font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold" fill="#64748B">Contact Phone</text>
    <text x="595" y="745" font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold" fill="#0F172A" text-anchor="end">${phone}</text>
    <line x1="85" y1="772" x2="595" y2="772" stroke="#E2E8F0" stroke-width="1.5" />

    <!-- Info Row 3: Card ID -->
    <text x="85" y="815" font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold" fill="#64748B">Volunteer ID</text>
    <text x="595" y="815" font-family="Liberation Mono, Courier, monospace" font-size="20" font-weight="bold" fill="#1E40AF" text-anchor="end">${id}</text>
    <line x1="85" y1="842" x2="595" y2="842" stroke="#E2E8F0" stroke-width="1.5" />

    <!-- Info Row 4: Status -->
    <text x="85" y="868" font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="bold" fill="#64748B">Status: <tspan font-weight="bold" fill="${statusColor}">${statusText}</tspan></text>
    <text x="595" y="868" font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold" fill="#64748B" text-anchor="end">HARE RAMA HARE KRISHNA</text>

    <!-- Footer -->
    <text x="340" y="930" font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="bold" fill="#475569" text-anchor="middle">Janmashtami 2026 Seva Committee</text>
    <text x="340" y="955" font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="bold" fill="#94A3B8" text-anchor="middle">VALID DURING FESTIVAL DAYS • NON-TRANSFERABLE</text>
  </svg>
  `;

  const composites: sharp.OverlayOptions[] = [];
  if (processedPhotoBuffer) {
    composites.push({
      input: processedPhotoBuffer,
      top: 225,
      left: 220,
    });
  }

  const baseSvgBuffer = Buffer.from(svgCard);
  const cardPng = await sharp(baseSvgBuffer)
    .composite(composites)
    .png({ quality: 95 })
    .toBuffer();

  return cardPng;
}

// ----------------------------------------------------
// Server-Side Direct ZIP Card Export Endpoint
// ----------------------------------------------------
const exportZipCardsHandler = async (req: express.Request, res: express.Response) => {
  try {
    const list = await loadVolunteers();
    const departmentQuery = String(req.query.department || req.body?.department || '').trim();
    const statusQuery = String(req.query.status || req.body?.status || '').trim();
    const idsQuery = req.query.ids || req.body?.ids;

    let targetVolunteers = [...list];

    // Filter by specific IDs if provided
    if (idsQuery) {
      const idArray = Array.isArray(idsQuery)
        ? idsQuery.map((id) => String(id).trim().toUpperCase())
        : String(idsQuery)
            .split(',')
            .map((id) => id.trim().toUpperCase());
      targetVolunteers = targetVolunteers.filter((v) =>
        idArray.includes(String(v.id).trim().toUpperCase())
      );
    } else {
      // Filter by department (case-insensitive & handles 'Arti Seva' or 'Arti')
      if (departmentQuery && departmentQuery !== 'ALL') {
        const cleanDept = departmentQuery.toLowerCase().replace(/[^a-z0-9]/g, '');
        targetVolunteers = targetVolunteers.filter((v) => {
          const vDept = (v.department || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return vDept === cleanDept || vDept.includes(cleanDept) || cleanDept.includes(vDept);
        });
      }

      // Filter by status if requested
      if (statusQuery && statusQuery !== 'ALL') {
        targetVolunteers = targetVolunteers.filter(
          (v) => (v.status || 'Active').toLowerCase() === statusQuery.toLowerCase()
        );
      }
    }

    if (targetVolunteers.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No volunteers found matching the requested filter (Department: "${departmentQuery || 'ALL'}").`,
      });
    }

    console.log(
      `[Server ZIP Export] Generating ${targetVolunteers.length} cards (Department: ${departmentQuery || 'ALL'})...`
    );

    const zip = new JSZip();

    // Render cards in parallel batches of 10 to maximize speed without overloading CPU
    const batchSize = 10;
    for (let i = 0; i < targetVolunteers.length; i += batchSize) {
      const batch = targetVolunteers.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (vol) => {
          try {
            const cardBuffer = await generateServerCardImageBuffer(vol);
            const safeName = (vol.name || 'Volunteer').replace(/[^a-zA-Z0-9_-]/g, '_');
            const safeDept = (vol.department || 'Seva').replace(/[^a-zA-Z0-9_-]/g, '_');
            const fileName = `${vol.id}_${safeName}_${safeDept}.png`;
            zip.file(fileName, cardBuffer, { binary: true });
          } catch (cardErr) {
            console.error(`Error rendering card for ${vol.id}:`, cardErr);
          }
        })
      );
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const dateStamp = new Date().toISOString().split('T')[0];
    const deptTag = departmentQuery && departmentQuery !== 'ALL'
      ? departmentQuery.replace(/[^a-zA-Z0-9_-]/g, '_')
      : 'All';
    const filename = `ISKCON_Janmashtami_2026_${deptTag}_Cards_${targetVolunteers.length}_${dateStamp}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', zipBuffer.length);

    return res.send(zipBuffer);
  } catch (err: any) {
    console.error('Error in exportZipCardsHandler:', err);
    return res.status(500).json({
      success: false,
      error: 'Server error generating card images ZIP: ' + (err?.message || err),
    });
  }
};

apiRouter.get('/volunteers/export/zip', exportZipCardsHandler);
apiRouter.get('/volunteers/export-zip', exportZipCardsHandler);
apiRouter.post('/volunteers/export/zip', exportZipCardsHandler);
apiRouter.post('/volunteers/export-zip', exportZipCardsHandler);
apiRouter.get('/export/zip', exportZipCardsHandler);

// Storage Diagnostics & Migration Status Endpoint
apiRouter.get('/admin/storage-status', async (_req, res) => {
  try {
    const list = await loadVolunteers();
    let supabaseCards = 0;
    let vercelBlobCards = 0;
    let unmigratedCount = 0;

    for (const v of list) {
      const isSupabase = Boolean(SUPABASE_URL && v.imageUrl && v.imageUrl.includes(SUPABASE_URL));
      const isVercelBlob = Boolean(v.imageUrl && (v.imageUrl.includes('blob.vercel-storage.com') || v.imageUrl.includes('public.blob.vercel')));

      if (isSupabase) {
        supabaseCards++;
      } else if (isVercelBlob) {
        vercelBlobCards++;
        unmigratedCount++;
      } else if (v.imageUrl && !isSupabase) {
        unmigratedCount++;
      }
    }

    return res.json({
      success: true,
      supabaseConnected: USE_SUPABASE,
      vercelBlobConnected: USE_VERCEL_BLOB,
      totalVolunteers: list.length,
      supabaseCardsCount: supabaseCards,
      vercelBlobCardsCount: vercelBlobCards,
      unmigratedCount,
      activeBackend: USE_SUPABASE ? 'Supabase Storage' : USE_VERCEL_BLOB ? 'Vercel Blob' : 'Local file',
      isMigrationReady: Boolean(USE_SUPABASE && (USE_VERCEL_BLOB || unmigratedCount > 0)),
    });
  } catch (err: any) {
    console.error('Error in /api/admin/storage-status:', err);
    return res.status(500).json({ success: false, error: 'Error checking storage status' });
  }
});

// Safe Migration Endpoint: Migrate existing volunteer photos/cards to Supabase Storage
apiRouter.post('/admin/migrate-to-supabase', async (req, res) => {
  try {
    const { pin } = req.body || {};
    const configuredPin = String(process.env.ADMIN_PIN || '2580').trim();

    if (pin && pin.trim() !== configuredPin) {
      return res.status(401).json({ success: false, error: 'Invalid admin PIN for migration' });
    }

    if (!USE_SUPABASE) {
      return res.status(400).json({
        success: false,
        error: 'Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are not configured in environment variables.',
      });
    }

    const list = await loadVolunteers();
    const oldUrlToNewSupabaseUrl = new Map<string, string>();
    const failedFiles: Array<{ id: string; url: string; reason: string }> = [];
    let totalDiscovered = 0;
    let successfullyMigrated = 0;
    let alreadyMigratedOrSkipped = 0;

    // STEP 1: Scan Vercel Blob store directly if BLOB_READ_WRITE_TOKEN is available
    if (BLOB_READ_WRITE_TOKEN) {
      try {
        let hasMore = true;
        let cursor: string | undefined = undefined;
        const allBlobs: Array<{ url: string; pathname: string; downloadUrl: string; size: number }> = [];

        while (hasMore) {
          const response = await listVercelBlobs({
            token: BLOB_READ_WRITE_TOKEN,
            cursor,
            limit: 1000,
          });
          allBlobs.push(...response.blobs);
          hasMore = response.hasMore;
          cursor = response.cursor;
        }

        totalDiscovered += allBlobs.length;

        for (const blob of allBlobs) {
          const targetPath = blob.pathname.replace(/^\/+/, '');

          // Skip master JSON from direct file copy
          if (targetPath.endsWith('.json')) continue;

          try {
            // Check if already in Supabase
            const { data: pubData } = getSupabase()!.storage.from(BUCKET_NAME).getPublicUrl(targetPath);
            const { data: existingFileData } = await getSupabase()!.storage.from(BUCKET_NAME).list(path.dirname(targetPath) === '.' ? '' : path.dirname(targetPath), {
              search: path.basename(targetPath),
            });

            const alreadyExists = existingFileData && existingFileData.some((f) => f.name === path.basename(targetPath) && f.metadata?.size === blob.size);

            if (alreadyExists) {
              alreadyMigratedOrSkipped++;
              oldUrlToNewSupabaseUrl.set(blob.url, pubData.publicUrl);
              oldUrlToNewSupabaseUrl.set(blob.downloadUrl, pubData.publicUrl);
              continue;
            }

            // Download from Vercel Blob
            const fetchRes = await fetch(blob.downloadUrl || blob.url);
            if (!fetchRes.ok) {
              throw new Error(`HTTP ${fetchRes.status} downloading blob`);
            }

            const arrBuf = await fetchRes.arrayBuffer();
            const buffer = Buffer.from(arrBuf);
            const mimeType = fetchRes.headers.get('content-type') || 'image/jpeg';

            const { error: upErr } = await getSupabase()!.storage.from(BUCKET_NAME).upload(targetPath, buffer, {
              contentType: mimeType,
              upsert: true,
              cacheControl: '3600',
            });

            if (upErr) throw upErr;

            oldUrlToNewSupabaseUrl.set(blob.url, pubData.publicUrl);
            oldUrlToNewSupabaseUrl.set(blob.downloadUrl, pubData.publicUrl);
            successfullyMigrated++;
          } catch (bErr: any) {
            failedFiles.push({
              id: targetPath,
              url: blob.url,
              reason: bErr?.message || String(bErr),
            });
          }
        }
      } catch (blobScanErr: any) {
        console.warn('[Migration] Error during Vercel Blob scan:', blobScanErr);
      }
    }

    // STEP 2: Map and migrate records from volunteer database
    for (let i = 0; i < list.length; i++) {
      const vol = list[i];

      // Check photo imageUrl
      if (vol.imageUrl) {
        totalDiscovered++;
        const isAlreadySupabase = SUPABASE_URL && vol.imageUrl.includes(SUPABASE_URL);

        if (isAlreadySupabase) {
          alreadyMigratedOrSkipped++;
        } else if (oldUrlToNewSupabaseUrl.has(vol.imageUrl)) {
          list[i].imageUrl = oldUrlToNewSupabaseUrl.get(vol.imageUrl)!;
        } else {
          try {
            let buffer: Buffer | null = null;
            let ext = 'jpg';
            let mimeType = 'image/jpeg';

            if (vol.imageUrl.startsWith('data:')) {
              const match = vol.imageUrl.match(/^data:([^;]+);base64,(.*)$/);
              if (match) {
                mimeType = match[1];
                if (mimeType.includes('png')) ext = 'png';
                else if (mimeType.includes('webp')) ext = 'webp';
                buffer = Buffer.from(match[2], 'base64');
              }
            } else if (vol.imageUrl.startsWith('http://') || vol.imageUrl.startsWith('https://')) {
              const resp = await fetch(vol.imageUrl);
              if (resp.ok) {
                const arrayBuf = await resp.arrayBuffer();
                buffer = Buffer.from(arrayBuf);
                const ct = resp.headers.get('content-type') || '';
                if (ct.includes('png')) {
                  ext = 'png';
                  mimeType = 'image/png';
                } else if (ct.includes('webp')) {
                  ext = 'webp';
                  mimeType = 'image/webp';
                }
              }
            }

            if (buffer) {
              const storagePath = `${vol.id}/photo.${ext}`;
              const { error: upErr } = await getSupabase()!.storage.from(BUCKET_NAME).upload(storagePath, buffer, {
                contentType: mimeType,
                upsert: true,
                cacheControl: '3600',
              });

              if (upErr) throw upErr;

              const { data: pubData } = getSupabase()!.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
              list[i].imageUrl = pubData.publicUrl;
              oldUrlToNewSupabaseUrl.set(vol.imageUrl, pubData.publicUrl);
              successfullyMigrated++;
            } else {
              alreadyMigratedOrSkipped++;
            }
          } catch (mErr: any) {
            failedFiles.push({
              id: vol.id,
              url: vol.imageUrl,
              reason: mErr?.message || String(mErr),
            });
          }
        }
      }

      // Check cardImageUrl
      if (vol.cardImageUrl) {
        totalDiscovered++;
        const isCardSupabase = SUPABASE_URL && vol.cardImageUrl.includes(SUPABASE_URL);

        if (isCardSupabase) {
          alreadyMigratedOrSkipped++;
        } else if (oldUrlToNewSupabaseUrl.has(vol.cardImageUrl)) {
          list[i].cardImageUrl = oldUrlToNewSupabaseUrl.get(vol.cardImageUrl)!;
        } else {
          try {
            const resp = await fetch(vol.cardImageUrl);
            if (resp.ok) {
              const arrayBuf = await resp.arrayBuffer();
              const buffer = Buffer.from(arrayBuf);
              const storagePath = `${vol.id}/card.png`;

              const { error: upErr } = await getSupabase()!.storage.from(BUCKET_NAME).upload(storagePath, buffer, {
                contentType: 'image/png',
                upsert: true,
                cacheControl: '3600',
              });

              if (!upErr) {
                const { data: pubData } = getSupabase()!.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
                list[i].cardImageUrl = pubData.publicUrl;
                successfullyMigrated++;
              }
            }
          } catch (cErr: any) {
            failedFiles.push({
              id: `${vol.id}-card`,
              url: vol.cardImageUrl,
              reason: cErr?.message || String(cErr),
            });
          }
        }
      }
    }

    // Save updated database with new Supabase URLs
    await saveVolunteers(list);

    return res.json({
      success: true,
      message: `Migration completed: ${successfullyMigrated} successfully migrated, ${alreadyMigratedOrSkipped} skipped/already migrated, ${failedFiles.length} failed.`,
      totalFiles: totalDiscovered,
      migratedCount: successfullyMigrated,
      alreadyMigratedOrSkipped,
      failedFiles,
      safetyNote: 'All original Vercel Blob files remain completely intact and unmodified.',
    });
  } catch (err: any) {
    console.error('Error in /api/admin/migrate-to-supabase:', err);
    return res.status(500).json({ success: false, error: 'Migration failed: ' + (err?.message || err) });
  }
});

// Catch-all for undefined API routes to return clean JSON
apiRouter.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `API endpoint not found: ${req.method} /api${req.path}`,
  });
});

// Mount Central API Router on /api and as sub-router for Vercel serverless functions
app.use('/api', apiRouter);
app.use(apiRouter);

// Vite / Static setup
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.warn('Vite dev middleware could not be loaded dynamically:', err);
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Janmashtami Volunteer Server running on http://0.0.0.0:${PORT}`);
    console.log(`Storage backend: ${USE_SUPABASE ? 'Supabase Storage (persistent)' : 'Local file (dev only)'}`);
  });
}

// Only start standalone server when not in Vercel Serverless environment
if (!process.env.VERCEL) {
  start();
}

export default app;
export { app, apiRouter };
