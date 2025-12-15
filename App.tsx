
import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Attendance from './pages/Attendance';
import Database from './pages/Database';
import OpenList from './pages/OpenList'; // Import New Page
import PublicAttendance from './pages/PublicAttendance'; // Import Public Page
import Settings from './pages/Settings'; // Import Settings Page
import { Worker, AttendanceSession, AttendanceRecord } from './types';
import { supabase } from './lib/supabaseClient';
import HamburgerIcon from './components/icons/HamburgerIcon';

export type Page = 'Dashboard' | 'Absensi' | 'Open List' | 'Data Base' | 'Pengaturan';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('Dashboard');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isPublicMode, setIsPublicMode] = useState(false);
  
  // Ref to access current workers state inside realtime callbacks without dependency loop
  const workersRef = useRef<Worker[]>([]);
  useEffect(() => {
    workersRef.current = workers;
  }, [workers]);
  
  // State for auto-opening modal in Dashboard
  const [autoOpenSessionId, setAutoOpenSessionId] = useState<string | null>(null);

  // Check URL for Public Attendance Mode OR Dashboard Redirects
  useEffect(() => {
    const path = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    
    if (path.startsWith('/attend/')) {
        setIsPublicMode(true);
    } else {
        // Handle redirect from OpenList closing
        const pageParam = searchParams.get('page');
        const manageId = searchParams.get('manageId');
        
        if (pageParam === 'Dashboard') {
            setCurrentPage('Dashboard');
        }
        if (manageId) {
            setAutoOpenSessionId(manageId);
            // Clean URL without reloading
            window.history.replaceState({}, '', '/');
        }
    }
  }, []);

  const [activeSession, setActiveSession] = useState<Omit<AttendanceSession, 'records' | 'id'> | null>(null);
  const [activeRecords, setActiveRecords] = useState<Omit<AttendanceRecord, 'id' | 'checkout_timestamp' | 'manual_status' | 'is_takeout'>[]>([]);

    const fetchData = useCallback(async () => {
    // Only set loading true on initial load
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
        
        const typedWorkers: Worker[] = workersData.map(w => ({
            ...w,
            createdAt: w.createdAt || new Date().toISOString()
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

        const history: AttendanceSession[] = sessionsData.map(session => {
            const recordsForSession = recordsBySessionId.get(session.id) || [];
            return {
                id: session.id,
                date: session.date,
                division: session.division,
                shiftTime: session.shiftTime,
                shiftId: session.shiftId,
                planMpp: session.planMpp,
                status: session.status,
                session_type: session.session_type,
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
                        is_arrived: rec.is_arrived ?? true, // Default to true if null
                    }
                }),
            };
        });
        setAttendanceHistory(history);

    } catch (err: any) {
      console.error("Fetch Data Error:", err);
      let errMsg = "An unexpected error occurred.";
      if (err instanceof Error) {
          errMsg = err.message;
      } else if (typeof err === 'object' && err !== null) {
          errMsg = err.message || err.details || JSON.stringify(err);
      } else if (typeof err === 'string') {
          errMsg = err;
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  }, []); 

  // Initial Fetch
  useEffect(() => {
    if (!isPublicMode) {
        fetchData();
    } else {
        setLoading(false); 
    }
  }, [isPublicMode]); 

  // Granular Realtime Sync Listener (No more full refreshes/flickering)
  useEffect(() => {
    if (isPublicMode) return;

    const channel = supabase.channel('global_changes')
        // --- WORKERS ---
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'workers' }, (payload) => {
            const newWorker = payload.new as Worker;
            setWorkers(prev => [...prev, newWorker]);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'workers' }, (payload) => {
            const updated = payload.new as Worker;
            setWorkers(prev => prev.map(w => w.id === updated.id ? updated : w));
            // Update names in attendance history instantly
            setAttendanceHistory(prev => prev.map(s => ({
                ...s,
                records: s.records.map(r => r.workerId === updated.id ? { ...r, fullName: updated.fullName, opsId: updated.opsId } : r)
            })));
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'workers' }, (payload) => {
             setWorkers(prev => prev.filter(w => w.id !== payload.old.id));
        })

        // --- SESSIONS ---
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance_sessions' }, (payload) => {
            const newSession = payload.new as AttendanceSession;
            setAttendanceHistory(prev => [{ ...newSession, records: [] }, ...prev]);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'attendance_sessions' }, (payload) => {
             const updated = payload.new as AttendanceSession;
             setAttendanceHistory(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'attendance_sessions' }, (payload) => {
            setAttendanceHistory(prev => prev.filter(s => s.id !== payload.old.id));
        })

        // --- RECORDS (Surgical updates) ---
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance_records' }, (payload) => {
            const newRecordDB = payload.new;
             setAttendanceHistory(prev => prev.map(s => {
                if (s.id === newRecordDB.session_id) {
                     const worker = workersRef.current.find(w => w.id === newRecordDB.worker_id);
                     const enrichedRecord: AttendanceRecord = {
                         id: newRecordDB.id,
                         workerId: newRecordDB.worker_id,
                         opsId: worker?.opsId || 'Unknown',
                         fullName: worker?.fullName || 'Unknown',
                         timestamp: newRecordDB.timestamp,
                         scan_timestamp: newRecordDB.scan_timestamp,
                         checkout_timestamp: newRecordDB.checkout_timestamp,
                         manual_status: newRecordDB.manual_status,
                         is_takeout: newRecordDB.is_takeout,
                         is_arrived: newRecordDB.is_arrived ?? true
                     };
                     // Prevent duplicate if any
                     if(s.records.some(r => r.id === newRecordDB.id)) return s;
                     // Add to top of list
                     return { ...s, records: [enrichedRecord, ...s.records] };
                }
                return s;
             }));
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'attendance_records' }, (payload) => {
            const updated = payload.new;
            setAttendanceHistory(prev => prev.map(s => {
                if (s.id === updated.session_id) {
                    return {
                        ...s,
                        records: s.records.map(r => r.id === updated.id ? { ...r, ...updated, is_arrived: updated.is_arrived ?? r.is_arrived } : r)
                    };
                }
                return s;
            }));
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'attendance_records' }, (payload) => {
            const oldRecord = payload.old;
            setAttendanceHistory(prev => prev.map(s => ({
                ...s,
                records: s.records.filter(r => r.id !== oldRecord.id)
            })));
        })
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
  }, [isPublicMode]); // Only re-subscribe if public mode changes

  // If Public Mode, Render Public Component Directly
  if (isPublicMode) {
      return <PublicAttendance />;
  }

  const renderPage = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center h-full">
          <div className="flex flex-col items-center">
             <div className="animate-pulse mb-4">
                 <img src="/favicon/favicon.svg" alt="Nexus Logo" className="h-16 w-16 opacity-80" />
             </div>
             <div className="text-gray-500 text-sm font-medium">Memuat data...</div>
          </div>
        </div>
      );
    }
    if (error) {
       return (
        <div className="flex flex-col justify-center items-center h-full p-4 bg-gray-50 rounded-xl">
           <div className="text-center p-8 bg-white rounded-xl shadow-lg border border-red-100 max-w-md">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">Terjadi Kesalahan</h2>
                <p className="text-gray-600 mb-6 font-mono text-sm break-words bg-gray-50 p-3 rounded border overflow-auto max-h-40">{error}</p>
                <button 
                    onClick={() => { setError(null); fetchData(); }}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-md"
                >
                    Coba Lagi
                </button>
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
                  autoOpenSessionId={autoOpenSessionId} // Pass auto-open ID
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
                />;
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-100 text-gray-800 font-sans">
      <Sidebar 
        currentPage={currentPage} 
        setCurrentPage={setCurrentPage} 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="lg:hidden p-4 flex justify-between items-center bg-white border-b shrink-0">
           <div>
              <h1 className="text-lg font-bold text-blue-600">ABSENSI NEXUS</h1>
              <p className="text-xs text-gray-500">SUNTER DC</p>
           </div>
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-gray-600">
            <HamburgerIcon />
          </button>
        </div>
        <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
            {renderPage()}
        </div>
      </main>
    </div>
  );
};

export default App;
