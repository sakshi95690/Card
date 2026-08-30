import React, { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Download, ShieldCheck, CheckCircle2, X, Pencil, Trash2 } from 'lucide-react';
import { Volunteer } from '../types';
import { AppLogo } from './AppLogo';

interface VolunteerCardProps {
  volunteer: Volunteer;
  onRegisterAnother?: () => void;
  isAdminView?: boolean;
  onClose?: () => void;
  onEdit?: (vol: Volunteer) => void;
  onDelete?: (vol: Volunteer) => void;
}

export default function VolunteerCard({
  volunteer,
  onRegisterAnother,
  isAdminView = false,
  onClose,
  onEdit,
  onDelete,
}: VolunteerCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  // Download Card as high-res PNG (3.5x pixel ratio for crystal clear print quality)
  const handleDownloadPNG = async () => {
    if (!cardRef.current) return;
    try {
      setIsDownloading(true);
      await new Promise((res) => setTimeout(res, 80));

      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 3.5,
        quality: 1,
        backgroundColor: '#ffffff',
        fontEmbedCSS: '',
        skipAutoScale: true,
      });

      const link = document.createElement('a');
      const safeName = volunteer.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      link.download = `Volunteer_Card_${safeName}.png`;
      link.href = dataUrl;
      link.click();

      setDownloadSuccess('PNG');
      setTimeout(() => setDownloadSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to download PNG card:', err);
      alert('Could not download card image. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else if (onRegisterAnother) {
      onRegisterAnother();
    }
  };

  return (
    <div className="w-full max-w-sm sm:max-w-md mx-auto flex flex-col items-center space-y-3.5 px-1 sm:px-0">
      {/* Header Banner - Only in Volunteer mode */}
      {!isAdminView && (
        <div className="w-full text-center space-y-1 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 border border-blue-300 text-blue-950 font-bold text-xs shadow-xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" /> Registration Successful 🎉
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight font-serif-cultural">
            Your Volunteer Card is Ready
          </h2>
        </div>
      )}

      {/* The Clean, White & Blue Volunteer Card */}
      <div className="relative w-full flex justify-center py-1 overflow-visible">
        <div
          ref={cardRef}
          id={`volunteer-card-${volunteer.id}`}
          className="printable-card w-full max-w-[325px] sm:max-w-[345px] rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl bg-white border border-blue-200 text-slate-900 relative select-none"
          style={{
            boxShadow: '0 12px 30px -10px rgba(30, 64, 175, 0.2), 0 0 0 1px rgba(30, 64, 175, 0.12)',
          }}
        >
          {/* Card Top Header: Deep Royal Blue Gradient with AppLogo */}
          <div className="relative blue-gradient text-white px-4 pt-3.5 pb-4 text-center overflow-hidden">
            {/* Top Bar with Logo and Mantra */}
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
                <span className="inline-block bg-white/15 backdrop-blur-xs border border-white/25 text-white px-2.5 py-0.5 rounded-full text-[10px] tracking-wider uppercase font-extrabold shadow-2xs">
                  HARE KRISHNA
                </span>
              </div>
            </div>

            {/* Blue & Gold Accent Ribbon Under Header */}
            <div className="absolute bottom-0 inset-x-0 h-1 bg-gradient-to-r from-blue-300 via-sky-200 to-amber-300 shadow-xs" />
          </div>

          {/* Volunteer Badge - Royal Blue & White or Deactivated Red */}
          <div className="flex justify-center -mt-3 relative z-20">
            {volunteer.status === 'Deactivated' ? (
              <div className="bg-gradient-to-r from-red-700 to-rose-600 text-white font-bold text-[10px] sm:text-xs tracking-widest uppercase px-5 py-1 rounded-full shadow-md border-2 border-white flex items-center gap-1.5 animate-pulse">
                <ShieldCheck className="w-3.5 h-3.5 text-rose-200" />
                <span>CARD DEACTIVATED</span>
              </div>
            ) : (
              <div className="bg-gradient-to-r from-[#0F294A] to-[#1E40AF] text-white font-bold text-[10px] sm:text-xs tracking-widest uppercase px-5 py-1 rounded-full shadow-md border-2 border-white flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-300" />
                <span>VOLUNTEER</span>
              </div>
            )}
          </div>

          {/* Card Body - Clean Crisp White with Blue accents */}
          <div className="p-4 pt-3 space-y-3 bg-gradient-to-b from-blue-50/40 via-white to-sky-50/30">
            {/* Photo Box */}
            <div className="flex flex-col items-center">
              <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden shadow-md border-2 border-[#1E40AF] bg-slate-50 ring-2 ring-blue-100">
                <img
                  src={volunteer.imageUrl}
                  alt={volunteer.name}
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

            {/* Name */}
            <div className="text-center pt-0.5">
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight capitalize leading-tight font-serif-cultural">
                {volunteer.name}
              </h3>
            </div>

            {/* Information Grid */}
            <div className="rounded-xl bg-white border border-blue-100 p-3 sm:p-3.5 shadow-xs space-y-2 text-xs sm:text-sm">
              {/* Department */}
              <div className="flex items-center justify-between pb-2 border-b border-blue-50">
                <span className="font-semibold text-slate-500">Department</span>
                <span className="font-bold text-[#1E40AF] bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-md text-right">
                  {volunteer.department || 'General Seva'}
                </span>
              </div>

              {/* HOD Name */}
              <div className="flex items-center justify-between pb-2 border-b border-blue-50">
                <span className="font-semibold text-slate-500">Department HOD</span>
                <span className="font-bold text-slate-900 text-right capitalize">
                  {volunteer.hodName || '—'}
                </span>
              </div>

              {/* Phone */}
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-500">Contact Phone</span>
                <span className="font-mono font-bold text-slate-800 text-right">
                  +91 {volunteer.phone}
                </span>
              </div>
            </div>

            {/* Bottom Card Footer */}
            <div className="text-center pt-1.5">
              <p className="text-[10px] text-slate-500 font-medium">
                Janmashtami 2026 Seva Committee
              </p>
              <p className="text-[8px] sm:text-[9px] text-slate-400 uppercase tracking-widest mt-0.5">
                Valid during festival days • Non-transferable
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="w-full flex flex-col gap-2 pt-1 no-print">
        <div className="grid grid-cols-2 gap-2.5 w-full">
          <button
            type="button"
            id="download-png-card-btn"
            onClick={handleDownloadPNG}
            disabled={isDownloading}
            className="py-3 px-3 rounded-xl blue-gradient hover:opacity-95 text-white font-bold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-75"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>{isDownloading ? 'Saving...' : 'Download PNG'}</span>
          </button>

          <button
            type="button"
            id="close-card-btn"
            onClick={handleClose}
            className="py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm border border-slate-300 shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <X className="w-4 h-4 shrink-0" />
            <span>Close</span>
          </button>
        </div>

        {isAdminView && (onEdit || onDelete) && (
          <div className="grid grid-cols-2 gap-2.5 w-full pt-1 border-t border-slate-100">
            {onEdit && (
              <button
                type="button"
                id="admin-card-edit-btn"
                onClick={() => onEdit(volunteer)}
                className="py-2.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1E40AF] font-bold text-xs border border-blue-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit Details</span>
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                id="admin-card-delete-btn"
                onClick={() => onDelete(volunteer)}
                className="py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Permanently</span>
              </button>
            )}
          </div>
        )}
      </div>

      {downloadSuccess && (
        <div className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg animate-in fade-in no-print text-center w-full">
          ✓ Card downloaded as {downloadSuccess} successfully!
        </div>
      )}
    </div>
  );
}
