
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { AttendanceSession, Worker } from '../types';

const PublicAttendance: React.FC = () => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [opsId, setOpsId] = useState('');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [suggestions, setSuggestions] = useState<Worker[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'buffer' | 'error' | 'closed' | 'locked'>('idle');
  const [message, setMessage] = useState('');
  const [submittedData, setSubmittedData] = useState<{name: string, time: string} | null>(null);

  useEffect(() => {
    const path = window.location.pathname;
    const parts = path.split('/');
    const id = parts[parts.length - 1];
    setSessionId(id);

    const lockKey = `nexus_attended_${id}`;
    if (localStorage.getItem(lockKey)) {
        setStatus('locked');
        return;
    }

    const fetchSession = async () => {
        const { data } = await supabase.from('attendance_sessions').select('*').eq('id', id).maybeSingle();
        if(data) {
            setSession(data);
            if (data.status === 'CLOSED') {
                setStatus('closed');
            }
        } else {
            setStatus('error');
            setMessage('Sesi tidak ditemukan.');
        }
    };
    
    const fetchWorkers = async () => {
        const { data } = await supabase.from('workers').select('*').eq('status', 'Active');
        if(data) setWorkers(data);
    };

    fetchSession();
    fetchWorkers();

    const channel = supabase.channel(`public_session_${id}`)
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'attendance_sessions', filter: `id=eq.${id}` },
            (payload) => {
                const newSession = payload.new as AttendanceSession;
                if (newSession.status === 'CLOSED') {
                    setStatus('closed');
                }
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
  }, []);

  const handleSearch = (text: string) => {
      setOpsId(text);
      if(text.length > 1) {
          const filtered = workers.filter(w => 
              w.opsId.toLowerCase().includes(text.toLowerCase()) || 
              w.fullName.toLowerCase().includes(text.toLowerCase())
          ).slice(0, 5);
          setSuggestions(filtered);
      } else {
          setSuggestions([]);
      }
  };

  const selectWorker = (w: Worker) => {
      setOpsId(w.opsId);
      setSuggestions([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!session || !opsId) return;
      
      if (session.status === 'CLOSED' || status === 'closed') {
          setStatus('closed');
          return;
      }
      
      setStatus('loading');

      const worker = workers.find(w => w.opsId.toLowerCase() === opsId.trim().toLowerCase());
      
      if(!worker) {
          setMessage("OpsID tidak ditemukan atau Non-Aktif (Cek ejaan/status).");
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
          // AUTO CLOSE LOGIC
          const newCount = currentCount + 1;
          if (session.auto_close && newCount >= session.planMpp) {
              await supabase.from('attendance_sessions').update({ status: 'CLOSED' }).eq('id', session.id);
          }

          if (sessionId) {
              localStorage.setItem(`nexus_attended_${sessionId}`, 'true');
          }
          
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
                  <h1 className="text-2xl font-bold text-gray-800 mb-2">SESI DITUTUP</h1>
                  <p className="text-gray-600">
                      Mohon maaf, kuota sesi Open List ini telah terpenuhi atau telah berakhir. Silakan hubungi Pak Korlap jika Kamu tidak kebagian list.
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
                  <h1 className="text-2xl font-bold text-gray-800 mb-2">SUDAH ABSEN</h1>
                  <p className="text-gray-600">
                      Perangkat ini sudah digunakan untuk melakukan absensi pada sesi ini. Terima kasih.
                  </p>
              </div>
          </div>
      );
  }

  if(!session) {
      if(status === 'error') return <div className="p-8 text-center text-red-600 mt-10">Error: {message}</div>;
      return <div className="p-8 text-center text-gray-600 mt-10 animate-pulse font-black uppercase tracking-widest text-xs">Memuat data sesi...</div>;
  }

  if (status === 'success' || status === 'buffer') {
      return (
          <div className={`min-h-screen flex flex-col items-center justify-center p-4 ${status === 'success' ? 'bg-green-50' : 'bg-yellow-50'}`}>
              <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${status === 'success' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
                      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <h1 className={`text-2xl font-bold mb-2 ${status === 'success' ? 'text-green-700' : 'text-yellow-700'}`}>
                      {status === 'success' ? 'ABSEN BERHASIL!' : 'BERHASIL (BUFFER)'}
                  </h1>
                  <p className="text-gray-600 mb-6">
                      Halo <strong>{submittedData?.name}</strong>, absen Anda diterima pada jam {submittedData?.time}, Harap hadir ke tenda 2 jam sebelum jam masuk untuk konfirmasi kehadiran fisik.
                      {status === 'buffer' && <span className="block mt-2 text-sm text-yellow-600 font-semibold">Kuota Plan sudah penuh. Ops Kamu masuk sebagai Buffer.</span>}
                  </p>
                  <p className="text-xs text-gray-400 mt-4">
                      Anda tidak dapat menggunakan perangkat ini lagi untuk absen di sesi ini.
                  </p>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4 sm:pt-10">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-visible relative"> 
          <div className="bg-blue-600 p-6 text-white text-center rounded-t-xl shadow-lg shadow-blue-200">
              <h1 className="text-2xl font-black tracking-wider uppercase">ABSENSI NEXUS</h1>
              <p className="opacity-90 text-xs font-bold mt-1 uppercase tracking-widest">SUNTER DC</p>
          </div>
          <div className="p-6">
              <div className="mb-6 text-center border-b pb-4">
                  <p className="text-[10px] text-gray-400 uppercase font-black tracking-[0.2em]">Sesi Aktif</p>
                  <h2 className="text-xl font-black text-gray-800 mt-1 tracking-tight uppercase">{session.division}</h2>
                  <p className="text-gray-500 font-bold text-sm">{session.date} | {session.shiftTime}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="relative">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Cari OpsID / Nama Lengkap</label>
                      <input 
                        type="text" 
                        value={opsId}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="w-full border-2 border-gray-100 bg-gray-50 rounded-2xl p-4 text-lg font-bold text-gray-800 focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
                        placeholder="Ketik OpsID..."
                        required
                        autoComplete="off"
                      />
                      {suggestions.length > 0 && (
                          <ul className="absolute z-50 w-full bg-white border border-gray-100 rounded-2xl shadow-2xl mt-2 max-h-60 overflow-y-auto overflow-x-hidden">
                              {suggestions.map(w => (
                                  <li key={w.id} onClick={() => selectWorker(w)} className="p-4 hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0 transition-colors flex items-center justify-between group">
                                      <div className="flex-1 min-w-0 pr-4">
                                          <p className="font-black text-gray-800 text-sm uppercase truncate group-hover:text-blue-600">{w.fullName}</p>
                                          <p className="text-xs text-black font-mono font-black mt-0.5">{w.opsId}</p>
                                      </div>
                                      <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                      </div>
                                  </li>
                              ))}
                          </ul>
                      )}
                  </div>
                  
                  {status === 'error' && (
                      <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-xs font-bold border border-red-100 flex items-center gap-3 animate-shake">
                          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          {message}
                      </div>
                  )}

                  <button 
                    type="submit" 
                    disabled={status === 'loading'}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-2xl text-xs uppercase tracking-[0.2em] shadow-xl shadow-blue-100 transition-all active:scale-[0.98] mt-4 flex items-center justify-center gap-3"
                  >
                      {status === 'loading' ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            <span>Memproses...</span>
                          </>
                      ) : 'Absen Sekarang'}
                  </button>
              </form>
          </div>
          <div className="bg-gray-50 p-4 text-center text-[10px] text-gray-400 font-black uppercase tracking-widest rounded-b-xl border-t border-gray-100">
              Satu perangkat hanya berlaku untuk satu kali absen.
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
