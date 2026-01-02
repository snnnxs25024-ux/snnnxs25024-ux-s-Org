
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { AttendanceSession, Worker } from '../types';
import { playSound } from '../utils/sound';

const PublicAttendance: React.FC = () => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [opsId, setOpsId] = useState('');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [suggestions, setSuggestions] = useState<Worker[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'buffer' | 'error' | 'closed' | 'locked'>('idle');
  const [message, setMessage] = useState('');
  const [submittedData, setSubmittedData] = useState<{name: string, time: string} | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    const path = window.location.pathname;
    const parts = path.split('/');
    const id = parts[parts.length - 1];
    setSessionId(id);
    
    if (!id) {
        setDataLoading(false);
        setStatus('error');
        setMessage('Sesi tidak ditemukan atau URL tidak valid.');
        return;
    }

    // --- REAL-TIME SUBSCRIPTION ---
    // This must always be active to listen for session closure events.
    const channel = supabase.channel(`public_session_${id}`)
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'attendance_sessions', filter: `id=eq.${id}` },
            (payload) => {
                const newSession = payload.new as any;
                if (newSession.status === 'CLOSED') {
                    // This is the source of truth. If the session is closed, all clients must update.
                    setStatus('closed');
                }
            }
        )
        .subscribe();

    const initializePage = async () => {
        setDataLoading(true);
        const lockKey = `absenin_attended_${id}`;

        // 1. Check DB for session status first. This is the ultimate source of truth.
        const { data: sessionData, error: sessionError } = await supabase.from('attendance_sessions').select('*').eq('id', id).maybeSingle();
        
        if (sessionError || !sessionData) {
            setStatus('error');
            setMessage('Sesi tidak ditemukan atau tidak valid.');
            setDataLoading(false);
            return;
        }

        // 2. If session is closed, show closed screen regardless of lock status.
        if (sessionData.status === 'CLOSED') {
            setStatus('closed');
            setDataLoading(false);
            return;
        }
        
        // 3. Session is OPEN. Now check if this device has already attended.
        if (localStorage.getItem(lockKey)) {
            setStatus('locked');
            setDataLoading(false);
            return;
        }
        
        // 4. Session is OPEN and device is NOT locked. Proceed to fetch worker data for attendance form.
        const sessionState: AttendanceSession = {
            id: sessionData.id,
            date: sessionData.date,
            division: sessionData.division,
            shiftTime: sessionData.shift_time,
            shiftId: sessionData.shift_id,
            planMpp: sessionData.plan_mpp,
            status: sessionData.status,
            session_type: sessionData.session_type,
            auto_close: sessionData.auto_close,
            records: []
        };
        setSession(sessionState);
        
        const { data: workerData, error: workerError } = await supabase
            .from('workers')
            .select('id, ops_id, full_name, department, status')
            .eq('status', 'Active');

        if (workerError) {
            console.error("Worker fetch error:", workerError);
            setStatus('error');
            setMessage('Gagal memuat daftar karyawan. (Error: DB)');
            setDataLoading(false);
            return;
        }
        
        if (!workerData || workerData.length === 0) {
            setStatus('error');
            setMessage('Tidak dapat mengambil daftar karyawan. Harap hubungi admin untuk memeriksa konfigurasi.');
            setDataLoading(false);
            return;
        }

        const typedWorkers: Worker[] = workerData.map((w: any) => ({
            id: w.id,
            opsId: w.ops_id,
            fullName: w.full_name,
            department: w.department,
            status: w.status,
            nik: '', phone: '', contractType: 'Daily Worker Vendor', createdAt: '',
        }));
        setWorkers(typedWorkers);
        setDataLoading(false);
    };

    initializePage();

    // Cleanup function to remove the channel subscription when the component unmounts.
    return () => {
        supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const handleSearch = (text: string) => {
      setOpsId(text);
      if(text.length > 1) {
          const lowerText = text.trim().toLowerCase();
          const filtered = workers.filter(w => 
              (w.opsId && w.opsId.trim().toLowerCase().includes(lowerText)) || 
              (w.fullName && w.fullName.trim().toLowerCase().includes(lowerText))
          ).slice(0, 5);
          setSuggestions(filtered);
      } else {
          setSuggestions([]);
      }
  };

  const selectWorker = (w: Worker) => {
      setOpsId(w.opsId);
      setSuggestions([]);
      inputRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!session || !opsId || dataLoading) return;
      
      if (session.status === 'CLOSED' || status === 'closed') {
          setStatus('closed');
          return;
      }
      
      setStatus('loading');

      const trimmedInput = opsId.trim().toLowerCase();
      const worker = workers.find(w => {
        if (!w.opsId || !w.fullName) return false;
        
        const workerOpsIdLower = w.opsId.trim().toLowerCase();
        const workerFullNameLower = w.fullName.trim().toLowerCase();
        
        // 1. Check for exact case-insensitive match on OpsID or full name
        if (workerOpsIdLower === trimmedInput || workerFullNameLower === trimmedInput) {
            return true;
        }

        // 2. Allow matching just the numeric part of the OpsID
        if (/^\d+$/.test(trimmedInput)) {
            const numericPartOfWorkerOpsId = workerOpsIdLower.replace(/[^0-9]/g, '');
            if (numericPartOfWorkerOpsId === trimmedInput) {
                return true;
            }
        }
        
        return false;
      });
      
      if(!worker) {
          setMessage("OpsID / Nama tidak ditemukan atau status Non-Aktif.");
          setStatus('error');
          return;
      }

      const { data: existingDaily, error: checkError } = await supabase
        .from('attendance_records')
        .select('id, attendance_sessions!inner(date)')
        .eq('worker_id', worker.id)
        .eq('attendance_sessions.date', session.date);
      
      if (checkError) {
          setMessage("Gagal memvalidasi data. Coba lagi.");
          setStatus('error');
          return;
      }

      if(existingDaily && existingDaily.length > 0) {
          setMessage(`OpsID ini sudah absen pada tanggal ${session.date} (Max 1x per hari).`);
          setStatus('error');
          return;
      }

      const { count } = await supabase
        .from('attendance_records')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', session.id);
      
      const currentCount = count || 0;
      let manualStatus = null;
      let resultStatus: 'success' | 'buffer' = 'success';

      if (currentCount >= session.planMpp) {
          manualStatus = 'Buffer';
          resultStatus = 'buffer';
      }

      const shiftStartTime = session.shiftTime.split(' - ')[0];
      const officialTimestamp = new Date(session.date + 'T' + shiftStartTime).toISOString();
      
      const { error } = await supabase.from('attendance_records').insert({
          session_id: session.id,
          worker_id: worker.id,
          timestamp: officialTimestamp,
          scan_timestamp: new Date().toISOString(),
          manual_status: manualStatus,
          is_arrived: false 
      });

      if(error) {
          setMessage("Gagal menyimpan data. Coba lagi.");
          setStatus('error');
      } else {
          const newTotalCount = currentCount + 1;
          if (session.auto_close && newTotalCount >= session.planMpp) {
              await supabase.from('attendance_sessions')
                .update({ status: 'CLOSED' })
                .eq('id', session.id);
          }

          if (sessionId) {
              localStorage.setItem(`absenin_attended_${sessionId}`, 'true');
          }
          
          playSound('scan-success');
          setSubmittedData({
              name: worker.fullName,
              time: new Date().toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})
          });
          setStatus(resultStatus);
      }
  };

  if (status === 'closed') {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-100">
              <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center border-t-8 border-red-500">
                   <div className="w-20 h-20 rounded-full bg-red-100 text-red-500 flex items-center justify-center mx-auto mb-4">
                      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <h1 className="text-2xl font-black text-gray-800 mb-2 uppercase tracking-tight">Sesi Ditutup</h1>
                  <p className="text-gray-600 font-bold text-sm uppercase leading-relaxed">
                      Mohon maaf, pendaftaran untuk sesi ini telah ditutup karena kuota terpenuhi atau batas waktu berakhir.
                  </p>
              </div>
          </div>
      );
  }

  if (status === 'locked') {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-100">
              <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center border-t-8 border-blue-500">
                   <div className="w-20 h-20 rounded-full bg-blue-100 text-blue-500 flex items-center justify-center mx-auto mb-4">
                      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  </div>
                  <h1 className="text-2xl font-black text-gray-800 mb-2 uppercase tracking-tight">Sudah Absen</h1>
                  <p className="text-gray-600 font-bold text-sm uppercase">
                      Perangkat ini sudah digunakan untuk absen pada sesi ini. Terima kasih.
                  </p>
              </div>
          </div>
      );
  }

  if(dataLoading) {
      return <div className="p-12 text-center text-gray-600 mt-10 animate-pulse font-black uppercase tracking-[0.3em] text-[10px]">Initializing Session...</div>;
  }
  
  if(!session && status === 'error') {
      return <div className="p-8 text-center text-red-600 mt-10 font-bold uppercase tracking-widest text-xs">Error: {message || 'Sesi tidak dapat dimuat.'}</div>;
  }

  if (status === 'success' || status === 'buffer') {
      return (
          <div className={`min-h-screen flex flex-col items-center justify-center p-4 ${status === 'success' ? 'bg-green-50' : 'bg-yellow-50'}`}>
              <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center border-t-4 border-blue-600">
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${status === 'success' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
                      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <h1 className={`text-2xl font-black mb-2 uppercase tracking-tight ${status === 'success' ? 'text-green-700' : 'text-yellow-700'}`}>
                      {status === 'success' ? 'Berhasil Terdaftar' : 'Berhasil (Buffer)'}
                  </h1>
                  <p className="text-gray-600 font-bold text-xs uppercase mb-6 leading-relaxed">
                      Halo <strong>{submittedData?.name}</strong>, absen Anda diterima pada jam {submittedData?.time}. Harap hadir ke tenda 2 jam sebelum jam masuk untuk konfirmasi.
                      {status === 'buffer' && <span className="block mt-3 text-[10px] text-yellow-600 font-black uppercase tracking-widest border border-yellow-200 bg-yellow-50 p-2 rounded-lg">Kuota Plan Penuh - Anda masuk daftar cadangan.</span>}
                  </p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest border-t pt-4">
                      Device ID Locked: {sessionId?.substring(0,8)}
                  </p>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4 sm:pt-10 font-sans">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-visible relative border border-gray-100"> 
          <div className="bg-blue-600 p-8 text-white text-center rounded-t-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16"></div>
              <h1 className="text-2xl font-black tracking-[0.2em] uppercase">ABSENIN</h1>
              <p className="opacity-80 text-[10px] font-black uppercase tracking-[0.4em] mt-2">Portal Absensi</p>
          </div>
          <div className="p-8">
              <div className="mb-8 text-center border-b border-gray-100 pb-6">
                  <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest mb-2">Live Session</p>
                  <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">{session?.division}</h2>
                  <p className="text-gray-500 font-bold text-sm mt-1">{session?.date} | {session?.shiftTime}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="relative">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Cari OpsID / Nama Lengkap</label>
                      <input 
                        ref={inputRef}
                        type="text" 
                        value={opsId}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="w-full border-2 border-gray-100 bg-gray-50 rounded-2xl p-4 text-lg font-black text-gray-800 focus:border-blue-500 focus:bg-white focus:outline-none transition-all placeholder:text-gray-300 disabled:opacity-50"
                        placeholder={dataLoading ? "Memuat data karyawan..." : "Ketik OpsID..."}
                        required
                        autoComplete="off"
                        disabled={dataLoading || workers.length === 0}
                      />
                      {suggestions.length > 0 && (
                          <ul className="absolute z-50 w-full bg-white border border-gray-100 rounded-2xl shadow-2xl mt-2 max-h-64 overflow-y-auto">
                              {suggestions.map(w => (
                                  <li key={w.id} onClick={() => selectWorker(w)} className="p-4 hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0 transition-colors group">
                                      <p className="font-black text-gray-800 text-xs uppercase group-hover:text-blue-600">{w.fullName}</p>
                                      <p className="text-[10px] text-black font-mono font-black mt-1">{w.opsId}</p>
                                  </li>
                              ))}
                          </ul>
                      )}
                  </div>
                  
                  {status === 'error' && (
                      <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-red-100 flex items-center gap-3 animate-shake">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          {message}
                      </div>
                  )}

                  <button 
                    type="submit" 
                    disabled={status === 'loading' || dataLoading || workers.length === 0}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-2xl text-xs uppercase tracking-[0.2em] shadow-xl shadow-blue-200 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  >
                      {status === 'loading' || dataLoading ? (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : 'Konfirmasi Absensi'}
                  </button>
              </form>
          </div>
          <div className="bg-gray-50 p-5 text-center text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] rounded-b-2xl border-t border-gray-100">
              1 Perangkat = 1 Absensi
          </div>
      </div>
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
      `}</style>
    </div>
  );
};

export default PublicAttendance;
