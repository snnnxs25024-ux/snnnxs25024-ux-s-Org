
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Modal from './Modal';
import { Worker, AttendanceSession, AttendanceRecord } from '../types';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../hooks/useToast';
import EditIcon from './icons/EditIcon';
import DeleteIcon from './icons/DeleteIcon';
import PrintIcon from './icons/PrintIcon';
import DownloadIcon from './icons/DownloadIcon';
import CopyIcon from './icons/CopyIcon';
import QrCodeModal from './QrCodeModal';

interface ManageSessionModalProps {
    isOpen: boolean;
    onClose: () => void;
    session: AttendanceSession | null;
    workers: Worker[];
    attendanceHistory: AttendanceSession[];
    refreshData: () => void;
    setAttendanceHistory: React.Dispatch<React.SetStateAction<AttendanceSession[]>>;
}

const calculateWorkDuration = (checkin: string, checkout: string | null | undefined): string => {
    if (!checkout) return '-';
    const checkinTime = new Date(checkin).getTime();
    const checkoutTime = new Date(checkout).getTime();
    if (isNaN(checkinTime) || isNaN(checkoutTime) || checkoutTime < checkinTime) return '-';
    let diff = Math.abs(checkoutTime - checkinTime);
    const nineHoursInMillis = 9 * 3600 * 1000;
    if (diff > nineHoursInMillis) diff = nineHoursInMillis;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${hours}j ${minutes}m`;
};

const ManageSessionModal: React.FC<ManageSessionModalProps> = ({ isOpen, onClose, session: initialSession, workers, attendanceHistory, refreshData, setAttendanceHistory }) => {
    const [session, setSession] = useState<AttendanceSession | null>(initialSession);
    const [isEditing, setIsEditing] = useState(false);
    const [loadingAction, setLoadingAction] = useState(false);
    const [isQrModalOpen, setIsQrModalOpen] = useState(false);
    const [qrWorkerData, setQrWorkerData] = useState<{ fullName: string; opsId: string; department: string } | null>(null);
    const [recordToDelete, setRecordToDelete] = useState<AttendanceRecord | null>(null);
    const [isDeleteRecordModalOpen, setIsDeleteRecordModalOpen] = useState(false);
    const [manualAddOpsId, setManualAddOpsId] = useState('');
    const [manualAddStatus, setManualAddStatus] = useState<'Partial' | 'Buffer' | 'On Plan'>('On Plan');
    const [manualAddError, setManualAddError] = useState<string | null>(null);
    const [manualAddSuggestions, setManualAddSuggestions] = useState<Worker[]>([]);
    const [isCopyDropdownOpen, setIsCopyDropdownOpen] = useState(false);
    const [copyFeedback, setCopyFeedback] = useState<'ops' | 'excel' | null>(null);
    
    const { showToast } = useToast();
    const dropdownRef = useRef<HTMLDivElement>(null);
    const manualAddSearchRef = useRef<HTMLDivElement>(null);
    
    // Fallbacks
    const shiftIdOpts = useMemo(() => Array.from(new Set(attendanceHistory.map(s => s.shiftId))), [attendanceHistory]);
    const divisionOpts = useMemo(() => Array.from(new Set(attendanceHistory.map(s => s.division))), [attendanceHistory]);
    const shiftTimeOpts = useMemo(() => Array.from(new Set(attendanceHistory.map(s => s.shiftTime))), [attendanceHistory]);

    // Sync local session state with updates from Dashboard
    useEffect(() => {
        if (initialSession) {
            const updatedSession = attendanceHistory.find(s => s.id === initialSession.id);
            setSession(updatedSession || null);
        } else {
            setSession(null);
        }
    }, [initialSession, attendanceHistory]);

    // Close dropdowns on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsCopyDropdownOpen(false);
            if (manualAddSearchRef.current && !manualAddSearchRef.current.contains(event.target as Node)) setManualAddSuggestions([]);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    if (!isOpen || !session) return null;

    // --- Action Handlers ---

    const handleUpdateSession = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault(); setLoadingAction(true);
        const formData = new FormData(e.currentTarget);
        const updates = {
            date: formData.get('date') as string, division: formData.get('division') as string,
            shift_time: formData.get('shiftTime') as string, shift_id: formData.get('shiftId') as string,
            plan_mpp: parseInt(formData.get('planMpp') as string, 10),
        };
        const { error } = await supabase.from('attendance_sessions').update(updates).eq('id', session.id);
        setLoadingAction(false);
        if (error) showToast(`Error: ${error.message}`, { type: 'error' });
        else {
            showToast('Sesi berhasil diperbarui.', { type: 'success' });
            setIsEditing(false);
            refreshData(); // Trigger full refresh to ensure consistency
        }
    };
    
    const handleToggleArrival = async (recordId: number, currentStatus: boolean) => {
        const newStatus = !currentStatus;
        setAttendanceHistory(prev => prev.map(s => s.id === session.id ? { ...s, records: s.records.map(r => r.id === recordId ? { ...r, is_arrived: newStatus } : r) } : s));
        const { error } = await supabase.from('attendance_records').update({ is_arrived: newStatus }).eq('id', recordId);
        if (error) { showToast('Gagal update status.', { type: 'error' }); refreshData(); }
    };
    
    const handleAction = async (action: 'checkout' | 'takeout', recordId: number) => {
        setLoadingAction(true);
        const { error } = await supabase.from('attendance_records').update(action === 'checkout' ? { checkout_timestamp: new Date().toISOString() } : { is_takeout: true }).eq('id', recordId).select().single();
        setLoadingAction(false);
        if (error) showToast(`Error: ${error.message}`, { type: 'error' });
        else refreshData();
    };

    const handleConfirmDeleteRecord = async () => {
        if (!recordToDelete) return; setLoadingAction(true);
        const { error } = await supabase.from('attendance_records').delete().eq('id', recordToDelete.id);
        setLoadingAction(false);
        if (error) showToast(`Error: ${error.message}`, { type: 'error' });
        else {
            showToast(`Data untuk ${recordToDelete.fullName} dihapus.`, { type: 'success' });
            setIsDeleteRecordModalOpen(false);
            refreshData();
        }
    };

    const handleManualAdd = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault(); setLoadingAction(true);
        const worker = workers.find(w => w.opsId.toLowerCase() === manualAddOpsId.toLowerCase());
        if (!worker) { setManualAddError(`Worker not found.`); setLoadingAction(false); return; }
        if (session.records.some(r => r.workerId === worker.id)) { setManualAddError(`Worker already in session.`); setLoadingAction(false); return; }
        const { error } = await supabase.from('attendance_records').insert({
            session_id: session.id, worker_id: worker.id, timestamp: new Date(session.date + 'T' + session.shiftTime.split(' - ')[0]).toISOString(),
            scan_timestamp: new Date().toISOString(), manual_status: manualAddStatus === 'On Plan' ? null : manualAddStatus, is_arrived: false
        });
        setLoadingAction(false);
        if (error) setManualAddError(error.message);
        else { showToast(`${worker.fullName} berhasil ditambahkan.`, { type: 'success' }); setManualAddOpsId(''); refreshData(); }
    };
    
    const sessionSummary = {
        absen: session.records.length,
        actual: session.records.filter(r => r.is_arrived).length
    };

    return (
        <>
        <Modal isOpen={isOpen} onClose={onClose} title="Manage Attendance Session" scrollable={true}>
            <div className="flex flex-col">
                {/* --- HEADER & EDIT FORM --- */}
                {isEditing ? (
                    <form onSubmit={handleUpdateSession} className="space-y-4 mb-4 p-4 bg-blue-50 rounded-lg border">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label>Tanggal</label><input name="date" type="date" defaultValue={session.date} required className="w-full border rounded-lg p-2" /></div>
                            <div><label>Divisi</label><select name="division" defaultValue={session.division} required className="w-full border rounded-lg p-2">{divisionOpts.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
                            <div><label>Shift Jam</label><select name="shiftTime" defaultValue={session.shiftTime} required className="w-full border rounded-lg p-2">{shiftTimeOpts.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                            <div><label>Shift ID</label><select name="shiftId" defaultValue={session.shiftId} required className="w-full border rounded-lg p-2">{shiftIdOpts.map(id => <option key={id} value={id}>{id}</option>)}</select></div>
                            <div><label>Plan MPP</label><input name="planMpp" type="number" defaultValue={session.planMpp} min="1" required className="w-full border rounded-lg p-2" /></div>
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 bg-gray-200 rounded-lg">Cancel</button>
                            <button type="submit" disabled={loadingAction} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Save</button>
                        </div>
                    </form>
                ) : (
                    <div className="relative bg-white p-5 rounded-xl shadow-md border mb-4">
                        <button onClick={() => setIsEditing(true)} className="absolute top-3 right-3 p-2 text-gray-400 hover:text-blue-600 rounded-full" title="Edit"><EditIcon /></button>
                        <div className="flex flex-col sm:flex-row items-start gap-4">
                            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-2xl font-black shrink-0">{session.division.substring(0, 2)}</div>
                            <div className="flex flex-col"><h3 className="text-xl font-bold">{session.division}</h3><p className="text-sm text-gray-500 mt-1">{session.date} | {session.shiftTime}</p><div className="mt-2 bg-gray-100 px-2 py-1 rounded w-fit"><p className="text-xs font-mono select-all">{session.shiftId}</p></div></div>
                            <div className="w-full sm:w-auto grid grid-cols-3 gap-3 pt-2 sm:pt-0">
                                <div className="text-center bg-gray-50 p-3 rounded-lg border"><p className="text-[10px] uppercase font-black">Plan</p><p className="text-2xl font-black">{session.planMpp}</p></div>
                                <div className="text-center bg-gray-50 p-3 rounded-lg border"><p className="text-[10px] uppercase font-black">Absen</p><p className="text-2xl font-black">{sessionSummary.absen}</p></div>
                                <div className="text-center bg-blue-50 p-3 rounded-lg border"><p className="text-[10px] uppercase font-black">Actual</p><p className="text-2xl font-black text-blue-600">{sessionSummary.actual}</p></div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- RECORDS TABLE --- */}
                <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-blue-600 text-white sticky top-0 z-10">
                            <tr>
                                <th className="p-2">Hadir</th><th className="p-2">OpsID</th><th className="p-2">Nama</th>
                                <th className="p-2">Jam Scan</th><th className="p-2">Jam In</th><th className="p-2">Jam Out</th>
                                <th className="p-2">Total</th><th className="p-2">Status</th><th className="p-2 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {session.records.map(record => {
                                const isArrived = record.is_arrived ?? true;
                                return (
                                <tr key={record.id} className={`hover:bg-blue-50 ${record.is_takeout ? 'opacity-60 bg-gray-100' : ''}`}>
                                    <td className="p-2 text-center"><input type="checkbox" checked={isArrived} onChange={() => handleToggleArrival(record.id, isArrived)} className="w-5 h-5" /></td>
                                    <td className="p-2 font-mono">{record.opsId}</td><td className="p-2 font-semibold">{record.fullName}</td>
                                    <td className="p-2 font-mono">{record.scan_timestamp ? new Date(record.scan_timestamp).toLocaleTimeString('id-ID') : '-'}</td>
                                    <td className="p-2">{session.shiftTime.split(' - ')[0]}</td><td>{session.shiftTime.split(' - ')[1]}</td>
                                    <td className="p-2 font-mono">{calculateWorkDuration(record.timestamp, record.checkout_timestamp)}</td>
                                    <td className="p-2"><span className={`px-2 py-1 text-xs rounded-full font-black uppercase ${record.is_takeout ? 'bg-gray-200' : record.manual_status ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>{record.is_takeout ? 'Take Out' : record.manual_status || 'On Plan'}</span></td>
                                    <td className="p-2"><div className="flex justify-center gap-2">
                                        <button onClick={() => { setQrWorkerData({fullName: record.fullName, opsId: record.opsId, department: workers.find(w=>w.id===record.workerId)?.department || '' }); setIsQrModalOpen(true); }} className="p-1"><PrintIcon /></button>
                                        <button onClick={() => handleAction('takeout', record.id)} disabled={loadingAction || record.is_takeout} className="text-xs bg-gray-200 font-bold py-1 px-2 rounded disabled:opacity-50">TakeOut</button>
                                        <button onClick={() => handleAction('checkout', record.id)} disabled={loadingAction || !!record.checkout_timestamp || record.is_takeout} className="text-xs bg-green-500 text-white font-bold py-1 px-2 rounded disabled:opacity-50">CheckOut</button>
                                        <button onClick={() => { setRecordToDelete(record); setIsDeleteRecordModalOpen(true); }} disabled={loadingAction} className="text-red-500 p-1"><DeleteIcon /></button>
                                    </div></td>
                                </tr>);
                            })}
                        </tbody>
                    </table>
                </div>

                {/* --- MANUAL ADD & ACTIONS --- */}
                <div className="shrink-0 mt-4 pt-4 border-t">
                    <form onSubmit={handleManualAdd} className="space-y-3 mb-4">
                        <h4 className="font-semibold">Tambah Karyawan Manual</h4>
                        {manualAddError && <p className="text-red-600 bg-red-50 p-2 rounded-lg">{manualAddError}</p>}
                        <div className="flex gap-2">
                            <div className="relative flex-grow" ref={manualAddSearchRef}><input type="text" value={manualAddOpsId} onChange={(e) => { setManualAddOpsId(e.target.value); setManualAddSuggestions(workers.filter(w => w.opsId.includes(e.target.value))) }} placeholder="Ketik OpsID..." className="w-full border rounded-lg p-2" required />{manualAddSuggestions.length > 0 && <ul className="absolute z-20 w-full bg-white border shadow-xl rounded-lg mt-1">{manualAddSuggestions.slice(0,5).map(w => <li key={w.id} onClick={() => { setManualAddOpsId(w.opsId); setManualAddSuggestions([]); }} className="p-2 cursor-pointer hover:bg-blue-50">{w.fullName} ({w.opsId})</li>)}</ul>}</div>
                            <select value={manualAddStatus} onChange={(e) => setManualAddStatus(e.target.value as any)} className="border rounded-lg p-2"><option value="On Plan">On Plan</option><option value="Partial">Partial</option><option value="Buffer">Buffer</option></select>
                            <button type="submit" disabled={loadingAction} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg">Add</button>
                        </div>
                    </form>
                    <div className="mt-4 pt-4 border-t flex flex-wrap justify-between items-center gap-3">
                        <div className="flex gap-2">
                            {/* Download & Copy Buttons Here */}
                        </div>
                    </div>
                </div>
            </div>
        </Modal>

        <QrCodeModal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} workerData={qrWorkerData} />

        <Modal isOpen={isDeleteRecordModalOpen} onClose={() => setIsDeleteRecordModalOpen(false)} title="Hapus Data Absensi" size="md">
            <p>Yakin ingin menghapus data absensi untuk <strong>{recordToDelete?.fullName}</strong>?</p>
            <div className="flex justify-end gap-4 mt-6">
                <button onClick={() => setIsDeleteRecordModalOpen(false)}>Batal</button>
                <button onClick={handleConfirmDeleteRecord} disabled={loadingAction}>{loadingAction ? 'Menghapus...' : 'Ya, Hapus'}</button>
            </div>
        </Modal>
        </>
    );
};

export default ManageSessionModal;
