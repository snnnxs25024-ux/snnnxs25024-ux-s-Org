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
  workerId: string;
  opsId: string;
  fullName: string;
  timestamp: string;
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