import React, { useState } from 'react';
import {
  X,
  Calendar,
  Plus,
  Trash2,
  Edit2,
  Check,
  AlertCircle,
  Loader2,
  Tag,
  Star,
  Settings2,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';
import { FestivalEvent } from '../types';
import {
  createFestivalEvent,
  updateFestivalEvent,
  deleteFestivalEvent,
  addDepartmentToEvent,
  removeDepartmentFromEvent,
} from '../lib/storage';

interface FestivalEventManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: FestivalEvent[];
  onEventsUpdated: () => void;
  selectedEventId: string;
  onSelectEvent: (id: string) => void;
}

export default function FestivalEventManagerModal({
  isOpen,
  onClose,
  events,
  onEventsUpdated,
  selectedEventId,
  onSelectEvent,
}: FestivalEventManagerModalProps) {
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  // New Event Form State
  const [newName, setNewName] = useState('');
  const [newYear, setNewYear] = useState(new Date().getFullYear().toString());
  const [newDate, setNewDate] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDepartmentsInput, setNewDepartmentsInput] = useState(
    'Arti Seva, Prasadam, Kitchen, Security, Crowd Management, Decoration, Media, Stage'
  );
  const [newIsDefault, setNewIsDefault] = useState(false);

  // Edit Event Form State
  const [editName, setEditName] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIsDefault, setEditIsDefault] = useState(false);
  const [editIsActive, setEditIsActive] = useState(true);

  // Quick department add state
  const [quickDeptInput, setQuickDeptInput] = useState<{ [eventId: string]: string }>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartEdit = (event: FestivalEvent) => {
    setEditingEventId(event.id);
    setEditName(event.name);
    setEditYear(event.year || '');
    setEditDate(event.date || '');
    setEditDescription(event.description || '');
    setEditIsDefault(Boolean(event.isDefault));
    setEditIsActive(event.isActive !== false);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleCancelEdit = () => {
    setEditingEventId(null);
    setErrorMsg(null);
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setErrorMsg('Festival / Event name is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const deptList = newDepartmentsInput
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean);

      const created = await createFestivalEvent({
        name: newName.trim(),
        year: newYear.trim(),
        date: newDate.trim(),
        description: newDescription.trim(),
        departments: deptList.length > 0 ? deptList : ['General Seva'],
        isDefault: newIsDefault,
        isActive: true,
      });

      setSuccessMsg(`Festival event "${created.name}" created successfully!`);
      setNewName('');
      setNewDate('');
      setNewDescription('');
      setNewIsDefault(false);
      setActiveTab('list');
      onEventsUpdated();
      onSelectEvent(created.id);
    } catch (err: any) {
      console.error('Error creating festival event:', err);
      setErrorMsg(err?.message || 'Failed to create festival event');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = async (eventId: string) => {
    if (!editName.trim()) {
      setErrorMsg('Event name cannot be empty');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      await updateFestivalEvent(eventId, {
        name: editName.trim(),
        year: editYear.trim(),
        date: editDate.trim(),
        description: editDescription.trim(),
        isDefault: editIsDefault,
        isActive: editIsActive,
      });

      setSuccessMsg('Festival details updated successfully!');
      setEditingEventId(null);
      onEventsUpdated();
    } catch (err: any) {
      console.error('Error updating event:', err);
      setErrorMsg(err?.message || 'Failed to update festival event');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEvent = async (event: FestivalEvent) => {
    if (event.id === 'janmashtami-2026' || events.length <= 1) {
      alert('The primary default festival event cannot be deleted.');
      return;
    }

    const confirm = window.confirm(
      `Are you sure you want to delete "${event.name}"? Existing volunteer cards linked to this event will remain in the database.`
    );
    if (!confirm) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      await deleteFestivalEvent(event.id);
      setSuccessMsg(`Festival "${event.name}" was removed.`);
      if (selectedEventId === event.id) {
        onSelectEvent('ALL');
      }
      onEventsUpdated();
    } catch (err: any) {
      console.error('Error deleting festival event:', err);
      setErrorMsg(err?.message || 'Failed to delete festival event');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddDept = async (eventId: string) => {
    const val = (quickDeptInput[eventId] || '').trim();
    if (!val) return;

    try {
      await addDepartmentToEvent(eventId, val);
      setQuickDeptInput((prev) => ({ ...prev, [eventId]: '' }));
      onEventsUpdated();
    } catch (err: any) {
      console.error('Error adding department:', err);
      setErrorMsg(err?.message || 'Failed to add department');
    }
  };

  const handleRemoveDept = async (eventId: string, dept: string) => {
    try {
      await removeDepartmentFromEvent(eventId, dept);
      onEventsUpdated();
    } catch (err: any) {
      console.error('Error removing department:', err);
      setErrorMsg(err?.message || 'Failed to remove department');
    }
  };

  return (
    <div
      id="festival-manager-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
    >
      <div
        id="festival-manager-modal-card"
        className="bg-white rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-blue-200 overflow-hidden space-y-4 my-auto animate-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#1E40AF]">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 font-serif-cultural leading-tight">
                Temple Festival & Department Manager
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure festivals, seva departments, active years and defaults
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'list'
                ? 'bg-white text-[#1E40AF] shadow-xs border border-blue-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Active Festivals ({events.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'create'
                ? 'bg-white text-[#1E40AF] shadow-xs border border-blue-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New Festival</span>
          </button>
        </div>

        {/* Status Messages */}
        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Tab 1: List & Manage Festivals */}
        {activeTab === 'list' && (
          <div className="overflow-y-auto flex-1 space-y-3.5 pr-1">
            {events.map((event) => {
              const isEditing = editingEventId === event.id;
              const isSelected = selectedEventId === event.id;

              return (
                <div
                  key={event.id}
                  className={`rounded-2xl border p-4 transition-all ${
                    isSelected
                      ? 'border-[#1E40AF] bg-blue-50/40 ring-1 ring-blue-200'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  {isEditing ? (
                    // Inline Edit Form
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 uppercase">
                            Festival Name *
                          </label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 focus:border-blue-500 outline-none"
                            placeholder="e.g. Sri Krishna Janmashtami"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 uppercase">
                            Year
                          </label>
                          <input
                            type="text"
                            value={editYear}
                            onChange={(e) => setEditYear(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 focus:border-blue-500 outline-none"
                            placeholder="2026"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 uppercase">
                            Date / Schedule
                          </label>
                          <input
                            type="text"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:border-blue-500 outline-none"
                            placeholder="e.g. 4-5 September 2026"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 uppercase">
                            Description
                          </label>
                          <input
                            type="text"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:border-blue-500 outline-none"
                            placeholder="Festival seva description"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-4 pt-1">
                        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editIsDefault}
                            onChange={(e) => setEditIsDefault(e.target.checked)}
                            className="rounded text-[#1E40AF]"
                          />
                          <span>Set as Default Festival</span>
                        </label>

                        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editIsActive}
                            onChange={(e) => setEditIsActive(e.target.checked)}
                            className="rounded text-[#1E40AF]"
                          />
                          <span>Active for Registration</span>
                        </label>
                      </div>

                      <div className="flex items-center gap-2 justify-end pt-2 border-t border-slate-200">
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(event.id)}
                          disabled={isSubmitting}
                          className="px-4 py-1.5 rounded-lg text-xs font-bold bg-[#1E40AF] hover:bg-blue-800 text-white flex items-center gap-1"
                        >
                          {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          <span>Save Changes</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Display Mode
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-slate-900 font-serif-cultural">
                              {event.name} {event.year ? `(${event.year})` : ''}
                            </h4>
                            {event.isDefault && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-extrabold">
                                <Star className="w-2.5 h-2.5 fill-amber-600 text-amber-600" />
                                <span>Default</span>
                              </span>
                            )}
                            {event.isActive === false ? (
                              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                                Inactive
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                Active
                              </span>
                            )}
                          </div>
                          {event.date && (
                            <p className="text-xs text-slate-500 mt-0.5 font-medium">
                              📅 Date: {event.date}
                            </p>
                          )}
                          {event.description && (
                            <p className="text-xs text-slate-600 mt-0.5">{event.description}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectEvent(event.id);
                              onClose();
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 hover:bg-blue-100 text-[#1E40AF] border border-blue-200 transition-colors"
                          >
                            Filter Table
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(event)}
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                            title="Edit festival details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {event.id !== 'janmashtami-2026' && (
                            <button
                              type="button"
                              onClick={() => handleDeleteEvent(event)}
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                              title="Delete festival"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Departments Management */}
                      <div className="pt-2 border-t border-slate-100 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                            <Tag className="w-3 h-3 text-[#1E40AF]" />
                            <span>Departments ({event.departments?.length || 0})</span>
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {event.departments?.map((dept) => (
                            <span
                              key={dept}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-800 text-xs font-medium border border-slate-200"
                            >
                              <span>{dept}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveDept(event.id, dept)}
                                className="text-slate-400 hover:text-rose-600 transition-colors"
                                title={`Remove ${dept}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>

                        {/* Add Quick Department */}
                        <div className="flex items-center gap-1.5 pt-1">
                          <input
                            type="text"
                            placeholder="Add department (e.g. VIP Seva, Security)..."
                            value={quickDeptInput[event.id] || ''}
                            onChange={(e) =>
                              setQuickDeptInput({ ...quickDeptInput, [event.id]: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddDept(event.id);
                              }
                            }}
                            className="flex-1 px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-800 focus:border-blue-500 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddDept(event.id)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2: Create New Festival */}
        {activeTab === 'create' && (
          <form onSubmit={handleCreateEvent} className="overflow-y-auto flex-1 space-y-3.5 pr-1">
            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-start gap-2.5 text-xs text-blue-900">
              <Info className="w-4 h-4 text-[#1E40AF] shrink-0 mt-0.5" />
              <span>
                Create a new festival/event (e.g. Radhashtami, Gaura Purnima, Ratha Yatra, Kartik Deepotsava).
                Once created, volunteers can register under this festival, with festival-branded ID cards generated dynamically.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-bold text-slate-700">
                  Festival / Event Name *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Sri Radhashtami Mahotsav"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 focus:border-[#1E40AF] focus:ring-1 focus:ring-blue-100 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Festival Year
                </label>
                <input
                  type="text"
                  value={newYear}
                  onChange={(e) => setNewYear(e.target.value)}
                  placeholder="2026"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 focus:border-[#1E40AF] focus:ring-1 focus:ring-blue-100 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Festival Date / Period
                </label>
                <input
                  type="text"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  placeholder="e.g. 19 September 2026"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-[#1E40AF] focus:ring-1 focus:ring-blue-100 outline-none"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-bold text-slate-700">
                  Description / Subtitle
                </label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Annual Sri Radhashtami Seva Celebration"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-[#1E40AF] focus:ring-1 focus:ring-blue-100 outline-none"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-bold text-slate-700">
                  Departments (Comma separated)
                </label>
                <textarea
                  rows={3}
                  value={newDepartmentsInput}
                  onChange={(e) => setNewDepartmentsInput(e.target.value)}
                  placeholder="Arti Seva, Prasadam, Kitchen, Security, Crowd Management, Decoration, Media, Stage, Sound, Book Distribution"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-[#1E40AF] focus:ring-1 focus:ring-blue-100 outline-none"
                />
                <p className="text-[11px] text-slate-400">
                  Enter departments separated by commas. You can add or remove individual departments later.
                </p>
              </div>

              <div className="sm:col-span-2 pt-1">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIsDefault}
                    onChange={(e) => setNewIsDefault(e.target.checked)}
                    className="rounded text-[#1E40AF]"
                  />
                  <span>Set as default selected festival for new registrations</span>
                </label>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl blue-gradient text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>Create Festival Event</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
