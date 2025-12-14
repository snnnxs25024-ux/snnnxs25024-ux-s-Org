
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
    // Extract ID from URL: /attend/{id}
    const path = window.location.pathname;
    const parts = path.split('/');
    const id = parts[parts.length - 1];
    setSessionId(id);

    // 1. Check Device Lock (1 Device 1 Attendance)
    const lockKey = `nexus_attended_${id}`;
    if (localStorage.getItem(lockKey)) {
        setStatus('locked');
        return;
    }

    // 2. Fetch Session & Status
    const fetchSession = async () => {
        const { data, error } = await supabase.from('attendance_sessions').select('*').eq('id', id).single();
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
    
    // 3. Fetch Active Workers for Autocomplete
    const fetchWorkers = async () => {
        const { data } = await supabase.from('workers').select('*').eq('status', 'Active');
        if(data) setWorkers(data);
    };

    fetchSession();
    fetchWorkers();

    // 4. Realtime Listener for Session Close
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
          // Case-insensitive filtering
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
      
      // Safety Check for Closed Session
      if (session.status === 'CLOSED' || status === 'closed') {
          setStatus('closed');
          return;
      }
      
      setStatus('loading');

      // 1. Validate Worker (Case Insensitive Check)
      // Ini memperbaiki masalah dimana OpsID "Active" tapi dibilang tidak ditemukan karena beda huruf besar/kecil
      const worker = workers.find(w => w.opsId.toLowerCase() === opsId.trim().toLowerCase());
      
      if(!worker) {
          setMessage("OpsID tidak ditemukan atau Non-Aktif (Cek ejaan/status).");
          setStatus('error');
          return;
      }

      // 2. Validate Duplicate (Server Check)
      const { data: existing } = await supabase
        .from('attendance_records')
        .select('id')
        .eq('session_id', session.id)
        .eq('worker_id', worker.id);
      
      if(existing && existing.length > 0) {
          setMessage("OpsID ini sudah absen sebelumnya!");
          setStatus('error');
          return;
      }

      // 3. Check Plan vs Buffer
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

      // 4. Insert
      const shiftStartTime = session.shiftTime.split(' - ')[0];
      const officialTimestamp = new Date(session.date + 'T' + shiftStartTime).toISOString();
      
      const { error } = await supabase.from('attendance_records').insert({
          session_id: session.id,
          worker_id: worker.id,
          timestamp: officialTimestamp,
          scan_timestamp: new Date().toISOString(),
          manual_status: manualStatus,
          is_arrived: false // Set to FALSE so admin must check it manually in Dashboard
      });

      if(error) {
          setMessage("Gagal menyimpan data. Coba lagi.");
          setStatus('error');
      } else {
          // 5. Set Local Lock
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
                      Mohon maaf, sesi Open List ini telah berakhir. Silakan hubungi Pak Korlap jika Kamu Tidak Kebagian List.
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
      return <div className="p-8 text-center text-gray-600 mt-10 animate-pulse">Memuat data sesi...</div>;
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
                      Halo <strong>{submittedData?.name}</strong>, absen Anda diterima pada jam {submittedData?.time}, Harap Hadir Ke Tenda 2 Jam Sebelum Jam Masuk Untuk Konfirmasi Kehadiran.
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
          <div className="bg-blue-600 p-6 text-white text-center rounded-t-xl">
              <h1 className="text-2xl font-bold tracking-wider">ABSENSI NEXUS</h1>
              <p className="opacity-90 text-sm mt-1">SUNTER DC</p>
          </div>
          <div className="p-6">
              <div className="mb-6 text-center border-b pb-4">
                  <p className="text-xs text-gray-500 uppercase font-bold tracking-wide">Sesi Aktif</p>
                  <h2 className="text-xl font-bold text-gray-800 mt-1">{session.division}</h2>
                  <p className="text-gray-600">{session.date} | {session.shiftTime}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="relative">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cari OpsID / Nama</label>
                      <input 
                        type="text" 
                        value={opsId}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="w-full border-2 border-gray-300 rounded-lg p-3 text-lg focus:border-blue-500 focus:outline-none"
                        placeholder="Ketik OpsID..."
                        required
                        autoComplete="off"
                      />
                      {/* Fixed Dropdown with proper Scroll and Z-Index */}
                      {suggestions.length > 0 && (
                          <ul className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-xl mt-1 max-h-60 overflow-y-auto">
                              {suggestions.map(w => (
                                  <li key={w.id} onClick={() => selectWorker(w)} className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 transition-colors">
                                      <p className="font-bold text-gray-800">{w.fullName}</p>
                                      <p className="text-xs text-gray-500">{w.opsId}</p>
                                  </li>
                              ))}
                          </ul>
                      )}
                  </div>
                  
                  {status === 'error' && (
                      <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-200">
                          {message}
                      </div>
                  )}

                  <button 
                    type="submit" 
                    disabled={status === 'loading'}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-lg text-lg shadow-md transition-transform active:scale-95 mt-4"
                  >
                      {status === 'loading' ? 'Memproses...' : 'ABSEN SEKARANG'}
                  </button>
              </form>
          </div>
          <div className="bg-gray-50 p-4 text-center text-xs text-gray-400 rounded-b-xl">
              Hanya bisa absen 1 kali per perangkat.
          </div>
      </div>
    </div>
  );
};

export default PublicAttendance;
