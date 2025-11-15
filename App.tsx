import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Attendance from './pages/Attendance';
import Database from './pages/Database';
import { Worker, AttendanceSession, AttendanceRecord } from './types';
import { supabase } from './lib/supabaseClient';
import HamburgerIcon from './components/icons/HamburgerIcon';

export type Page = 'Dashboard' | 'Absensi' | 'Data Base';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('Dashboard');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [activeSession, setActiveSession] = useState<Omit<AttendanceSession, 'records' | 'id'> | null>(null);
  const [activeRecords, setActiveRecords] = useState<Omit<AttendanceRecord, 'id' | 'checkout_timestamp' | 'manual_status' | 'is_takeout'>[]>([]);

    const fetchData = useCallback(async () => {
    setLoading(true);
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

                allData = [...allData, ...data];
                lastData = data;
                page++;
            } while (lastData && lastData.length === pageSize);
            
            return allData;
        };

        const workersData = await fetchAll('workers', '*');
        const sessionsData = await fetchAll('attendance_sessions', '*');
        const recordsData = await fetchAll('attendance_records', 'id, session_id, worker_id, timestamp, checkout_timestamp, manual_status, is_takeout');
        
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
                records: recordsForSession.map((rec: any) => {
                    const worker = workerMap.get(rec.worker_id);
                    return {
                        id: rec.id,
                        workerId: rec.worker_id,
                        opsId: worker?.opsId || 'N/A',
                        fullName: worker?.fullName || 'Unknown',
                        timestamp: rec.timestamp,
                        checkout_timestamp: rec.checkout_timestamp,
                        manual_status: rec.manual_status,
                        is_takeout: rec.is_takeout,
                    }
                }),
            };
        });
        setAttendanceHistory(history);

    } catch (err: any) {
      console.error("Detailed Error:", err);
      const getCircularReplacer = () => {
        const seen = new WeakSet();
        return (key: any, value: any) => {
          if (typeof value === "object" && value !== null) {
            if (seen.has(value)) return "[Circular Reference]";
            seen.add(value);
          }
          return value;
        };
      };
      let detailedMessage = JSON.stringify(err, getCircularReplacer(), 2);
      const errorMessageString = (typeof err?.message === 'string') ? err.message : '';
      if (errorMessageString.includes("relation") && errorMessageString.includes("does not exist")) {
          detailedMessage += `\n\n**Suggestion:**\nA required table was not found. Please ensure these tables exist in your Supabase project: \`workers\`, \`attendance_sessions\`, \`attendance_records\`.`;
      }
      setError(detailedMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const renderPage = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center h-full">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      );
    }
    if (error) {
       return (
        <div className="flex flex-col justify-center items-center h-full p-4">
          <div className="bg-white p-6 rounded-lg border border-red-200 shadow-lg w-full max-w-3xl">
            <h2 className="font-bold text-2xl mb-4 text-red-700">Error: Could not fetch data</h2>
            <p className="text-base text-gray-600 mb-4">
              There was a problem communicating with the database. This is usually due to a misconfiguration in your Supabase project (like a missing or misnamed table).
            </p>
            <p className="text-sm font-semibold text-gray-700 mb-2">Detailed Error from Supabase:</p>
            <pre className="text-xs text-left bg-gray-50 p-4 rounded-lg w-full overflow-x-auto whitespace-pre-wrap">{error}</pre>
          </div>
        </div>
      );
    }

    switch (currentPage) {
      case 'Dashboard':
        return <Dashboard workers={workers} attendanceHistory={attendanceHistory} refreshData={fetchData} />;
      case 'Absensi':
        return <Attendance 
                  workers={workers} 
                  refreshData={fetchData}
                  activeSession={activeSession}
                  setActiveSession={setActiveSession}
                  activeRecords={activeRecords}
                  setActiveRecords={setActiveRecords}
               />;
      case 'Data Base':
        return <Database workers={workers} refreshData={fetchData} />;
      default:
        return <Dashboard workers={workers} attendanceHistory={attendanceHistory} refreshData={fetchData} />;
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
      <main className="flex-1 flex flex-col">
        <div className="lg:hidden p-4 flex justify-between items-center bg-white border-b">
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