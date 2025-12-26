
import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabaseClient';
import { AttendanceSession, AttendanceRecord, Worker } from '../types';
import CopyIcon from '../components/icons/CopyIcon';
import DeleteIcon from '../components/icons/DeleteIcon';
import { useToast } from '../hooks/useToast';
import Modal from '../components/Modal';

interface OpenListProps {
  workers: Worker[];
}

// Fallbacks
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

const OpenList: React.FC<OpenListProps> = ({ workers }) => {
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null);
  const [liveRecords, setLiveRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [autoClose, setAutoClose] = useState(true);
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
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
      const restoreSession = async () => {
          const today = getTodayString();
          const { data } = await supabase
              .from('attendance_sessions')
              .select('*')
              .eq('status', 'OPEN')
              .eq('date', today)
              .eq('session_type', 'PUBLIC')
              .order('id', { ascending: false })
              .limit(1)
              .maybeSingle();
          
          if (data) {
              setActiveSession({ ...data, records: [] });
          }
      };
      restoreSession();
  }, []);

  useEffect(() => {
    if (!activeSession) return;

    const fetchLiveRecords = async () => {
        const { data } = await supabase
          .from('attendance_records')
          .select('*')
          .eq('session_id', activeSession.id)
          .order('timestamp', { ascending: false });

        if (data) {
// FIX: Explicitly map database record to AttendanceRecord type to avoid type mismatch.
// The database uses snake_case (e.g., worker_id) and may have null values,
// while the TypeScript type expects camelCase (e.g., workerId) and non-nullable booleans.
           const enrichedData: AttendanceRecord[] = data.map((rec: any) => {
               const worker = workers.find(w => w.id === rec.worker_id);
               return {
                   id: rec.id,
                   workerId: rec.worker_id,
                   opsId: worker?.opsId || 'N/A',
                   fullName: worker?.fullName || 'Unknown',
                   timestamp: rec.timestamp,
                   scan_timestamp: rec.scan_timestamp,
                   checkout_timestamp: rec.checkout_timestamp,
                   manual_status: rec.manual_status,
                   is_takeout: rec.is_takeout ?? false,
                   is_arrived: rec.is_arrived,
               };
           });
           setLiveRecords(enrichedData);
        }
    };
    fetchLiveRecords();

    const channel = supabase.channel(`open_list_${activeSession.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_records', filter: `session_id=eq.${activeSession.id}` },
        async (payload) => {
            if (payload.eventType === 'INSERT') {
                 const newRecord = payload.new as any;
                 const worker = workers.find(w => w.id === newRecord.worker_id);
                 const enriched: AttendanceRecord = {
                   id: newRecord.id,
                   workerId: newRecord.worker_id,
                   opsId: worker?.opsId || 'N/A',
                   fullName: worker?.fullName || 'Unknown',
                   timestamp: newRecord.timestamp,
                   scan_timestamp: newRecord.scan_timestamp,
                   checkout_timestamp: newRecord.checkout_timestamp,
                   manual_status: newRecord.manual_status,
                   is_takeout: newRecord.is_takeout ?? false,
                   is_arrived: newRecord.is_arrived
                 };
                 setLiveRecords(prev => [enriched, ...prev]);
            } else if (payload.eventType === 'UPDATE') {
                const updated = payload.new as any;
                 setLiveRecords(prev => prev.map(r => {
                    if (r.id === updated.id) {
                        const worker = workers.find(w => w.id === updated.worker_id);
                        return {
                            ...r,
                            id: updated.id,
                            workerId: updated.worker_id,
                            opsId: worker?.opsId || r.opsId,
                            fullName: worker?.fullName || r.fullName,
                            timestamp: updated.timestamp,
                            scan_timestamp: updated.scan_timestamp,
                            checkout_timestamp: updated.checkout_timestamp,
                            manual_status: updated.manual_status,
                            is_takeout: updated.is_takeout ?? false,
                            is_arrived: updated.is_arrived,
                        };
                    }
                    return r;
                 }));
            } else if (payload.eventType === 'DELETE') {
                 setLiveRecords(prev => prev.filter(r => r.id !== (payload.old as any).id));
            }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'attendance_sessions', filter: `id=eq.${activeSession.id}` },
        (payload) => {
            const updatedSession = payload.new as AttendanceSession;
            if (updatedSession.status === 'CLOSED') {
                const sessionIdToRedirect = activeSession.id;
                // No need to set state, component will unmount.
                window.location.href = `/?page=Dashboard&manageId=${sessionIdToRedirect}`;
            }
        }
      )
      .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
  }, [activeSession?.id, workers]);

  const handleCreateSession = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const newSessionId = uuidv4();
    
    const sessionData = {
      id: newSessionId,
      date: formData.get('sessionDate') as string,
      division: formData.get('division') as string,
      shiftTime: formData.get('shiftTime') as string,
      shiftId: formData.get('shiftId') as string,
      planMpp: parseInt(formData.get('planMpp') as string, 10),
      auto_close: autoClose,
      status: 'OPEN' as const,
      session_type: 'PUBLIC' as const
    };

    const { error: insertError } = await supabase
      .from('attendance_sessions')
      .insert(sessionData);

    if (insertError) {
      setError(insertError.message);
      setIsLoading(false);
      showToast(`Gagal membuat link: ${insertError.message}`, { type: 'error', title: 'Error' });
    } else {
      setActiveSession({ ...sessionData, records: [] });
      showToast('Link absensi publik berhasil dibuat.', { type: 'success', title: 'Berhasil Dibuat' });
      setIsLoading(false);
    }
  };

  const handleCloseSession = async () => {
      if (!activeSession) return;
      setIsCloseConfirmOpen(false);
      const { error } = await supabase.from('attendance_sessions').update({ status: 'CLOSED' }).eq('id', activeSession.id);
      if (error) {
          showToast("Gagal menutup sesi: " + error.message, { type: 'error', title: 'Error' });
          return;
      }
      showToast('Sesi publik ditutup. Mengalihkan ke Dashboard...', { type: 'info', title: 'Sesi Ditutup' });
      const sessionId = activeSession.id;
      setActiveSession(null);
      setLiveRecords([]);
      setTimeout(() => {
        window.location.href = `/?page=Dashboard&manageId=${sessionId}`;
      }, 1500);
  };

  const getPublicLink = () => {
      if(!activeSession) return '';
      return `${window.location.origin}/attend/${activeSession.id}`;
  };

  const copyToClipboard = () => {
      navigator.clipboard.writeText(getPublicLink());
      setCopySuccess(true);
      showToast('Link berhasil disalin ke clipboard.', { type: 'success', title: 'Tersalin!' });
      setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleDeleteRecord = async (recordId: number) => {
      const { error } = await supabase.from('attendance_records').delete().eq('id', recordId);
      if(error) {
        showToast(`Gagal menghapus: ${error.message}`, { type: 'error', title: 'Error' });
      } else {
        showToast('Data berhasil dihapus dari sesi ini.', { type: 'success', title: 'Berhasil Dihapus' });
        setLiveRecords(prev => prev.filter(r => r.id !== recordId));
      }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Open List (Absensi Mandiri)</h1>
      
      {!activeSession ? (
         <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200">
             <h2 className="text-xl font-semibold mb-4 text-blue-600">Buat Link Absensi Baru</h2>
             <form onSubmit={handleCreateSession} className="space-y-4 max-w-2xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block mb-2 text-sm font-medium text-gray-700 font-bold uppercase tracking-wider text-[10px]">Tanggal</label>
                        <input type="date" name="sessionDate" defaultValue={getTodayString()} required className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500" />
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
                    
                    {/* TOGGLE AUTO CLOSE */}
                    <div className="md:col-span-2 flex items-center justify-between p-4 bg-blue-50 rounded-xl border border-blue-100">
                        <div>
                            <p className="font-black text-blue-900 text-xs uppercase tracking-widest">Tutup Sesi Otomatis</p>
                            <p className="text-[10px] text-blue-600 font-bold mt-1 uppercase">Sesi otomatis CLOSED jika kuota terpenuhi</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={autoClose} 
                              onChange={() => setAutoClose(!autoClose)} 
                              className="sr-only peer" 
                            />
                            <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>
                </div>
                <button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-lg transition-colors uppercase tracking-[0.2em] shadow-lg shadow-blue-100 mt-4">
                    {isLoading ? 'Membuat Link...' : 'Generate Link Absensi'}
                </button>
                {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
             </form>
         </div>
      ) : (
          <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 animate-fade-in">
                  <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                      <div>
                          <div className="flex items-center gap-2">
                            <span className="bg-green-200 text-green-800 text-[10px] font-black px-2 py-1 rounded-full animate-pulse uppercase tracking-widest">LIVE OPEN</span>
                            {activeSession.auto_close && <span className="bg-blue-200 text-blue-800 text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest">Auto-Close ON</span>}
                          </div>
                          <h2 className="text-2xl font-black text-gray-800 mt-2 uppercase tracking-tight">{activeSession.division}</h2>
                          <p className="text-gray-600 font-bold">{activeSession.date} | {activeSession.shiftTime}</p>
                          <p className="text-xs text-gray-500 font-mono mt-1">ID: {activeSession.shiftId}</p>
                      </div>
                      <div className="flex flex-col items-end gap-3">
                           <div className="flex items-center gap-2 bg-white p-2 rounded-lg border shadow-sm w-full md:w-auto">
                               <input type="text" readOnly value={getPublicLink()} className="bg-transparent text-xs text-gray-600 w-48 md:w-64 outline-none font-bold" />
                               <button onClick={copyToClipboard} className="text-blue-600 hover:text-blue-800 font-black text-xs flex items-center gap-1 uppercase">
                                   <CopyIcon /> {copySuccess ? 'Copied!' : 'Copy'}
                               </button>
                           </div>
                           <button onClick={() => setIsCloseConfirmOpen(true)} className="bg-red-600 hover:bg-red-700 text-white font-black py-2 px-6 rounded-lg shadow-sm w-full md:w-auto uppercase text-xs tracking-widest">
                               Tutup Sesi
                           </button>
                      </div>
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-lg shadow border border-t-4 border-blue-500">
                      <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Total Hadir</p>
                      <p className="text-3xl font-black text-blue-600">{liveRecords.length}</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow border border-t-4 border-green-500">
                      <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">On Plan</p>
                      <p className="text-3xl font-black text-green-600">
                          {liveRecords.filter(r => !r.manual_status).length}
                      </p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Kuota: {activeSession.planMpp}</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow border border-t-4 border-yellow-500">
                      <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Buffer</p>
                      <p className="text-3xl font-black text-yellow-600">
                           {liveRecords.filter(r => r.manual_status === 'Buffer').length}
                      </p>
                  </div>
              </div>

              <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
                  <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                      <h3 className="font-black text-gray-700 uppercase text-xs tracking-[0.2em]">Real-time Monitor</h3>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Stream Active</span>
                      </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-blue-600 text-white uppercase text-xs">
                            <tr>
                                <th className="p-4 font-black tracking-widest">Waktu</th>
                                <th className="p-4 font-black tracking-widest">OpsID</th>
                                <th className="p-4 font-black tracking-widest">Nama</th>
                                <th className="p-4 font-black tracking-widest">Status</th>
                                <th className="p-4 font-black tracking-widest text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {liveRecords.map(rec => (
                                <tr key={rec.id} className="hover:bg-blue-50 transition-colors">
                                    <td className="p-4 font-mono text-gray-400 font-bold text-xs">
                                        {new Date(rec.scan_timestamp || rec.timestamp).toLocaleTimeString('id-ID')}
                                    </td>
                                    <td className="p-4 font-mono font-black text-black">{rec.opsId}</td>
                                    <td className="p-4 font-bold text-gray-800 uppercase text-xs">{rec.fullName}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                            rec.manual_status === 'Buffer' 
                                            ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' 
                                            : 'bg-green-100 text-green-800 border border-green-200'
                                        }`}>
                                            {rec.manual_status || 'On Plan'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        <button onClick={() => handleDeleteRecord(rec.id)} className="text-red-400 hover:text-red-600 transition-transform active:scale-90 p-1">
                                            <DeleteIcon />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {liveRecords.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-gray-400 italic font-bold uppercase tracking-widest text-xs">
                                        Menunggu pendaftar pertama masuk...
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                  </div>
              </div>
          </div>
      )}

      <Modal isOpen={isCloseConfirmOpen} onClose={() => setIsCloseConfirmOpen(false)} title="Tutup Sesi Publik" size="sm" scrollable={false}>
          <div>
              <p className="text-gray-600">Apakah Anda yakin ingin menutup sesi ini? Link absensi akan menjadi tidak aktif.</p>
              <div className="flex justify-end gap-3 mt-6">
                  <button onClick={() => setIsCloseConfirmOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium">
                      Batal
                  </button>
                  <button onClick={handleCloseSession} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold">
                      Ya, Tutup Sesi
                  </button>
              </div>
          </div>
      </Modal>
    </div>
  );
};

export default OpenList;