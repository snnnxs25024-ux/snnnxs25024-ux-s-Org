import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore
import { v4 as uuidv4 } from 'uuid';
import Modal from '../components/Modal';
import { Worker, AttendanceSession, AttendanceRecord } from '../types';

interface AttendanceProps {
  workers: Worker[];
  attendanceHistory: AttendanceSession[];
  setAttendanceHistory: React.Dispatch<React.SetStateAction<AttendanceSession[]>>;
  activeSession: Omit<AttendanceSession, 'records' | 'date' | 'id'> | null;
  setActiveSession: React.Dispatch<React.SetStateAction<Omit<AttendanceSession, 'records' | 'date' | 'id'> | null>>;
  activeRecords: AttendanceRecord[];
  setActiveRecords: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>;
}

const divisionToDepartmentMap: { [key: string]: Worker['department'] | Worker['department'][] } = {
    'ASM2': 'SOC Operator',
    'CACHE': 'Cache',
    'INVENTORY': 'Inventory',
    'RETURN': 'Return',
    'TP SUNTER 1': ['SOC Operator', 'Cache', 'Return', 'Inventory'],
    'TP SUNTER 2': ['SOC Operator', 'Cache', 'Return', 'Inventory'],
};

const Attendance: React.FC<AttendanceProps> = ({ 
  workers, 
  setAttendanceHistory,
  activeSession,
  setActiveSession,
  activeRecords,
  setActiveRecords,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(!activeSession);
  const [opsIdInput, setOpsIdInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeSession) {
      setIsModalOpen(false);
      inputRef.current?.focus();
    }
  }, [activeSession]);
  
  useEffect(() => {
    if(!isModalOpen && activeSession) {
        inputRef.current?.focus();
    }
  }, [isModalOpen, activeSession])

  const handleStartSession = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const division = formData.get('division') as string;
    const shiftTime = formData.get('shiftTime') as string;
    const shiftId = formData.get('shiftId') as string;
    const planMpp = parseInt(formData.get('planMpp') as string, 10);

    if (division && shiftTime && shiftId && planMpp > 0) {
      setActiveSession({ division, shiftTime, shiftId, planMpp });
      setActiveRecords([]);
      setError(null);
    }
  };
  
  const handleScan = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!opsIdInput.trim() || !activeSession) return;

      const worker = workers.find(w => w.opsId.toLowerCase() === opsIdInput.toLowerCase() && w.status === 'Active');

      if (!worker) {
          setError(`Worker with OpsID "${opsIdInput}" not found or is inactive.`);
          setOpsIdInput('');
          return;
      }
      
      const allowedDepartment = divisionToDepartmentMap[activeSession.division];
      if (allowedDepartment) {
          const isAllowed = Array.isArray(allowedDepartment) 
              ? allowedDepartment.includes(worker.department)
              : worker.department === allowedDepartment;
          
          if (!isAllowed) {
              setError(`Worker ${worker.fullName} (${worker.department}) is not allowed in ${activeSession.division} division.`);
              setOpsIdInput('');
              return;
          }
      }

      if (activeRecords.some(r => r.opsId === worker.opsId)) {
          setError(`Worker ${worker.fullName} has already been scanned.`);
          setOpsIdInput('');
          return;
      }

      const newRecord: AttendanceRecord = {
          workerId: worker.id,
          opsId: worker.opsId,
          fullName: worker.fullName,
          timestamp: new Date().toISOString(),
      };

      setActiveRecords(prev => [newRecord, ...prev]);
      setError(null);
      setOpsIdInput('');
  };

  const handleEndSession = () => {
    if(activeSession && activeRecords.length > 0) {
        const newSession: AttendanceSession = {
            id: uuidv4(),
            ...activeSession,
            date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
            records: activeRecords
        };
        setAttendanceHistory(prev => [...prev, newSession]);
    }
    setActiveSession(null);
    setActiveRecords([]);
    setIsModalOpen(true);
  }

  const getFulfillmentStatus = () => {
      if (!activeSession) return { text: '', color: '' };
      const actual = activeRecords.length;
      const planned = activeSession.planMpp;
      if (actual < planned) return { text: 'GAP', color: 'text-red-400' };
      if (actual === planned) return { text: 'FULL FILL', color: 'text-green-400' };
      return { text: 'FULL FILL BUFFER', color: 'text-yellow-400' };
  }

  const fulfillmentStatus = getFulfillmentStatus();

  const shiftTimeOptions = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, '0');
    return `${hour}:00`;
  });

  return (
    <div>
      <h1 className="text-4xl font-bold text-white mb-8">Attendance</h1>

      {activeSession ? (
        <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4 bg-gray-800 p-4 rounded-lg border border-gray-700">
                <div>
                    <p className="text-gray-400">Division: <span className="font-semibold text-white">{activeSession.division}</span></p>
                    <p className="text-gray-400">Shift: <span className="font-semibold text-white">{activeSession.shiftTime} ({activeSession.shiftId})</span></p>
                </div>
                <div className="text-center">
                    <p className="text-gray-400">MPP Counter</p>
                    <p className="text-3xl font-bold text-teal-400">{activeSession.planMpp - activeRecords.length}</p>
                </div>
                <div className="text-center">
                    <p className="text-gray-400">Status</p>
                    <p className={`text-3xl font-bold ${fulfillmentStatus.color}`}>{fulfillmentStatus.text}</p>
                </div>
                 <button onClick={handleEndSession} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                    End Session
                </button>
            </div>

            <form onSubmit={handleScan} className="flex gap-4">
                <input
                    ref={inputRef}
                    type="text"
                    value={opsIdInput}
                    onChange={(e) => setOpsIdInput(e.target.value)}
                    placeholder="Scan or type OpsID..."
                    className="flex-grow bg-gray-700 border border-gray-600 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">
                    Submit
                </button>
            </form>
             {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-lg">{error}</p>}
            
            <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden border border-gray-700">
                 <div className="overflow-y-auto max-h-[calc(100vh-380px)]">
                    <table className="w-full text-left">
                        <thead className="bg-gray-700 sticky top-0">
                            <tr>
                                <th className="p-3">OpsID</th>
                                <th className="p-3">Nama Lengkap</th>
                                <th className="p-3">Shift Jam Masuk</th>
                                <th className="p-3">Shift ID</th>
                                <th className="p-3">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activeRecords.map(record => (
                                <tr key={record.workerId} className="border-b border-gray-700 hover:bg-gray-700/50">
                                    <td className="p-3">{record.opsId}</td>
                                    <td className="p-3">{record.fullName}</td>
                                    <td className="p-3">{activeSession.shiftTime}</td>
                                    <td className="p-3">{activeSession.shiftId}</td>
                                    <td className="p-3 text-green-400 font-semibold">Hadir</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      ) : (
        <div className="text-center pt-16">
          <h2 className="text-2xl text-gray-400 mb-4">No Active Session</h2>
          <p className="text-gray-500 mb-8">Click the button below to start tracking attendance.</p>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-6 rounded-lg transition-colors shadow-lg hover:shadow-teal-500/50"
          >
            Start New Session
          </button>
        </div>
      )}

      <Modal isOpen={isModalOpen && !activeSession} onClose={() => setIsModalOpen(false)} title="Start Attendance Session">
        <form onSubmit={handleStartSession} className="space-y-4">
          <div>
            <label htmlFor="division" className="block mb-2 text-sm font-medium text-gray-300">Divisi</label>
            <select id="division" name="division" required className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option>ASM2</option>
              <option>CACHE</option>
              <option>TP SUNTER 1</option>
              <option>TP SUNTER 2</option>
              <option>INVENTORY</option>
              <option>RETURN</option>
            </select>
          </div>
          <div>
            <label htmlFor="shiftTime" className="block mb-2 text-sm font-medium text-gray-300">Shift Jam (WIB)</label>
            <select id="shiftTime" name="shiftTime" required className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500">
              {shiftTimeOptions.map(time => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="shiftId" className="block mb-2 text-sm font-medium text-gray-300">Shift ID</label>
             <select id="shiftId" name="shiftId" required className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option>S1</option>
              <option>S2</option>
              <option>S3</option>
              <option>NS1</option>
              <option>NS2</option>
            </select>
          </div>
          <div>
            <label htmlFor="planMpp" className="block mb-2 text-sm font-medium text-gray-300">Plan MPP</label>
            <input type="number" id="planMpp" name="planMpp" min="1" required className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div className="pt-4">
            <button type="submit" className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-lg transition-colors">
              Start Session
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Attendance;