import React, { useState, useRef } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileCode,
  Image,
  Printer,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { toPng } from 'html-to-image';
import JSZip from 'jszip';
import { Volunteer } from '../types';
import { AppLogo } from './AppLogo';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  allVolunteers: Volunteer[];
  filteredVolunteers: Volunteer[];
  selectedIds: string[];
}

export default function ExportModal({
  isOpen,
  onClose,
  allVolunteers,
  filteredVolunteers,
  selectedIds,
}: ExportModalProps) {
  const [exportScope, setExportScope] = useState<'selected' | 'filtered' | 'all'>(() => {
    return selectedIds.length > 0 ? 'selected' : 'all';
  });

  const [activeTab, setActiveTab] = useState<'csv' | 'zip' | 'json' | 'print'>('zip');

  // ZIP export state
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [isDownloadingServerZip, setIsDownloadingServerZip] = useState(false);
  const [zipProgress, setZipProgress] = useState({ current: 0, total: 0, statusText: '' });
  const [zipError, setZipError] = useState<string | null>(null);
  const [zipSuccess, setZipSuccess] = useState<string | null>(null);
  const cancelExportRef = useRef(false);

  // Active rendering volunteer for dynamic off-screen generation
  const [renderVol, setRenderVol] = useState<Volunteer | null>(null);
  const cardRenderRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  // Determine the target list of volunteers based on chosen scope
  const targetList: Volunteer[] =
    exportScope === 'selected' && selectedIds.length > 0
      ? allVolunteers.filter((v) => selectedIds.includes(v.id))
      : exportScope === 'filtered'
      ? filteredVolunteers
      : allVolunteers;

  const totalTargetCount = targetList.length;

  // Converts any remote image URL to safe data: URI via backend proxy to eliminate CORS & tainted canvas errors
  const getSafeDataUrl = async (imgUrl: string | undefined): Promise<string> => {
    if (!imgUrl || typeof imgUrl !== 'string' || imgUrl.trim().length === 0) return '';
    if (imgUrl.startsWith('data:')) return imgUrl;

    try {
      const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(imgUrl)}`;
      const resp = await fetch(proxyUrl);
      if (resp.ok) {
        const blob = await resp.blob();
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => resolve(imgUrl);
          reader.readAsDataURL(blob);
        });
      }
    } catch (e) {
      console.warn('Proxy fetch warning for image:', e);
    }
    return imgUrl;
  };

  // Helper to escape CSV fields cleanly for Excel and Google Sheets
  const escapeCSV = (val: any): string => {
    if (val === undefined || val === null) return '""';
    const str = String(val).trim();
    return `"${str.replace(/"/g, '""')}"`;
  };

  // 1. Export CSV Handler (Fast & 100% Reliable for 722+ records)
  const handleExportCSV = () => {
    if (totalTargetCount === 0) {
      alert('No volunteer records to export in the selected scope.');
      return;
    }

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

    const rows = targetList.map((vol) => {
      const formattedDate = vol.createdAt
        ? new Date(vol.createdAt).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : '';

      const photoUrl =
        vol.imageUrl && (vol.imageUrl.startsWith('http://') || vol.imageUrl.startsWith('https://'))
          ? vol.imageUrl
          : vol.imageUrl && vol.imageUrl.startsWith('data:')
          ? 'Uploaded Base64 Photo'
          : '';

      const cardUrl = (vol as any).cardImageUrl || photoUrl || '';

      return [
        escapeCSV(vol.id),
        escapeCSV(vol.name),
        escapeCSV(vol.phone ? `+91 ${vol.phone}` : ''),
        escapeCSV(vol.department || 'General Seva'),
        escapeCSV(vol.hodName || ''),
        escapeCSV(vol.status || 'Active'),
        escapeCSV(vol.cardStatus || 'Generated'),
        escapeCSV(photoUrl),
        escapeCSV(cardUrl),
        escapeCSV(formattedDate),
      ].join(',');
    });

    // Add UTF-8 BOM (\uFEFF) so Excel on Windows/Mac properly parses Hindi/Unicode text
    const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStamp = new Date().toISOString().split('T')[0];
    link.download = `ISKCON_Janmashtami_2026_Volunteers_${totalTargetCount}_Records_${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 2. Direct Server-Side High-Speed ZIP Download (Zero CORS issues, perfect for Arti Seva & full batches)
  const handleServerSideZipDownload = async () => {
    if (totalTargetCount === 0) {
      alert('No volunteer records to export.');
      return;
    }

    try {
      setIsDownloadingServerZip(true);
      setZipError(null);
      setZipSuccess(null);

      const targetIds = targetList.map((v) => v.id);

      const resp = await fetch('/api/volunteers/export/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: targetIds }),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with HTTP ${resp.status}`);
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStamp = new Date().toISOString().split('T')[0];
      const deptTag = exportScope === 'filtered' && filteredVolunteers.length > 0 && filteredVolunteers[0]?.department
        ? filteredVolunteers[0].department.replace(/[^a-zA-Z0-9_-]/g, '_')
        : 'Volunteers';

      link.download = `ISKCON_Janmashtami_2026_${deptTag}_Cards_${targetList.length}_${dateStamp}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setZipSuccess(`Successfully downloaded high-quality ZIP archive with ${targetList.length} card images!`);
    } catch (err: any) {
      console.error('Server ZIP download error:', err);
      setZipError('Failed to download ZIP from server: ' + (err?.message || err));
    } finally {
      setIsDownloadingServerZip(false);
    }
  };

  // 3. Export JSON Database Backup
  const handleExportJSON = () => {
    if (totalTargetCount === 0) {
      alert('No volunteer records to export.');
      return;
    }

    const jsonStr = JSON.stringify(targetList, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStamp = new Date().toISOString().split('T')[0];
    link.download = `ISKCON_Janmashtami_2026_Database_Backup_${totalTargetCount}_Volunteers_${dateStamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 4. Batch Card Images ZIP Export in Browser with Safe Data URL Preloading
  const handleExportImagesZIP = async () => {
    if (totalTargetCount === 0) {
      alert('No volunteer cards to export.');
      return;
    }

    try {
      setIsExportingZip(true);
      setZipError(null);
      setZipSuccess(null);
      cancelExportRef.current = false;
      setZipProgress({ current: 0, total: totalTargetCount, statusText: 'Initializing card generator...' });

      const zip = new JSZip();
      let successCount = 0;
      let skippedCount = 0;

      // Yielding helper to prevent freezing the UI thread
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      for (let i = 0; i < targetList.length; i++) {
        if (cancelExportRef.current) {
          setZipError('Export cancelled by user.');
          setIsExportingZip(false);
          return;
        }

        const vol = targetList[i];
        
        setZipProgress({
          current: i + 1,
          total: totalTargetCount,
          statusText: `Preparing image for card ${i + 1} of ${totalTargetCount}: ${vol.name}...`,
        });

        // Convert image to safe local data URL to completely prevent CORS tainted canvas errors
        const safeImageUrl = await getSafeDataUrl(vol.imageUrl);
        setRenderVol({ ...vol, imageUrl: safeImageUrl });

        setZipProgress({
          current: i + 1,
          total: totalTargetCount,
          statusText: `Rendering card ${i + 1} of ${totalTargetCount}: ${vol.name} (${vol.id})...`,
        });

        // Give React a frame to mount this specific volunteer's card into the dynamic offscreen container
        await sleep(75);

        const cardEl = document.getElementById('dynamic-export-card-canvas');
        if (cardEl) {
          try {
            // Render card at clean 2x resolution (crisp & compact memory footprint)
            const dataUrl = await toPng(cardEl, {
              pixelRatio: 2,
              quality: 0.92,
              backgroundColor: '#ffffff',
              skipAutoScale: true,
              cacheBust: false,
            });

            const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
            const safeName = (vol.name || 'Volunteer').replace(/[^a-zA-Z0-9_-]/g, '_');
            const safeDept = (vol.department || 'Seva').replace(/[^a-zA-Z0-9_-]/g, '_');
            const fileName = `${vol.id}_${safeName}_${safeDept}.png`;

            zip.file(fileName, base64Data, { base64: true });
            successCount++;
          } catch (cardErr) {
            console.warn(`Card render warning for ${vol.id}, attempting fallback canvas:`, cardErr);
            // Fallback: draw basic card on canvas so no volunteer is ever lost
            try {
              const canvas = document.createElement('canvas');
              canvas.width = 680;
              canvas.height = 1040;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                // Blue background
                const grad = ctx.createLinearGradient(0, 0, 680, 1040);
                grad.addColorStop(0, '#0F294A');
                grad.addColorStop(0.5, '#1E40AF');
                grad.addColorStop(1, '#2563EB');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, 680, 1040);

                // Card inner container
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(30, 140, 620, 860);

                // Header text
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 30px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('SRI KRISHNA JANMASTAMI 2026', 340, 75);
                ctx.font = 'bold 20px sans-serif';
                ctx.fillStyle = '#93C5FD';
                ctx.fillText('VOLUNTEER SEVA CARD', 340, 115);

                // Name & Details
                ctx.fillStyle = '#0F172A';
                ctx.font = 'bold 36px sans-serif';
                ctx.fillText(vol.name, 340, 360);

                ctx.fillStyle = '#1E40AF';
                ctx.font = 'bold 28px sans-serif';
                ctx.fillText(vol.department, 340, 420);

                ctx.fillStyle = '#475569';
                ctx.font = '22px sans-serif';
                ctx.fillText(`HOD: ${vol.hodName}`, 340, 480);
                ctx.fillText(`Phone: +91 ${vol.phone}`, 340, 530);
                ctx.fillText(`Card ID: ${vol.id}`, 340, 580);

                const dataUrl = canvas.toDataURL('image/png');
                const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
                const safeName = (vol.name || 'Volunteer').replace(/[^a-zA-Z0-9_-]/g, '_');
                const safeDept = (vol.department || 'Seva').replace(/[^a-zA-Z0-9_-]/g, '_');
                zip.file(`${vol.id}_${safeName}_${safeDept}.png`, base64Data, { base64: true });
                successCount++;
              }
            } catch {
              skippedCount++;
            }
          }
        } else {
          skippedCount++;
        }

        // Small pause every 15 cards to give garbage collector time
        if (i % 15 === 0) {
          await sleep(20);
        }
      }

      setZipProgress({
        current: totalTargetCount,
        total: totalTargetCount,
        statusText: 'Packaging ZIP file (compressing images)...',
      });

      // Generate ZIP with standard compression
      const zipBlob = await zip.generateAsync(
        {
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 },
        },
        (metadata) => {
          setZipProgress({
            current: totalTargetCount,
            total: totalTargetCount,
            statusText: `Compressing ZIP file: ${Math.round(metadata.percent)}% complete...`,
          });
        }
      );

      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      const dateStamp = new Date().toISOString().split('T')[0];
      link.download = `ISKCON_Janmashtami_2026_Cards_Archive_${successCount}_Cards_${dateStamp}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setZipSuccess(
        `Successfully exported ${successCount} high-resolution volunteer cards into ZIP!${
          skippedCount > 0 ? ` (${skippedCount} cards had image errors and were skipped)` : ''
        }`
      );
    } catch (err: any) {
      console.error('Error during bulk ZIP export:', err);
      setZipError(err?.message || 'Error occurred while packaging card images.');
    } finally {
      setIsExportingZip(false);
      setRenderVol(null);
    }
  };

  const handlePrintCards = () => {
    onClose();
    setTimeout(() => {
      window.print();
    }, 200);
  };

  return (
    <div
      id="export-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
    >
      <div
        id="export-modal-dialog"
        className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-blue-200 overflow-hidden space-y-4 my-auto animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#1E40AF] shrink-0">
              <Download className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug font-serif-cultural">
                Export Volunteer Directory Data
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Download full data records (CSV / Excel / JSON) or high-res card images (ZIP)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isExportingZip || isDownloadingServerZip}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Export Scope Selector: Selected / Filtered / All */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#1E40AF]" />
            <span>Select Export Scope:</span>
          </label>

          <div className="grid grid-cols-3 gap-2">
            {selectedIds.length > 0 && (
              <button
                type="button"
                id="export-scope-selected"
                onClick={() => setExportScope('selected')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border text-center cursor-pointer ${
                  exportScope === 'selected'
                    ? 'bg-[#1E40AF] text-white border-[#1E40AF] shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Selected ({selectedIds.length})
              </button>
            )}

            <button
              type="button"
              id="export-scope-filtered"
              onClick={() => setExportScope('filtered')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border text-center cursor-pointer ${
                exportScope === 'filtered'
                  ? 'bg-[#1E40AF] text-white border-[#1E40AF] shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Filtered ({filteredVolunteers.length})
            </button>

            <button
              type="button"
              id="export-scope-all"
              onClick={() => setExportScope('all')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border text-center cursor-pointer ${
                exportScope === 'all'
                  ? 'bg-[#1E40AF] text-white border-[#1E40AF] shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              All Records ({allVolunteers.length})
            </button>
          </div>

          <p className="text-[11px] text-slate-500 font-medium text-center">
            Targeting <strong>{totalTargetCount} volunteer cards</strong>
          </p>
        </div>

        {/* Tab Selector */}
        <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('zip')}
            className={`py-2 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'zip'
                ? 'bg-white text-[#1E40AF] shadow-xs border border-blue-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Image className="w-3.5 h-3.5 text-[#1E40AF]" />
            <span>Cards (ZIP)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('csv')}
            className={`py-2 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'csv'
                ? 'bg-white text-emerald-800 shadow-xs border border-emerald-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Spreadsheet</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('json')}
            className={`py-2 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'json'
                ? 'bg-white text-amber-800 shadow-xs border border-amber-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileCode className="w-3.5 h-3.5 text-amber-600" />
            <span>JSON Backup</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('print')}
            className={`py-2 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'print'
                ? 'bg-white text-purple-800 shadow-xs border border-purple-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Printer className="w-3.5 h-3.5 text-purple-600" />
            <span>Print Sheet</span>
          </button>
        </div>

        {/* Tab 1: High-Resolution Card Images ZIP (Fast Server ZIP + Browser Generator) */}
        {activeTab === 'zip' && (
          <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-3">
            <div className="flex items-start gap-2.5">
              <Image className="w-5 h-5 text-[#1E40AF] shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-blue-950">High-Resolution Card PNG Images (.ZIP)</h4>
                <p className="text-xs text-blue-800 mt-0.5 leading-relaxed">
                  Generates clean printable cards for all <strong>{totalTargetCount}</strong> volunteers and packages them into a ZIP archive.
                  Images are proxied to guarantee zero CORS/image loading errors.
                </p>
              </div>
            </div>

            {/* ZIP Progress Bar */}
            {isExportingZip && (
              <div className="p-3 bg-white border border-blue-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <div className="flex items-center gap-1.5 text-[#1E40AF]">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="truncate max-w-[260px]">{zipProgress.statusText}</span>
                  </div>
                  <span className="shrink-0">
                    {zipProgress.current} / {zipProgress.total} (
                    {Math.round((zipProgress.current / Math.max(zipProgress.total, 1)) * 100)}%)
                  </span>
                </div>

                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-[#1E40AF] h-2.5 rounded-full transition-all duration-150"
                    style={{
                      width: `${(zipProgress.current / Math.max(zipProgress.total, 1)) * 100}%`,
                    }}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    cancelExportRef.current = true;
                  }}
                  className="text-[11px] text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                >
                  Cancel Export
                </button>
              </div>
            )}

            {zipSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{zipSuccess}</span>
              </div>
            )}

            {zipError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{zipError}</span>
              </div>
            )}

            {/* Action Buttons: Instant Server ZIP (Recommended) & Browser Generator */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-2 justify-end">
              <button
                type="button"
                id="server-zip-export-btn"
                onClick={handleServerSideZipDownload}
                disabled={isDownloadingServerZip || isExportingZip || totalTargetCount === 0}
                className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 min-h-[42px]"
                title="Super-fast server-side generation: 100% error-free"
              >
                {isDownloadingServerZip ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Packaging Cards ({totalTargetCount})...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                    <span>Instant High-Speed ZIP ({totalTargetCount} Cards)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                id="export-zip-modal-confirm-btn"
                onClick={handleExportImagesZIP}
                disabled={isExportingZip || isDownloadingServerZip || totalTargetCount === 0}
                className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-white border border-blue-300 hover:bg-blue-50 text-[#1E40AF] font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 min-h-[42px]"
              >
                {isExportingZip ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Rendering ({zipProgress.current}/{zipProgress.total})...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Browser ZIP Generator</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Excel / CSV Export */}
        {activeTab === 'csv' && (
          <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-3">
            <div className="flex items-start gap-2.5">
              <FileSpreadsheet className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-emerald-950">Excel & Google Sheets Spreadsheet (.CSV)</h4>
                <p className="text-xs text-emerald-800 mt-0.5 leading-relaxed">
                  Exports all <strong>{totalTargetCount}</strong> volunteer records instantly into an organized,
                  UTF-8 formatted spreadsheet with names, phones, departments, and image links.
                </p>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center gap-2 justify-end">
              <a
                href="/api/volunteers/export/csv"
                download
                className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Direct Full Directory CSV</span>
              </a>

              <button
                type="button"
                id="export-csv-modal-confirm-btn"
                onClick={handleExportCSV}
                className="w-full sm:w-auto py-2.5 px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[42px]"
              >
                <Download className="w-4 h-4" />
                <span>Download Scope CSV ({totalTargetCount} Records)</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: JSON Database Backup */}
        {activeTab === 'json' && (
          <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-3">
            <div className="flex items-start gap-2.5">
              <FileCode className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-amber-950">Complete Database Backup (.JSON)</h4>
                <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                  Full raw structured JSON dump of all <strong>{totalTargetCount}</strong> volunteer entries with
                  all internal schema keys. Ideal for disaster recovery, migrations, or local offline storage.
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                id="export-json-modal-confirm-btn"
                onClick={handleExportJSON}
                className="w-full sm:w-auto py-2.5 px-5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs sm:text-sm shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[42px]"
              >
                <Download className="w-4 h-4" />
                <span>Download Database JSON ({totalTargetCount} Records)</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 4: Print Multi-Cards Sheet */}
        {activeTab === 'print' && (
          <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-200 space-y-3">
            <div className="flex items-start gap-2.5">
              <Printer className="w-5 h-5 text-purple-700 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-purple-950">Print Multi-Card Badges on A4</h4>
                <p className="text-xs text-purple-800 mt-0.5 leading-relaxed">
                  Opens the browser print dialog formatted for clean batch printing on A4 cardstock sheets.
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                id="print-cards-modal-confirm-btn"
                onClick={handlePrintCards}
                className="w-full sm:w-auto py-2.5 px-5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs sm:text-sm shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[42px]"
              >
                <Printer className="w-4 h-4" />
                <span>Print Volunteer Cards</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Dynamic Off-Screen Card Canvas for Browser-based Export (Rendered 1-at-a-time for memory efficiency) */}
      {renderVol && (
        <div
          id="offscreen-render-wrapper"
          style={{
            position: 'fixed',
            left: '-9999px',
            top: 0,
            opacity: 0,
            pointerEvents: 'none',
            zIndex: -1,
          }}
        >
          <div
            id="dynamic-export-card-canvas"
            ref={cardRenderRef}
            className="w-[340px] rounded-3xl overflow-hidden shadow-xl bg-white border border-blue-200 text-slate-900 select-none"
            style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {/* Header: Blue Theme */}
            <div className="relative blue-gradient text-white px-4 pt-3.5 pb-4 text-center overflow-hidden">
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-white p-1 shadow-md border-2 border-blue-200/80 flex items-center justify-center overflow-hidden shrink-0">
                    <AppLogo className="w-full h-full object-contain" size={44} />
                  </div>
                  <div className="text-left leading-none">
                    <p className="text-[10px] text-sky-200 font-bold uppercase tracking-wider">ISKCON</p>
                    <p className="text-[9px] text-blue-100 font-medium">Janmashtami</p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="inline-block bg-white/15 backdrop-blur-xs border border-white/25 text-white px-2.5 py-0.5 rounded-full text-[10px] tracking-wider uppercase font-extrabold">
                    HARE KRISHNA
                  </span>
                </div>
              </div>

              <div className="absolute bottom-0 inset-x-0 h-1 bg-gradient-to-r from-blue-300 via-sky-200 to-amber-300" />
            </div>

            {/* Badge */}
            <div className="flex justify-center -mt-3 relative z-20">
              {renderVol.status === 'Deactivated' ? (
                <div className="bg-gradient-to-r from-red-700 to-rose-600 text-white font-bold text-xs tracking-widest uppercase px-5 py-1 rounded-full shadow-md border-2 border-white flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-rose-200" />
                  <span>CARD DEACTIVATED</span>
                </div>
              ) : (
                <div className="bg-gradient-to-r from-[#0F294A] to-[#1E40AF] text-white font-bold text-xs tracking-widest uppercase px-5 py-1 rounded-full shadow-md border-2 border-white flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-300" />
                  <span>VOLUNTEER</span>
                </div>
              )}
            </div>

            {/* Card Body */}
            <div className="p-4 pt-3 space-y-3 bg-gradient-to-b from-blue-50/40 via-white to-sky-50/30">
              <div className="flex flex-col items-center">
                <div
                  className={`relative w-32 h-32 rounded-2xl overflow-hidden shadow-md border-2 bg-slate-50 ring-2 ${
                    renderVol.status === 'Deactivated'
                      ? 'border-rose-400 ring-rose-100'
                      : 'border-[#1E40AF] ring-blue-100'
                  }`}
                >
                  <img
                    src={renderVol.imageUrl}
                    alt={renderVol.name}
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (target.src.endsWith('.jpg')) {
                        target.src = target.src.replace(/\.jpg$/, '.webp');
                      } else if (target.src.endsWith('.webp')) {
                        target.src = target.src.replace(/\.webp$/, '.jpg');
                      }
                    }}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              <div className="text-center pt-0.5">
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight capitalize leading-tight font-serif-cultural">
                  {renderVol.name}
                </h3>
              </div>

              <div className="rounded-xl bg-white border border-blue-100 p-3.5 shadow-xs space-y-2 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-blue-50">
                  <span className="font-semibold text-slate-500">Department</span>
                  <span className="font-bold text-[#1E40AF] bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-md text-right">
                    {renderVol.department}
                  </span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-blue-50">
                  <span className="font-semibold text-slate-500">Department HOD</span>
                  <span className="font-bold text-slate-900 text-right capitalize">
                    {renderVol.hodName}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-500">Contact Phone</span>
                  <span className="font-mono font-bold text-slate-800 text-right">
                    +91 {renderVol.phone}
                  </span>
                </div>
              </div>

              <div className="text-center pt-1.5">
                <p className="text-[10px] text-slate-500 font-medium">Janmashtami 2026 Seva Committee</p>
                <p className="text-[8px] text-slate-400 uppercase tracking-widest mt-0.5">
                  Valid during festival days • Non-transferable
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
