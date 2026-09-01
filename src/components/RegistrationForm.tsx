import React, { useState, useEffect, useCallback } from 'react';
import { User, Phone, UserCheck, AlertCircle, Loader2, Calendar, IdCard } from 'lucide-react';
import { DEPARTMENTS, Volunteer, FestivalEvent } from '../types';
import { registerVolunteerRecord, fetchAllEvents, subscribeToVolunteerUpdates } from '../lib/storage';
import ImageUploader from './ImageUploader';
import { AppLogo } from './AppLogo';

interface RegistrationFormProps {
  onSuccess: (volunteer: Volunteer) => void;
}

interface FormState {
  name: string;
  phone: string;
  hodName: string;
  department: string;
  imageUrl: string;
  eventId: string;
  eventName: string;
}

interface FormErrors {
  name?: string;
  phone?: string;
  hodName?: string;
  department?: string;
  imageUrl?: string;
  eventId?: string;
  general?: string;
  isDuplicate?: boolean;
  duplicateVolunteer?: Volunteer | null;
}

export default function RegistrationForm({ onSuccess }: RegistrationFormProps) {
  const [events, setEvents] = useState<FestivalEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const [formData, setFormData] = useState<FormState>({
    name: '',
    phone: '',
    hodName: '',
    department: '-- Select --',
    imageUrl: '',
    eventId: 'janmashtami-2026',
    eventName: 'Sri Krishna Janmashtami',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadEventsList = useCallback(async (isMounted: boolean) => {
    try {
      const list = await fetchAllEvents();
      if (isMounted && list.length > 0) {
        setEvents(list);
        const savedId = localStorage.getItem('active_festival_event_id');
        let defaultEvent = savedId ? list.find((e) => e.id === savedId) : null;
        if (!defaultEvent) {
          defaultEvent =
            list.find((e) => e.isDefault && e.isActive !== false) ||
            list.find((e) => e.isActive !== false) ||
            list[0];
        }
        if (defaultEvent) {
          setFormData((prev) => ({
            ...prev,
            eventId: defaultEvent.id,
            eventName: defaultEvent.name,
          }));
        }
      }
    } catch (err) {
      console.error('Error loading events for registration form:', err);
    } finally {
      if (isMounted) setLoadingEvents(false);
    }
  }, []);

  // Load events on mount and listen to active event changes
  useEffect(() => {
    let isMounted = true;
    loadEventsList(isMounted);

    const handleFestivalChange = (e: any) => {
      if (e?.detail?.event) {
        const ev = e.detail.event;
        setFormData((prev) => ({
          ...prev,
          eventId: ev.id,
          eventName: ev.name,
          department: '-- Select --',
        }));
      }
      loadEventsList(isMounted);
    };

    window.addEventListener('festival_event_changed', handleFestivalChange);
    const unsubscribe = subscribeToVolunteerUpdates(() => {
      loadEventsList(isMounted);
    });

    return () => {
      isMounted = false;
      window.removeEventListener('festival_event_changed', handleFestivalChange);
      unsubscribe();
    };
  }, [loadEventsList]);

  // Active event object
  const currentEvent = events.find((e) => e.id === formData.eventId) || events[0];
  const activeDepartments = currentEvent?.departments && currentEvent.departments.length > 0
    ? currentEvent.departments
    : DEPARTMENTS;

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    // 1. Name
    if (!formData.name.trim()) {
      newErrors.name = 'Please enter your full name.';
    }

    // 2. Phone (Indian mobile format: 10 digits starting with 6-9, optionally with +91 or 0)
    const cleanPhone = formData.phone.replace(/[\s\-()]/g, '');
    const indianPhoneRegex = /^(?:\+91|91|0)?[6-9]\d{9}$/;
    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required.';
    } else if (!indianPhoneRegex.test(cleanPhone)) {
      newErrors.phone = 'Please enter a valid 10-digit mobile number.';
    }

    // 3. Department HOD Name (Optional)
    // No mandatory validation required

    // 4. Department (Mandatory)
    if (!formData.department || formData.department === '-- Select --') {
      newErrors.department = 'Please select your department from the list.';
    }

    // 5. Image
    if (!formData.imageUrl) {
      newErrors.imageUrl = 'Please upload your photograph.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!validate()) {
      // Scroll to the first error
      const firstErrorKey = Object.keys(errors)[0];
      const el = document.getElementById(`field-${firstErrorKey}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      const selectedDept =
        !formData.department || formData.department === '-- Select --'
          ? (activeDepartments[0] || 'General Seva')
          : formData.department.trim();

      const createdVolunteer = await registerVolunteerRecord({
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        hodName: formData.hodName ? formData.hodName.trim() : '',
        department: selectedDept,
        imageUrl: formData.imageUrl,
        eventId: formData.eventId,
        eventName: currentEvent ? currentEvent.name : formData.eventName,
      });

      onSuccess(createdVolunteer);
    } catch (err: any) {
      console.error('Registration submit error:', err);
      const errMsg =
        typeof err?.message === 'string'
          ? err.message
          : typeof err === 'string'
          ? err
          : 'An unexpected error occurred. Please try again.';
      const isDup = Boolean(
        err?.isDuplicate ||
          (typeof errMsg === 'string' &&
            (errMsg.toLowerCase().includes('already registered') ||
              errMsg.toLowerCase().includes('only 1 card is allowed')))
      );
      setErrors((prev) => ({
        ...prev,
        general: errMsg,
        isDuplicate: isDup,
        duplicateVolunteer: err?.existingVolunteer || null,
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto py-1">
      {/* Outer Card */}
      <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden transition-all">
        {/* Card Header with Blue Theme and AppLogo */}
        <div className="blue-gradient px-4 py-4 sm:px-6 sm:py-5 text-white text-center relative overflow-hidden">
          <div className="relative z-10 space-y-2 flex flex-col items-center">
            {/* Logo in form header */}
            <div className="w-12 h-12 rounded-full bg-white/95 p-1 shadow-sm flex items-center justify-center overflow-hidden">
              <AppLogo className="w-full h-full object-contain" size={38} />
            </div>

            <div>
              <div className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-white/20 text-sky-200 text-[10px] sm:text-xs font-bold uppercase tracking-wider">
                {currentEvent ? `${currentEvent.name} ${currentEvent.year || ''}` : 'Janmashtami 2026'}
              </div>

              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-serif-cultural mt-1">
                Volunteer Registration
              </h1>

              <p className="text-[11px] sm:text-xs text-blue-100 leading-tight mt-0.5">
                International Society for Krishna Consciousness
              </p>
            </div>
          </div>
          <div className="absolute bottom-0 inset-x-0 h-1 bg-gradient-to-r from-blue-300 via-sky-200 to-amber-300" />
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} noValidate className="p-4 sm:p-6 space-y-3.5 sm:space-y-4 bg-white">
          {errors.general && (
            <div className={`p-4 rounded-xl border text-xs animate-in fade-in shadow-xs ${
              errors.isDuplicate 
                ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                : 'bg-red-50/90 border-red-200 text-red-950'
            }`}>
              <div className="flex items-start gap-2.5">
                <AlertCircle className={`w-5 h-5 shrink-0 mt-0.5 ${errors.isDuplicate ? 'text-amber-700' : 'text-red-600'}`} />
                <div className="space-y-1 flex-1">
                  <p className={`font-bold text-xs ${errors.isDuplicate ? 'text-amber-900' : 'text-red-900'}`}>
                    {errors.isDuplicate ? 'Already Registered (Ek Mobile = Ek Card)' : 'Registration Notice'}
                  </p>
                  <p className="text-[12px] leading-relaxed font-medium">
                    {errors.general}
                  </p>

                  {/* If user already has a card generated, let them view it directly! */}
                  {errors.isDuplicate && errors.duplicateVolunteer && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => onSuccess(errors.duplicateVolunteer!)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#1E40AF] text-white font-bold text-xs hover:bg-blue-800 transition-colors shadow-xs cursor-pointer"
                      >
                        <IdCard className="w-3.5 h-3.5" />
                        <span>View My Existing Volunteer Card</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Festival / Event Selector (Shows when there are multiple active events or to allow switching) */}
          {events.length > 1 && (
            <div id="field-eventId" className="space-y-1">
              <label htmlFor="volunteer-festival-event" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Festival / Event <span className="text-[#1E40AF]">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Calendar className="w-4 h-4" />
                </div>
                <select
                  id="volunteer-festival-event"
                  name="eventId"
                  value={formData.eventId}
                  onChange={(e) => {
                    const selId = e.target.value;
                    const selEvent = events.find((ev) => ev.id === selId);
                    setFormData({
                      ...formData,
                      eventId: selId,
                      eventName: selEvent ? selEvent.name : formData.eventName,
                      department: '-- Select --', // Reset dept on festival switch
                    });
                  }}
                  className="w-full pl-9 pr-8 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-200 text-sm text-slate-800 bg-slate-50/50 outline-none transition-all appearance-none cursor-pointer"
                >
                  {events
                    .filter((ev) => ev.isActive !== false)
                    .map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.name} {ev.year ? `(${ev.year})` : ''}
                      </option>
                    ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* 1. Name */}
          <div id="field-name" className="space-y-1">
            <label htmlFor="volunteer-name" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Name <span className="text-[#1E40AF]">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                id="volunteer-name"
                name="name"
                type="text"
                required
                placeholder="Enter full name"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (errors.name) setErrors({ ...errors, name: undefined });
                }}
                className={`w-full pl-9 pr-3 py-2 rounded-lg border text-sm text-slate-800 bg-slate-50/50 placeholder:text-slate-400 outline-none transition-all ${
                  errors.name
                    ? 'border-red-400 bg-red-50/20 focus:ring-2 focus:ring-red-100'
                    : 'border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-200'
                }`}
              />
            </div>
            {errors.name && <p className="text-[11px] font-medium text-red-600 mt-0.5">{errors.name}</p>}
          </div>

          {/* 2. Phone */}
          <div id="field-phone" className="space-y-1">
            <label htmlFor="volunteer-phone" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Phone <span className="text-[#1E40AF]">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Phone className="w-4 h-4" />
              </div>
              <input
                id="volunteer-phone"
                name="phone"
                type="tel"
                required
                maxLength={14}
                placeholder="Enter 10-digit mobile number"
                value={formData.phone}
                onChange={(e) => {
                  setFormData({ ...formData, phone: e.target.value });
                  if (errors.phone) setErrors({ ...errors, phone: undefined });
                }}
                className={`w-full pl-9 pr-3 py-2 rounded-lg border text-sm text-slate-800 bg-slate-50/50 placeholder:text-slate-400 outline-none transition-all ${
                  errors.phone
                    ? 'border-red-400 bg-red-50/20 focus:ring-2 focus:ring-red-100'
                    : 'border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-200'
                }`}
              />
            </div>
            {errors.phone && <p className="text-[11px] font-medium text-red-600 mt-0.5">{errors.phone}</p>}
          </div>

          {/* 3. Department HOD Name (Optional) */}
          <div id="field-hodName" className="space-y-1">
            <label htmlFor="volunteer-hod-name" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Department HOD Name <span className="text-slate-400 font-normal normal-case">(Optional)</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <UserCheck className="w-4 h-4" />
              </div>
              <input
                id="volunteer-hod-name"
                name="hodName"
                type="text"
                placeholder="Enter HOD name"
                value={formData.hodName}
                onChange={(e) => {
                  setFormData({ ...formData, hodName: e.target.value });
                  if (errors.hodName) setErrors({ ...errors, hodName: undefined });
                }}
                className={`w-full pl-9 pr-3 py-2 rounded-lg border text-sm text-slate-800 bg-slate-50/50 placeholder:text-slate-400 outline-none transition-all ${
                  errors.hodName
                    ? 'border-red-400 bg-red-50/20 focus:ring-2 focus:ring-red-100'
                    : 'border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-200'
                }`}
              />
            </div>
            {errors.hodName && <p className="text-[11px] font-medium text-red-600 mt-0.5">{errors.hodName}</p>}
          </div>

          {/* 4. Department (Mandatory) */}
          <div id="field-department" className="space-y-1">
            <label htmlFor="volunteer-department" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Select Department <span className="text-[#1E40AF]">*</span>
            </label>
            <div className="relative">
              <select
                id="volunteer-department"
                name="department"
                required
                value={formData.department}
                onChange={(e) => {
                  setFormData({ ...formData, department: e.target.value });
                  if (errors.department) setErrors({ ...errors, department: undefined });
                }}
                className={`w-full px-3 py-2 rounded-lg border text-sm text-slate-800 bg-slate-50/50 outline-none transition-all appearance-none cursor-pointer ${
                  errors.department
                    ? 'border-red-400 bg-red-50/20 focus:ring-2 focus:ring-red-100'
                    : 'border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-200'
                }`}
              >
                <option value="-- Select --">-- Select Department --</option>
                {activeDepartments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                  <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                </svg>
              </div>
            </div>
            {errors.department && <p className="text-[11px] font-medium text-red-600 mt-0.5">{errors.department}</p>}
          </div>

          {/* 6. Volunteer Image */}
          <div id="field-imageUrl">
            <ImageUploader
              currentImage={formData.imageUrl}
              onImageSelected={(dataUrl) => {
                setFormData({ ...formData, imageUrl: dataUrl });
                if (errors.imageUrl) setErrors({ ...errors, imageUrl: undefined });
              }}
              error={errors.imageUrl}
            />
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              id="submit-registration-btn"
              disabled={isSubmitting}
              className={`w-full py-2.5 sm:py-3 px-4 rounded-xl blue-gradient text-white font-bold text-xs sm:text-sm tracking-wide shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer hover:opacity-95 ${
                isSubmitting ? 'opacity-75 cursor-not-allowed' : 'active:scale-[0.99]'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <span>Register as Volunteer</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
