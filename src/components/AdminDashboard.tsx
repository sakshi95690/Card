import { useState, useEffect, useCallback, useMemo } from 'react';
import { toPng } from 'html-to-image';
import JSZip from 'jszip';
import {
  Download,
  Eye,
  CheckSquare,
  Square,
  Loader2,
  Users,
  LogOut,
  CheckCircle2,
  RefreshCw,
  Phone,
  UserCheck,
  Search,
  Hash,
  Clock,
  ShieldCheck,
  Filter,
  Building2,
  AlertCircle,
  Ban,
  ShieldAlert,
  RotateCcw,
  UserX,
  FileSpreadsheet,
  Pencil,
  Trash2,
} from 'lucide-react';
import { DEPARTMENTS, Volunteer } from '../types';
import {
  fetchAllVolunteers,
  subscribeToVolunteerUpdates,
  deactivateVolunteerCard,
  updateVolunteerStatus,
  deleteVolunteerPermanently,
  bulkDeleteVolunteersPermanently,
} from '../lib/storage';
import VolunteerCard from './VolunteerCard';
import EditVolunteerModal from './EditVolunteerModal';
import DeleteConfirmModal from './DeleteConfirmModal';
import ExportModal from './ExportModal';
import { AppLogo } from './AppLogo';

interface AdminDashboardProps {
  onBackToRegistration: () => void;
}

export default function AdminDashboard({ onBackToRegistration }: AdminDashboardProps) {
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewVolunteer, setPreviewVolunteer] = useState<Volunteer | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'DEACTIVATED' | 'ALL'>('ALL');

  // Edit volunteer modal state
  const [editingVolunteer, setEditingVolunteer] = useState<Volunteer | null>(null);

  // Permanent Deletion modal state
  const [deletingVolunteers, setDeletingVolunteers] = useState<Volunteer[]>([]);
  const [isDeletingPermanently, setIsDeletingPermanently] = useState(false);

  // Deactivation confirmation modal state
  const [deactivatingVolunteer, setDeactivatingVolunteer] = useState<Volunteer | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  // Export Data modal state
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Generic action notification
  const [actionNotification, setActionNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Bulk Image Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setActionNotification({ type, message });
    setTimeout(() => {
      setActionNotification((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  // Load volunteers list from server
  const loadData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      const list = await fetchAllVolunteers();
      setVolunteers(list);
      setFetchError(null);
    } catch (err: any) {
      console.error('Failed to load volunteers:', err);
      setFetchError(err?.message || 'Failed to connect to central database server');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial load + Real-time synchronization
  useEffect(() => {
    loadData();

    // Subscribe to cross-tab and backend update broadcasts (auto-sync every 3s)
    const unsubscribe = subscribeToVolunteerUpdates(() => {
      loadData();
    });

    return () => {
      unsubscribe();
    };
  }, [loadData]);

  // Compute status counts
  const activeCount = useMemo(() => {
    return volunteers.filter((v) => v.status !== 'Deactivated').length;
  }, [volunteers]);

  const deactivatedCount = useMemo(() => {
    return volunteers.filter((v) => v.status === 'Deactivated').length;
  }, [volunteers]);

  const totalCount = volunteers.length;

  // Filtered volunteers based on status, department and search query
  const filteredVolunteers = useMemo(() => {
    return volunteers.filter((v) => {
      // Status filter
      if (statusFilter === 'ACTIVE' && v.status === 'Deactivated') {
        return false;
      }
      if (statusFilter === 'DEACTIVATED' && v.status !== 'Deactivated') {
        return false;
      }

      // Department filter
      if (selectedDepartment !== 'ALL' && v.department !== selectedDepartment) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesQuery =
          String(v?.name || '').toLowerCase().includes(q) ||
          String(v?.id || '').toLowerCase().includes(q) ||
          String(v?.phone || '').includes(q) ||
          String(v?.hodName || '').toLowerCase().includes(q) ||
          String(v?.department || '').toLowerCase().includes(q);
        if (!matchesQuery) return false;
      }

      return true;
    });
  }, [volunteers, statusFilter, selectedDepartment, searchQuery]);

  // Compute counts per department for filter badges (respecting status filter)
  const departmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const relevantList =
      statusFilter === 'ACTIVE'
        ? volunteers.filter((v) => v.status !== 'Deactivated')
        : statusFilter === 'DEACTIVATED'
        ? volunteers.filter((v) => v.status === 'Deactivated')
        : volunteers;

    relevantList.forEach((v) => {
      counts[v.department] = (counts[v.department] || 0) + 1;
    });
    return counts;
  }, [volunteers, statusFilter]);

  // Select all or deselect all
  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredVolunteers.length && filteredVolunteers.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredVolunteers.map((v) => v.id));
    }
  };

  // Toggle single volunteer selection
  const handleToggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Handle Edit Save Success
  const handleSaveEditSuccess = (updated: Volunteer) => {
    setVolunteers((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    if (previewVolunteer?.id === updated.id) {
      setPreviewVolunteer(updated);
    }
    setEditingVolunteer(null);
    showNotification(`Volunteer card for ${updated.name} (${updated.id}) updated successfully.`);
  };

  // Open single volunteer permanent delete modal
  const handleOpenSingleDeleteModal = (vol: Volunteer) => {
    setDeletingVolunteers([vol]);
  };

  // Open bulk permanent delete modal
  const handleOpenBulkDeleteModal = () => {
    const selectedList = volunteers.filter((v) => selectedIds.includes(v.id));
    if (selectedList.length === 0) return;
    setDeletingVolunteers(selectedList);
  };

  // Execute Permanent Delete (Single or Bulk)
  const handleConfirmPermanentDelete = async () => {
    if (deletingVolunteers.length === 0) return;

    try {
      setIsDeletingPermanently(true);

      if (deletingVolunteers.length === 1) {
        const target = deletingVolunteers[0];
        const success = await deleteVolunteerPermanently(target.id);
        if (success) {
          setVolunteers((prev) => prev.filter((v) => v.id !== target.id));
          setSelectedIds((prev) => prev.filter((id) => id !== target.id));
          if (previewVolunteer?.id === target.id) {
            setPreviewVolunteer(null);
          }
          if (editingVolunteer?.id === target.id) {
            setEditingVolunteer(null);
          }
          showNotification(`Card for ${target.name} (${target.id}) permanently deleted from storage.`);
        } else {
          showNotification('Failed to permanently delete volunteer card. Check network and retry.', 'error');
        }
      } else {
        const targetIds = deletingVolunteers.map((v) => v.id);
        const result = await bulkDeleteVolunteersPermanently(targetIds);
        if (result.success) {
          setVolunteers((prev) => prev.filter((v) => !targetIds.includes(v.id)));
          setSelectedIds([]);
          if (previewVolunteer && targetIds.includes(previewVolunteer.id)) {
            setPreviewVolunteer(null);
          }
          if (editingVolunteer && targetIds.includes(editingVolunteer.id)) {
            setEditingVolunteer(null);
          }
          showNotification(`Successfully deleted ${result.deletedCount} cards permanently from storage.`);
        } else {
          showNotification(result.message || 'Failed to delete selected cards.', 'error');
        }
      }
    } catch (err: any) {
      console.error('Error during permanent delete:', err);
      showNotification(err?.message || 'Error occurred while permanently deleting card(s).', 'error');
    } finally {
      setIsDeletingPermanently(false);
      setDeletingVolunteers([]);
    }
  };

  // Handle Deactivate Action
  const handleOpenDeactivateModal = (vol: Volunteer) => {
    setDeactivatingVolunteer(vol);
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivatingVolunteer) return;
    try {
      setIsDeactivating(true);
      const success = await deactivateVolunteerCard(deactivatingVolunteer.id);
      if (success) {
        setVolunteers((prev) =>
          prev.map((v) =>
            v.id === deactivatingVolunteer.id ? { ...v, status: 'Deactivated' } : v
          )
        );
        showNotification(
          `Volunteer card for ${deactivatingVolunteer.name} (${deactivatingVolunteer.id}) was deactivated.`
        );

        if (previewVolunteer?.id === deactivatingVolunteer.id) {
          setPreviewVolunteer((prev) => (prev ? { ...prev, status: 'Deactivated' } : null));
        }
      } else {
        showNotification('Failed to deactivate volunteer card. Please check connection.', 'error');
      }
    } catch (err) {
      console.error('Error deactivating card:', err);
      showNotification('Error occurred while deactivating volunteer card.', 'error');
    } finally {
      setIsDeactivating(false);
      setDeactivatingVolunteer(null);
    }
  };

  // Handle Reactivate Action
  const handleReactivateCard = async (vol: Volunteer) => {
    try {
      const success = await updateVolunteerStatus(vol.id, 'Active');
      if (success) {
        setVolunteers((prev) =>
          prev.map((v) => (v.id === vol.id ? { ...v, status: 'Active' } : v))
        );
        showNotification(`Volunteer card for ${vol.name} (${vol.id}) is now Active.`);

        if (previewVolunteer?.id === vol.id) {
          setPreviewVolunteer((prev) => (prev ? { ...prev, status: 'Active' } : null));
        }
      }
    } catch (err) {
      console.error('Error reactivating card:', err);
      showNotification('Failed to reactivate card.', 'error');
    }
  };

  // Open Export Data Modal with current selection/filter
  const handleOpenExportModal = () => {
    setIsExportModalOpen(true);
  };

  // Quick select all active
  const handleSelectAllActive = () => {
    const activeIds = volunteers.filter((v) => v.status !== 'Deactivated').map((v) => v.id);
    setSelectedIds(activeIds);
    showNotification(`Selected all ${activeIds.length} active volunteer cards.`);
  };

  // Quick select all in entire directory
  const handleSelectAllTotal = () => {
    const allIds = volunteers.map((v) => v.id);
    setSelectedIds(allIds);
    showNotification(`Selected all ${allIds.length} volunteer cards.`);
  };

  const isAllSelected =
    selectedIds.length === filteredVolunteers.length && filteredVolunteers.length > 0;
  const isAnySelected = selectedIds.length > 0;

  return (
    <div className="w-full space-y-2.5 max-w-4xl mx-auto">
      {/* Top Controls & Action Bar */}
      <div className="bg-white border border-blue-100 rounded-2xl p-3 sm:p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Title & Stats */}
          <div className="flex items-center justify-between sm:justify-start gap-2.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#1E40AF] shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 font-serif-cultural leading-tight">
                  Volunteer Cards Directory
                </h2>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] font-semibold text-slate-600">
                  <span className="text-[#1E40AF] font-bold">{activeCount} Active</span>
                  <span className="text-slate-300">•</span>
                  <span className="text-rose-600 font-bold">{deactivatedCount} Deactivated</span>
                  <span className="text-slate-300">•</span>
                  <span>{totalCount} Total</span>
                </div>
              </div>
            </div>

            {/* Quick Actions for Mobile */}
            <div className="flex sm:hidden items-center gap-1.5">
              <button
                type="button"
                id="refresh-volunteers-btn-mobile"
                onClick={() => loadData(true)}
                disabled={isRefreshing}
                title="Refresh list"
                className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold transition-all flex items-center justify-center cursor-pointer disabled:opacity-50 min-h-[34px] min-w-[34px]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#1E40AF]' : ''}`} />
              </button>
              <button
                type="button"
                id="admin-logout-btn-mobile"
                onClick={onBackToRegistration}
                className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1E40AF] border border-blue-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer min-h-[34px]"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span>Exit</span>
              </button>
            </div>
          </div>

          {/* Desktop Actions & Export */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Delete Selected (Bulk Action) */}
            {isAnySelected && (
              <button
                type="button"
                id="bulk-delete-permanently-btn"
                onClick={handleOpenBulkDeleteModal}
                title="Permanently delete selected cards from storage"
                className="w-full sm:w-auto py-2 px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[36px] animate-in fade-in"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>Delete Selected ({selectedIds.length})</span>
              </button>
            )}

            {/* Comprehensive Export Data Button (CSV, ZIP, JSON, Print) */}
            <button
              type="button"
              id="open-export-modal-btn"
              onClick={handleOpenExportModal}
              disabled={volunteers.length === 0}
              title="Export all data, spreadsheet, or card images"
              className="w-full sm:w-auto py-2 px-4 rounded-xl blue-gradient hover:opacity-95 text-white font-bold text-xs sm:text-sm shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 min-h-[36px]"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>
                {isAnySelected
                  ? `Export Selected (${selectedIds.length}) Data / Cards`
                  : `Export All Data (${volunteers.length})`}
              </span>
            </button>

            {/* Direct CSV Download */}
            <a
              href="/api/volunteers/export/csv"
              download
              title="Direct instant CSV spreadsheet download"
              className="hidden md:inline-flex py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition-all items-center gap-1.5 cursor-pointer shadow-xs min-h-[36px]"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
              <span>CSV Spreadsheet</span>
            </a>

            <button
              type="button"
              id="refresh-volunteers-btn"
              onClick={() => loadData(true)}
              disabled={isRefreshing}
              title="Refresh list"
              className="hidden sm:flex p-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold transition-all items-center gap-1 cursor-pointer disabled:opacity-50 min-h-[36px]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#1E40AF]' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              id="admin-logout-btn"
              onClick={onBackToRegistration}
              className="hidden sm:flex px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1E40AF] border border-blue-200 text-xs font-bold transition-all items-center gap-1.5 cursor-pointer shadow-2xs min-h-[36px]"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span>Exit</span>
            </button>
          </div>
        </div>

        {/* Status Filters: Active / Deactivated / All */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/80">
            <button
              type="button"
              id="filter-status-active-btn"
              onClick={() => {
                setStatusFilter('ACTIVE');
                setSelectedIds([]);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'ACTIVE'
                  ? 'bg-white text-[#1E40AF] shadow-xs border border-blue-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Active ({activeCount})</span>
            </button>

            <button
              type="button"
              id="filter-status-deactivated-btn"
              onClick={() => {
                setStatusFilter('DEACTIVATED');
                setSelectedIds([]);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'DEACTIVATED'
                  ? 'bg-white text-rose-700 shadow-xs border border-rose-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <span>Deactivated ({deactivatedCount})</span>
            </button>

            <button
              type="button"
              id="filter-status-all-btn"
              onClick={() => {
                setStatusFilter('ALL');
                setSelectedIds([]);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>All ({totalCount})</span>
            </button>
          </div>

          <span className="text-[11px] text-slate-500 hidden sm:inline font-medium">
            Filter: <strong>{statusFilter}</strong> cards
          </span>
        </div>

        {/* Search & Department Filter Bar */}
        {volunteers.length > 0 && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              {/* Search Input */}
              <div className="relative sm:col-span-7">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-3.5 h-3.5" />
                </div>
                <input
                  id="admin-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, phone, or HOD..."
                  className="w-full pl-8 pr-4 py-2 rounded-xl bg-slate-50 sm:bg-white border border-slate-200 sm:border-blue-100 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-400 hover:text-slate-600 font-semibold cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Department Dropdown Filter */}
              <div className="relative sm:col-span-5">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#1E40AF]">
                  <Filter className="w-3.5 h-3.5" />
                </div>
                <select
                  id="admin-department-filter"
                  value={selectedDepartment}
                  onChange={(e) => {
                    setSelectedDepartment(e.target.value);
                    setSelectedIds([]);
                  }}
                  className="w-full pl-8 pr-7 py-2 rounded-xl bg-slate-50 sm:bg-white border border-slate-200 sm:border-blue-100 text-xs text-slate-800 font-medium focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 outline-none transition-all cursor-pointer appearance-none"
                >
                  <option value="ALL">All Departments</option>
                  {DEPARTMENTS.map((dept) => {
                    const count = departmentCounts[dept] || 0;
                    return (
                      <option key={dept} value={dept}>
                        {dept} {count > 0 ? `(${count})` : '(0)'}
                      </option>
                    );
                  })}
                </select>
                <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-slate-400">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Active Filter Pill */}
            {selectedDepartment !== 'ALL' && (
              <div className="flex items-center justify-between px-0.5 text-xs">
                <span className="inline-flex items-center gap-1 font-semibold text-blue-900 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 text-[11px]">
                  <Building2 className="w-3 h-3 text-[#1E40AF]" />
                  <span>Filtered: <strong>{selectedDepartment}</strong> ({filteredVolunteers.length})</span>
                </span>
                <button
                  type="button"
                  id="clear-dept-filter-btn"
                  onClick={() => setSelectedDepartment('ALL')}
                  className="text-[11px] text-[#1E40AF] hover:underline font-bold cursor-pointer"
                >
                  Show All Departments
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Notification */}
      {actionNotification && (
        <div
          className={`p-3 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 animate-in fade-in shadow-2xs border ${
            actionNotification.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionNotification.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span>{actionNotification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionNotification(null)}
            className="text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Export Success Notification */}
      {exportSuccessMsg && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in shadow-2xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{exportSuccessMsg}</span>
        </div>
      )}

      {/* Selection Toolbar & Quick Filters */}
      {volunteers.length > 0 && (
        <div className="flex items-center justify-between px-1 gap-2 flex-wrap bg-blue-50/50 p-2 rounded-xl border border-blue-100">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              id="select-all-btn"
              onClick={handleToggleSelectAll}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs min-h-[34px]"
            >
              {isAllSelected ? (
                <>
                  <CheckSquare className="w-3.5 h-3.5 text-[#1E40AF] shrink-0" />
                  <span>Deselect All</span>
                </>
              ) : (
                <>
                  <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Select Filtered ({filteredVolunteers.length})</span>
                </>
              )}
            </button>

            {volunteers.length > filteredVolunteers.length && (
              <button
                type="button"
                id="select-all-total-btn"
                onClick={handleSelectAllTotal}
                className="px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-[#1E40AF] font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer min-h-[34px]"
              >
                <span>Select All ({volunteers.length})</span>
              </button>
            )}

            {activeCount > 0 && selectedIds.length !== activeCount && (
              <button
                type="button"
                id="select-all-active-btn"
                onClick={handleSelectAllActive}
                className="hidden sm:inline-flex px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs items-center gap-1 transition-colors cursor-pointer min-h-[34px]"
              >
                <span>Select Active ({activeCount})</span>
              </button>
            )}

            {isAnySelected && (
              <button
                type="button"
                id="selection-bulk-delete-btn"
                onClick={handleOpenBulkDeleteModal}
                className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs min-h-[34px]"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Delete ({selectedIds.length})</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
            {isAnySelected ? (
              <span className="text-[#1E40AF] font-bold bg-white px-2 py-0.5 rounded-md border border-blue-200">
                {selectedIds.length} Selected
              </span>
            ) : (
              <span>Showing {filteredVolunteers.length} of {volunteers.length}</span>
            )}
          </div>
        </div>
      )}

      {/* Cards List - Fully Mobile Friendly & Clean Blue/White */}
      <div className="bg-white border border-blue-100 rounded-2xl shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="py-14 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-[#1E40AF]" />
            <span>Loading volunteer cards from central database...</span>
          </div>
        ) : fetchError ? (
          <div className="py-12 text-center space-y-3 px-4">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Unable to load volunteers from server</p>
              <p className="text-xs text-red-500 mt-1 max-w-sm mx-auto">{fetchError}</p>
            </div>
            <button
              type="button"
              onClick={() => loadData(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1E40AF] text-white font-bold text-xs hover:bg-blue-800 transition-colors shadow-xs cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Connection</span>
            </button>
          </div>
        ) : filteredVolunteers.length === 0 ? (
          <div className="py-14 text-center space-y-2 px-4">
            <Users className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">
              {searchQuery || selectedDepartment !== 'ALL' || statusFilter !== 'ALL'
                ? `No ${statusFilter === 'DEACTIVATED' ? 'deactivated' : statusFilter === 'ACTIVE' ? 'active' : ''} volunteers found`
                : 'No Volunteer Cards Registered Yet'}
            </p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {selectedDepartment !== 'ALL'
                ? `No volunteers registered in "${selectedDepartment}".`
                : searchQuery
                ? 'Try searching with a different name, department, or phone number.'
                : statusFilter === 'DEACTIVATED'
                ? 'There are currently no deactivated volunteer cards.'
                : 'Jab bhi koi volunteer kisi bhi device se form bharega, uska card yahan automatically instant reflect hoga.'}
            </p>
            {(selectedDepartment !== 'ALL' || searchQuery || statusFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSelectedDepartment('ALL');
                  setSearchQuery('');
                  setStatusFilter('ALL');
                }}
                className="mt-2 text-xs text-[#1E40AF] font-bold hover:underline cursor-pointer"
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredVolunteers.map((vol) => {
              const isSelected = selectedIds.includes(vol.id);
              const isDeactivated = vol.status === 'Deactivated';

              return (
                <div
                  key={vol.id}
                  className={`p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                    isDeactivated
                      ? 'bg-rose-50/30 hover:bg-rose-50/50'
                      : isSelected
                      ? 'bg-blue-50/60'
                      : 'hover:bg-blue-50/20'
                  }`}
                >
                  {/* Main Content Area: Checkbox + Photo + Full Info */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="pt-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectOne(vol.id)}
                        className="rounded accent-[#1E40AF] cursor-pointer w-4 h-4 shrink-0"
                      />
                    </div>

                    {/* Volunteer Photo */}
                    <div className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden border bg-slate-100 shrink-0 shadow-2xs ${
                      isDeactivated ? 'border-rose-400 grayscale-50' : 'border-[#1E40AF]'
                    }`}>
                      <img
                        src={vol.imageUrl}
                        alt={vol.name}
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
                      {isDeactivated && (
                        <div className="absolute inset-0 bg-red-900/30 flex items-center justify-center">
                          <Ban className="w-5 h-5 text-white drop-shadow" />
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className={`text-sm sm:text-base font-bold capitalize font-serif-cultural truncate ${
                          isDeactivated ? 'text-slate-700 line-through' : 'text-slate-900'
                        }`}>
                          {vol.name}
                        </h4>
                        <span className="text-[10px] font-mono text-slate-400 flex items-center gap-0.5">
                          <Hash className="w-3 h-3" />
                          {vol.id}
                        </span>

                        {/* Status Badge */}
                        {isDeactivated ? (
                          <span className="px-2 py-0.5 rounded-md bg-rose-100 border border-rose-300 font-extrabold text-rose-800 text-[10px] flex items-center gap-1">
                            <Ban className="w-2.5 h-2.5 text-rose-600" />
                            <span>Deactivated</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 font-bold text-emerald-700 text-[10px] flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            <span>Active</span>
                          </span>
                        )}

                        {/* Card Workflow Status Badge */}
                        {vol.cardStatus && vol.cardStatus !== 'Generated' && (
                          <span className="px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 font-bold text-sky-800 text-[10px]">
                            {vol.cardStatus === 'Printed' ? '🖨️ Printed' : '🎖️ Issued'}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 font-bold text-[#1E40AF] text-[10px]">
                          {vol.department}
                        </span>
                        <span className="text-[11px] text-slate-600 flex items-center gap-1">
                          <UserCheck className="w-3 h-3 text-slate-400 inline shrink-0" />
                          <span>HOD: <strong className="text-slate-800">{vol.hodName}</strong></span>
                        </span>
                        <span className="text-[11px] text-slate-600 font-mono flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400 inline shrink-0" />
                          <span>+91 {vol.phone}</span>
                        </span>
                        {vol.createdAt && (
                          <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {new Date(vol.createdAt).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons: View, Edit, Deactivate/Reactivate, Delete */}
                  <div className="flex items-center justify-end gap-1.5 pl-7 sm:pl-0 shrink-0 flex-wrap">
                    {/* View Card Button */}
                    <button
                      type="button"
                      id={`view-card-btn-${vol.id}`}
                      onClick={() => setPreviewVolunteer(vol)}
                      title="View Volunteer Card"
                      className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1E40AF] border border-blue-200 font-bold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-2xs min-h-[34px]"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">View</span>
                    </button>

                    {/* Edit Card Button */}
                    <button
                      type="button"
                      id={`edit-card-btn-${vol.id}`}
                      onClick={() => setEditingVolunteer(vol)}
                      title="Edit volunteer details and photo"
                      className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-2xs min-h-[34px]"
                    >
                      <Pencil className="w-3.5 h-3.5 text-amber-700" />
                      <span>Edit</span>
                    </button>

                    {/* Deactivate / Reactivate Button */}
                    {isDeactivated ? (
                      <button
                        type="button"
                        id={`reactivate-card-btn-${vol.id}`}
                        onClick={() => handleReactivateCard(vol)}
                        title="Reactivate this volunteer card"
                        className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800 text-slate-700 border border-slate-200 font-bold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs min-h-[34px]"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="hidden sm:inline">Reactivate</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        id={`deactivate-card-btn-${vol.id}`}
                        onClick={() => handleOpenDeactivateModal(vol)}
                        title="Deactivate this volunteer card"
                        className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-white hover:bg-rose-50 hover:border-rose-300 text-rose-700 border border-slate-200 font-bold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs min-h-[34px]"
                      >
                        <Ban className="w-3.5 h-3.5 text-rose-600" />
                        <span className="hidden sm:inline">Deactivate</span>
                      </button>
                    )}

                    {/* Delete Permanently Button */}
                    <button
                      type="button"
                      id={`delete-card-permanently-btn-${vol.id}`}
                      onClick={() => handleOpenSingleDeleteModal(vol)}
                      title="Permanently delete this card from storage"
                      className="px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-xl bg-slate-50 hover:bg-rose-100 hover:text-rose-800 text-slate-500 border border-slate-200 hover:border-rose-300 font-bold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-2xs min-h-[34px]"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Edit Volunteer Details & Photo */}
      {editingVolunteer && (
        <EditVolunteerModal
          volunteer={editingVolunteer}
          onClose={() => setEditingVolunteer(null)}
          onSaveSuccess={handleSaveEditSuccess}
          onRequestDelete={(vol) => {
            setEditingVolunteer(null);
            handleOpenSingleDeleteModal(vol);
          }}
        />
      )}

      {/* Modal: Permanent Delete Confirmation (Single or Bulk) */}
      {deletingVolunteers.length > 0 && (
        <DeleteConfirmModal
          volunteersToDelete={deletingVolunteers}
          isDeleting={isDeletingPermanently}
          onCancel={() => setDeletingVolunteers([])}
          onConfirm={handleConfirmPermanentDelete}
        />
      )}

      {/* Confirmation Modal: Deactivate Volunteer Card */}
      {deactivatingVolunteer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-rose-100 overflow-hidden space-y-4 my-auto animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                  Are you sure you want to deactivate this volunteer card?
                </h3>
                <p className="text-xs text-slate-500">
                  This card will remain in the database for records, but will be marked as{' '}
                  <strong className="text-rose-700">Deactivated</strong> and cannot be used or re-generated.
                </p>
              </div>
            </div>

            {/* Volunteer Details Summary */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-500">Volunteer Name:</span>
                <span className="font-bold text-slate-900">{deactivatingVolunteer.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-500">Card ID:</span>
                <span className="font-mono font-bold text-[#1E40AF]">{deactivatingVolunteer.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-500">Department:</span>
                <span className="font-bold text-slate-800">{deactivatingVolunteer.department}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-500">Mobile Phone:</span>
                <span className="font-mono text-slate-800">+91 {deactivatingVolunteer.phone}</span>
              </div>
            </div>

            {/* Action Buttons: Cancel | Deactivate */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                id="cancel-deactivate-btn"
                onClick={() => setDeactivatingVolunteer(null)}
                disabled={isDeactivating}
                className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm border border-slate-300 transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center min-h-[42px]"
              >
                Cancel
              </button>

              <button
                type="button"
                id="confirm-deactivate-btn"
                onClick={handleConfirmDeactivate}
                disabled={isDeactivating}
                className="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[42px]"
              >
                {isDeactivating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>Deactivating...</span>
                  </>
                ) : (
                  <>
                    <Ban className="w-4 h-4 shrink-0" />
                    <span>Deactivate</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: View Individual Volunteer Card */}
      {previewVolunteer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl border border-blue-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-auto">
            <VolunteerCard
              volunteer={previewVolunteer}
              isAdminView={true}
              onClose={() => setPreviewVolunteer(null)}
              onEdit={(vol) => {
                setPreviewVolunteer(null);
                setEditingVolunteer(vol);
              }}
              onDelete={(vol) => {
                setPreviewVolunteer(null);
                handleOpenSingleDeleteModal(vol);
              }}
            />
          </div>
        </div>
      )}

      {/* Sticky Floating Bulk Action Bar when items are selected */}
      {isAnySelected && (
        <div className="fixed bottom-4 inset-x-3 sm:inset-x-6 max-w-xl mx-auto z-40 bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl border border-slate-700/80 p-3 sm:p-4 flex items-center justify-between gap-2.5 animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-blue-600 font-bold text-xs flex items-center justify-center text-white shrink-0">
              {selectedIds.length}
            </span>
            <div className="leading-tight">
              <p className="text-xs font-bold text-white">
                {selectedIds.length === 1 ? '1 card selected' : `${selectedIds.length} cards selected`}
              </p>
              <p className="text-[10px] text-slate-300">
                Bulk operations ready
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="floating-export-btn"
              onClick={handleOpenExportModal}
              className="px-3 py-1.5 rounded-xl bg-[#1E40AF] hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer min-h-[34px]"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Export</span>
            </button>

            <button
              type="button"
              id="floating-delete-btn"
              onClick={handleOpenBulkDeleteModal}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer min-h-[34px]"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>Delete</span>
            </button>

            <button
              type="button"
              id="floating-deselect-btn"
              onClick={() => setSelectedIds([])}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 text-xs transition-colors cursor-pointer"
              title="Deselect All"
            >
              <Square className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Export All / Filtered / Selected Data Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        allVolunteers={volunteers}
        filteredVolunteers={filteredVolunteers}
        selectedIds={selectedIds}
      />
    </div>
  );
}
