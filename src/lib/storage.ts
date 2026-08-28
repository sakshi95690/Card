import { Volunteer, CardStatus, AdminNotification } from '../types';

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

/**
 * Fetch all volunteers directly from the central database (Cross-device persistence)
 */
export async function fetchAllVolunteers(): Promise<Volunteer[]> {
  try {
    const res = await fetch('/api/volunteers', {
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });

    if (!res.ok) {
      console.warn(`Fetch volunteers returned status ${res.status}`);
      return [];
    }

    const contentType = res.headers.get('content-type') || '';
    if (typeof contentType === 'string' && contentType.toLowerCase().includes('application/json')) {
      const data = await res.json();
      if (data && Array.isArray(data.volunteers)) {
        return data.volunteers;
      }
    }
    return [];
  } catch (err) {
    console.error('Failed to fetch volunteers database:', err);
    return [];
  }
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
        return data;
      }
    }
  } catch (err) {
    console.error(`Failed to fetch volunteer ${id}:`, err);
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
}): Promise<Volunteer> {
  const safeName = String(formData?.name || '').trim();
  const rawPhone = String(formData?.phone || '');
  const safeEmail = formData?.email ? String(formData.email).trim() : '';
  const safeHodName = String(formData?.hodName || '').trim();
  const safeDepartment = String(formData?.department || '').trim();
  const safeImageUrl = String(formData?.imageUrl || '').trim();

  const payload = {
    name: safeName,
    phone: rawPhone,
    email: safeEmail,
    hodName: safeHodName,
    department: safeDepartment,
    imageUrl: safeImageUrl,
    cardStatus: 'Generated',
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
      errorMessage || 'This mobile number is already registered and a volunteer card has already been generated.'
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
 * Delete volunteer record from central database
 */
export async function deleteVolunteerRecord(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/volunteers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      try {
        broadcastChannel?.postMessage({
          type: 'VOLUNTEER_DELETED',
          id,
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

