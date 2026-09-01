import React, { useState } from 'react';
import {
  X,
  Save,
  Loader2,
  AlertCircle,
  User,
  Phone,
  Mail,
  Building2,
  UserCheck,
  ShieldCheck,
  Ban,
  Camera,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { Volunteer, DEPARTMENTS, CardStatus, FestivalEvent } from '../types';
import { updateVolunteerRecord } from '../lib/storage';
import ImageUploader from './ImageUploader';

interface EditVolunteerModalProps {
  volunteer: Volunteer;
  onClose: () => void;
  onSaveSuccess: (updated: Volunteer) => void;
  onRequestDelete?: (vol: Volunteer) => void;
  availableDepartments?: string[];
  events?: FestivalEvent[];
}

export default function EditVolunteerModal({
  volunteer,
  onClose,
  onSaveSuccess,
  onRequestDelete,
  availableDepartments,
  events,
}: EditVolunteerModalProps) {
  const [selectedEventId, setSelectedEventId] = useState<string>(
    volunteer.eventId || 'janmashtami-2026'
  );
  const [name, setName] = useState(volunteer.name || '');
  const [phone, setPhone] = useState(volunteer.phone || '');
  const [email, setEmail] = useState(volunteer.email || '');
  const [department, setDepartment] = useState(volunteer.department || 'General Seva');
  const [hodName, setHodName] = useState(volunteer.hodName || '');
  const [status, setStatus] = useState<'Active' | 'Deactivated'>(
    volunteer.status === 'Deactivated' ? 'Deactivated' : 'Active'
  );
  const [cardStatus, setCardStatus] = useState<CardStatus>(
    volunteer.cardStatus || 'Generated'
  );

  const [imageUrl, setImageUrl] = useState(volunteer.imageUrl || '');
  const [isChangingPhoto, setIsChangingPhoto] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Compute active departments for current selected event
  const currentEvent = events?.find((e) => e.id === selectedEventId);
  const computedDepartments =
    currentEvent?.departments && currentEvent.departments.length > 0
      ? currentEvent.departments
      : availableDepartments && availableDepartments.length > 0
      ? availableDepartments
      : DEPARTMENTS;

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numeric input, max 10 digits
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPhone(cleaned);
  };

  const handleImageUploaded = (newBase64: string) => {
    setImageUrl(newBase64);
    setIsChangingPhoto(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Validation
    if (!name.trim()) {
      setErrorMsg('Please enter volunteer full name');
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setErrorMsg('Please enter a valid 10-digit mobile number');
      return;
    }

    if (!department || department === '-- Select --') {
      setErrorMsg('Please select a valid department');
      return;
    }

    if (!imageUrl) {
      setErrorMsg('Volunteer photograph is required');
      return;
    }

    try {
      setIsSaving(true);

      const updated = await updateVolunteerRecord(volunteer.id, {
        name: name.trim(),
        phone: cleanPhone,
        email: email.trim(),
        department: department.trim(),
        hodName: hodName.trim(),
        status,
        cardStatus,
        imageUrl,
        eventId: selectedEventId,
        eventName: currentEvent ? currentEvent.name : undefined,
      });

      onSaveSuccess(updated);
    } catch (err: any) {
      console.error('Error updating volunteer card:', err);
      setErrorMsg(err?.message || 'Failed to update volunteer card. Please check inputs and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      id="edit-volunteer-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
    >
      <div
        id="edit-volunteer-modal-card"
        className="bg-white rounded-3xl max-w-xl w-full p-4 sm:p-6 shadow-2xl border border-blue-100 overflow-hidden space-y-4 my-auto animate-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#1E40AF]">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 font-serif-cultural leading-tight">
                Edit Volunteer Card
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[11px] font-mono font-bold text-[#1E40AF]">
                  {volunteer.id}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-[11px] text-slate-500">
                  Registered: {new Date(volunteer.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            id="close-edit-modal-btn"
            onClick={onClose}
            disabled={isSaving}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <form onSubmit={handleSave} className="overflow-y-auto flex-1 pr-1 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Photo Section */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-[#1E40AF]" />
                <span>Volunteer Photograph</span>
              </label>
              {!isChangingPhoto && (
                <button
                  type="button"
                  id="change-photo-btn"
                  onClick={() => setIsChangingPhoto(true)}
                  className="text-xs font-bold text-[#1E40AF] hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Camera className="w-3 h-3" />
                  <span>Change Photo</span>
                </button>
              )}
            </div>

            {isChangingPhoto ? (
              <div className="space-y-2 bg-white p-3 rounded-xl border border-blue-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-slate-600">
                    Upload & Crop New Photograph
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsChangingPhoto(false)}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Keep Existing Photo
                  </button>
                </div>
                <ImageUploader
                  onImageSelected={handleImageUploaded}
                  currentImage={imageUrl}
                />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-[#1E40AF] bg-white shadow-xs shrink-0">
                  <img
                    src={imageUrl}
                    alt={name}
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="text-xs space-y-0.5">
                  <p className="font-bold text-slate-900">Current Photo Active</p>
                  <p className="text-[11px] text-slate-500">
                    Photo will be updated on the pass automatically when saved.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Festival / Event Selector */}
          {events && events.length > 0 && (
            <div className="p-3 rounded-2xl bg-purple-50/70 border border-purple-200/80 space-y-1.5">
              <label className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-purple-700" />
                <span>Festival / Event *</span>
              </label>
              <select
                id="edit-volunteer-event-select"
                value={selectedEventId}
                onChange={(e) => {
                  const newEventId = e.target.value;
                  setSelectedEventId(newEventId);
                  const ev = events.find((item) => item.id === newEventId);
                  if (ev?.departments && ev.departments.length > 0 && !ev.departments.includes(department)) {
                    setDepartment(ev.departments[0]);
                  }
                }}
                className="w-full px-3 py-2 rounded-xl bg-white border border-purple-300 text-xs font-bold text-slate-900 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 outline-none cursor-pointer"
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name} {ev.year ? `(${ev.year})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Grid of Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Full Name */}
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <User className="w-3 h-3 text-[#1E40AF]" />
                <span>Full Name *</span>
              </label>
              <input
                id="edit-volunteer-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ramesh Kumar Das"
                required
                className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>

            {/* Mobile Phone */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Phone className="w-3 h-3 text-[#1E40AF]" />
                <span>Mobile Phone (10 digits) *</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-xs font-bold text-slate-500">
                  +91
                </div>
                <input
                  id="edit-volunteer-phone"
                  type="tel"
                  value={phone}
                  onChange={handlePhoneChange}
                  placeholder="9876543210"
                  required
                  maxLength={10}
                  className="w-full pl-11 pr-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-mono font-bold text-slate-900 placeholder:text-slate-400 focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>
            </div>

            {/* Email (Optional) */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Mail className="w-3 h-3 text-[#1E40AF]" />
                <span>Email Address (Optional)</span>
              </label>
              <input
                id="edit-volunteer-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="volunteer@iskcon.com"
                className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>

            {/* Department */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Building2 className="w-3 h-3 text-[#1E40AF]" />
                <span>Department / Seva *</span>
              </label>
              <select
                id="edit-volunteer-department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-semibold text-slate-900 focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 outline-none cursor-pointer"
              >
                {computedDepartments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            {/* Department HOD Name */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-[#1E40AF]" />
                <span>Department HOD Name</span>
              </label>
              <input
                id="edit-volunteer-hod"
                type="text"
                value={hodName}
                onChange={(e) => setHodName(e.target.value)}
                placeholder="e.g. HG Madhava Das"
                className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>

            {/* Volunteer Status (Active / Deactivated) */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-[#1E40AF]" />
                <span>Card Status (Permission)</span>
              </label>
              <select
                id="edit-volunteer-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'Active' | 'Deactivated')}
                className={`w-full px-3 py-2 rounded-xl border text-xs font-bold focus:ring-2 outline-none cursor-pointer ${
                  status === 'Deactivated'
                    ? 'bg-rose-50 border-rose-300 text-rose-800 focus:ring-rose-100'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-800 focus:ring-emerald-100'
                }`}
              >
                <option value="Active">🟢 Active (Valid Card)</option>
                <option value="Deactivated">🔴 Deactivated (Disabled)</option>
              </select>
            </div>

            {/* Card Printing Status (Generated / Printed / Issued) */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-[#1E40AF]" />
                <span>Physical Card Workflow</span>
              </label>
              <select
                id="edit-volunteer-card-status"
                value={cardStatus}
                onChange={(e) => setCardStatus(e.target.value as CardStatus)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-semibold text-slate-900 focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 outline-none cursor-pointer"
              >
                <option value="Generated">📄 Generated</option>
                <option value="Printed">🖨️ Printed</option>
                <option value="Issued">🎖️ Issued to Volunteer</option>
              </select>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5">
            {/* Delete button option */}
            {onRequestDelete ? (
              <button
                type="button"
                id="modal-delete-permanently-btn"
                onClick={() => onRequestDelete(volunteer)}
                disabled={isSaving}
                className="w-full sm:w-auto px-3 py-2 rounded-xl text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Delete Permanently</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                id="cancel-edit-btn"
                onClick={onClose}
                disabled={isSaving}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 transition-colors cursor-pointer disabled:opacity-50 min-h-[38px]"
              >
                Cancel
              </button>

              <button
                type="submit"
                id="save-volunteer-changes-btn"
                disabled={isSaving}
                className="w-full sm:w-auto px-5 py-2 rounded-xl blue-gradient hover:opacity-95 text-white text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 min-h-[38px]"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
