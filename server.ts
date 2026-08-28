import express from 'express';
import path from 'path';
import fs from 'fs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

// Body parser with 25mb limit for volunteer photo/card uploads
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

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
// Supabase Storage & Database Persistence Layer
// ----------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const BUCKET_NAME = 'volunteer-cards';
const SUPABASE_DATA_PATH = 'data/volunteers-data.json';

const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

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
 * Upload a base64 image (photo or card) or buffer to Supabase Storage
 * Returns the public URL of the uploaded image
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

    let buffer: Buffer;
    let mimeType = 'image/jpeg';
    let extension = 'jpg';

    if (typeof imageInput === 'string') {
      const match = imageInput.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        mimeType = match[1];
        const base64Data = match[2];
        buffer = Buffer.from(base64Data, 'base64');
      } else {
        buffer = Buffer.from(imageInput, 'base64');
      }

      if (mimeType.includes('png')) extension = 'png';
      else if (mimeType.includes('webp')) extension = 'webp';
      else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) extension = 'jpg';
    } else {
      buffer = imageInput;
      if (filename.endsWith('.png')) mimeType = 'image/png';
      else if (filename.endsWith('.webp')) mimeType = 'image/webp';
      else mimeType = 'image/jpeg';
    }

    const cleanFilename = filename.replace(/\.[^/.]+$/, '');
    const storagePath = `${volunteerId}/${cleanFilename}.${extension}`;

    const { error: uploadError } = await client.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('[Supabase Storage] Error uploading image:', uploadError);
      return null;
    }

    const { data: publicData } = client.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
    return publicData.publicUrl;
  } catch (err: any) {
    console.error('[Supabase Storage] Exception uploading image:', err?.message || err);
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
    // List all files in folder volunteerId
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
      // Fallback common filenames if list is empty
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
    console.error('[Supabase Storage] Error reading database JSON:', err?.message || err);
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

// ---- Local filesystem fallback (local dev or when Supabase is not configured) ----
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

// ---- Unified storage API used by all routes ----
async function loadVolunteers(): Promise<VolunteerRecord[]> {
  let list: VolunteerRecord[] = [];
  if (USE_SUPABASE) {
    list = await loadVolunteersFromSupabase();
    // If Supabase database JSON is empty, fall back to initial file if exists
    if (list.length === 0) {
      const fileList = loadVolunteersFromFile();
      if (fileList.length > 0) {
        list = fileList;
        // Auto-sync initial file list to Supabase
        await saveVolunteersToSupabase(fileList);
      }
    }
  } else {
    list = loadVolunteersFromFile();
  }

  return list.map((v: any) => ({
    ...v,
    cardStatus: v.cardStatus || 'Generated',
    status: v.status || 'Active',
  }));
}

async function saveVolunteers(volunteers: VolunteerRecord[]): Promise<boolean> {
  if (USE_SUPABASE) {
    const success = await saveVolunteersToSupabase(volunteers);
    // Also save to local file as immediate local replica
    saveVolunteersToFile(volunteers);
    return success;
  }
  return saveVolunteersToFile(volunteers);
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
    const configuredPin = String(process.env.ADMIN_PIN || '2580').trim();

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
    if (USE_SUPABASE && typeof imageUrl === 'string' && imageUrl.startsWith('data:')) {
      try {
        const uploadedUrl = await uploadImageToSupabase(newId, imageUrl, 'photo');
        if (uploadedUrl) {
          finalImageUrl = uploadedUrl;
        }
      } catch (uploadErr) {
        console.warn(`[Supabase Storage] Photo upload failed for ${newId}, storing image locally/in payload:`, uploadErr);
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

// Upload generated full card image (JPG/PNG/WebP) to Supabase Storage
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
    if (USE_SUPABASE) {
      const ext = format === 'png' ? 'png' : format === 'jpg' || format === 'jpeg' ? 'jpg' : 'webp';
      const uploaded = await uploadImageToSupabase(list[index].id, cardImage, `card.${ext}`);
      if (uploaded) {
        publicCardUrl = uploaded;
        list[index].cardImageUrl = uploaded;
        await saveVolunteers(list);
      }
    }

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

// Update volunteer card status or status (e.g. Generated -> Printed -> Issued)
const patchStatusHandler = async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const { cardStatus, status } = req.body || {};

    const list = await loadVolunteers();
    const index = list.findIndex((v) => v.id.toUpperCase() === id.toUpperCase());
    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Volunteer not found' });
    }

    if (cardStatus && ['Generated', 'Printed', 'Issued'].includes(cardStatus)) {
      list[index].cardStatus = cardStatus;
    }

    if (status && ['Verified', 'Pending', 'Active', 'Deactivated'].includes(status)) {
      list[index].status = status;
    }

    const saved = await saveVolunteers(list);
    if (!saved) {
      return res.status(500).json({ success: false, error: 'Could not save changes to storage' });
    }

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

// Delete volunteer (Admin action) - Also cleans up Supabase Storage files
const deleteVolunteerHandler = async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const list = await loadVolunteers();
    const index = list.findIndex((v) => v.id.toUpperCase() === id.toUpperCase());
    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Volunteer not found' });
    }

    const removed = list.splice(index, 1)[0];
    const saved = await saveVolunteers(list);
    if (!saved) {
      return res.status(500).json({ success: false, error: 'Could not save changes to storage' });
    }

    // Clean up associated files from Supabase Storage asynchronously
    if (USE_SUPABASE) {
      deleteVolunteerFilesFromSupabase(removed.id, removed.imageUrl).catch((err) => {
        console.warn(`[Supabase Storage] Cleanup notice for deleted volunteer ${removed.id}:`, err);
      });
    }

    return res.json({
      success: true,
      message: `Volunteer ${removed.name} (${removed.id}) deleted successfully`,
    });
  } catch (err: any) {
    console.error('Error in deleteVolunteerHandler:', err);
    return res.status(500).json({ success: false, error: 'Server error deleting volunteer' });
  }
};

apiRouter.delete('/volunteers/:id', deleteVolunteerHandler);
apiRouter.delete('/volunteer/:id', deleteVolunteerHandler);

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
    let migratedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < list.length; i++) {
      const vol = list[i];
      const isAlreadySupabase = vol.imageUrl && SUPABASE_URL && vol.imageUrl.includes(SUPABASE_URL);

      if (vol.imageUrl && !isAlreadySupabase) {
        try {
          let buffer: Buffer | null = null;
          let ext = 'jpg';

          if (vol.imageUrl.startsWith('data:')) {
            const match = vol.imageUrl.match(/^data:([^;]+);base64,(.*)$/);
            if (match) {
              const mime = match[1];
              if (mime.includes('png')) ext = 'png';
              else if (mime.includes('webp')) ext = 'webp';
              buffer = Buffer.from(match[2], 'base64');
            }
          } else if (vol.imageUrl.startsWith('http://') || vol.imageUrl.startsWith('https://')) {
            // Fetch remote image (e.g. from existing Vercel Blob URL)
            const resp = await fetch(vol.imageUrl);
            if (resp.ok) {
              const arrayBuf = await resp.arrayBuffer();
              buffer = Buffer.from(arrayBuf);
              const contentType = resp.headers.get('content-type') || '';
              if (contentType.includes('png')) ext = 'png';
              else if (contentType.includes('webp')) ext = 'webp';
            }
          }

          if (buffer) {
            const uploadedUrl = await uploadImageToSupabase(vol.id, buffer, `photo.${ext}`);
            if (uploadedUrl) {
              list[i].imageUrl = uploadedUrl;
              migratedCount++;
            } else {
              errors.push(`Upload failed for ${vol.id}`);
            }
          } else {
            skippedCount++;
          }
        } catch (mErr: any) {
          errors.push(`Error processing ${vol.id}: ${mErr?.message || mErr}`);
        }
      } else {
        skippedCount++;
      }
    }

    await saveVolunteers(list);

    return res.json({
      success: true,
      message: `Migration completed: ${migratedCount} migrated, ${skippedCount} skipped, ${errors.length} errors`,
      migratedCount,
      skippedCount,
      total: list.length,
      errors: errors.slice(0, 10),
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

// Mount Central API Router on /api
app.use('/api', apiRouter);

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

start();

export default app;
export { app, apiRouter };
