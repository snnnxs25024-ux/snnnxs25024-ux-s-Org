
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Modal from '../components/Modal';
import { Worker, AttendanceSession, AttendanceRecord } from '../types';
import { supabase } from '../lib/supabaseClient';
import DeleteIcon from '../components/icons/DeleteIcon';
import { useToast } from '../hooks/useToast';
import { playSound } from '../utils/sound';

interface AttendanceProps {
  workers: Worker[];
  refreshData: () => void;
  activeSession: Omit<AttendanceSession, 'records' | 'id'> | null;
  setActiveSession: React.Dispatch<React.SetStateAction<Omit<AttendanceSession, 'records' | 'id'> | null>>;
  activeRecords: Omit<AttendanceRecord, 'id' | 'checkout_timestamp' | 'manual_status' | 'is_takeout'>[];
  setActiveRecords: React.Dispatch<React.SetStateAction<Omit<AttendanceRecord, 'id' | 'checkout_timestamp' | 'manual_status' | 'is_takeout'>[]>>;
}

// Fallbacks if DB is empty
const defaultShiftIds = [
    'SOCSTROPS0009', 'SOCSTROPS0110', 'SOCSTROPS0211', 'SOCSTROPS0312', 'SOCSTROPS0413', 'SOCSTROPS0514',
    'SOCSTROPS0615', 'SOCSTROPS0716', 'SOCSTROPS0817', 'SOCSTROPS0918', 'SOCSTROPS1019', 'SOCSTROPS1120',
    'SOCSTROPS1221', 'SOCSTROPS1322', 'SOCSTROPS1423', 'SOCSTROPS1500', 'SOCSTROPS1601', 'SOCSTROPS1702',
    'SOCSTROPS1803', 'SOCSTROPS1904', 'SOCSTROPS2005', 'SOCSTROPS2106', 'SOCSTROPS2207', 'SOCSTROPS2308',
];

const defaultDivisions = ['ASM2', 'CACHE', 'TP SUNTER 1', 'TP SUNTER 2', 'INVENTORY', 'RETURN'];

const defaultShiftTimes = Array.from({ length: 24 }, (_, i) => {
    const startHour = i;
    const endHour = (startHour + 9) % 24;
    const startTime = startHour.toString().padStart(2, '0') + ':00';
    const endTime = endHour.toString().padStart(2, '0') + ':00';
    return `${startTime} - ${endTime}`;
});

const Attendance: React.FC<AttendanceProps> = ({ 
  workers, refreshData, activeSession, setActiveSession, activeRecords, setActiveRecords,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(!activeSession);
  const [opsIdInput, setOpsIdInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Worker[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  
  // Dynamic Options
  const [shiftIdOpts, setShiftIdOpts] = useState<string[]>(defaultShiftIds);
  const [divisionOpts, setDivisionOpts] = useState<string[]>(defaultDivisions);
  const [shiftTimeOpts, setShiftTimeOpts] = useState<string[]>(defaultShiftTimes);

  useEffect(() => {
    const fetchMasterOptions = async () => {
        const { data } = await supabase.from('master_data').select('*');
        if (data && data.length > 0) {
            const divs = data.filter(d => d.category === 'DIVISION').map(d => d.value);
            const times = data.filter(d => d.category === 'SHIFT_TIME').map(d => d.value);
            const ids = data.filter(d => d.category === 'SHIFT_ID').map(d => d.value);
            
            if (divs.length > 0) setDivisionOpts(divs);
            if (times.length > 0) setShiftTimeOpts(times);
            if (ids.length > 0) setShiftIdOpts(ids);
        }
    };
    fetchMasterOptions();
  }, []);
  
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
            setSuggestions([]);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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
      showToast('Sesi manual baru telah dimulai.', { type: 'success', title: 'Sesi Dimulai' });
    }
  };
  
  const handleOpsIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setOpsIdInput(query);
    setError(null);
    setHighlightedIndex(-1);

    if (query.length > 1) {
        const activeRecordOpsIds = new Set(activeRecords.map(r => r.opsId));
        const availableWorkers = workers.filter(w => 
            !activeRecordOpsIds.has(w.opsId) &&
            w.status === 'Active' &&
            (w.opsId.toLowerCase().includes(query.toLowerCase()) || w.fullName.toLowerCase().includes(query.toLowerCase()))
        );
        setSuggestions(availableWorkers.slice(0, 5));
    } else {
        setSuggestions([]);
    }
  };

  const handleSuggestionClick = (worker: Worker) => {
      setOpsIdInput(worker.opsId);
      setSuggestions([]);
      inputRef.current?.focus();
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
        if (highlightedIndex > -1) {
            e.preventDefault();
            handleSuggestionClick(suggestions[highlightedIndex]);
        }
    }
  };

  const handleScan = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!opsIdInput.trim() || !activeSession) return;
      setSuggestions([]);

      const worker = workers.find(w => w.opsId.toLowerCase() === opsIdInput.toLowerCase() && w.status === 'Active');

      if (!worker || !worker.id) {
          setError(`Worker with OpsID "${opsIdInput}" not found or is inactive.`);
          setOpsIdInput('');
          return;
      }

      // VALIDATION: Check if worker's department matches the session's division
      const { data: divisions } = await supabase.from('master_data').select('value').eq('category', 'DIVISION');
      const divisionList = divisions?.map(d => d.value) || divisionOpts;

      if (divisionList.includes(activeSession.division) && worker.department !== activeSession.division) {
          setError(`Worker ${worker.fullName} (Dept: ${worker.department}) tidak diizinkan untuk sesi Divisi ${activeSession.division}.`);
          setOpsIdInput('');
          return;
      }

      // VALIDATION 1: Check Local Buffer (Duplicate in Current Session)
      if (activeRecords.some(r => r.opsId === worker.opsId)) {
          setError(`Worker ${worker.fullName} has already been scanned in this session.`);
          setOpsIdInput('');
          return;
      }

      // VALIDATION 2: Check Database for Same Day Attendance (Cross-Session)
      try {
          const { data, error } = await supabase
            .from('attendance_records')
            .select('id, attendance_sessions!inner(date)')
            .eq('worker_id', worker.id)
            .eq('attendance_sessions.date', activeSession.date);
          
          if (error) {
             console.error(error);
             setError("Error validating attendance history. Please try again.");
             return;
          }

          if (data && data.length > 0) {
              setError(`Worker ${worker.fullName} has already attended a session today (${activeSession.date}).`);
              setOpsIdInput('');
              return;
          }
      } catch (err) {
          console.error(err);
          return;
      }

      // --- LOGIKA PENGUNCIAN WAKTU SESI ---
      const shiftStartTime = activeSession.shiftTime.split(' - ')[0]; // "HH:mm"
      const sessionDateIso = activeSession.date + 'T' + shiftStartTime;
      const officialTimestamp = new Date(sessionDateIso).toISOString();
      const actualScanTimestamp = new Date().toISOString();

      const newRecord: Omit<AttendanceRecord, 'id' | 'checkout_timestamp' | 'manual_status' | 'is_takeout'> = {
          workerId: worker.id,
          opsId: worker.opsId,
          fullName: worker.fullName,
          timestamp: officialTimestamp, // Official Time (Locked to Session)
          scan_timestamp: actualScanTimestamp, // Audit Time (Real-time)
          is_arrived: true // Auto-confirm presence for Admin Scans
      };
      
      playSound('scan-success');
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
                id: newSessionId, 
                date: activeSession.date, 
                division: activeSession.division,
                shift_time: activeSession.shiftTime, 
                shift_id: activeSession.shiftId, 
                plan_mpp: activeSession.planMpp,
                session_type: 'MANUAL' // Mark as Manual Admin Session
            });
            if (sessionError) throw sessionError;
            
            // Map records to include the official timestamp AND the actual scan timestamp
            const recordsToInsert = activeRecords.map(rec => ({ 
                session_id: newSessionId, 
                worker_id: rec.workerId, 
                timestamp: rec.timestamp, // Official
                scan_timestamp: rec.scan_timestamp, // Actual
                is_arrived: true // Explicitly true for manual scans
            }));
            
            const { error: recordsError } = await supabase.from('attendance_records').insert(recordsToInsert);
            if (recordsError) throw recordsError;
        }
        showToast(`Sesi manual untuk ${activeSession.division} berhasil disimpan.`, { type: 'success', title: 'Sesi Disimpan' });
        setActiveSession(null);
        setActiveRecords([]);
        setIsModalOpen(true);
        refreshData();
    } catch(err: any) {
        showToast(`Gagal menyimpan sesi: ${err.message}`, { type: 'error', title: 'Error' });
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
    showToast('Sesi manual dibatalkan dan data tidak disimpan.', { type: 'info', title: 'Sesi Dibatalkan' });
  };

  const handleRemoveActiveRecord = (workerIdToRemove: string) => {
    setActiveRecords(prev => prev.filter(record => record.workerId !== workerIdToRemove));
  };
  
  const fulfillmentStatus = useMemo(() => {
      if (!activeSession) return { text: '', color: '', bg: '', border: '' };
      const actual = activeRecords.length;
      const planned = activeSession.planMpp;
      if (actual < planned) return { text: 'GAP', color: 'text-red-700', bg: 'bg-red-100', border: 'border-red-200' };
      if (actual === planned) return { text: 'FULL FILL', color: 'text-green-700', bg: 'bg-green-100', border: 'border-green-200' };
      return { text: 'FULL FILL BUFFER', color: 'text-yellow-700', bg: 'bg-yellow-100', border: 'border-yellow-200' };
  }, [activeSession, activeRecords]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Attendance (Manual)</h1>
      {activeSession ? (
        <div className="space-y-6">
            {/* New Designed Active Session Card */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 border-t-4 border-blue-600 p-6 transition-all duration-300 hover:shadow-xl">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-stretch gap-6">
                    
                    {/* Left Side: Context Information */}
                    <div className="flex-grow space-y-4">
                        <div className="flex flex-col gap-1">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Sesi Aktif</span>
                            <div className="flex items-baseline gap-3">
                                <h2 className="text-2xl font-bold text-gray-800">{activeSession.date}</h2>
                                <span className="text-lg font-medium text-gray-500">|</span>
                                <h3 className="text-xl font-semibold text-blue-600">{activeSession.division}</h3>
                            </div>
                        </div>
                        
                        <div>
                            <p className="text-xs text-gray-400 mb-1">Jam Operasional (Patokan Sistem)</p>
                            <p className="text-3xl font-extrabold text-gray-800 tracking-tight">
                                {activeSession.shiftTime}
                            </p>
                            <p className="text-xs text-gray-400 font-mono mt-1 truncate max-w-xl select-all">
                                ID: {activeSession.shiftId}
                            </p>
                        </div>
                    </div>

                    {/* Right Side: KPI & Status */}
                    <div className="w-full md:w-auto flex flex-col justify-between items-end gap-4 bg-gray-50 p-5 rounded-xl border border-gray-100 min-w-[280px]">
                        
                        {/* Status Badge */}
                        <div className={`w-full text-center px-4 py-2 rounded-lg border ${fulfillmentStatus.bg} ${fulfillmentStatus.border}`}>
                            <span className={`text-sm font-black tracking-widest uppercase ${fulfillmentStatus.color}`}>
                                {fulfillmentStatus.text}
                            </span>
                        </div>

                        {/* Counter Display */}
                        <div className="text-right w-full">
                            <p className="text-xs text-gray-500 font-semibold uppercase mb-1">Kehadiran / Plan</p>
                            <div className="flex items-baseline justify-end gap-2">
                                <span className={`text-5xl font-black ${fulfillmentStatus.color} tracking-tighter`}>
                                    {activeRecords.length}
                                </span>
                                <span className="text-2xl text-gray-400 font-medium">
                                    / {activeSession.planMpp}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <form onSubmit={handleScan} className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-grow" ref={searchRef}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={opsIdInput}
                        onChange={handleOpsIdChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Scan or type OpsID/Name..."
                        className="w-full bg-white border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoComplete="off"
                    />
                    {suggestions.length > 0 && (
                        <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
                            {suggestions.map((worker, index) => (
                                <li 
                                    key={worker.id} 
                                    onClick={() => handleSuggestionClick(worker)} 
                                    className={`p-3 cursor-pointer border-b last:border-0 ${index === highlightedIndex ? 'bg-blue-100' : 'hover:bg-blue-50'}`}
                                >
                                    <p className="font-semibold text-sm text-gray-800">{worker.fullName}</p>
                                    <p className="text-xs text-black font-mono">{worker.opsId}</p>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors shadow-sm hover:shadow-md">
                    Submit
                </button>
            </form>
            {error && <p className="text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">{error}</p>}
            
            <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200 transition-shadow duration-300 hover:shadow-xl">
                 <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-blue-600 text-white shadow-sm">
                            <tr>
                                <th className="p-4 font-bold uppercase tracking-wider rounded-tl-lg">OpsID</th>
                                <th className="p-4 font-bold uppercase tracking-wider">Nama Lengkap</th>
                                <th className="p-4 font-bold uppercase tracking-wider">Shift Jam Masuk</th>
                                <th className="p-4 font-bold uppercase tracking-wider">Jam Scan (Aktual)</th>
                                <th className="p-4 font-bold uppercase tracking-wider">Status</th>
                                <th className="p-4 font-bold uppercase tracking-wider text-center rounded-tr-lg">Hapus</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {activeRecords.map(record => (
                                <tr key={record.workerId} className="hover:bg-blue-50 transition-colors">
                                    <td className="p-4 font-mono font-bold text-black">{record.opsId}</td>
                                    <td className="p-4 font-semibold text-gray-800">{record.fullName}</td>
                                    <td className="p-4 text-gray-700">{new Date(record.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</td>
                                    <td className="p-4 font-mono text-gray-500">
                                        {record.scan_timestamp 
                                            ? new Date(record.scan_timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                                            : '-'
                                        }
                                    </td>
                                    <td className="p-4">
                                        <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-black uppercase">Hadir</span>
                                    </td>
                                    <td className="p-4 text-center">
                                      <button onClick={() => handleRemoveActiveRecord(record.workerId)} className="text-red-500 hover:text-red-700 transition-colors p-1" aria-label={`Remove ${record.fullName}`}>
                                        <DeleteIcon />
                                      </button>
                                    </td>
                                </tr>
                            ))}
                            {activeRecords.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-gray-400 italic">Belum ada karyawan yang di-scan.</td>
                                </tr>
                            )}
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
          <h2 className="text-2xl text-gray-600 mb-4">No Active Manual Session</h2>
          <p className="text-gray-500 mb-8">Click the button below to start manually tracking attendance.</p>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors shadow-lg hover:shadow-blue-500/50"
          >
            Start New Session
          </button>
        </div>
      )}

      <Modal isOpen={isModalOpen && !activeSession} onClose={() => setIsModalOpen(false)} title="Start Manual Attendance Session">
        <form onSubmit={handleStartSession} className="space-y-4">
          <div>
            <label htmlFor="sessionDate" className="block mb-2 text-sm font-medium text-gray-700">Tanggal Sesi</label>
            <input type="date" id="sessionDate" name="sessionDate" defaultValue={getTodayString()} required className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="division" className="block mb-2 text-sm font-medium text-gray-700">Divisi</label>
            <select id="division" name="division" required className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
              {divisionOpts.map(div => <option key={div} value={div}>{div}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="shiftTime" className="block mb-2 text-sm font-medium text-gray-700">Shift Jam (WIB)</label>
            <select id="shiftTime" name="shiftTime" required className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
              {shiftTimeOpts.map(time => (<option key={time} value={time}>{time}</option>))}
            </select>
          </div>
          <div>
            <label htmlFor="shiftId" className="block mb-2 text-sm font-medium text-gray-700">Shift ID</label>
             <select id="shiftId" name="shiftId" required className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
               {shiftIdOpts.map(shift => (<option key={shift} value={shift}>{shift}</option>))}
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

      <Modal isOpen={isCancelConfirmOpen} onClose={() => setIsCancelConfirmOpen(false)} title="Confirm Cancel Session" size="sm" scrollable={false}>
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
