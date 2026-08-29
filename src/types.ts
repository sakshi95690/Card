export type CardStatus = 'Generated' | 'Printed' | 'Issued';

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
}

export interface AdminNotification {
  id: string;
  volunteerId: string;
  volunteerName: string;
  department: string;
  timestamp: string;
  read: boolean;
}

export interface VolunteerPublicVerification {
  id: string;
  name: string;
  department: string;
  status: string;
  createdAt: string;
}

export const DEPARTMENTS = [
  'Abhishekam Seva',
  'Arti Seva',
  'BBT',
  'Bhoga Offering',
  'Book Distribution',
  'Book Stall',
  'BPS',
  'Crisis Mgmt',
  'Crowd Control',
  'Decoration',
  'DYPH',
  'Electricity',
  'G. Prasadam Distribution',
  'Gift Distribution',
  'Govindas',
  'Japa Seva',
  'Kirtan Seva',
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
  'Tent Cleaning'
  'V. Prasadam Distribution',
  'Volunteer Care Seva',
  'Welcome Seva',
] as const;

export type DepartmentType = (typeof DEPARTMENTS)[number];
