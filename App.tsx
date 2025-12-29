
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Attendance from './pages/Attendance';
import Database from './pages/Database';
import OpenList from './pages/OpenList';
import PublicAttendance from './pages/PublicAttendance';
import Settings from './pages/Settings';
import LoginPage from './pages/LoginPage';
import WelcomePage from './pages/WelcomePage';
import { Worker, AttendanceSession, AttendanceRecord } from './types';
import { supabase } from './lib/supabaseClient';
import HamburgerIcon from './components/icons/HamburgerIcon';
import { ToastProvider } from './contexts/ToastContext';

export type Page = 'Dashboard' | 'Absensi' | 'Open List' | 'Data Base' | 'Pengaturan';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(true);
  const [currentPage, setCurrentPage] = useState<Page>('Dashboard');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isPublicMode, setIsPublicMode] = useState(false);
  
  const workersRef = useRef<Worker[]>([]);
  useEffect(() => {
    workersRef.current = workers;
  }, [workers]);
  
  const [autoOpenSessionId, setAutoOpenSessionId] = useState<string | null>(null);

  useEffect(() => {
    // This listener will fire immediately with the initial session state,
    // and then again whenever the session changes. This is more robust.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false); // Set loading to false once we have the auth state.
    });

    return () => subscription.unsubscribe();
  }, []);

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
            // Hapus parameter dari URL setelah dibaca agar tidak memicu lagi saat refresh
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
  }, []);

  const [activeSession, setActiveSession] = useState<Omit<AttendanceSession, 'records' | 'id'> | null>(null);
  const [activeRecords, setActiveRecords] = useState<Omit<AttendanceRecord, 'id' | 'checkout_timestamp' | 'manual_status' | 'is_takeout'>[]>([]);

  const fetchData = useCallback(async () => {
    if (!session) return;
    if (workers.length === 0) setLoading(true); 
    setError(null);

    try {
        const fetchAll = async (table: string, select: string) => {
            let allData: any[] = [];
            let lastData: any[] | null = null;
            let page = 0;
            const pageSize = 1000;

            do {
                const { data, error } = await supabase
                    .from(table)
                    .select(select)
                    .range(page * pageSize, (page + 1) * pageSize - 1);

                if (error) throw error;

                if (data) {
                    allData = [...allData, ...data];
                    lastData = data;
                } else {
                    lastData = [];
                }
                page++;
            } while (lastData && lastData.length === pageSize);
            
            return allData;
        };

        const workersData = await fetchAll('workers', '*');
        const sessionsData = await fetchAll('attendance_sessions', '*');
        const recordsData = await fetchAll('attendance_records', 'id, session_id, worker_id, timestamp, checkout_timestamp, manual_status, is_takeout, scan_timestamp, is_arrived');
        
        const typedWorkers: Worker[] = workersData.map((w: any) => ({
            id: w.id,
            opsId: w.ops_id,
            fullName: w.full_name,
            nik: w.nik,
            phone: w.phone,
            contractType: w.contract_type,
            department: w.department,
            createdAt: w.created_at || new Date().toISOString(),
            status: w.status,
        }));
        setWorkers(typedWorkers);

        const workerMap = new Map<string, Worker>();
        typedWorkers.forEach(worker => {
            if (worker.id) {
                workerMap.set(worker.id, worker);
            }
        });

        const recordsBySessionId = new Map<string, any[]>();
        recordsData.forEach(record => {
            if (!recordsBySessionId.has(record.session_id)) {
                recordsBySessionId.set(record.session_id, []);
            }
            recordsBySessionId.get(record.session_id)!.push(record);
        });

        const history: AttendanceSession[] = sessionsData.map((session: any) => {
            const recordsForSession = recordsBySessionId.get(session.id) || [];
            return {
                id: session.id,
                date: session.date,
                division: session.division,
                shiftTime: session.shift_time,
                shiftId: session.shift_id,
                planMpp: session.plan_mpp,
                status: session.status,
                session_type: session.session_type,
                auto_close: session.auto_close,
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
      let errMsg = err?.message || "An unexpected error occurred.";
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  }, [session, workers.length]); 

  useEffect(() => {
    if (!isPublicMode && session) {
        fetchData();
    } else {
        setLoading(false); 
    }
  }, [isPublicMode, session, fetchData]); 

  // Fungsi untuk membersihkan state auto-open setelah digunakan
  const clearAutoOpenSessionId = () => {
    setAutoOpenSessionId(null);
  };

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

  if (!session && showWelcome) {
    return <WelcomePage onEnter={() => setShowWelcome(false)} />;
  }

  if (!session) {
    return <LoginPage />;
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
    
    switch (currentPage) {
      case 'Dashboard':
        return <Dashboard 
                  workers={workers} 
                  attendanceHistory={attendanceHistory} 
                  refreshData={fetchData} 
                  setAttendanceHistory={setAttendanceHistory}
                  autoOpenSessionId={autoOpenSessionId}
                  clearAutoOpenSessionId={clearAutoOpenSessionId}
               />;
      case 'Absensi':
        return <Attendance 
                  workers={workers} 
                  refreshData={fetchData}
                  activeSession={activeSession}
                  setActiveSession={setActiveSession}
                  activeRecords={activeRecords}
                  setActiveRecords={setActiveRecords}
               />;
      case 'Open List':
          return <OpenList workers={workers} />;
      case 'Data Base':
        return <Database workers={workers} refreshData={fetchData} />;
      case 'Pengaturan':
          return <Settings />;
      default:
        return <Dashboard 
                  workers={workers} 
                  attendanceHistory={attendanceHistory} 
                  refreshData={fetchData} 
                  setAttendanceHistory={setAttendanceHistory} 
                  autoOpenSessionId={autoOpenSessionId}
                  clearAutoOpenSessionId={clearAutoOpenSessionId}
                />;
    }
  };

  return (
    <ToastProvider>
        <div className="flex min-h-screen bg-[#f8f9fc] text-gray-800 font-sans">
        <Sidebar 
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
    </ToastProvider>
  );
};

export default App;
