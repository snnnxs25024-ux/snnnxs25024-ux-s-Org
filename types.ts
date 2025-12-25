
export interface Company {
  id: string; // UUID
  name: string;
  created_at: string;
}

export interface Profile {
  id: string; // a.k.a user_id, matches auth.users.id
  company_id: string;
  full_name: string;
  nik: string;
  phone: string;
  role: 'admin' | 'member';
}

export interface Worker {
  id?: string;
  company_id: string;
  opsId: string;
  fullName: string;
  nik: string;
  phone: string;
  contractType: 'Daily Worker Vendor';
  department: string;
  createdAt: string;
  status: 'Active' | 'Non Active' | 'Blacklist';
}

export interface AttendanceRecord {
  id: number; // The primary key from the attendance_records table
  workerId: string;
  opsId: string;
  fullName: string;
  timestamp: string; // Check-in time (Official/System based on Shift)
  scan_timestamp?: string | null; // Actual Scan time (Audit Trail)
  checkout_timestamp?: string | null; // Check-out time
  manual_status?: 'Partial' | 'Buffer' | null; // New field for manual additions
  is_takeout: boolean; // New field for takeout status
  is_arrived?: boolean; // New field for physical arrival confirmation (OTW vs Hadir)
}

export interface AttendanceSession {
  id: string; // Unique identifier for the session
  company_id: string;
  date: string; // YYYY-MM-DD
  division: string;
  shiftTime: string;
  shiftId: string;
  planMpp: number;
  status?: 'OPEN' | 'CLOSED'; // New field for session status
  session_type?: 'MANUAL' | 'PUBLIC'; // Distinguish between Admin Manual session and Open List Public session
  auto_close?: boolean; // New field for auto-closing toggle
  records: AttendanceRecord[];
}

export interface MasterData {
    id: number;
    company_id: string; // Master data is also company-specific
    category: 'DIVISION' | 'SHIFT_TIME' | 'SHIFT_ID';
    value: string;
}
