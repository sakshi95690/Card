import { Volunteer, CardStatus, AdminNotification, FestivalEvent } from '../types';

const NOTIFICATIONS_KEY = 'iskcon_admin_notifications_2026';
const CHANNEL_NAME = 'iskcon_volunteers_broadcast_channel';

// Get a broadcast channel if supported in browser for same-origin tabs
let broadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
  }
} catch {
  // BroadcastChannel fallback
}

/**
 * Helper function to safely extract error message from any server response or error object
 */
function extractErrorMessage(data: any, fallbackMessage: string): string {
  if (!data) return fallbackMessage;
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (typeof data.error === 'string' && data.error.trim()) return data.error.trim();
  if (data.error && typeof data.error.message === 'string' && data.error.message.trim()) return data.error.message.trim();
  if (data.error && typeof data.error === 'object') {
    try {
      const stringified = JSON.stringify(data.error);
      if (stringified && stringified !== '{}') return stringified;
    } catch {
      // ignore
    }
  }
  if (typeof data.message === 'string' && data.message.trim()) return data.message.trim();
  if (typeof data.details === 'string' && data.details.trim()) return data.details.trim();
  return fallbackMessage;
}

const DIRECT_SUPABASE_DATA_URL = 'https://dgmhavoihauufpvpmmvq.supabase.co/storage/v1/object/public/volunteer-cards/data/volunteers-data.json';

// ----------------------------------------------------
// Festival Events Client API
// ----------------------------------------------------

/**
 * Fetch all festival events from the server
 */
export async function fetchAllEvents(): Promise<FestivalEvent[]> {
  try {
    const res = await fetch('/api/events', {
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.success && Array.isArray(data?.events)) {
        return data.events;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch events from /api/events:', err);
  }

  // Fallback defaults in case server is starting
  return [
    {
      id: 'janmashtami-2026',
      name: 'Sri Krishna Janmashtami',
      year: 2026,
      startDate: '2026-09-04',
      endDate: '2026-09-05',
      description: 'Sri Krishna Janmashtami Mahotsav 2026 Grand Celebration Volunteer Seva',
      departments: [
        'Abhishekam Seva',
        'Arti Seva',
        'BBT',
        'Bhoga Offering',
        'Bhoga Preparation',
        'Book Distribution',
        'Book Stall',
        'BPS',
        'Cleaning',
        'Crisis Mgmt',
        'Crowd Control',
        'Decoration',
        'DYPH',
        'Electricity',
        'G. Prasadam Distribution',
        'Gift Distribution',
        'Govindas',
        'IYF',
        'Japa Seva',
        'Kirtan Seva',
        'Kitchen',
        'Light',
        'Media Seva',
        'Medical',
        'Nuttts',
        'Parking',
        'Parking & Traffic',
        'Plumber',
        'Priest Seva',
        'Reception Seva',
        'Security',
        'Shoe Stall',
        'Sound',
        'Tent',
        'V. Prasadam Distribution',
        'Volunteer Care Seva',
        'Welcome Seva',
      ],
      isActive: true,
      isDefault: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ];
}

/**
 * Fetch single festival event by ID
 */
export async function fetchEventById(id: string): Promise<FestivalEvent | null> {
  try {
    const res = await fetch(`/api/events/${encodeURIComponent(id)}`, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.success && data?.event) {
        return data.event;
      }
    }
  } catch (err) {
    console.warn(`Failed to fetch event ${id}:`, err);
  }

  const all = await fetchAllEvents();
  return all.find((e) => e.id.toLowerCase() === id.toLowerCase()) || null;
}

/**
 * Create a new Festival / Event (Admin action)
 */
export async function createFestivalEvent(
  eventData: Partial<FestivalEvent>
): Promise<FestivalEvent> {
  const res = await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(eventData),
  });

  const data = await res.json();
  if (res.ok && data?.success && data?.event) {
    try {
      broadcastChannel?.postMessage({
        type: 'EVENTS_UPDATED',
      });
    } catch {
      // ignore
    }
    return data.event;
  }

  throw new Error(extractErrorMessage(data, 'Failed to create festival event'));
}

/**
 * Update an existing Festival / Event (Admin action)
 */
export async function updateFestivalEvent(
  id: string,
  eventData: Partial<FestivalEvent>
): Promise<FestivalEvent> {
  const res = await fetch(`/api/events/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(eventData),
  });

  const data = await res.json();
  if (res.ok && data?.success && data?.event) {
    try {
      broadcastChannel?.postMessage({
        type: 'EVENTS_UPDATED',
        activeEventId: data.event.isDefault ? data.event.id : undefined,
      });
      window.dispatchEvent(
        new CustomEvent('festival_event_changed', { detail: { event: data.event } })
      );
    } catch {
      // ignore
    }
    return data.event;
  }

  throw new Error(extractErrorMessage(data, 'Failed to update festival event'));
}

/**
 * Set active/default festival event across the entire system
 */
export async function setActiveFestivalEvent(id: string): Promise<FestivalEvent> {
  const cleanId = String(id || '').trim();
  if (!cleanId) throw new Error('Festival ID is required');

  try {
    const res = await fetch(`/api/events/set-active/${encodeURIComponent(cleanId)}`, {
      method: 'POST',
      headers: { 'Cache-Control': 'no-cache' },
    });
    const data = await res.json();
    if (res.ok && data?.success && data?.event) {
      localStorage.setItem('active_festival_event_id', cleanId);
      try {
        broadcastChannel?.postMessage({
          type: 'EVENTS_UPDATED',
          activeEventId: cleanId,
        });
        window.dispatchEvent(
          new CustomEvent('festival_event_changed', { detail: { event: data.event } })
        );
      } catch {
        // ignore
      }
      return data.event;
    }
  } catch (err) {
    console.warn('[Storage] Notice in POST /api/events/set-active, falling back to PUT:', err);
  }

  // Fallback to updating isDefault
  const updated = await updateFestivalEvent(cleanId, { isDefault: true, isActive: true });
  localStorage.setItem('active_festival_event_id', cleanId);
  try {
    broadcastChannel?.postMessage({
      type: 'EVENTS_UPDATED',
      activeEventId: cleanId,
    });
    window.dispatchEvent(
      new CustomEvent('festival_event_changed', { detail: { event: updated } })
    );
  } catch {
    // ignore
  }
  return updated;
}

/**
 * Delete a Festival / Event (Admin action)
 */
export async function deleteFestivalEvent(id: string): Promise<boolean> {
  const res = await fetch(`/api/events/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

  const data = await res.json();
  if (res.ok && data?.success) {
    try {
      broadcastChannel?.postMessage({
        type: 'EVENTS_UPDATED',
      });
    } catch {
      // ignore
    }
    return true;
  }

  throw new Error(extractErrorMessage(data, 'Failed to delete festival event'));
}

/**
 * Add a department to a festival event
 */
export async function addDepartmentToEvent(
  eventId: string,
  departmentName: string
): Promise<string[]> {
  const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/departments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ departmentName }),
  });

  const data = await res.json();
  if (res.ok && data?.success && Array.isArray(data?.departments)) {
    return data.departments;
  }

  throw new Error(extractErrorMessage(data, 'Failed to add department'));
}

/**
 * Remove a department from a festival event
 */
export async function removeDepartmentFromEvent(
  eventId: string,
  departmentName: string
): Promise<string[]> {
  const res = await fetch(
    `/api/events/${encodeURIComponent(eventId)}/departments/${encodeURIComponent(departmentName)}`,
    {
      method: 'DELETE',
    }
  );

  const data = await res.json();
  if (res.ok && data?.success && Array.isArray(data?.departments)) {
    return data.departments;
  }

  throw new Error(extractErrorMessage(data, 'Failed to remove department'));
}

/**
 * Fetch all volunteers directly from the central database (Cross-device persistence)
 */
export async function fetchAllVolunteers(eventId?: string): Promise<Volunteer[]> {
  try {
    const url = eventId && eventId !== 'ALL'
      ? `/api/volunteers?eventId=${encodeURIComponent(eventId)}`
      : '/api/volunteers';

    const res = await fetch(url, {
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });

    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (typeof contentType === 'string' && contentType.toLowerCase().includes('application/json')) {
        const data = await res.json();
        if (data && Array.isArray(data.volunteers)) {
          return data.volunteers;
        }
      }
    }
  } catch (err) {
    console.warn('Failed to fetch from /api/volunteers, attempting direct storage fallback:', err);
  }

  // Resilient fallback for Vercel/Client-side environments directly to persistent storage
  try {
    const fallbackRes = await fetch(DIRECT_SUPABASE_DATA_URL, {
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    if (fallbackRes.ok) {
      const fallbackData = await fallbackRes.json();
      if (Array.isArray(fallbackData)) {
        if (eventId && eventId !== 'ALL') {
          return fallbackData.filter((v: any) => (v.eventId || 'janmashtami-2026') === eventId);
        }
        return fallbackData;
      }
    }
  } catch (fallbackErr) {
    console.error('Failed to fetch volunteers from fallback storage:', fallbackErr);
  }

  return [];
}

/**
 * Fetch a single volunteer by ID from the central database
 */
export async function fetchVolunteerById(id: string): Promise<Volunteer | null> {
  try {
    const res = await fetch(`/api/volunteers/${encodeURIComponent(id)}`, {
      headers: {
        'Cache-Control': 'no-cache',
      },
    });
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (typeof contentType === 'string' && contentType.toLowerCase().includes('application/json')) {
        const data = await res.json();
        if (data && data.id) {
          return data;
        }
      }
    }
  } catch (err) {
    console.warn(`Failed to fetch volunteer ${id} from API, checking fallback storage:`, err);
  }

  // Fallback to searching all volunteers in persistent storage
  try {
    const all = await fetchAllVolunteers();
    const found = all.find((v) => v.id.toLowerCase() === id.toLowerCase());
    if (found) return found;
  } catch {
    // ignore
  }

  return null;
}

/**
 * Register a new volunteer with strict central database persistence
 */
export async function registerVolunteerRecord(formData: {
  name: string;
  phone: string;
  email?: string;
  hodName: string;
  department: string;
  imageUrl: string;
  eventId?: string;
  eventName?: string;
}): Promise<Volunteer> {
  const safeName = String(formData?.name || '').trim();
  const rawPhone = String(formData?.phone || '');
  const safeEmail = formData?.email ? String(formData.email).trim() : '';
  const safeHodName = String(formData?.hodName || '').trim();
  const safeDepartment = String(formData?.department || '').trim();
  const safeImageUrl = String(formData?.imageUrl || '').trim();
  const safeEventId = formData?.eventId || 'janmashtami-2026';
  const safeEventName = formData?.eventName || 'Sri Krishna Janmashtami';

  const payload = {
    name: safeName,
    phone: rawPhone,
    email: safeEmail,
    hodName: safeHodName,
    department: safeDepartment,
    imageUrl: safeImageUrl,
    cardStatus: 'Generated',
    eventId: safeEventId,
    eventName: safeEventName,
  };

  let response: Response;
  try {
    response = await fetch('/api/volunteers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Network error during registration POST /api/volunteers:', err);
    throw new Error('Server connection error. Please check your network and try again.');
  }

  let data: any = null;
  const contentType = response.headers.get('content-type') || '';
  if (typeof contentType === 'string' && contentType.toLowerCase().includes('application/json')) {
    try {
      data = await response.json();
    } catch (e) {
      console.warn('Could not parse JSON response from server:', e);
    }
  } else {
    // If not JSON, try to read text for better error messages
    try {
      const text = await response.text();
      console.warn('Non-JSON response received:', text ? text.substring(0, 100) : '');
      if (text && text.trim()) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text.trim();
        }
      }
    } catch {
      // ignore
    }
  }

  if (response.ok && data?.success && data?.volunteer) {
    const createdVolunteer: Volunteer = data.volunteer;

    // Add Notification for Admin
    addAdminNotification({
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      volunteerId: createdVolunteer.id,
      volunteerName: createdVolunteer.name,
      department: createdVolunteer.department,
      timestamp: createdVolunteer.createdAt,
      read: false,
    });

    // Notify other tabs/windows in real time
    try {
      broadcastChannel?.postMessage({
        type: 'NEW_VOLUNTEER',
        volunteer: createdVolunteer,
      });
    } catch {
      // ignore
    }

    return createdVolunteer;
  }

  const fallbackError = `Server returned status ${response.status}. Please check your inputs and try again.`;
  const errorMessage = extractErrorMessage(data, fallbackError);
  const isDuplicate =
    response.status === 409 ||
    (typeof errorMessage === 'string' &&
      (errorMessage.toLowerCase().includes('already registered') ||
        errorMessage.toLowerCase().includes('only 1 card is allowed')));

  if (response.status === 409 || isDuplicate) {
    const errorObj: any = new Error(
      errorMessage || 'This mobile number is already registered for this festival event.'
    );
    errorObj.isDuplicate = true;
    errorObj.existingVolunteer = data?.volunteer || null;
    errorObj.volunteerId = data?.volunteerId || (data?.volunteer ? data.volunteer.id : null);
    throw errorObj;
  }

  if (response.status === 403 || data?.isDeactivated) {
    throw new Error(
      errorMessage || 'This volunteer card has been deactivated. Please contact the administrator.'
    );
  }

  throw new Error(errorMessage);
}

/**
 * Update volunteer status (Active / Deactivated) in central database
 */
export async function updateVolunteerStatus(
  id: string,
  status: 'Active' | 'Deactivated' | 'Verified' | 'Pending'
): Promise<boolean> {
  try {
    const res = await fetch(`/api/volunteers/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    if (res.ok) {
      try {
        broadcastChannel?.postMessage({
          type: 'STATUS_UPDATED',
          id,
          status,
        });
      } catch {
        // ignore
      }
      return true;
    }
  } catch (err) {
    console.error('Failed to update volunteer status in backend:', err);
  }
  return false;
}

/**
 * Deactivate a volunteer card in central database
 */
export async function deactivateVolunteerCard(id: string): Promise<boolean> {
  return updateVolunteerStatus(id, 'Deactivated');
}

/**
 * Update card status (e.g. Generated -> Printed -> Issued) in central database
 */
export async function updateVolunteerCardStatus(
  id: string,
  newCardStatus: CardStatus
): Promise<boolean> {
  try {
    const res = await fetch(`/api/volunteers/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardStatus: newCardStatus }),
    });

    if (res.ok) {
      try {
        broadcastChannel?.postMessage({
          type: 'STATUS_UPDATED',
          id,
          cardStatus: newCardStatus,
        });
      } catch {
        // ignore
      }
      return true;
    }
  } catch (err) {
    console.error('Failed to update card status in backend:', err);
  }
  return false;
}

/**
 * Update full volunteer details (Admin Action) in central database
 */
export async function updateVolunteerRecord(
  id: string,
  updatedData: {
    name?: string;
    phone?: string;
    email?: string;
    hodName?: string;
    department?: string;
    imageUrl?: string;
    status?: 'Active' | 'Deactivated' | 'Verified' | 'Pending';
    cardStatus?: CardStatus;
    eventId?: string;
    eventName?: string;
  }
): Promise<Volunteer> {
  const cleanId = String(id || '').trim();
  let response: Response | null = null;
  let data: any = null;

  // 1. Try standard PUT /api/volunteers/:id
  try {
    response = await fetch(`/api/volunteers/${encodeURIComponent(cleanId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(updatedData),
    });
  } catch (err) {
    console.warn('PUT /api/volunteers/:id failed, trying POST edit fallback:', err);
  }

  // 2. Try POST /api/volunteers/:id/edit as fallback if PUT failed or received 404/405
  if (!response || !response.ok) {
    try {
      const fallbackRes = await fetch(`/api/volunteers/${encodeURIComponent(cleanId)}/edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(updatedData),
      });
      if (fallbackRes.ok || !response) {
        response = fallbackRes;
      }
    } catch (fallbackErr) {
      console.warn('Fallback POST /api/volunteers/:id/edit also failed:', fallbackErr);
    }
  }

  if (response) {
    try {
      data = await response.json();
    } catch {
      // ignore JSON parse error
    }
  }

  if (response && response.ok && data?.success && data?.volunteer) {
    try {
      broadcastChannel?.postMessage({
        type: 'VOLUNTEER_UPDATED',
        volunteer: data.volunteer,
        id: cleanId,
      });
    } catch {
      // ignore
    }
    return data.volunteer;
  }

  const errorMessage = extractErrorMessage(
    data,
    response ? `Failed to update volunteer record (Status ${response.status})` : 'Server connection error. Please check your network and try again.'
  );
  throw new Error(errorMessage);
}

/**
 * Delete volunteer record permanently from central database and storage
 */
export async function deleteVolunteerRecord(id: string): Promise<boolean> {
  return deleteVolunteerPermanently(id);
}

/**
 * Permanently delete single volunteer card from database and storage
 */
export async function deleteVolunteerPermanently(id: string): Promise<boolean> {
  const cleanId = String(id || '').trim();
  try {
    // 1. Try standard DELETE /api/volunteers/:id
    let res = await fetch(`/api/volunteers/${encodeURIComponent(cleanId)}`, {
      method: 'DELETE',
    });

    // 2. Fallback to POST /api/volunteers/:id/delete in environments where DELETE method is restricted
    if (!res.ok) {
      res = await fetch(`/api/volunteers/${encodeURIComponent(cleanId)}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (res.ok) {
      try {
        broadcastChannel?.postMessage({
          type: 'VOLUNTEER_DELETED',
          id: cleanId,
        });
      } catch {
        // ignore
      }
      return true;
    }
  } catch (err) {
    console.error('Failed to delete volunteer record from backend:', err);
  }
  return false;
}

/**
 * Permanently delete multiple volunteer cards from database and storage in bulk
 */
export async function bulkDeleteVolunteersPermanently(
  ids: string[]
): Promise<{ success: boolean; deletedCount: number; message?: string }> {
  try {
    const res = await fetch('/api/volunteers/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });

    const data = await res.json();
    if (res.ok && data?.success) {
      try {
        broadcastChannel?.postMessage({
          type: 'BULK_VOLUNTEERS_DELETED',
          ids,
        });
      } catch {
        // ignore
      }
      return { success: true, deletedCount: data.deletedCount || ids.length, message: data.message };
    }
    return { success: false, deletedCount: 0, message: data?.error || 'Failed to delete records' };
  } catch (err: any) {
    console.error('Failed to bulk delete volunteer records from backend:', err);
    return { success: false, deletedCount: 0, message: err?.message || 'Server error during bulk delete' };
  }
}

/**
 * Admin Notifications Management (Client UI session helper)
 */
export function getAdminNotifications(): AdminNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function setAdminNotifications(notifications: AdminNotification[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
  } catch {
    // ignore
  }
}

export function addAdminNotification(notif: AdminNotification) {
  const current = getAdminNotifications();
  const updated = [notif, ...current.slice(0, 49)];
  setAdminNotifications(updated);
}

export function markNotificationAsRead(id: string) {
  const current = getAdminNotifications();
  const updated = current.map((n) => (n.id === id ? { ...n, read: true } : n));
  setAdminNotifications(updated);
}

export function markAllNotificationsAsRead() {
  const current = getAdminNotifications();
  const updated = current.map((n) => ({ ...n, read: true }));
  setAdminNotifications(updated);
}

export function clearAdminNotifications() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(NOTIFICATIONS_KEY);
  } catch {
    // ignore
  }
}

/**
 * Real-time event listener for live admin synchronization across all devices and tabs
 */
export function subscribeToVolunteerUpdates(
  onUpdate: (event: { type: string; volunteer?: Volunteer; id?: string; cardStatus?: CardStatus }) => void
): () => void {
  const handleBroadcast = (event: MessageEvent) => {
    if (event.data && event.data.type) {
      onUpdate(event.data);
    }
  };

  const handleWindowFocus = () => {
    onUpdate({ type: 'FOCUS_SYNC' });
  };

  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', handleBroadcast);
  }
  window.addEventListener('focus', handleWindowFocus);

  // Fast background polling (every 2.5 seconds) to immediately catch registrations from any phone/laptop
  const intervalId = setInterval(() => {
    onUpdate({ type: 'POLL_SYNC' });
  }, 2500);

  return () => {
    if (broadcastChannel) {
      broadcastChannel.removeEventListener('message', handleBroadcast);
    }
    window.removeEventListener('focus', handleWindowFocus);
    clearInterval(intervalId);
  };
}

