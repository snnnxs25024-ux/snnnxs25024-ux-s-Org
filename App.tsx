import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Attendance from './pages/Attendance';
import Database from './pages/Database';
import { useLocalStorage } from './hooks/useLocalStorage';
import { Worker, AttendanceSession, AttendanceRecord } from './types';
import { initialWorkers } from './data/initialData';

export type Page = 'Dashboard' | 'Absensi' | 'Data Base';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('Dashboard');
  const [workers, setWorkers] = useLocalStorage<Worker[]>('workers', initialWorkers);
  const [attendanceHistory, setAttendanceHistory] = useLocalStorage<AttendanceSession[]>('attendanceHistory', []);

  // State for the active attendance session, lifted up to persist across pages
  const [activeSession, setActiveSession] = useState<Omit<AttendanceSession, 'records' | 'date' | 'id'> | null>(null);
  const [activeRecords, setActiveRecords] = useState<AttendanceRecord[]>([]);


  const renderPage = () => {
    switch (currentPage) {
      case 'Dashboard':
        return <Dashboard workers={workers} attendanceHistory={attendanceHistory} setAttendanceHistory={setAttendanceHistory} />;
      case 'Absensi':
        return <Attendance 
                  workers={workers} 
                  attendanceHistory={attendanceHistory} 
                  setAttendanceHistory={setAttendanceHistory}
                  activeSession={activeSession}
                  setActiveSession={setActiveSession}
                  activeRecords={activeRecords}
                  setActiveRecords={setActiveRecords}
               />;
      case 'Data Base':
        return <Database workers={workers} setWorkers={setWorkers} />;
      default:
        return <Dashboard workers={workers} attendanceHistory={attendanceHistory} setAttendanceHistory={setAttendanceHistory} />;
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