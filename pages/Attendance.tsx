// Fix: Import `useMemo` from 'react' to resolve the "Cannot find name 'useMemo'" error.
import React, { useState, useEffect, useRef, useMemo } from 'react';
// @ts-ignore
import { v4 as uuidv4 } from 'uuid';
import Modal from '../components/Modal';
import { Worker, AttendanceSession, AttendanceRecord } from '../types';
import { supabase } from '../lib/supabaseClient';
import DeleteIcon from '../components/icons/DeleteIcon';

interface AttendanceProps {
  workers: Worker[];
  refreshData: () => void;
  activeSession: Omit<AttendanceSession, 'records' | 'id'> | null;
  setActiveSession: React.Dispatch<React.SetStateAction<Omit<AttendanceSession, 'records' | 'id'> | null>>;
  activeRecords: Omit<AttendanceRecord, 'id' | 'checkout_timestamp' | 'manual_status' | 'is_takeout'>[];
  setActiveRecords: React.Dispatch<React.SetStateAction<Omit<AttendanceRecord, 'id' | 'checkout_timestamp' | 'manual_status' | 'is_takeout'>[]>>;
}

const divisionToDepartmentMap: { [key: string]: Worker['department'] | Worker['department'][] } = {
    'ASM2': 'SOC Operator',
    'CACHE': 'Cache',
    'INVENTORY': 'Inventory',
    'RETURN': 'Return',
    'TP SUNTER 1': ['SOC Operator', 'Cache', 'Return', 'Inventory'],
    'TP SUNTER 2': ['SOC Operator', 'Cache', 'Return', 'Inventory'],
};

const shiftIdOptions = [
    'SOCSTROPS0009 Shift 00 00:00 - 09:00',
    'SOCSTROPS0110 Shift 01 01:00 - 10:00',
    'SOCSTROPS0211 Shift 02 02:00 - 11:00',
    'SOCSTROPS0312 Shift 03 03:00 - 15:00',
    'SOCSTROPS0413 Shift 04 04:00 - 16:00',
    'SOCSTROPS0514 Shift 05 05:00 - 17:00',
    'SOCSTROPS0615 Shift 06 06:00 - 15:00',
    'SOCSTROPS0716 Shift 07 07:00 - 19:00',
    'SOCSTROPS0817 Shift 08 08:00 - 20:00',
    'SOCSTROPS0918 Shift 09 09:00 - 18:00',
    'SOCSTROPS1019 Shift 10 10:00 - 22:00',
    'SOCSTROPS1120 Shift 11 11:00 - 23:00',
    'SOCSTROPS1221 Shift 12 12:00 - 00:00',
    'SOCSTROPS1322 Shift 13 13:00 - 22:00',
    'SOCSTROPS1423 Shift 14 14:00 - 02:00',
    'SOCSTROPS1500 Shift 15 15:00 - 03:00',
    'SOCSTROPS1601 Shift 16 16:00 - 04:00',
    'SOCSTROPS1702 Shift 17 17:00 - 02:00',
    'SOCSTROPS1803 Shift 18 18:00 - 06:00',
    'SOCSTROPS1904 Shift 19 19:00 - 07:00',
    'SOCSTROPS2005 Shift 20 20:00 - 05:00',
    'SOCSTROPS2207 Shift 22 22:00 - 10:00',
    'SOCSTROPS2308 Shift 23 23:00 - 08:00',
];


const Attendance: React.FC<AttendanceProps> = ({ 
  workers, 
  refreshData,
  activeSession,
  setActiveSession,
  activeRecords,
  setActiveRecords,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(!activeSession);
  const [opsIdInput, setOpsIdInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Helper to get today's date in YYYY-MM-DD format for the input default
  const getTodayString = () => new Date().toISOString().split('T')[0];

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
    const date = formData.get('sessionDate') as string;
    const division = formData.get('division') as string;
    const shiftTime = formData.get('shiftTime') as string;
    const shiftId = formData.get('shiftId') as string;
    const planMpp = parseInt(formData.get('planMpp') as string, 10);

    if (date && division && shiftTime && shiftId && planMpp > 0) {
      setActiveSession({ date, division, shiftTime, shiftId, planMpp });
      setActiveRecords([]);
      setError(null);
    }
  };
  
  const handleScan = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!opsIdInput.trim() || !activeSession) return;

      const worker = workers.find(w => w.opsId.toLowerCase() === opsIdInput.toLowerCase() && w.status === 'Active');

      if (!worker || !worker.id) {
          setError(`Worker with OpsID "${opsIdInput}" not found, is inactive, or has a database ID issue.`);
          setOpsIdInput('');
          return;
      }

      // Check if worker is already in an active (non-checked-out) session
      const { data: activeCheckin, error: activeCheckinError } = await supabase
        .from('attendance_records')
        .select('id')
        .eq('worker_id', worker.id)
        .is('checkout_timestamp', null)
        .limit(1)
        .single();

      if (activeCheckin) {
          setError(`Worker ${worker.fullName} is already checked in and has not checked out yet.`);
          setOpsIdInput('');
          return;
      }

      // Fetch the last record to check for same-day checkout and cooldown
      const { data: lastRecord, error: lastRecordError } = await supabase
        .from('attendance_records')
        .select('checkout_timestamp')
        .eq('worker_id', worker.id)
        .not('checkout_timestamp', 'is', null) // Ensure we only get records where they've checked out
        .order('checkout_timestamp', { ascending: false })
        .limit(1)
        .single();
      
      if(lastRecord && lastRecord.checkout_timestamp){
        const lastCheckoutDate = new Date(lastRecord.checkout_timestamp);
        const today = new Date();
        
        // Rule 1: Check if already checked out on the same calendar day
        if (
            lastCheckoutDate.getFullYear() === today.getFullYear() &&
            lastCheckoutDate.getMonth() === today.getMonth() &&
            lastCheckoutDate.getDate() === today.getDate()
        ) {
            setError(`Worker ${worker.fullName} has already completed a shift today.`);
            setOpsIdInput('');
            return;
        }

        // Rule 2: Check for 9-hour cooldown period
        const lastCheckoutTime = lastCheckoutDate.getTime();
        const now = today.getTime();
        const nineHoursInMillis = 9 * 60 * 60 * 1000;

        if((now - lastCheckoutTime) < nineHoursInMillis){
            const timeLeft = nineHoursInMillis - (now - lastCheckoutTime);
            const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
            const minutesLeft = Math.ceil((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            setError(`Worker ${worker.fullName} cannot check in yet. Cooldown period active for another ${hoursLeft}h ${minutesLeft}m.`);
            setOpsIdInput('');
            return;
        }
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
          setError(`Worker ${worker.fullName} has already been scanned in this session.`);
          setOpsIdInput('');
          return;
      }

      const newRecord: Omit<AttendanceRecord, 'id' | 'checkout_timestamp' | 'manual_status' | 'is_takeout'> = {
          workerId: worker.id,
          opsId: worker.opsId,
          fullName: worker.fullName,
          timestamp: new Date().toISOString(),
      };

      setActiveRecords(prev => [newRecord, ...prev]);
      setError(null);
      setOpsIdInput('');
  };

  const handleEndSession = async () => {
    if(!activeSession) return;
    setIsEndingSession(true);

    try {
        if(activeRecords.length > 0) {
            // 1. Insert the session
            const newSessionId = uuidv4();
            const { error: sessionError } = await supabase
                .from('attendance_sessions')
                .insert({
                    id: newSessionId,
                    date: activeSession.date, // Use selected date from active session
                    division: activeSession.division,
                    shiftTime: activeSession.shiftTime,
                    shiftId: activeSession.shiftId,
                    planMpp: activeSession.planMpp
                });
            
            if (sessionError) throw sessionError;

            // 2. Prepare and insert all records
            const recordsToInsert = activeRecords.map(rec => ({
                session_id: newSessionId,
                worker_id: rec.workerId,
                timestamp: rec.timestamp
            }));

            const { error: recordsError } = await supabase
                .from('attendance_records')
                .insert(recordsToInsert);

            if (recordsError) throw recordsError;
        }

        // 3. Reset state and refresh data
        setActiveSession(null);
        setActiveRecords([]);
        setIsModalOpen(true);
        refreshData();

    } catch(err: any) {
        setError(`Failed to save session: ${err.message}`);
    } finally {
        setIsEndingSession(false);
    }
  }

  const handleRemoveActiveRecord = (workerIdToRemove: string) => {
    setActiveRecords(prev => prev.filter(record => record.workerId !== workerIdToRemove));
  };
  
  const mppCounter = useMemo(() => {
    if (!activeSession) return { text: '0', color: 'text-teal-400' };
    const remaining = activeSession.planMpp - activeRecords.length;
    if (remaining < 0) {
        return { text: `+${Math.abs(remaining)}`, color: 'text-yellow-400' };
    }
    return { text: `${remaining}`, color: 'text-teal-400' };
  }, [activeSession, activeRecords]);

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
    const startHour = i;
    const endHour = (startHour + 9) % 24;
    const startTime = startHour.toString().padStart(2, '0') + ':00';
    const endTime = endHour.toString().padStart(2, '0') + ':00';
    return `${startTime} - ${endTime}`;
  });

  return (
    <div>
      <h1 className="text-4xl font-bold text-white mb-8">Attendance</h1>

      {activeSession ? (
        <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4 bg-gray-800 p-4 rounded-lg border border-gray-700">
                <div>
                    <p className="text-gray-400">Tanggal Sesi: <span className="font-semibold text-white">{activeSession.date}</span></p>
                    <p className="text-gray-400">Division: <span className="font-semibold text-white">{activeSession.division}</span></p>
                    <p className="text-gray-400">Shift: <span className="font-semibold text-white">{activeSession.shiftTime} ({activeSession.shiftId})</span></p>
                </div>
                <div className="text-center">
                    <p className="text-gray-400">MPP Counter</p>
                    <p className={`text-3xl font-bold ${mppCounter.color}`}>{mppCounter.text}</p>
                </div>
                <div className="text-center">
                    <p className="text-gray-400">Status</p>
                    <p className={`text-3xl font-bold ${fulfillmentStatus.color}`}>{fulfillmentStatus.text}</p>
                </div>
                 <button onClick={handleEndSession} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors" disabled={isEndingSession}>
                    {isEndingSession ? 'Saving...' : 'End Session'}
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
                 <div className="overflow-y-auto max-h-[calc(100vh-400px)]">
                    <table className="w-full text-left">
                        <thead className="bg-gray-700 sticky top-0">
                            <tr>
                                <th className="p-3">OpsID</th>
                                <th className="p-3">Nama Lengkap</th>
                                <th className="p-3">Shift Jam Masuk</th>
                                <th className="p-3">Shift ID</th>
                                <th className="p-3">Status</th>
                                <th className="p-3 text-center">Hapus</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activeRecords.map(record => (
                                <tr key={record.workerId} className="border-b border-gray-700 hover:bg-gray-700/50">
                                    <td className="p-3">{record.opsId}</td>
                                    <td className="p-3">{record.fullName}</td>
                                    <td className="p-3">{activeSession.shiftTime.split(' - ')[0]}</td>
                                    <td className="p-3">{activeSession.shiftId}</td>
                                    <td className="p-3 text-green-400 font-semibold">Hadir</td>
                                    <td className="p-3 text-center">
                                      <button 
                                        onClick={() => handleRemoveActiveRecord(record.workerId)}
                                        className="text-red-400 hover:text-red-300 transition-colors"
                                        aria-label={`Remove ${record.fullName}`}
                                      >
                                        <DeleteIcon />
                                      </button>
                                    </td>
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
            <label htmlFor="sessionDate" className="block mb-2 text-sm font-medium text-gray-300">Tanggal Sesi</label>
            <input 
              type="date" 
              id="sessionDate" 
              name="sessionDate" 
              defaultValue={getTodayString()}
              required 
              className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
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
               {shiftIdOptions.map(shift => (
                 <option key={shift} value={shift}>{shift}</option>
               ))}
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