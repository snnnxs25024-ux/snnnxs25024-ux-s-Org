export interface Worker {
  id?: string;
  opsId: string;
  fullName: string;
  nik: string;
  phone: string;
  contractType: 'Daily Worker Vendor - NEXUS';
  department: 'SOC Operator' | 'Cache' | 'Return' | 'Inventory';
  createdAt: string;
  status: 'Active' | 'Non Active' | 'Blacklist';
}

export interface AttendanceRecord {
  id: number; // The primary key from the attendance_records table
  workerId: string;
  opsId: string;
  fullName: string;
  timestamp: string; // Check-in time
  checkout_timestamp?: string | null; // Check-out time
  manual_status?: 'Partial' | 'Buffer' | null; // New field for manual additions
  is_takeout: boolean; // New field for takeout status
}

export interface AttendanceSession {
  id: string; // Unique identifier for the session
  date: string; // YYYY-MM-DD
  division: string;
  shiftTime: string;
  shiftId: string;
  planMpp: number;
  records: AttendanceRecord[];
}