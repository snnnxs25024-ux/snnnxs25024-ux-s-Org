
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabaseClient';
import { AttendanceSession, AttendanceRecord, Worker } from '../types';
import { useToast } from '../hooks/useToast';
import { playSound } from '../utils/sound';
import { Page } from '../App';
import useLocalStorage from '../hooks/useLocalStorage';
import Modal from '../components/Modal';
import DeleteIcon from '../components/icons/DeleteIcon';
import CopyIcon from '../components/icons/CopyIcon';

// This is a subset of the full AttendanceSession for local state before DB insert
type DraftSession = Omit<AttendanceSession, 'id' | 'records' | 'status' | 'session_type' | 'auto_close'>;

interface CreateSessionProps {
    workers: Worker[];
    refreshData: () => void;
    setCurrentPage: (page: Page) => void;
    setAutoOpenSessionId: (id: string | null) => void;
    attendanceHistory: AttendanceSession[];
}

// Fallback data
const defaultShiftIds = ['SOCSTROPS0009', 'SOCSTROPS0110', 'SOCSTROPS0211'];
const defaultDivisions = ['ASM2', 'CACHE', 'INVENTORY', 'RETURN'];
const defaultShiftTimes = ['00:00 - 09:00', '01:00 - 10:00', '02:00 - 11:00'];

// Division-to-Department Mapping for Manual Session Validation
const divisionToDepartmentMap: { [key: string]: Worker['department'] | Worker['department'][] } = {
    'ASM2': 'SOC Operator', 'CACHE': 'Cache', 'INVENTORY': 'Inventory', 'RETURN': 'Return',
    'TP SUNTER 1': ['SOC Operator', 'Cache', 'Return', 'Inventory'],
    'TP SUNTER 2': ['SOC Operator', 'Cache', 'Return', 'Inventory'],
};


const CreateSession: React.FC<CreateSessionProps> = ({ workers, refreshData, setCurrentPage, setAutoOpenSessionId, attendanceHistory }) => {
    // --- STATE MANAGEMENT ---
    const [sessionType, setSessionType] = useState<'MANUAL' | 'PUBLIC'>('MANUAL');
    
    // State for Manual Session
    const [manualSession, setManualSession] = useLocalStorage<DraftSession | null>('draftAbseninManualSession', null);
    const [manualRecords, setManualRecords] = useLocalStorage<Omit<AttendanceRecord, 'id' | 'checkout_timestamp' | 'manual_status' | 'is_takeout'>[]>('draftAbseninManualRecords', []);

    // State for Public Session (synced with DB)
    const [publicSession, setPublicSession] = useState<AttendanceSession | null>(null);
    const [liveRecords, setLiveRecords] = useState<AttendanceRecord[]>([]);

    // General UI State
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Dynamic Options from DB
    const [shiftIdOpts, setShiftIdOpts] = useState<string[]>(defaultShiftIds);
    const [divisionOpts, setDivisionOpts] = useState<string[]>(defaultDivisions);
    const [shiftTimeOpts, setShiftTimeOpts] = useState<string[]>(defaultShiftTimes);
    
    const { showToast } = useToast();

    // --- EFFECTS ---

    // Fetch master data on mount
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

    // Sync active PUBLIC session from DB and subscribe to changes
    useEffect(() => {
        const syncActivePublicSession = async () => {
          setIsSyncing(true);
          const { data, error: dbError } = await supabase.from('attendance_sessions').select('*').eq('status', 'OPEN').eq('session_type', 'PUBLIC').order('id', { ascending: false }).limit(1).maybeSingle();

          if (dbError) showToast('Gagal memeriksa sesi aktif.', { type: 'error' });
          else if (data) {
            const newActiveSession: AttendanceSession = {
                id: data.id, date: data.date, division: data.division, shiftTime: data.shift_time,
                shiftId: data.shift_id, planMpp: data.plan_mpp, status: data.status,
                session_type: data.session_type, auto_close: data.auto_close, records: [],
            };
            setPublicSession(newActiveSession);
          } else {
            setPublicSession(null);
          }
          setIsSyncing(false);
        };
        
        syncActivePublicSession();
        
        const channel = supabase.channel('public-session-sync').on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_sessions', filter: 'session_type=eq.PUBLIC' }, syncActivePublicSession).subscribe();
        
        return () => { supabase.removeChannel(channel); };
    }, [showToast]);

    // Fetch and subscribe to records for an active PUBLIC session
    useEffect(() => {
        if (!publicSession) { setLiveRecords([]); return; }

        const fetchLiveRecords = async () => {
            const { data, error: dbError } = await supabase.from('attendance_records').select('*').eq('session_id', publicSession.id).order('scan_timestamp', { ascending: false });
            if (dbError) { showToast('Gagal memuat data absensi.', { type: 'error' }); return; }
            if (data) {
               const enrichedData: AttendanceRecord[] = data.map((rec: any) => {
                   const worker = workers.find(w => w.id === rec.worker_id);
                   return {
                       id: rec.id, workerId: rec.worker_id, opsId: worker?.opsId || 'N/A',
                       fullName: worker?.fullName || 'Unknown', timestamp: rec.timestamp,
                       scan_timestamp: rec.scan_timestamp, checkout_timestamp: rec.checkout_timestamp,
                       manual_status: rec.manual_status, is_takeout: rec.is_takeout ?? false, is_arrived: rec.is_arrived,
                   };
               });
               setLiveRecords(enrichedData);
            }
        };
        fetchLiveRecords();

        const recordsChannel = supabase.channel(`open_list_records_${publicSession.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records', filter: `session_id=eq.${publicSession.id}` }, (payload) => {
            fetchLiveRecords();
            if(payload.eventType === 'INSERT') playSound('scan-success');
        }).subscribe();

        return () => { supabase.removeChannel(recordsChannel); };
    }, [publicSession, workers, showToast]);

    // --- FORM HANDLERS ---
    
    const handleCreateSession = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        
        const formData = new FormData(e.currentTarget);
        const sessionData: DraftSession = {
            date: formData.get('sessionDate') as string, division: formData.get('division') as string,
            shiftTime: formData.get('shiftTime') as string, shiftId: formData.get('shiftId') as string,
            planMpp: parseInt(formData.get('planMpp') as string, 10),
        };
        
        if (sessionType === 'MANUAL') {
            setManualSession(sessionData);
            setManualRecords([]);
            showToast('Sesi manual baru telah dimulai.', { type: 'success', title: 'Sesi Dimulai' });
        } else { // PUBLIC
            const { error: insertError } = await supabase.from('attendance_sessions').insert({
                id: uuidv4(), date: sessionData.date, division: sessionData.division,
                shift_time: sessionData.shiftTime, shift_id: sessionData.shiftId,
                plan_mpp: sessionData.planMpp, auto_close: (formData.get('autoClose') === 'on'),
                status: 'OPEN', session_type: 'PUBLIC'
            });
            if (insertError) {
                setError(insertError.message);
                showToast(`Gagal membuat link: ${insertError.message}`, { type: 'error' });
            } else {
                showToast('Link absensi publik berhasil dibuat.', { type: 'success' });
            }
        }
        setIsLoading(false);
    };

    if (isSyncing) {
        return <div className="text-center py-20 text-gray-500">Menyinkronkan sesi...</div>
    }

    if (manualSession) {
        return <LiveSessionManager 
            session={manualSession} 
            records={manualRecords}
            setRecords={setManualRecords}
            onEndSession={() => { setManualSession(null); setManualRecords([]); refreshData(); }}
            onCancelSession={() => { setManualSession(null); setManualRecords([]); }}
            workers={workers}
            attendanceHistory={attendanceHistory}
        />;
    }

    if (publicSession) {
        return <PublicSessionMonitor
            session={publicSession}
            liveRecords={liveRecords}
            workers={workers}
            onCloseSession={() => {
                const sessionId = publicSession.id;
                setPublicSession(null);
                setLiveRecords([]);
                setAutoOpenSessionId(sessionId);
                setCurrentPage('Dashboard');
            }}
        />
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Buat Sesi Absensi</h1>
            
            <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200">
                <form onSubmit={handleCreateSession} className="space-y-4 max-w-2xl">
                    <div className="mb-6">
                        <label className="block mb-3 text-sm font-medium text-gray-700 font-bold uppercase tracking-wider text-[10px]">Pilih Tipe Sesi</label>
                        <div className="flex gap-2 bg-blue-50 border border-blue-100 p-1 rounded-xl">
                            <button type="button" onClick={() => setSessionType('MANUAL')} className={`flex-1 px-4 py-3 font-black text-xs uppercase tracking-widest transition-all rounded-lg ${sessionType === 'MANUAL' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-transparent text-gray-500 hover:bg-blue-100 hover:text-blue-600'}`}>Scan Manual</button>
                            <button type="button" onClick={() => setSessionType('PUBLIC')} className={`flex-1 px-4 py-3 font-black text-xs uppercase tracking-widest transition-all rounded-lg ${sessionType === 'PUBLIC' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-transparent text-gray-500 hover:bg-blue-100 hover:text-blue-600'}`}>Link Publik</button>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block mb-2 text-sm font-medium text-gray-700 font-bold uppercase tracking-wider text-[10px]">Tanggal</label>
                            <input type="date" name="sessionDate" defaultValue={new Date().toISOString().split('T')[0]} required className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                            <label className="block mb-2 text-sm font-medium text-gray-700 font-bold uppercase tracking-wider text-[10px]">Divisi</label>
                            <select name="division" required className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500">
                                {divisionOpts.map(div => <option key={div} value={div}>{div}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block mb-2 text-sm font-medium text-gray-700 font-bold uppercase tracking-wider text-[10px]">Shift Jam</label>
                            <select name="shiftTime" required className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500">
                                {shiftTimeOpts.map(time => (<option key={time} value={time}>{time}</option>))}
                            </select>
                        </div>
                        <div>
                            <label className="block mb-2 text-sm font-medium text-gray-700 font-bold uppercase tracking-wider text-[10px]">Shift ID</label>
                            <select name="shiftId" required className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500">
                                {shiftIdOpts.map(shift => (<option key={shift} value={shift}>{shift}</option>))}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block mb-2 text-sm font-medium text-gray-700 font-bold uppercase tracking-wider text-[10px]">Target Kuota (Plan MPP)</label>
                            <input type="number" name="planMpp" min="1" placeholder="Masukkan angka kuota (misal: 50)" required className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500" />
                        </div>
                        
                        {sessionType === 'PUBLIC' && (
                            <div className="md:col-span-2 flex items-center justify-between p-4 bg-blue-50 rounded-xl border border-blue-100">
                                <div>
                                    <p className="font-black text-blue-900 text-xs uppercase tracking-widest">Tutup Sesi Otomatis</p>
                                    <p className="text-[10px] text-blue-600 font-bold mt-1 uppercase">Sesi otomatis CLOSED jika kuota terpenuhi</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" name="autoClose" defaultChecked className="sr-only peer" />
                                    <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                            </div>
                        )}
                    </div>
                    <button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-lg transition-colors uppercase tracking-[0.2em] shadow-lg shadow-blue-100 mt-4">
                        {isLoading ? 'Memproses...' : 'Buat Sesi'}
                    </button>
                    {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
                </form>
            </div>
        </div>
    );
}

// --- SUB-COMPONENTS for active sessions ---

// MANUAL SESSION MANAGER (derived from Attendance.tsx)
interface LiveSessionManagerProps {
    session: DraftSession;
    records: Omit<AttendanceRecord, 'id' | 'checkout_timestamp' | 'manual_status' | 'is_takeout'>[];
    setRecords: React.Dispatch<React.SetStateAction<Omit<AttendanceRecord, 'id' | 'checkout_timestamp' | 'manual_status' | 'is_takeout'>[]>>;
    onEndSession: () => void;
    onCancelSession: () => void;
    workers: Worker[];
    attendanceHistory: AttendanceSession[];
}
const LiveSessionManager: React.FC<LiveSessionManagerProps> = ({ session, records, setRecords, onEndSession, onCancelSession, workers, attendanceHistory }) => {
    const [opsIdInput, setOpsIdInput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isEndingSession, setIsEndingSession] = useState(false);
    const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const { showToast } = useToast();

    useEffect(() => { inputRef.current?.focus(); }, []);
    
    const handleScan = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!opsIdInput.trim()) return;

        const worker = workers.find(w => w.opsId.toLowerCase() === opsIdInput.toLowerCase() && w.status === 'Active');
        if (!worker || !worker.id) { setError(`Worker with OpsID "${opsIdInput}" not found or is inactive.`); setOpsIdInput(''); return; }
        
        const allowedDepartment = divisionToDepartmentMap[session.division];
        if (allowedDepartment) {
            const isAllowed = Array.isArray(allowedDepartment) ? allowedDepartment.includes(worker.department) : worker.department === allowedDepartment;
            if (!isAllowed) { setError(`Worker ${worker.fullName} (${worker.department}) is not allowed in ${session.division} session.`); setOpsIdInput(''); return; }
        }
        
        if (records.some(r => r.opsId === worker.opsId)) { setError(`Worker ${worker.fullName} has already been scanned.`); setOpsIdInput(''); return; }

        const alreadyAttendedToday = attendanceHistory.some(s => s.date === session.date && s.records.some(r => r.workerId === worker!.id));
        if (alreadyAttendedToday) { setError(`Worker ${worker.fullName} already attended a session today.`); setOpsIdInput(''); return; }

        const shiftStartTime = session.shiftTime.split(' - ')[0];
        const officialTimestamp = new Date(session.date + 'T' + shiftStartTime).toISOString();
        const newRecord = {
            workerId: worker.id, opsId: worker.opsId, fullName: worker.fullName,
            timestamp: officialTimestamp, scan_timestamp: new Date().toISOString(), is_arrived: true
        };
        
        playSound('scan-success');
        setRecords(prev => [newRecord, ...prev]);
        setError(null);
        setOpsIdInput('');
    };
    
    const handleEndSession = async () => {
        setIsEndingSession(true);
        try {
            if (records.length > 0) {
                const { data: newSession, error: sessionError } = await supabase.from('attendance_sessions').insert({
                    id: uuidv4(), date: session.date, division: session.division, shift_time: session.shiftTime,
                    shift_id: session.shiftId, plan_mpp: session.planMpp, session_type: 'MANUAL'
                }).select().single();
                if (sessionError) throw sessionError;

                const recordsToInsert = records.map(rec => ({ session_id: newSession.id, worker_id: rec.workerId, timestamp: rec.timestamp, scan_timestamp: rec.scan_timestamp, is_arrived: true }));
                const { error: recordsError } = await supabase.from('attendance_records').insert(recordsToInsert);
                if (recordsError) throw recordsError;
            }
            showToast(`Sesi manual untuk ${session.division} berhasil disimpan.`, { type: 'success' });
            onEndSession();
        } catch(err: any) {
            showToast(`Gagal menyimpan sesi: ${err.message}`, { type: 'error' });
        } finally {
            setIsEndingSession(false);
        }
    }

    const handleConfirmCancel = () => {
        setIsCancelConfirmOpen(false);
        onCancelSession();
        showToast('Sesi manual dibatalkan.', { type: 'info' });
    };

    const handleRemoveRecord = (workerIdToRemove: string) => {
        setRecords(prev => prev.filter(record => record.workerId !== workerIdToRemove));
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Sesi Manual Aktif</h1>
            {/* Session Info Card */}
            {/* Scan Form, Records Table, Action Buttons */}
            {/* ... (This UI can be copied & adapted from the old Attendance.tsx) ... */}
            <form onSubmit={handleScan} className="flex gap-4">
                <input ref={inputRef} type="text" value={opsIdInput} onChange={(e) => setOpsIdInput(e.target.value)} placeholder="Scan or type OpsID..." className="w-full bg-white border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg">Submit</button>
            </form>
            {error && <p className="text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden border">
                <table className="w-full text-left text-sm">
                    {/* Table Head */}
                    <thead className="bg-blue-600 text-white"><tr><th className="p-4">OpsID</th><th className="p-4">Nama</th><th className="p-4">Jam Scan</th><th className="p-4 text-center">Aksi</th></tr></thead>
                    <tbody>
                        {records.map(rec => (
                            <tr key={rec.workerId} className="border-b">
                                <td className="p-4 font-mono">{rec.opsId}</td>
                                <td className="p-4">{rec.fullName}</td>
                                <td className="p-4 font-mono">{new Date(rec.scan_timestamp!).toLocaleTimeString('id-ID')}</td>
                                <td className="p-4 text-center"><button onClick={() => handleRemoveRecord(rec.workerId)} className="text-red-500"><DeleteIcon /></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="flex justify-end gap-4">
                <button onClick={() => setIsCancelConfirmOpen(true)} className="bg-gray-500 text-white font-bold py-2 px-6 rounded-lg">Batal</button>
                <button onClick={handleEndSession} className="bg-red-600 text-white font-bold py-2 px-6 rounded-lg" disabled={isEndingSession}>{isEndingSession ? 'Menyimpan...' : 'Akhiri Sesi'}</button>
            </div>
            <Modal isOpen={isCancelConfirmOpen} onClose={() => setIsCancelConfirmOpen(false)} title="Batalkan Sesi" size="sm">
                <p>Yakin ingin membatalkan sesi? Data yang sudah di-scan tidak akan tersimpan.</p>
                <div className="flex justify-end gap-4 mt-6"><button onClick={() => setIsCancelConfirmOpen(false)}>Tidak</button><button onClick={handleConfirmCancel}>Ya, Batalkan</button></div>
            </Modal>
        </div>
    );
};


// PUBLIC SESSION MONITOR (derived from OpenList.tsx)
interface PublicSessionMonitorProps {
    session: AttendanceSession;
    liveRecords: AttendanceRecord[];
    workers: Worker[];
    onCloseSession: () => void;
}
const PublicSessionMonitor: React.FC<PublicSessionMonitorProps> = ({ session, liveRecords, onCloseSession }) => {
    const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
    const { showToast } = useToast();

    const getPublicLink = () => `${window.location.origin}/attend/${session.id}`;

    const handleCloseSession = async () => {
        setIsCloseConfirmOpen(false);
        const { error } = await supabase.from('attendance_sessions').update({ status: 'CLOSED' }).eq('id', session.id);
        if (error) { showToast("Gagal menutup sesi: " + error.message, { type: 'error' }); return; }
        showToast('Sesi publik ditutup.', { type: 'info' });
        onCloseSession();
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Sesi Publik Aktif</h1>
            {/* Public Link Info, Records Table, Action Buttons */}
            {/* ... (This UI can be copied & adapted from the old OpenList.tsx) ... */}
            <div className="bg-green-50 p-6 rounded-xl border border-green-200">
                <input type="text" readOnly value={getPublicLink()} className="bg-white text-xs p-2 border rounded-lg w-full mb-2" />
                <button onClick={() => navigator.clipboard.writeText(getPublicLink()) && showToast('Link disalin!', {type: 'success'})} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg w-full">Salin Link</button>
            </div>
            <div className="bg-white rounded-lg shadow-lg overflow-hidden border">
                <table className="w-full text-left text-sm">
                    <thead className="bg-blue-600 text-white"><tr><th className="p-4">Waktu</th><th className="p-4">OpsID</th><th className="p-4">Nama</th><th className="p-4">Status</th></tr></thead>
                    <tbody>
                        {liveRecords.map(rec => (
                            <tr key={rec.id} className="border-b">
                                <td className="p-4 font-mono">{new Date(rec.scan_timestamp!).toLocaleTimeString('id-ID')}</td>
                                <td className="p-4 font-mono">{rec.opsId}</td>
                                <td className="p-4">{rec.fullName}</td>
                                <td className="p-4"><span className={`px-2 py-1 text-xs rounded-full ${rec.manual_status === 'Buffer' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>{rec.manual_status || 'On Plan'}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="flex justify-end">
                <button onClick={() => setIsCloseConfirmOpen(true)} className="bg-red-600 text-white font-bold py-2 px-6 rounded-lg">Tutup Sesi</button>
            </div>
             <Modal isOpen={isCloseConfirmOpen} onClose={() => setIsCloseConfirmOpen(false)} title="Tutup Sesi Publik" size="sm">
                <p>Yakin ingin menutup sesi? Link absensi akan nonaktif.</p>
                <div className="flex justify-end gap-4 mt-6"><button onClick={() => setIsCloseConfirmOpen(false)}>Batal</button><button onClick={handleCloseSession}>Ya, Tutup</button></div>
            </Modal>
        </div>
    );
}

export default CreateSession;
