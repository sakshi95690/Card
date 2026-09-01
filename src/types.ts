export type CardStatus = 'Generated' | 'Printed' | 'Issued';

export interface FestivalEvent {
  id: string; // unique slug e.g. 'janmashtami-2026'
  name: string; // e.g. 'Sri Krishna Janmashtami'
  year: number | string; // e.g. 2026
  date?: string; // e.g. '2026-09-04'
  startDate?: string;
  endDate?: string;
  description?: string;
  departments: string[];
  isActive: boolean;
  isDefault?: boolean;
  createdAt: string;
}

export interface Volunteer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  hodName: string;
  department: string;
  imageUrl: string;
  createdAt: string;
  status: 'Verified' | 'Pending' | 'Active' | 'Deactivated';
  cardStatus?: CardStatus;
  eventId?: string;
  eventName?: string;
}

export interface AdminNotification {
  id: string;
  volunteerId: string;
  volunteerName: string;
  department: string;
  timestamp: string;
  read: boolean;
  eventId?: string;
}

export interface VolunteerPublicVerification {
  id: string;
  name: string;
  department: string;
  status: string;
  createdAt: string;
  eventId?: string;
  eventName?: string;
}

export const DEPARTMENTS = [
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
] as const;

export type DepartmentType = (typeof DEPARTMENTS)[number];
