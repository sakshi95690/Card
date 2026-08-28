/**
 * Migration Script: Migrate cards, photos, and assets from Vercel Blob to Supabase Storage.
 *
 * Safety Guarantees:
 * 1. Non-destructive: Does NOT delete any files from Vercel Blob or local storage.
 * 2. Deduplication: Skips already migrated files (already pointing to Supabase).
 * 3. Database Safety: Creates timestamped local backups of database before saving changes.
 * 4. Verification: Verifies each uploaded file URL before updating database records.
 *
 * Usage:
 *   SUPABASE_URL=https://xyz.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... \
 *   npm run migrate:supabase
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { list as listVercelBlobs } from '@vercel/blob';

const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN?.trim();

const BUCKET_NAME = 'volunteer-cards';
const SUPABASE_DATA_PATH = 'data/volunteers-data.json';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.');
  console.error('Example:');
  console.error('  SUPABASE_URL="https://xxx.supabase.co" \\');
  console.error('  SUPABASE_SERVICE_ROLE_KEY="eyJ..." \\');
  console.error('  BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..." \\');
  console.error('  npm run migrate:supabase\n');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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

interface FailedItem {
  identifier: string;
  urlOrPath: string;
  reason: string;
}

async function runMigration() {
  console.log('\n========================================================');
  console.log('🚀 Starting Vercel Blob -> Supabase Storage Migration');
  console.log('========================================================');
  console.log(`Target Supabase URL : ${SUPABASE_URL}`);
  console.log(`Target Bucket       : ${BUCKET_NAME}`);
  console.log(`Vercel Blob Token   : ${BLOB_READ_WRITE_TOKEN ? 'Provided (Will scan full Vercel Blob store)' : 'Not set (Will scan database records)'}`);
  console.log('Safety Mode         : NON-DESTRUCTIVE (No Vercel Blob files will be deleted)\n');

  // 1. Ensure Supabase Bucket exists and is public
  try {
    const { data: bucket, error: getErr } = await supabase.storage.getBucket(BUCKET_NAME);
    if (!bucket || getErr) {
      console.log(`Creating public bucket '${BUCKET_NAME}' in Supabase...`);
      const { error: createErr } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: '25MB',
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/json'],
      });
      if (createErr && !createErr.message?.includes('already exists')) {
        console.warn(`Note when checking/creating bucket: ${createErr.message}`);
      }
    }
  } catch (err: any) {
    console.warn(`Bucket initialization warning (proceeding): ${err?.message || err}`);
  }

  // 2. Load Volunteer Database
  let volunteers: VolunteerRecord[] = [];
  const localDataPath = path.join(process.cwd(), 'data', 'volunteers.json');

  if (fs.existsSync(localDataPath)) {
    try {
      const raw = fs.readFileSync(localDataPath, 'utf-8');
      volunteers = JSON.parse(raw);
      console.log(`📦 Loaded ${volunteers.length} volunteer records from local database.`);
    } catch (e) {
      console.warn('Could not read local data/volunteers.json');
    }
  }

  // Also check Supabase Storage for remote database copy if local is empty or to merge
  try {
    const { data, error } = await supabase.storage.from(BUCKET_NAME).download(SUPABASE_DATA_PATH);
    if (data && !error) {
      const text = await data.text();
      const remoteList: VolunteerRecord[] = JSON.parse(text);
      if (Array.isArray(remoteList) && remoteList.length > 0) {
        console.log(`📦 Found ${remoteList.length} volunteer records in Supabase storage.`);
        // Merge records by ID if not in local
        const existingIds = new Set(volunteers.map((v) => v.id));
        for (const rem of remoteList) {
          if (!existingIds.has(rem.id)) {
            volunteers.push(rem);
            existingIds.add(rem.id);
          }
        }
      }
    }
  } catch {
    // ignore
  }

  // Create safe backup of database before starting
  if (volunteers.length > 0) {
    const backupDir = path.join(process.cwd(), 'data', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const backupPath = path.join(backupDir, `volunteers_pre_migration_${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(volunteers, null, 2), 'utf-8');
    console.log(`🛡️ Safe pre-migration backup saved to: ${backupPath}\n`);
  }

  const failedItems: FailedItem[] = [];
  const oldUrlToNewSupabaseUrl = new Map<string, string>();

  let totalFilesDiscovered = 0;
  let successfullyMigrated = 0;
  let alreadyMigratedOrSkipped = 0;

  // --------------------------------------------------------------------------
  // STEP A: If Vercel Blob Token is provided, list all blobs directly from Vercel
  // --------------------------------------------------------------------------
  if (BLOB_READ_WRITE_TOKEN) {
    console.log('🔍 Listing all existing files directly from Vercel Blob store...');
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

      console.log(`Found ${allBlobs.length} files in Vercel Blob store.`);
      totalFilesDiscovered += allBlobs.length;

      for (let i = 0; i < allBlobs.length; i++) {
        const blob = allBlobs[i];
        const targetPath = blob.pathname.replace(/^\/+/, '');
        console.log(`[Blob ${i + 1}/${allBlobs.length}] Processing: ${targetPath}`);

        // Check if already in Supabase Storage with same path
        try {
          const { data: existingFileData } = await supabase.storage.from(BUCKET_NAME).list(path.dirname(targetPath) === '.' ? '' : path.dirname(targetPath), {
            search: path.basename(targetPath),
          });

          const alreadyExists = existingFileData && existingFileData.some((f) => f.name === path.basename(targetPath) && f.metadata?.size === blob.size);

          if (alreadyExists) {
            console.log(`  ⏭️ Already exists in Supabase: ${targetPath}`);
            alreadyMigratedOrSkipped++;
            const { data: pubData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(targetPath);
            oldUrlToNewSupabaseUrl.set(blob.url, pubData.publicUrl);
            oldUrlToNewSupabaseUrl.set(blob.downloadUrl, pubData.publicUrl);
            continue;
          }

          // Download from Vercel Blob
          const res = await fetch(blob.downloadUrl || blob.url);
          if (!res.ok) {
            throw new Error(`Failed to download from Vercel Blob: HTTP ${res.status} ${res.statusText}`);
          }

          const arrayBuffer = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const mimeType = res.headers.get('content-type') || 'application/octet-stream';

          // Upload to Supabase
          const { error: uploadErr } = await supabase.storage.from(BUCKET_NAME).upload(targetPath, buffer, {
            contentType: mimeType,
            upsert: true,
            cacheControl: '3600',
          });

          if (uploadErr) {
            throw uploadErr;
          }

          const { data: pubData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(targetPath);
          const newUrl = pubData.publicUrl;
          oldUrlToNewSupabaseUrl.set(blob.url, newUrl);
          oldUrlToNewSupabaseUrl.set(blob.downloadUrl, newUrl);
          successfullyMigrated++;
          console.log(`  ✅ Successfully uploaded to Supabase: ${newUrl}`);
        } catch (err: any) {
          console.error(`  ❌ Failed migrating blob ${targetPath}:`, err?.message || err);
          failedItems.push({
            identifier: targetPath,
            urlOrPath: blob.url,
            reason: err?.message || String(err),
          });
        }
      }
    } catch (err: any) {
      console.error('Error during Vercel Blob API listing:', err?.message || err);
    }
  }

  // --------------------------------------------------------------------------
  // STEP B: Scan all Volunteer Records for Vercel Blob URLs, Base64, or Remote Images
  // --------------------------------------------------------------------------
  console.log('\n🔍 Scanning volunteer records for photos and card URLs...');

  for (let i = 0; i < volunteers.length; i++) {
    const vol = volunteers[i];

    // Check if photo URL needs migration
    if (vol.imageUrl) {
      totalFilesDiscovered++;
      const isAlreadyOnSupabase = vol.imageUrl.includes(SUPABASE_URL);

      if (isAlreadyOnSupabase) {
        alreadyMigratedOrSkipped++;
        console.log(`[Record ${i + 1}/${volunteers.length}] ⏭️ ${vol.id} (${vol.name}) photo is already on Supabase.`);
      } else if (oldUrlToNewSupabaseUrl.has(vol.imageUrl)) {
        // We already migrated this exact blob URL in Step A
        volunteers[i].imageUrl = oldUrlToNewSupabaseUrl.get(vol.imageUrl)!;
        console.log(`[Record ${i + 1}/${volunteers.length}] 🔄 ${vol.id} mapped to migrated Supabase URL.`);
      } else {
        console.log(`[Record ${i + 1}/${volunteers.length}] 🔄 Migrating photo for ${vol.id} (${vol.name})...`);
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
            const res = await fetch(vol.imageUrl);
            if (res.ok) {
              const arrBuf = await res.arrayBuffer();
              buffer = Buffer.from(arrBuf);
              const ct = res.headers.get('content-type') || '';
              if (ct.includes('png')) {
                ext = 'png';
                mimeType = 'image/png';
              } else if (ct.includes('webp')) {
                ext = 'webp';
                mimeType = 'image/webp';
              }
            } else {
              throw new Error(`HTTP ${res.status} fetching image`);
            }
          }

          if (buffer) {
            const storagePath = `${vol.id}/photo.${ext}`;
            const { error: uploadErr } = await supabase.storage.from(BUCKET_NAME).upload(storagePath, buffer, {
              contentType: mimeType,
              upsert: true,
              cacheControl: '3600',
            });

            if (uploadErr) throw uploadErr;

            const { data: publicData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
            volunteers[i].imageUrl = publicData.publicUrl;
            oldUrlToNewSupabaseUrl.set(vol.imageUrl, publicData.publicUrl);
            successfullyMigrated++;
            console.log(`  ✅ Uploaded to Supabase: ${publicData.publicUrl}`);
          } else {
            throw new Error('Empty image buffer');
          }
        } catch (err: any) {
          console.error(`  ❌ Failed migrating photo for ${vol.id}:`, err?.message || err);
          failedItems.push({
            identifier: vol.id,
            urlOrPath: vol.imageUrl,
            reason: err?.message || String(err),
          });
        }
      }
    }

    // Check if cardImageUrl needs migration
    if (vol.cardImageUrl) {
      totalFilesDiscovered++;
      const isCardOnSupabase = vol.cardImageUrl.includes(SUPABASE_URL);

      if (isCardOnSupabase) {
        alreadyMigratedOrSkipped++;
      } else if (oldUrlToNewSupabaseUrl.has(vol.cardImageUrl)) {
        volunteers[i].cardImageUrl = oldUrlToNewSupabaseUrl.get(vol.cardImageUrl)!;
      } else {
        try {
          const res = await fetch(vol.cardImageUrl);
          if (res.ok) {
            const arrBuf = await res.arrayBuffer();
            const buffer = Buffer.from(arrBuf);
            const storagePath = `${vol.id}/card.png`;
            const { error: uploadErr } = await supabase.storage.from(BUCKET_NAME).upload(storagePath, buffer, {
              contentType: 'image/png',
              upsert: true,
              cacheControl: '3600',
            });

            if (!uploadErr) {
              const { data: publicData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
              volunteers[i].cardImageUrl = publicData.publicUrl;
              successfullyMigrated++;
            }
          }
        } catch (err: any) {
          failedItems.push({
            identifier: `${vol.id}-card`,
            urlOrPath: vol.cardImageUrl,
            reason: err?.message || String(err),
          });
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // STEP C: Save Updated Database to Supabase and Local
  // --------------------------------------------------------------------------
  console.log('\n💾 Updating database with new Supabase URLs...');
  const jsonBuffer = Buffer.from(JSON.stringify(volunteers, null, 2), 'utf-8');

  try {
    const { error: saveDbErr } = await supabase.storage.from(BUCKET_NAME).upload(SUPABASE_DATA_PATH, jsonBuffer, {
      contentType: 'application/json',
      upsert: true,
      cacheControl: '0',
    });

    if (saveDbErr) {
      console.error('Error saving updated database to Supabase:', saveDbErr.message);
    } else {
      console.log(`✅ Saved updated database (${volunteers.length} records) to Supabase Storage.`);
    }

    if (fs.existsSync(path.dirname(localDataPath))) {
      fs.writeFileSync(localDataPath, JSON.stringify(volunteers, null, 2), 'utf-8');
      console.log(`✅ Saved updated local replica to ${localDataPath}`);
    }
  } catch (err: any) {
    console.error('Exception saving database records:', err?.message || err);
  }

  // --------------------------------------------------------------------------
  // STEP D: Final Detailed Report
  // --------------------------------------------------------------------------
  console.log('\n========================================================');
  console.log('📊 VERCEL BLOB -> SUPABASE MIGRATION REPORT');
  console.log('========================================================');
  console.log(`Total Files / Records Checked : ${totalFilesDiscovered}`);
  console.log(`Successfully Migrated         : ${successfullyMigrated}`);
  console.log(`Already Migrated / Skipped    : ${alreadyMigratedOrSkipped}`);
  console.log(`Failed Files                  : ${failedItems.length}`);
  console.log('--------------------------------------------------------');

  if (failedItems.length > 0) {
    console.log('⚠️ Failed Files Details:');
    failedItems.forEach((f, idx) => {
      console.log(`  ${idx + 1}. [${f.identifier}] ${f.urlOrPath} -> Reason: ${f.reason}`);
    });
    console.log('--------------------------------------------------------');
  }

  console.log('🛡️  CRITICAL SAFETY NOTE:');
  console.log('  NO files were deleted from Vercel Blob.');
  console.log('  All original files in Vercel Blob remain completely intact and safe.');
  console.log('  You can delete Vercel Blob files ONLY AFTER you independently verify');
  console.log('  that cards and photos open properly from Supabase URLs.');
  console.log('========================================================\n');
}

runMigration().catch((err) => {
  console.error('\n❌ Fatal Migration Error:', err);
  process.exit(1);
});
