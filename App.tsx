
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
import UpdatePasswordPage from './pages/UpdatePasswordPage';
import { Worker, AttendanceSession, AttendanceRecord } from './types';
import { supabase } from './lib/supabaseClient';
import HamburgerIcon from './components/icons/HamburgerIcon';
import { ToastProvider } from './contexts/ToastContext';

export type Page = 'Dashboard' | 'Absensi' | 'Open List' | 'Data Base' | 'Pengaturan';
type AuthAction = 'IDLE' | 'RECOVERY';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authAction, setAuthAction] = useState<AuthAction>('IDLE');
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      
      setAuthAction(currentAuthAction => {
        if (event === 'PASSWORD_RECOVERY') {
          return 'RECOVERY';
        }
        // If we are currently in recovery, only a SIGNED_OUT event can pull us out.
        if (currentAuthAction === 'RECOVERY' && event !== 'SIGNED_OUT') {
          return 'RECOVERY'; 
        }
        // Otherwise, default to IDLE.
        return 'IDLE';
      });

      setAuthLoading(false);
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
    if (!isPublicMode && session && authAction !== 'RECOVERY') {
        fetchData();
    } else {
        setLoading(false); 
    }
  }, [isPublicMode, session, fetchData, authAction]); 
  
  // Real-time data synchronization
  useEffect(() => {
    if (!session || isPublicMode) return;
    
    // --- Granular updates for frequently changing attendance data ---
    const handleAttendanceChanges = (payload: any) => {
      const workerMap = new Map<string, Worker>();
      // Use the ref which is always up-to-date with the 'workers' state
      workersRef.current.forEach(worker => {
          if (worker.id) {
              workerMap.set(worker.id, worker);
          }
      });

      const enrichRecord = (record: any): AttendanceRecord => {
          const worker = workerMap.get(record.worker_id);
          return {
              id: record.id,
              workerId: record.worker_id,
              opsId: worker?.opsId || 'N/A',
              fullName: worker?.fullName || 'Unknown',
              timestamp: record.timestamp,
              scan_timestamp: record.scan_timestamp,
              checkout_timestamp: record.checkout_timestamp,
              manual_status: record.manual_status,
              is_takeout: record.is_takeout,
              is_arrived: record.is_arrived ?? true,
          };
      };
      
      setAttendanceHistory(currentHistory => {
        let newHistory = [...currentHistory];
        
        // Handle Session Changes
        if (payload.table === 'attendance_sessions') {
            const sessionIndex = newHistory.findIndex(s => s.id === (payload.new?.id || payload.old?.id));

            if (payload.eventType === 'INSERT') {
                if (sessionIndex > -1) return newHistory; // Already exists
                const newSessionData = payload.new;
                const newSession: AttendanceSession = {
                    id: newSessionData.id, date: newSessionData.date, division: newSessionData.division,
                    shiftTime: newSessionData.shift_time, shiftId: newSessionData.shift_id,
                    planMpp: newSessionData.plan_mpp, status: newSessionData.status,
                    session_type: newSessionData.session_type, auto_close: newSessionData.auto_close,
                    records: [],
                };
                return [newSession, ...newHistory];
            } else if (payload.eventType === 'UPDATE') {
                if (sessionIndex > -1) {
                    const updatedSessionData = payload.new;
                    newHistory[sessionIndex] = {
                        ...newHistory[sessionIndex], // keep records
                        date: updatedSessionData.date, division: updatedSessionData.division,
                        shiftTime: updatedSessionData.shift_time, shiftId: updatedSessionData.shift_id,
                        planMpp: updatedSessionData.plan_mpp, status: updatedSessionData.status,
                        session_type: updatedSessionData.session_type, auto_close: updatedSessionData.auto_close,
                    };
                    return [...newHistory];
                }
            } else if (payload.eventType === 'DELETE') {
                return newHistory.filter(s => s.id !== payload.old.id);
            }
        }

        // Handle Record Changes
        if (payload.table === 'attendance_records') {
            const sessionId = payload.new?.session_id || payload.old?.session_id;
            if (!sessionId) return newHistory;

            const sessionIndex = newHistory.findIndex(s => s.id === sessionId);
            if (sessionIndex === -1) return newHistory;

            const targetSession = { ...newHistory[sessionIndex] };
            let updatedRecords = [...targetSession.records];

            if (payload.eventType === 'INSERT') {
                const newRecord = enrichRecord(payload.new);
                if (!updatedRecords.some(r => r.id === newRecord.id)) {
                  updatedRecords.push(newRecord);
                }
            } else if (payload.eventType === 'UPDATE') {
                const updatedRecord = enrichRecord(payload.new);
                const recordIndex = updatedRecords.findIndex(r => r.id === updatedRecord.id);
                if (recordIndex > -1) {
                    updatedRecords[recordIndex] = updatedRecord;
                } else {
                    updatedRecords.push(updatedRecord);
                }
            } else if (payload.eventType === 'DELETE') {
                updatedRecords = updatedRecords.filter(r => r.id !== payload.old.id);
            }
            
            targetSession.records = updatedRecords;
            newHistory[sessionIndex] = targetSession;
            return [...newHistory];
        }

        return currentHistory;
      });
    };
    
    // Channel for frequent data
    const attendanceChannel = supabase
      .channel('attendance-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_sessions' }, handleAttendanceChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, handleAttendanceChanges)
      .subscribe();
      
    // Channel for foundational data that triggers a full refetch
    const foundationalDataChannel = supabase
      .channel('foundational-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workers' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'master_data' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(attendanceChannel);
      supabase.removeChannel(foundationalDataChannel);
    };
  }, [session, isPublicMode, fetchData]);


  // Fungsi untuk membersihkan state auto-open setelah digunakan
  const clearAutoOpenSessionId = () => {
    setAutoOpenSessionId(null);
  };

  if (isPublicMode) {
      return <PublicAttendance />;
  }

  // Handle password recovery state BEFORE checking for session
  if (authAction === 'RECOVERY') {
    return (
      <ToastProvider>
        <UpdatePasswordPage />
      </ToastProvider>
    );
  }

  if (authLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="animate-pulse">
             <img src="https://i.imgur.com/lie9EMX.png" alt="ABSENIN Logo" className="h-24 w-24 object-contain" />
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
          return <OpenList 
                    workers={workers} 
                    setCurrentPage={setCurrentPage}
                    setAutoOpenSessionId={setAutoOpenSessionId}
                 />;
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
