
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Attendance from './pages/Attendance';
import Database from './pages/Database';
import OpenList from './pages/OpenList';
import PublicAttendance from './pages/PublicAttendance';
import Settings from './pages/Settings';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import OnboardingPage from './pages/OnboardingPage';
import WelcomePage from './pages/WelcomePage';
import { Worker, AttendanceSession, AttendanceRecord, Profile } from './types';
import { supabase } from './lib/supabaseClient';
import HamburgerIcon from './components/icons/HamburgerIcon';

export type Page = 'Dashboard' | 'Absensi' | 'Open List' | 'Data Base' | 'Pengaturan';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(true);
  const [currentPage, setCurrentPage] = useState<Page>('Dashboard');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isPublicMode, setIsPublicMode] = useState(false);
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  
  const [autoOpenSessionId, setAutoOpenSessionId] = useState<string | null>(null);

  useEffect(() => {
    // Check for public attendance routes first
    const path = window.location.pathname;
    if (path.startsWith('/attend/')) {
        setIsPublicMode(true);
        setAuthLoading(false);
        return;
    }
    if (path === '/signup') {
        setIsSignUpMode(true);
        setAuthLoading(false);
        return;
    }

    // Handle session and profile fetching for authenticated routes
    const fetchSessionAndProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);

      if (session) {
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', session.user.id)
          .single();
        setProfile(userProfile);
      }
      setAuthLoading(false);
    };

    fetchSessionAndProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) {
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', session.user.id)
          .single();
        setProfile(userProfile);
        // If user signs in but has no profile, profile will be null, leading to onboarding.
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const pageParam = searchParams.get('page');
    const manageId = searchParams.get('manageId');
    
    if (pageParam === 'Dashboard') {
        setCurrentPage('Dashboard');
    }
    if (manageId) {
        setAutoOpenSessionId(manageId);
        window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const [activeSession, setActiveSession] = useState<Omit<AttendanceSession, 'records' | 'id'> | null>(null);
  const [activeRecords, setActiveRecords] = useState<Omit<AttendanceRecord, 'id' | 'checkout_timestamp' | 'manual_status' | 'is_takeout'>[]>([]);

  const fetchData = useCallback(async () => {
    if (!session || !profile) return;
    setLoading(true); 
    setError(null);

    try {
        // RLS handles filtering by company_id automatically, so queries remain simple.
        const { data: workersData, error: workersError } = await supabase.from('workers').select('*');
        if (workersError) throw workersError;
        
        const { data: sessionsData, error: sessionsError } = await supabase.from('attendance_sessions').select('*');
        if (sessionsError) throw sessionsError;
        
        const { data: recordsData, error: recordsError } = await supabase.from('attendance_records').select('id, session_id, worker_id, timestamp, checkout_timestamp, manual_status, is_takeout, scan_timestamp, is_arrived');
        if (recordsError) throw recordsError;
        
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
  }, [session, profile]); 

  useEffect(() => {
    // Fetch data only if authenticated and has a profile
    if (!isPublicMode && session && profile) {
        fetchData();
    } else {
        setLoading(false); 
    }
  }, [isPublicMode, session, profile, fetchData]); 

  const clearAutoOpenSessionId = () => setAutoOpenSessionId(null);

  if (isPublicMode) return <PublicAttendance />;
  if (isSignUpMode) return <SignUpPage />;

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

  // Authentication Flow
  if (!session) {
    if (showWelcome) return <WelcomePage onEnter={() => setShowWelcome(false)} />;
    return <LoginPage />;
  }
  
  // Onboarding Flow: Authenticated but no profile yet
  if (session && !profile) {
      return <OnboardingPage />;
  }

  const renderPage = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center h-full">
          <div className="flex flex-col items-center">
             <div className="animate-bounce mb-4">
                 <img src="https://i.imgur.com/lie9EMX.png" alt="ABSENIN Logo" className="h-12 w-12 object-contain opacity-50" />
             </div>
             <div className="text-gray-400 text-xs font-bold uppercase tracking-widest">Memuat Data Perusahaan Anda...</div>
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
    <div className="flex min-h-screen bg-[#f8f9fc] text-gray-800 font-sans">
      <Sidebar 
        currentPage={currentPage} 
        setCurrentPage={setCurrentPage} 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        userProfile={profile}
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

export default App;