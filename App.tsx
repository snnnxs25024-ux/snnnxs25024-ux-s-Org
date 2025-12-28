
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Attendance from './pages/Attendance';
import Database from './pages/Database';
import OpenList from './pages/OpenList';
import PublicAttendance from './pages/PublicAttendance';
import Settings from './pages/Settings';
import AuthRouter from './pages/AuthRouter';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import EmployeeDashboard from './pages/EmployeeDashboard';
import { Worker, AttendanceSession, AttendanceRecord, Profile } from './types';
import { supabase } from './lib/supabaseClient';
import HamburgerIcon from './components/icons/HamburgerIcon';
import { ToastProvider } from './contexts/ToastContext';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './hooks/useAuth';

export type Page = 'Dashboard' | 'Absensi' | 'Open List' | 'Data Base' | 'Pengaturan';

const AppContent: React.FC = () => {
  const { session, profile, loading: authLoading } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>('Dashboard');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isPublicMode, setIsPublicMode] = useState(false);
  
  const [autoOpenSessionId, setAutoOpenSessionId] = useState<string | null>(null);

  useEffect(() => {
    const path = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    
    if (path.startsWith('/attend/')) {
        setIsPublicMode(true);
    } else {
        const pageParam = searchParams.get('page');
        const manageId = searchParams.get('manageId');
        
        if (pageParam === 'Dashboard') {
            setCurrentPage('Dashboard');
        }
        if (manageId) {
            setAutoOpenSessionId(manageId);
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
  }, []);

  const [activeSession, setActiveSession] = useState<Omit<AttendanceSession, 'records' | 'id' | 'company_id'> | null>(null);
  const [activeRecords, setActiveRecords] = useState<Omit<AttendanceRecord, 'id' | 'checkout_timestamp' | 'manual_status' | 'is_takeout'>[]>([]);

  const fetchData = useCallback(async (companyId: string) => {
    if (!session || !companyId) return;
    setLoading(true);
    setError(null);

    try {
      const { data: workersData, error: workersError } = await supabase.from('workers').select('*').eq('company_id', companyId);
      if (workersError) throw workersError;
      setWorkers(workersData || []);
      
      const { data: sessionsData, error: sessionsError } = await supabase.from('attendance_sessions').select('*').eq('company_id', companyId);
      if (sessionsError) throw sessionsError;
      
      const sessionIds = (sessionsData || []).map(s => s.id);
      let allRecordsData: any[] = [];
      if (sessionIds.length > 0) {
          const { data: recordsData, error: recordsError } = await supabase.from('attendance_records').select('*').in('session_id', sessionIds);
          if (recordsError) throw recordsError;
          allRecordsData = recordsData || [];
      }
      
      const workerMap = new Map<string, Worker>();
      (workersData || []).forEach(worker => {
          if (worker.id) workerMap.set(worker.id, worker);
      });

      const recordsBySessionId = new Map<string, any[]>();
      allRecordsData.forEach(record => {
          if (!recordsBySessionId.has(record.session_id)) {
              recordsBySessionId.set(record.session_id, []);
          }
          recordsBySessionId.get(record.session_id)!.push(record);
      });

      const history: AttendanceSession[] = (sessionsData || []).map(session => {
          const recordsForSession = recordsBySessionId.get(session.id) || [];
          return {
              ...session,
              records: recordsForSession.map((rec: any) => {
                  const worker = workerMap.get(rec.worker_id);
                  return {
                      id: rec.id,
                      workerId: rec.worker_id,
                      opsId: worker?.opsId || 'N/A',
                      fullName: worker?.fullName || 'Unknown',
                      timestamp: rec.timestamp,
                      scan_timestamp: rec.scan_timestamp,
                      checkout_timestamp: rec.checkout_timestamp,
                      manual_status: rec.manual_status,
                      is_takeout: rec.is_takeout,
                      is_arrived: rec.is_arrived ?? true,
                  }
              }),
          };
      });
      setAttendanceHistory(history);

    } catch (err: any) {
      console.error("Fetch Data Error:", err);
      setError(err?.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }, [session]); 

  useEffect(() => {
    if (!isPublicMode && session && profile?.role === 'company_admin' && profile.company_id) {
        fetchData(profile.company_id);
    } else {
        setLoading(false); 
    }
  }, [isPublicMode, session, profile, fetchData]); 

  const clearAutoOpenSessionId = () => setAutoOpenSessionId(null);

  if (isPublicMode) {
      return <PublicAttendance />;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050a18]">
        <div className="flex flex-col items-center">
           <div className="animate-pulse mb-6">
               <img src="https://i.imgur.com/lie9EMX.png" alt="ABSENIN Logo" className="h-20 w-20 object-contain" />
           </div>
           <div className="text-blue-500 text-[10px] font-black tracking-[0.5em] uppercase">Initializing ABSENIN</div>
        </div>
      </div>
    );
  }

  if (!session || !profile) {
    // AuthRouter will handle showing WelcomePage or LoginPage
    return <AuthRouter><></></AuthRouter>;
  }
  
  // ROLE-BASED ROUTING
  if (profile.role === 'super_admin') {
    return <SuperAdminDashboard profile={profile} />;
  }

  if (profile.role === 'employee') {
    return <EmployeeDashboard profile={profile} />;
  }

  // Default to Company Admin
  if (profile.role !== 'company_admin' || !profile.company_id) {
    return (
        <AuthRouter>
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-red-500">Error: Profil pengguna tidak valid atau tidak memiliki perusahaan terkait.</p>
            </div>
        </AuthRouter>
    );
  }

  const renderPage = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center h-full">
          <div className="flex flex-col items-center">
             <div className="animate-bounce mb-4">
                 <img src="https://i.imgur.com/lie9EMX.png" alt="ABSENIN Logo" className="h-12 w-12 object-contain opacity-50" />
             </div>
             <div className="text-gray-400 text-xs font-bold uppercase tracking-widest">Memuat Data...</div>
          </div>
        </div>
      );
    }
    
    const companyId = profile.company_id!;

    switch (currentPage) {
      case 'Dashboard':
        return <Dashboard 
                  profile={profile}
                  workers={workers} 
                  attendanceHistory={attendanceHistory} 
                  refreshData={() => fetchData(companyId)} 
                  setAttendanceHistory={setAttendanceHistory}
                  autoOpenSessionId={autoOpenSessionId}
                  clearAutoOpenSessionId={clearAutoOpenSessionId}
               />;
      case 'Absensi':
        return <Attendance 
                  profile={profile}
                  workers={workers} 
                  refreshData={() => fetchData(companyId)}
                  activeSession={activeSession}
                  setActiveSession={setActiveSession}
                  activeRecords={activeRecords}
                  setActiveRecords={setActiveRecords}
               />;
      case 'Open List':
          return <OpenList profile={profile} workers={workers} />;
      case 'Data Base':
        return <Database profile={profile} workers={workers} setWorkers={setWorkers} />;
      case 'Pengaturan':
          return <Settings profile={profile} />;
      default:
        return <Dashboard 
                  profile={profile}
                  workers={workers} 
                  attendanceHistory={attendanceHistory} 
                  refreshData={() => fetchData(companyId)} 
                  setAttendanceHistory={setAttendanceHistory} 
                  autoOpenSessionId={autoOpenSessionId}
                  clearAutoOpenSessionId={clearAutoOpenSessionId}
                />;
    }
  };

  return (
    <div className="flex min-h-screen bg-[#f8f9fc] text-gray-800 font-sans">
    <Sidebar 
        profile={profile}
        currentPage={currentPage} 
        setCurrentPage={setCurrentPage} 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
    />
    <main className="flex-1 flex flex-col min-h-screen overflow-hidden transition-all duration-300">
        <div className="lg:hidden p-4 flex justify-between items-center bg-white border-b shrink-0">
        <div className="flex items-center gap-3">
            <img src="https://i.imgur.com/lie9EMX.png" alt="ABSENIN Logo" className="h-8 w-8 object-contain" />
            <div>
                <h1 className="text-sm font-black text-blue-600 leading-none tracking-tighter">ABSENIN</h1>
                <p className="text-[8px] text-gray-400 font-black uppercase tracking-widest mt-0.5">Attendance Portal</p>
            </div>
        </div>
        <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors">
            <HamburgerIcon />
        </button>
        </div>
        <div className="flex-1 p-4 sm:p-6 lg:p-10 overflow-y-auto no-scrollbar">
            {renderPage()}
        </div>
    </main>
    </div>
  );
};

const App: React.FC = () => (
  <ToastProvider>
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  </ToastProvider>
);

export default App;
