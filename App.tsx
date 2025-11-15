import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Attendance from './pages/Attendance';
import Database from './pages/Database';
import { Worker, AttendanceSession, AttendanceRecord } from './types';
import { supabase } from './lib/supabaseClient';

export type Page = 'Dashboard' | 'Absensi' | 'Data Base';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('Dashboard');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State for the active attendance session - NOW INCLUDES DATE
  const [activeSession, setActiveSession] = useState<Omit<AttendanceSession, 'records' | 'id'> | null>(null);
  const [activeRecords, setActiveRecords] = useState<Omit<AttendanceRecord, 'id' | 'checkout_timestamp' | 'manual_status' | 'is_takeout'>[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch workers
      const { data: workersData, error: workersError } = await supabase
        .from('workers')
        .select('*')
        .order('createdAt', { ascending: false });
      if (workersError) throw workersError;
      
      const typedWorkers: Worker[] = workersData.map(w => ({
          ...w,
          createdAt: w.createdAt || new Date().toISOString()
      }));
      setWorkers(typedWorkers);

      // Create a map of workers for efficient lookup
      const workerMap = new Map<string, Worker>();
      typedWorkers.forEach(worker => {
          if (worker.id) {
              workerMap.set(worker.id, worker);
          }
      });

      // Fetch attendance sessions
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('attendance_sessions')
        .select('*')
        .order('date', { ascending: false });
      if (sessionsError) throw sessionsError;

      // Fetch all attendance records
      const { data: recordsData, error: recordsError } = await supabase
        .from('attendance_records')
        .select('id, session_id, worker_id, timestamp, checkout_timestamp, manual_status, is_takeout'); // Ensure new fields are selected
      if (recordsError) throw recordsError;

      // Create a map of records by session_id for efficient lookup
      const recordsBySessionId = new Map<string, any[]>();
      recordsData.forEach(record => {
          if (!recordsBySessionId.has(record.session_id)) {
              recordsBySessionId.set(record.session_id, []);
          }
          recordsBySessionId.get(record.session_id)!.push(record);
      });

      // Join the data on the client side
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
                 id: rec.id, // Add the record's primary key
                 workerId: rec.worker_id,
                 opsId: worker?.opsId || 'N/A',
                 fullName: worker?.fullName || 'Unknown',
                 timestamp: rec.timestamp,
                 checkout_timestamp: rec.checkout_timestamp, // Add the checkout time
                 manual_status: rec.manual_status, // Add the manual status
                 is_takeout: rec.is_takeout, // Add the takeout status
             }
          }),
        };
      });
      setAttendanceHistory(history);

    } catch (err: any) {
      console.error("Detailed Error:", err); // Log the full object to the console for debugging

      // Robust error serialization to prevent "[object Object]"
      const getCircularReplacer = () => {
        const seen = new WeakSet();
        return (key: any, value: any) => {
          if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
              return "[Circular Reference]";
            }
            seen.add(value);
          }
          return value;
        };
      };

      let detailedMessage;
      try {
        detailedMessage = JSON.stringify(err, getCircularReplacer(), 2);
      } catch (e) {
        detailedMessage = "Could not serialize the error object. Please check the browser console for more details.";
      }


      // Add a specific, helpful suggestion for the most common problem
      const errorMessageString = (typeof err?.message === 'string') ? err.message : '';
      if (errorMessageString.includes("relation") && errorMessageString.includes("does not exist")) {
          detailedMessage += `\n\n----------------------------------------------------------------\n\n**Suggestion:**\nThis error means a required table could not be found in your database.\n\nPlease go to your Supabase project's **Table Editor** and ensure you have created the following tables with these exact names:\n- \`workers\`\n- \`attendance_sessions\`\n- \`attendance_records\`\n\nCheck carefully for any typos in the table names.`;
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
      return <div className="flex justify-center items-center h-full text-xl">Loading data from Supabase...</div>;
    }
    if (error) {
       return (
        <div className="flex flex-col justify-center items-center h-full text-xl text-red-400 p-4">
          <div className="bg-gray-800 p-6 rounded-lg border border-red-500/50 shadow-lg w-full max-w-3xl">
            <p className="font-bold text-2xl mb-4 text-white">Error: Could not fetch data</p>
            <p className="text-base text-gray-400 mb-4">
              There was a problem communicating with the database. This is usually due to a misconfiguration in your Supabase project (like a missing or misnamed table).
            </p>
            <p className="text-sm font-semibold text-gray-300 mb-2">Detailed Error from Supabase:</p>
            <pre className="text-xs text-left bg-gray-900 p-4 rounded-lg w-full overflow-x-auto whitespace-pre-wrap">{error}</pre>
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
    <div className="flex min-h-screen bg-gray-900 text-gray-200 font-sans">
      <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      <main className="flex-1 p-8 overflow-auto">
        {renderPage()}
      </main>
    </div>
  );
};

export default App;