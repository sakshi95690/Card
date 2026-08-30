import React from 'react';
import { Trash2, AlertTriangle, Loader2, X, Users } from 'lucide-react';
import { Volunteer } from '../types';

interface DeleteConfirmModalProps {
  volunteersToDelete: Volunteer[];
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteConfirmModal({
  volunteersToDelete,
  isDeleting,
  onCancel,
  onConfirm,
}: DeleteConfirmModalProps) {
  const count = volunteersToDelete.length;
  if (count === 0) return null;

  const isBulk = count > 1;
  const singleVol = !isBulk ? volunteersToDelete[0] : null;

  return (
    <div
      id="delete-confirm-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
    >
      <div
        id="delete-confirm-modal-card"
        className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-rose-200 overflow-hidden space-y-4 my-auto animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug font-serif-cultural">
                {isBulk
                  ? `Permanently delete ${count} volunteer cards?`
                  : `Permanently delete this card?`}
              </h3>
              <p className="text-xs text-rose-700 font-semibold">
                Permanent deletion from database and cloud storage
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Warning Details */}
        <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-2xl space-y-2 text-xs text-rose-900">
          <div className="flex items-center gap-1.5 font-bold text-rose-950">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>Warning: This cannot be undone</span>
          </div>
          <p className="text-[11px] leading-relaxed text-rose-800">
            The volunteer record will be permanently wiped from the database and all uploaded photos
            and generated card files will be deleted from Supabase Storage and Vercel Blob.
          </p>
        </div>

        {/* Target Details */}
        {singleVol ? (
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl overflow-hidden border border-rose-300 bg-white shrink-0">
                <img
                  src={singleVol.imageUrl}
                  alt={singleVol.name}
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-900 text-sm truncate">{singleVol.name}</p>
                <p className="font-mono text-[11px] font-bold text-[#1E40AF]">{singleVol.id}</p>
                <p className="text-[11px] text-slate-600">{singleVol.department}</p>
              </div>
            </div>
            <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
              <span>Mobile: <strong>+91 {singleVol.phone}</strong></span>
              <span>Status: <strong className="text-slate-800">{singleVol.status}</strong></span>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 max-h-36 overflow-y-auto space-y-1.5">
            <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1">
              <Users className="w-3.5 h-3.5 text-[#1E40AF]" />
              <span>Selected {count} Volunteers:</span>
            </div>
            {volunteersToDelete.map((v) => (
              <div
                key={v.id}
                className="text-[11px] flex items-center justify-between py-1 px-2 rounded-lg bg-white border border-slate-100"
              >
                <span className="font-bold text-slate-900 truncate max-w-[180px]">{v.name}</span>
                <span className="font-mono text-slate-500 text-[10px]">{v.id}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            id="cancel-delete-modal-btn"
            onClick={onCancel}
            disabled={isDeleting}
            className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm border border-slate-300 transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center min-h-[42px]"
          >
            Cancel
          </button>

          <button
            type="button"
            id="confirm-delete-permanently-btn"
            onClick={onConfirm}
            disabled={isDeleting}
            className="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[42px]"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>{isBulk ? `Delete ${count} Permanently` : 'Delete Permanently'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
