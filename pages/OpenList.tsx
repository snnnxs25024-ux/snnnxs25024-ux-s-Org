
import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabaseClient';
import { AttendanceSession, AttendanceRecord, Worker } from '../types';
import CopyIcon from '../components/icons/CopyIcon';
import DeleteIcon from '../components/icons/DeleteIcon';

interface OpenListProps {
  workers: Worker[];
}

const shiftIdOptions = [
    'SOCSTROPS0009', 'SOCSTROPS0110', 'SOCSTROPS0211', 'SOCSTROPS0312', 'SOCSTROPS0413', 'SOCSTROPS0514',
    'SOCSTROPS0615', 'SOCSTROPS0716', 'SOCSTROPS0817', 'SOCSTROPS0918', 'SOCSTROPS1019', 'SOCSTROPS1120',
    'SOCSTROPS1221', 'SOCSTROPS1322', 'SOCSTROPS1423', 'SOCSTROPS1500', 'SOCSTROPS1601', 'SOCSTROPS1702',
    'SOCSTROPS1803', 'SOCSTROPS1904', 'SOCSTROPS2005', 'SOCSTROPS2106', 'SOCSTROPS2207', 'SOCSTROPS2308',
];

const shiftTimeOptions = Array.from({ length: 24 }, (_, i) => {
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

  const getTodayString = () => new Date().toISOString().split('T')[0];

  // Poll for live updates when session is active
  useEffect(() => {
    let interval: any;
    if (activeSession) {
      const fetchLiveRecords = async () => {
        const { data, error } = await supabase
          .from('attendance_records')
          .select('*')
          .eq('session_id', activeSession.id)
          .order('timestamp', { ascending: false });

        if (data) {
           // Enrich with worker names since DB might only have IDs if joined, but here we keep it simple
           // In a real join query we'd get names, but let's map manually from props for speed
           const enrichedData = data.map((rec: any) => {
               const worker = workers.find(w => w.id === rec.worker_id);
               return {
                   ...rec,
                   opsId: worker?.opsId || 'N/A',
                   fullName: worker?.fullName || 'Unknown'
               };
           });
           setLiveRecords(enrichedData);
        }
      };

      fetchLiveRecords();
      interval = setInterval(fetchLiveRecords, 3000); // Poll every 3 seconds
    }
    return () => clearInterval(interval);
  }, [activeSession, workers]);

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
      planMpp: parseInt(formData.get('planMpp') as string, 10)
    };

    const { error: insertError } = await supabase
      .from('attendance_sessions')
      .insert(sessionData);

    if (insertError) {
      setError(insertError.message);
      setIsLoading(false);
    } else {
      setActiveSession({ ...sessionData, records: [] });
      setIsLoading(false);
    }
  };

  const handleCloseSession = () => {
      // In a real app, we might update a 'status' column in DB.
      // For now, we just clear the local state so Admin stops monitoring/sharing.
      // The session remains in DB as history.
      setActiveSession(null);
      setLiveRecords([]);
  };

  const getPublicLink = () => {
      if(!activeSession) return '';
      const baseUrl = window.location.origin;
      return `${baseUrl}/attend/${activeSession.id}`;
  };

  const copyToClipboard = () => {
      navigator.clipboard.writeText(getPublicLink());
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleDeleteRecord = async (recordId: number) => {
      if(!confirm("Are you sure you want to remove this entry?")) return;
      
      const { error } = await supabase.from('attendance_records').delete().eq('id', recordId);
      if(error) alert("Failed to delete");
      else {
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
                        <label className="block mb-2 text-sm font-medium text-gray-700">Tanggal</label>
                        <input type="date" name="sessionDate" defaultValue={getTodayString()} required className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                        <label className="block mb-2 text-sm font-medium text-gray-700">Divisi</label>
                        <select name="division" required className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500">
                        <option>ASM2</option> <option>CACHE</option> <option>TP SUNTER 1</option>
                        <option>TP SUNTER 2</option> <option>INVENTORY</option> <option>RETURN</option>
                        </select>
                    </div>
                    <div>
                        <label className="block mb-2 text-sm font-medium text-gray-700">Shift Jam</label>
                        <select name="shiftTime" required className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500">
                        {shiftTimeOptions.map(time => (<option key={time} value={time}>{time}</option>))}
                        </select>
                    </div>
                    <div>
                        <label className="block mb-2 text-sm font-medium text-gray-700">Shift ID</label>
                        <select name="shiftId" required className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500">
                        {shiftIdOptions.map(shift => (<option key={shift} value={shift}>{shift}</option>))}
                        </select>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block mb-2 text-sm font-medium text-gray-700">Target Kuota (Plan MPP)</label>
                        <input type="number" name="planMpp" min="1" placeholder="Masukkan angka kuota (misal: 50)" required className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500" />
                        <p className="text-xs text-gray-500 mt-1">*Jika absensi melebihi angka ini, status akan otomatis menjadi "Buffer".</p>
                    </div>
                </div>
                <button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors">
                    {isLoading ? 'Membuat Link...' : 'Generate Link Absensi'}
                </button>
                {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
             </form>
         </div>
      ) : (
          <div className="space-y-6">
              {/* Active Session Monitor */}
              <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                  <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                      <div>
                          <span className="bg-green-200 text-green-800 text-xs font-bold px-2 py-1 rounded-full animate-pulse">LIVE</span>
                          <h2 className="text-2xl font-bold text-gray-800 mt-2">Sesi Aktif: {activeSession.division}</h2>
                          <p className="text-gray-600">{activeSession.date} | {activeSession.shiftTime}</p>
                          <p className="text-sm text-gray-500 font-mono mt-1">ID: {activeSession.shiftId}</p>
                      </div>
                      <div className="flex flex-col items-end gap-3">
                           <div className="flex items-center gap-2 bg-white p-2 rounded-lg border shadow-sm w-full md:w-auto">
                               <input type="text" readOnly value={getPublicLink()} className="bg-transparent text-sm text-gray-600 w-48 md:w-64 outline-none" />
                               <button onClick={copyToClipboard} className="text-blue-600 hover:text-blue-800 font-bold text-sm flex items-center gap-1">
                                   <CopyIcon /> {copySuccess ? 'Copied!' : 'Copy'}
                               </button>
                           </div>
                           <button onClick={handleCloseSession} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg shadow-sm">
                               Tutup Link
                           </button>
                      </div>
                  </div>
              </div>

              {/* Stats & Table */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-lg shadow border border-t-4 border-blue-500">
                      <p className="text-gray-500 text-sm font-bold uppercase">Total Hadir</p>
                      <p className="text-3xl font-bold text-blue-600">{liveRecords.length}</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow border border-t-4 border-green-500">
                      <p className="text-gray-500 text-sm font-bold uppercase">On Plan</p>
                      <p className="text-3xl font-bold text-green-600">
                          {liveRecords.filter(r => !r.manual_status).length}
                      </p>
                      <p className="text-xs text-gray-400">Kuota: {activeSession.planMpp}</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow border border-t-4 border-yellow-500">
                      <p className="text-gray-500 text-sm font-bold uppercase">Buffer</p>
                      <p className="text-3xl font-bold text-yellow-600">
                           {liveRecords.filter(r => r.manual_status === 'Buffer').length}
                      </p>
                  </div>
              </div>

              <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
                  <div className="p-4 border-b bg-gray-50">
                      <h3 className="font-bold text-gray-700">Real-time Data Masuk</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                            <tr>
                                <th className="p-3">Waktu</th>
                                <th className="p-3">OpsID</th>
                                <th className="p-3">Nama</th>
                                <th className="p-3">Status</th>
                                <th className="p-3 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {liveRecords.map(rec => (
                                <tr key={rec.id} className="hover:bg-blue-50 transition-colors">
                                    <td className="p-3 font-mono text-gray-500">
                                        {new Date(rec.scan_timestamp || rec.timestamp).toLocaleTimeString('id-ID')}
                                    </td>
                                    <td className="p-3 font-bold">{rec.opsId}</td>
                                    <td className="p-3">{rec.fullName}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                            rec.manual_status === 'Buffer' 
                                            ? 'bg-yellow-100 text-yellow-800' 
                                            : 'bg-green-100 text-green-800'
                                        }`}>
                                            {rec.manual_status || 'On Plan'}
                                        </span>
                                    </td>
                                    <td className="p-3 text-center">
                                        <button onClick={() => handleDeleteRecord(rec.id)} className="text-red-400 hover:text-red-600">
                                            <DeleteIcon />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {liveRecords.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-6 text-center text-gray-400 italic">
                                        Belum ada data masuk. Menunggu karyawan mengakses link...
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default OpenList;
