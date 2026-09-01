import React, { useState, useEffect } from 'react';
import {
  X,
  UserPlus,
  Loader2,
  AlertCircle,
  User,
  Phone,
  Mail,
  Building2,
  UserCheck,
  Calendar,
  Camera,
  CheckCircle2,
  IdCard,
} from 'lucide-react';
import { DEPARTMENTS, Volunteer, FestivalEvent, CardStatus } from '../types';
import { registerVolunteerRecord } from '../lib/storage';
import ImageUploader from './ImageUploader';

interface AddVolunteerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newVolunteer: Volunteer) => void;
  events: FestivalEvent[];
  defaultEventId?: string;
}

export function AddVolunteerModal({
  isOpen,
  onClose,
  onSuccess,
  events,
  defaultEventId,
}: AddVolunteerModalProps) {
  const [selectedEventId, setSelectedEventId] = useState<string>(
    defaultEventId && defaultEventId !== 'ALL' ? defaultEventId : 'janmashtami-2026'
  );
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [hodName, setHodName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [cardStatus, setCardStatus] = useState<CardStatus>('Generated');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync selected event if defaultEventId changes
  useEffect(() => {
    if (defaultEventId && defaultEventId !== 'ALL') {
      setSelectedEventId(defaultEventId);
    } else if (events.length > 0 && !events.some((e) => e.id === selectedEventId)) {
      const def = events.find((e) => e.isDefault) || events[0];
      if (def) setSelectedEventId(def.id);
    }
  }, [defaultEventId, events]);

  // Current active event and departments
  const currentEvent = events.find((e) => e.id === selectedEventId) || events[0];
  const availableDepartments =
    currentEvent?.departments && currentEvent.departments.length > 0
      ? currentEvent.departments
      : DEPARTMENTS;

  // Set default department on event change
  useEffect(() => {
    if (availableDepartments.length > 0 && (!department || !availableDepartments.includes(department))) {
      setDepartment(availableDepartments[0]);
    }
  }, [selectedEventId, availableDepartments]);

  if (!isOpen) return null;

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPhone(cleaned);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Form validations
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
      setErrorMsg('Please select a valid seva department');
      return;
    }

    if (!imageUrl) {
      setErrorMsg('Volunteer photograph is required for ID card generation');
      return;
    }

    try {
      setIsSubmitting(true);
      const created = await registerVolunteerRecord({
        name: name.trim(),
        phone: cleanPhone,
        email: email.trim(),
        hodName: hodName.trim(),
        department: department.trim(),
        imageUrl: imageUrl.trim(),
        eventId: currentEvent ? currentEvent.id : selectedEventId,
        eventName: currentEvent ? currentEvent.name : 'Sri Krishna Janmashtami',
      });

      // Reset form
      setName('');
      setPhone('');
      setEmail('');
      setHodName('');
      setImageUrl('');
      setErrorMsg(null);

      onSuccess(created);
      onClose();
    } catch (err: any) {
      console.error('Error adding new volunteer:', err);
      setErrorMsg(err?.message || 'Failed to register volunteer. Please check inputs and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="add-volunteer-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
    >
      <div
        id="add-volunteer-modal-card"
        className="bg-white rounded-3xl max-w-xl w-full p-4 sm:p-6 shadow-2xl border border-blue-100 overflow-hidden space-y-4 my-auto animate-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#1E40AF]">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 font-serif-cultural leading-tight">
                Add New Volunteer
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Admin manual volunteer registration & instant pass generation
              </p>
            </div>
          </div>

          <button
            type="button"
            id="close-add-modal-btn"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 pr-1 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Festival / Event Selector */}
          <div className="p-3 rounded-2xl bg-purple-50/70 border border-purple-200/80 space-y-1.5">
            <label className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-purple-700" />
              <span>Festival / Event *</span>
            </label>
            <select
              id="add-volunteer-event-select"
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-purple-300 text-xs font-bold text-slate-900 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 outline-none cursor-pointer"
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} {ev.year ? `(${ev.year})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Photo Section */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
            <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-[#1E40AF]" />
                <span>Volunteer Photograph *</span>
              </span>
              {imageUrl && (
                <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Photo Attached
                </span>
              )}
            </label>

            <ImageUploader
              onImageSelected={(base64) => setImageUrl(base64)}
              currentImage={imageUrl}
            />
          </div>

          {/* Input Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Full Name */}
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <User className="w-3 h-3 text-[#1E40AF]" />
                <span>Full Name *</span>
              </label>
              <input
                id="add-volunteer-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Radheshyam Das"
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
                  id="add-volunteer-phone"
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
                id="add-volunteer-email"
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
                id="add-volunteer-department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-semibold text-slate-900 focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 outline-none cursor-pointer"
              >
                {availableDepartments.map((dept) => (
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
                id="add-volunteer-hod"
                type="text"
                value={hodName}
                onChange={(e) => setHodName(e.target.value)}
                placeholder="e.g. HG Madhava Das"
                className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              id="cancel-add-btn"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 transition-colors cursor-pointer disabled:opacity-50 min-h-[38px]"
            >
              Cancel
            </button>

            <button
              type="submit"
              id="submit-add-volunteer-btn"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl blue-gradient hover:opacity-95 text-white text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 min-h-[38px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Registering...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Create Volunteer & Generate ID</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddVolunteerModal;
