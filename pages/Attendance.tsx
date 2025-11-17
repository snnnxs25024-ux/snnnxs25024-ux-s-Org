import React, { useState, useEffect, useRef, useMemo } from 'react';
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
    'SOCSTROPS0009 Shift 00 00:00 - 09:00', 'SOCSTROPS0110 Shift 01 01:00 - 10:00', 'SOCSTROPS0211 Shift 02 02:00 - 11:00',
    'SOCSTROPS0312 Shift 03 03:00 - 15:00', 'SOCSTROPS0413 Shift 04 04:00 - 16:00', 'SOCSTROPS0514 Shift 05 05:00 - 17:00',
    'SOCSTROPS0615 Shift 06 06:00 - 15:00', 'SOCSTROPS0716 Shift 07 07:00 - 19:00', 'SOCSTROPS0817 Shift 08 08:00 - 20:00',
    'SOCSTROPS0918 Shift 09 09:00 - 18:00', 'SOCSTROPS1019 Shift 10 10:00 - 22:00', 'SOCSTROPS1120 Shift 11 11:00 - 23:00',
    'SOCSTROPS1221 Shift 12 12:00 - 00:00', 'SOCSTROPS1322 Shift 13 13:00 - 22:00', 'SOCSTROPS1423 Shift 14 14:00 - 02:00',
    'SOCSTROPS1500 Shift 15 15:00 - 03:00', 'SOCSTROPS1601 Shift 16 16:00 - 04:00', 'SOCSTROPS1702 Shift 17 17:00 - 02:00',
    'SOCSTROPS1803 Shift 18 18:00 - 06:00', 'SOCSTROPS1904 Shift 19 19:00 - 07:00', 'SOCSTROPS2005 Shift 20 20:00 - 05:00',
    'SOCSTROPS2207 Shift 22 22:00 - 10:00', 'SOCSTROPS2308 Shift 23 23:00 - 08:00',
];

const Attendance: React.FC<AttendanceProps> = ({ 
  workers, refreshData, activeSession, setActiveSession, activeRecords, setActiveRecords,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(!activeSession);
  const [opsIdInput, setOpsIdInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
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
          setError(`Worker with OpsID "${opsIdInput}" not found or is inactive.`);
          setOpsIdInput('');
          return;
      }

      // Smarter check for active check-ins
      const { data: activeCheckin } = await supabase
        .from('attendance_records')
        .select('id, timestamp')
        .eq('worker_id', worker.id)
        .is('checkout_timestamp', null)
        .limit(1)
        .single();

      if (activeCheckin) {
          const checkinTime = new Date(activeCheckin.timestamp).getTime();
          const now = new Date().getTime();
          const nineHoursInMillis = 9 * 60 * 60 * 1000;
          
          if ((now - checkinTime) > nineHoursInMillis) {
              // Stale session found, auto-close it
              const autoCheckoutTime = new Date(checkinTime + nineHoursInMillis).toISOString();
              const { error: updateError } = await supabase
                  .from('attendance_records')
                  .update({ checkout_timestamp: autoCheckoutTime })
                  .eq('id', activeCheckin.id);

              if (updateError) {
                  setError(`Could not auto-close stale session for ${worker.fullName}. Error: ${updateError.message}`);
                  setOpsIdInput('');
                  return;
              }
              // If successful, proceed with new check-in
          } else {
              // Genuinely active session, block check-in
              setError(`Worker ${worker.fullName} is already checked in and has not checked out yet.`);
              setOpsIdInput('');
              return;
          }
      }

      const { data: lastRecord } = await supabase.from('attendance_records').select('checkout_timestamp').eq('worker_id', worker.id).not('checkout_timestamp', 'is', null).order('checkout_timestamp', { ascending: false }).limit(1).single();
      if(lastRecord && lastRecord.checkout_timestamp){
        const lastCheckoutDate = new Date(lastRecord.checkout_timestamp);
        const today = new Date();
        if (lastCheckoutDate.toDateString() === today.toDateString()) {
            setError(`Worker ${worker.fullName} has already completed a shift today.`);
            setOpsIdInput('');
            return;
        }
        const nineHoursInMillis = 9 * 60 * 60 * 1000;
        if((today.getTime() - lastCheckoutDate.getTime()) < nineHoursInMillis){
            const timeLeft = nineHoursInMillis - (today.getTime() - lastCheckoutDate.getTime());
            const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
            const minutesLeft = Math.ceil((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            setError(`Worker ${worker.fullName} is in a cooldown period for another ${hoursLeft}h ${minutesLeft}m.`);
            setOpsIdInput('');
            return;
        }
      }

      const allowedDepartment = divisionToDepartmentMap[activeSession.division];
      if (allowedDepartment) {
          const isAllowed = Array.isArray(allowedDepartment) ? allowedDepartment.includes(worker.department) : worker.department === allowedDepartment;
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
          workerId: worker.id, opsId: worker.opsId, fullName: worker.fullName, timestamp: new Date().toISOString(),
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
            const newSessionId = uuidv4();
            const { error: sessionError } = await supabase.from('attendance_sessions').insert({
                id: newSessionId, date: activeSession.date, division: activeSession.division,
                shiftTime: activeSession.shiftTime, shiftId: activeSession.shiftId, planMpp: activeSession.planMpp
            });
            if (sessionError) throw sessionError;
            const recordsToInsert = activeRecords.map(rec => ({ session_id: newSessionId, worker_id: rec.workerId, timestamp: rec.timestamp }));
            const { error: recordsError } = await supabase.from('attendance_records').insert(recordsToInsert);
            if (recordsError) throw recordsError;
        }
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

  const handleCancelSession = () => {
    setIsCancelConfirmOpen(true);
  };

  const handleConfirmCancel = () => {
    setActiveSession(null);
    setActiveRecords([]);
    setIsCancelConfirmOpen(false);
    setIsModalOpen(true);
  };

  const handleRemoveActiveRecord = (workerIdToRemove: string) => {
    setActiveRecords(prev => prev.filter(record => record.workerId !== workerIdToRemove));
  };
  
  const mppCounter = useMemo(() => {
    if (!activeSession) return { text: '0', color: 'text-blue-600' };
    const remaining = activeSession.planMpp - activeRecords.length;
    if (remaining < 0) return { text: `+${Math.abs(remaining)}`, color: 'text-yellow-600' };
    return { text: `${remaining}`, color: 'text-blue-600' };
  }, [activeSession, activeRecords]);

  const fulfillmentStatus = useMemo(() => {
      if (!activeSession) return { text: '', color: '' };
      const actual = activeRecords.length;
      const planned = activeSession.planMpp;
      if (actual < planned) return { text: 'GAP', color: 'text-red-600' };
      if (actual === planned) return { text: 'FULL FILL', color: 'text-green-600' };
      return { text: 'FULL FILL BUFFER', color: 'text-yellow-600' };
  }, [activeSession, activeRecords]);

  const shiftTimeOptions = Array.from({ length: 24 }, (_, i) => {
    const startHour = i;
    const endHour = (startHour + 9) % 24;
    const startTime = startHour.toString().padStart(2, '0') + ':00';
    const endTime = endHour.toString().padStart(2, '0') + ':00';
    return `${startTime} - ${endTime}`;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Attendance</h1>
      {activeSession ? (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white p-4 rounded-lg border border-gray-200 shadow-lg border-t-4 border-blue-500 transition-shadow duration-300 hover:shadow-xl">
                <div className="col-span-2 md:col-span-1">
                    <p className="text-xs text-gray-500">Tanggal Sesi</p>
                    <p className="font-semibold text-gray-800">{activeSession.date}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-500">Division</p>
                    <p className="font-semibold text-gray-800">{activeSession.division}</p>
                </div>
                 <div className="col-span-2 md:col-span-2">
                    <p className="text-xs text-gray-500">Shift</p>
                    <p className="font-semibold text-gray-800 truncate">{activeSession.shiftTime} ({activeSession.shiftId})</p>
                </div>
                <div className="text-center">
                    <p className="text-xs text-gray-500">MPP Counter</p>
                    <p className={`text-2xl font-bold ${mppCounter.color}`}>{mppCounter.text}</p>
                </div>
                <div className="text-center">
                    <p className="text-xs text-gray-500">Status</p>
                    <p className={`text-2xl font-bold ${fulfillmentStatus.color}`}>{fulfillmentStatus.text}</p>
                </div>
            </div>

            <form onSubmit={handleScan} className="flex flex-col sm:flex-row gap-4">
                <input
                    ref={inputRef}
                    type="text"
                    value={opsIdInput}
                    onChange={(e) => setOpsIdInput(e.target.value)}
                    placeholder="Scan or type OpsID..."
                    className="flex-grow bg-white border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors shadow-sm hover:shadow-md">
                    Submit
                </button>
            </form>
            {error && <p className="text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">{error}</p>}
            
            <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200 transition-shadow duration-300 hover:shadow-xl">
                 <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-blue-600 text-white">
                            <tr>
                                <th className="p-3 font-semibold rounded-tl-lg">OpsID</th>
                                <th className="p-3 font-semibold">Nama Lengkap</th>
                                <th className="p-3 font-semibold">Shift Jam Masuk</th>
                                <th className="p-3 font-semibold">Status</th>
                                <th className="p-3 font-semibold text-center rounded-tr-lg">Hapus</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {activeRecords.map(record => (
                                <tr key={record.workerId} className="hover:bg-gray-50">
                                    <td className="p-3">{record.opsId}</td>
                                    <td className="p-3">{record.fullName}</td>
                                    <td className="p-3">{activeSession.shiftTime.split(' - ')[0]}</td>
                                    <td className="p-3 text-green-600 font-semibold">Hadir</td>
                                    <td className="p-3 text-center">
                                      <button onClick={() => handleRemoveActiveRecord(record.workerId)} className="text-red-500 hover:text-red-700 transition-colors p-1" aria-label={`Remove ${record.fullName}`}>
                                        <DeleteIcon />
                                      </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
             <div className="flex justify-end gap-4">
                  <button onClick={handleCancelSession} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-lg transition-colors shadow-sm hover:shadow-md" disabled={isEndingSession}>
                    Cancel Session
                 </button>
                 <button onClick={handleEndSession} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg transition-colors shadow-sm hover:shadow-md" disabled={isEndingSession}>
                    {isEndingSession ? 'Saving...' : 'End Session'}
                </button>
            </div>
        </div>
      ) : (
        <div className="text-center py-16">
          <h2 className="text-2xl text-gray-600 mb-4">No Active Session</h2>
          <p className="text-gray-500 mb-8">Click the button below to start tracking attendance.</p>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors shadow-lg hover:shadow-blue-500/50"
          >
            Start New Session
          </button>
        </div>
      )}

      <Modal isOpen={isModalOpen && !activeSession} onClose={() => setIsModalOpen(false)} title="Start Attendance Session">
        <form onSubmit={handleStartSession} className="space-y-4">
          <div>
            <label htmlFor="sessionDate" className="block mb-2 text-sm font-medium text-gray-700">Tanggal Sesi</label>
            <input type="date" id="sessionDate" name="sessionDate" defaultValue={getTodayString()} required className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="division" className="block mb-2 text-sm font-medium text-gray-700">Divisi</label>
            <select id="division" name="division" required className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>ASM2</option> <option>CACHE</option> <option>TP SUNTER 1</option>
              <option>TP SUNTER 2</option> <option>INVENTORY</option> <option>RETURN</option>
            </select>
          </div>
          <div>
            <label htmlFor="shiftTime" className="block mb-2 text-sm font-medium text-gray-700">Shift Jam (WIB)</label>
            <select id="shiftTime" name="shiftTime" required className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
              {shiftTimeOptions.map(time => (<option key={time} value={time}>{time}</option>))}
            </select>
          </div>
          <div>
            <label htmlFor="shiftId" className="block mb-2 text-sm font-medium text-gray-700">Shift ID</label>
             <select id="shiftId" name="shiftId" required className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
               {shiftIdOptions.map(shift => (<option key={shift} value={shift}>{shift}</option>))}
            </select>
          </div>
          <div>
            <label htmlFor="planMpp" className="block mb-2 text-sm font-medium text-gray-700">Plan MPP</label>
            <input type="number" id="planMpp" name="planMpp" min="1" required className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="pt-4">
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors">
              Start Session
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isCancelConfirmOpen} onClose={() => setIsCancelConfirmOpen(false)} title="Confirm Cancel Session">
        <div>
            <p className="text-gray-600">Are you sure you want to cancel this session? All scanned data will be lost and will not be saved.</p>
            <div className="flex justify-end gap-4 mt-6">
                <button onClick={() => setIsCancelConfirmOpen(false)} className="py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold">
                    Keep Session
                </button>
                <button onClick={handleConfirmCancel} className="py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold">
                    Yes, Cancel
                </button>
            </div>
        </div>
      </Modal>
    </div>
  );
};

export default Attendance;