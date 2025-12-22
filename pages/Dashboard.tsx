
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';
import { Worker, AttendanceSession, AttendanceRecord } from '../types';
import DownloadIcon from '../components/icons/DownloadIcon';
import Modal from '../components/Modal';
import ViewIcon from '../components/icons/ViewIcon';
import DeleteIcon from '../components/icons/DeleteIcon';
import { supabase } from '../lib/supabaseClient';
import CopyIcon from '../components/icons/CopyIcon';
import EditIcon from '../components/icons/EditIcon';
import PrintIcon from '../components/icons/PrintIcon';


interface DashboardProps {
    workers: Worker[];
    attendanceHistory: AttendanceSession[];
    refreshData: () => void;
    setAttendanceHistory: React.Dispatch<React.SetStateAction<AttendanceSession[]>>;
    autoOpenSessionId?: string | null;
}

type PeriodicReportData = {
  workerId: string;
  opsId: string;
  fullName: string;
  attendanceCount: number;
}[];

interface SummaryStats {
    plan: number;
    actual: number;
    gap: number;
}

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


const generatePeriodicReport = (
  sessions: AttendanceSession[],
  workers: Worker[],
  startDate: Date,
  endDate: Date
): PeriodicReportData => {
  const attendanceCounts: { [workerId: string]: number } = {};
  const workerDetails: { [workerId: string]: { opsId: string; fullName: string } } = {};

  const relevantSessions = sessions.filter(session => {
    const sessionDate = new Date(session.date + 'T00:00:00');
    return sessionDate >= startDate && sessionDate <= endDate;
  });

  for (const session of relevantSessions) {
    const uniqueWorkerIdsThisDay = new Set<string>();
    for (const record of session.records) {
      if (!record.is_takeout && record.is_arrived) {
        uniqueWorkerIdsThisDay.add(record.workerId);
        if (!workerDetails[record.workerId] || workerDetails[record.workerId].fullName === 'Unknown') {
            workerDetails[record.workerId] = {
                opsId: record.opsId,
                fullName: record.fullName
            };
        }
      }
    }
    uniqueWorkerIdsThisDay.forEach(workerId => {
        attendanceCounts[workerId] = (attendanceCounts[workerId] || 0) + 1;
    });
  }

  const report = Object.entries(attendanceCounts).map(([workerId, count]) => {
    let opsId = workerDetails[workerId]?.opsId;
    let fullName = workerDetails[workerId]?.fullName;

    if (!opsId || !fullName || fullName === 'Unknown') {
        const worker = workers.find(w => w.id === workerId);
        if (worker) {
            opsId = worker.opsId;
            fullName = worker.fullName;
        }
    }

    return {
      workerId,
      opsId: opsId || 'N/A',
      fullName: fullName || 'Unknown',
      attendanceCount: count
    };
  });

  return report.sort((a, b) => b.attendanceCount - a.attendanceCount);
};

const ReportList: React.FC<{ title: string; data: PeriodicReportData; onWorkerClick: (workerId: string, workerName: string) => void; }> = ({ title, data, onWorkerClick }) => (
    <div className="flex-1">
        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 pb-2">{title}</h4>
        <div className="max-h-64 overflow-y-auto pr-2 no-scrollbar">
            {data.length > 0 ? (
                <ul className="space-y-2">
                    {data.map(item => (
                        <li key={item.workerId} 
                            className="flex justify-between items-center bg-white p-3 rounded-xl border border-gray-100 cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all group shadow-sm"
                            onClick={() => onWorkerClick(item.workerId, item.fullName)}
                        >
                            <div className="min-w-0 pr-2">
                                <p className="font-black text-xs text-gray-800 uppercase truncate group-hover:text-blue-600">{item.fullName}</p>
                                <p className="text-[10px] text-black font-black font-mono mt-0.5">{item.opsId}</p>
                            </div>
                            <div className="shrink-0 bg-blue-600 px-2 py-1 rounded-lg">
                                <span className="font-black text-[10px] text-white uppercase tracking-tighter">{item.attendanceCount} HK</span>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-gray-400 text-[10px] font-bold uppercase text-center pt-8 tracking-widest">Tidak ada data.</p>
            )}
        </div>
    </div>
);

const StatCard: React.FC<{ title: string; value: string | number; description: string; borderColor: string }> = ({ title, value, description, borderColor }) => (
    <div className={`bg-white p-6 rounded-2xl shadow-xl shadow-gray-100 border border-gray-100 transition-all duration-300 hover:-translate-y-1 border-t-4 ${borderColor}`}>
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{title}</h3>
        <p className="text-4xl font-black text-gray-900 my-3 tracking-tighter">{value}</p>
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{description}</p>
    </div>
);

const SummaryItem: React.FC<{ label: string; stats: SummaryStats; bgColor: string; textColor: string }> = ({ label, stats, bgColor, textColor }) => (
    <div className={`text-center p-4 rounded-2xl ${bgColor} flex flex-col justify-between h-full border border-black/5`}>
        <p className={`text-[10px] uppercase font-black ${textColor} opacity-80 mb-3 tracking-[0.2em]`}>{label}</p>
        <div className="space-y-1.5">
            <div className="flex justify-between items-center border-b border-black/5 pb-1.5">
                <span className="text-[9px] font-black uppercase opacity-60">Plan</span>
                <span className={`text-xs font-black ${textColor}`}>{stats.plan}</span>
            </div>
             <div className="flex justify-between items-center border-b border-black/5 pb-1.5">
                <span className="text-[9px] font-black uppercase opacity-60">Actual</span>
                <span className={`text-lg font-black ${textColor} tracking-tighter`}>{stats.actual}</span>
            </div>
             <div className="flex justify-between items-center pt-1.5">
                <span className="text-[9px] font-black uppercase opacity-60">Gap</span>
                <span className={`text-xs font-black ${stats.gap >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {stats.gap > 0 ? `+${stats.gap}` : stats.gap}
                </span>
            </div>
        </div>
    </div>
);

const calculateWorkDuration = (checkin: string, checkout: string | null | undefined): string => {
    if (!checkout) return '-';
    const checkinTime = new Date(checkin).getTime();
    const checkoutTime = new Date(checkout).getTime();
    if (isNaN(checkinTime) || isNaN(checkoutTime) || checkoutTime < checkinTime) return '-';

    let diff = Math.abs(checkoutTime - checkinTime);
    const nineHoursInMillis = 9 * 3600 * 1000;
    if (diff > nineHoursInMillis) {
        diff = nineHoursInMillis;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}j ${minutes}m`;
};

const Dashboard: React.FC<DashboardProps> = ({ workers, attendanceHistory, refreshData, setAttendanceHistory, autoOpenSessionId }) => {
    const [selectedSession, setSelectedSession] = useState<AttendanceSession | null>(null);
    const [isManageModalOpen, setIsManageModalOpen] = useState(false);
    const [isDeleteSessionModalOpen, setIsDeleteSessionModalOpen] = useState(false);
    const [isDeleteRecordModalOpen, setIsDeleteRecordModalOpen] = useState(false);
    const [recordToDelete, setRecordToDelete] = useState<AttendanceRecord | null>(null);
    const [loadingAction, setLoadingAction] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [selectedReportMonth, setSelectedReportMonth] = useState<{ month: number; year: number } | null>(null);
    const [manualAddOpsId, setManualAddOpsId] = useState('');
    const [manualAddStatus, setManualAddStatus] = useState<'Partial' | 'Buffer' | 'On Plan'>('On Plan');
    const [manualAddError, setManualAddError] = useState<string | null>(null);
    const [isDetailReportModalOpen, setIsDetailReportModalOpen] = useState(false);
    const [detailReportData, setDetailReportData] = useState<{ workerName: string; period: string; dates: { date: string; shiftTime: string; division: string }[], total: number } | null>(null);
    const [isEditingSession, setIsEditingSession] = useState(false);
    const [isCopyDropdownOpen, setIsCopyDropdownOpen] = useState(false);
    const [copyFeedback, setCopyFeedback] = useState<'ops' | 'excel' | null>(null);
    const [isQrModalOpen, setIsQrModalOpen] = useState(false);
    const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
    const [qrWorkerData, setQrWorkerData] = useState<{ fullName: string; opsId: string; department: string } | null>(null);
    
    const dropdownRef = useRef<HTMLDivElement>(null);

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

    useEffect(() => {
        if (autoOpenSessionId && attendanceHistory.length > 0) {
            const session = attendanceHistory.find(s => s.id === autoOpenSessionId);
            if (session) {
                openManageModal(session);
            }
        }
    }, [autoOpenSessionId, attendanceHistory]);

    useEffect(() => {
        if (selectedSession?.id) {
            const updatedSession = attendanceHistory.find(s => s.id === selectedSession.id);
            if (updatedSession) {
                setSelectedSession(updatedSession);
            } else {
                setIsManageModalOpen(false);
            }
        }
    }, [attendanceHistory, selectedSession?.id]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsCopyDropdownOpen(false);
            }
        };
        if (isCopyDropdownOpen) document.addEventListener('mousedown', handleClickOutside);
        else document.removeEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isCopyDropdownOpen]);

    const activeWorkersCount = workers.filter(w => w.status === 'Active').length;

    const calculateFulfillment = (startDay: number, endDay: number) => {
        const today = new Date();
        const relevantSessions = attendanceHistory.filter(session => {
            const sessionDate = new Date(session.date + 'T00:00:00');
            if (isNaN(sessionDate.getTime())) return false;
            return sessionDate.getMonth() === today.getMonth() &&
                   sessionDate.getFullYear() === today.getFullYear() &&
                   sessionDate.getDate() >= startDay &&
                   sessionDate.getDate() <= endDay;
        });
        if (relevantSessions.length === 0) return '0%';
        const totalPlanned = relevantSessions.reduce((sum, s) => sum + s.planMpp, 0);
        const totalActual = relevantSessions.reduce((sum, s) => sum + s.records.filter(r => !r.is_takeout && r.is_arrived).length, 0);
        if (totalPlanned === 0) return 'N/A';
        return `${((totalActual / totalPlanned) * 100).toFixed(1)}%`;
    };

    const currentMonthHistory = useMemo(() => {
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        return attendanceHistory
            .filter(session => {
                const sessionDate = new Date(session.date + 'T00:00:00');
                return sessionDate.getMonth() === currentMonth && sessionDate.getFullYear() === currentYear;
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [attendanceHistory]);

    const downloadReport = (format: 'xlsx' | 'pdf') => {
        const reportData = currentMonthHistory.flatMap(session => 
            session.records.map(record => ({
                'Tanggal': session.date,
                'Divisi': session.division,
                'Shift Jam': session.shiftTime,
                'Shift ID': session.shiftId,
                'Ops ID': record.opsId,
                'Nama Lengkap': record.fullName,
                'Jam Masuk': new Date(record.timestamp).toLocaleTimeString('id-ID'),
                'Jam Pulang': record.checkout_timestamp ? new Date(record.checkout_timestamp).toLocaleTimeString('id-ID') : '-',
                'Total Jam Kerja': calculateWorkDuration(record.timestamp, record.checkout_timestamp),
                'Status': record.is_takeout ? 'Take Out' : record.manual_status || 'On Plan',
                'Kehadiran Fisik': record.is_arrived ? 'Hadir' : 'Sedang di jalan',
                'Tipe Sesi': session.session_type || 'MANUAL'
            }))
        );
        if (format === 'xlsx') {
            const worksheet = XLSX.utils.json_to_sheet(reportData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Report');
            XLSX.writeFile(workbook, 'Absensi_Report_Bulan_Ini.xlsx');
        } else {
            const doc = new jsPDF();
            autoTable(doc, {
                head: [['Tanggal', 'Divisi', 'Shift Jam', 'Shift ID', 'Ops ID', 'Nama Lengkap', 'Jam Masuk', 'Jam Pulang', 'Total Jam Kerja', 'Status']],
                body: reportData.map(Object.values),
            });
            doc.save('Absensi_Report_Bulan_Ini.pdf');
        }
    };
    
    const summaryCounts = useMemo(() => {
        const today_local = new Date();
        const year = today_local.getFullYear();
        const month = (today_local.getMonth() + 1).toString().padStart(2, '0');
        const day = today_local.getDate().toString().padStart(2, '0');
        const todayString = `${year}-${month}-${day}`;
        const currentYear = today_local.getFullYear();
        const currentMonth = today_local.getMonth();
        const startOfWeek = new Date(today_local);
        startOfWeek.setDate(startOfWeek.getDate() - today_local.getDay() + (today_local.getDay() === 0 ? -6 : 1));
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);
        const counts: { [key: string]: SummaryStats } = { 
            today: { plan: 0, actual: 0, gap: 0 }, 
            thisWeek: { plan: 0, actual: 0, gap: 0 }, 
            thisMonth: { plan: 0, actual: 0, gap: 0 }, 
            period1: { plan: 0, actual: 0, gap: 0 }, 
            period2: { plan: 0, actual: 0, gap: 0 } 
        };
        attendanceHistory.forEach(session => {
            const sessionDate = new Date(session.date + 'T00:00:00'); 
            if (isNaN(sessionDate.getTime())) return;
            const planned = session.planMpp || 0;
            const actual = session.records.filter(r => !r.is_takeout && r.is_arrived).length;
            if (session.date === todayString) { counts.today.plan += planned; counts.today.actual += actual; }
            if (sessionDate >= startOfWeek && sessionDate <= endOfWeek) { counts.thisWeek.plan += planned; counts.thisWeek.actual += actual; }
            if (sessionDate.getFullYear() === currentYear && sessionDate.getMonth() === currentMonth) {
                counts.thisMonth.plan += planned; counts.thisMonth.actual += actual;
                if (sessionDate.getDate() <= 15) { counts.period1.plan += planned; counts.period1.actual += actual; }
                else { counts.period2.plan += planned; counts.period2.actual += actual; }
            }
        });
        Object.keys(counts).forEach(k => { counts[k].gap = counts[k].actual - counts[k].plan; });
        return counts;
    }, [attendanceHistory]);

    const openManageModal = (session: AttendanceSession) => {
        setSelectedSession(session);
        setManualAddError(null);
        setManualAddOpsId('');
        setIsEditingSession(false);
        setIsCopyDropdownOpen(false);
        setIsManageModalOpen(true);
    };

    const openDeleteSessionModal = (session: AttendanceSession) => {
        setSelectedSession(session);
        setIsDeleteSessionModalOpen(true);
    };
    
    const openDeleteRecordModal = (record: AttendanceRecord) => {
        setRecordToDelete(record);
        setIsDeleteRecordModalOpen(true);
    };

    const handleDeleteSession = async () => {
        if (!selectedSession) return;
        setLoadingAction(true);
        const { error } = await supabase.from('attendance_sessions').delete().match({ id: selectedSession.id });
        setLoadingAction(false);
        if (error) alert(`Error deleting session: ${error.message}`);
        else {
            setIsDeleteSessionModalOpen(false);
            setSelectedSession(null);
            refreshData();
        }
    };

    const handleConfirmDeleteRecord = async () => {
        if (!recordToDelete || !selectedSession) return;
        setLoadingAction(true);
        const { error } = await supabase.from('attendance_records').delete().eq('id', recordToDelete.id);
        setLoadingAction(false);
        if (error) alert(`Error removing record: ${error.message}`);
        else {
            setAttendanceHistory(prevHistory =>
                prevHistory.map(session =>
                    session.id === selectedSession.id
                        ? { ...session, records: session.records.filter(r => r.id !== recordToDelete.id) }
                        : session
                )
            );
            setIsDeleteRecordModalOpen(false);
            setRecordToDelete(null);
        }
    };
    
    const handleAction = async (action: 'checkout' | 'takeout', recordId: number) => {
        setLoadingAction(true);
        const updateData = action === 'checkout' ? { checkout_timestamp: new Date().toISOString() } : { is_takeout: true };
        const { data: updatedRecord, error } = await supabase.from('attendance_records').update(updateData).eq('id', recordId).select().single();
        setLoadingAction(false);
        if (error) alert(`Error updating record: ${error.message}`);
        else if (updatedRecord && selectedSession) {
             const updatedFields = { checkout_timestamp: updatedRecord.checkout_timestamp, is_takeout: updatedRecord.is_takeout };
            setAttendanceHistory(prevHistory =>
                prevHistory.map(session =>
                    session.id === selectedSession.id ? { ...session, records: session.records.map(r => r.id === recordId ? { ...r, ...updatedFields } : r) } : session
                )
            );
        }
    };

    const handleToggleArrival = async (recordId: number, currentStatus: boolean) => {
        const newStatus = !currentStatus;
        if (selectedSession) {
            setAttendanceHistory(prevHistory =>
                prevHistory.map(session =>
                    session.id === selectedSession.id ? { ...session, records: session.records.map(r => r.id === recordId ? { ...r, is_arrived: newStatus } : r) } : session
                )
            );
        }
        const { error } = await supabase.from('attendance_records').update({ is_arrived: newStatus }).eq('id', recordId);
        if (error) { alert('Gagal update status: ' + error.message); refreshData(); }
    };

    const handleCheckOutAll = async () => {
        if (!selectedSession) return;
        const now = new Date().getTime();
        const nineHoursInMillis = 9 * 60 * 60 * 1000;
        const recordsToCheckOut = selectedSession.records.filter(r => !r.checkout_timestamp && !r.is_takeout && (now - new Date(r.timestamp).getTime()) < nineHoursInMillis);
        if (recordsToCheckOut.length === 0) { alert("Semua karyawan sudah check-out."); return; }
        const recordIdsToCheckOut = recordsToCheckOut.map(r => r.id);
        setLoadingAction(true);
        const { error } = await supabase.from('attendance_records').update({ checkout_timestamp: new Date().toISOString() }).in('id', recordIdsToCheckOut).is('checkout_timestamp', null);
        setLoadingAction(false);
        if (error) alert(`Error checking out all: ${error.message}`);
        else { refreshData(); setIsManageModalOpen(false); }
    };
    
    const handleManualAdd = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedSession || !manualAddOpsId) return;
        setManualAddError(null);
        setLoadingAction(true);
        const worker = workers.find(w => w.opsId.toLowerCase() === manualAddOpsId.toLowerCase());
        if (!worker || !worker.id) { setManualAddError(`Worker with OpsID "${manualAddOpsId}" not found.`); setLoadingAction(false); return; }
        const alreadyInSession = selectedSession.records.some(r => r.workerId === worker.id);
        if (alreadyInSession) { setManualAddError(`Worker ${worker.fullName} is already in this session.`); setLoadingAction(false); return; }
        const alreadyAttendedToday = attendanceHistory.some(session => session.date === selectedSession.date && session.records.some(r => r.workerId === worker.id));
        if (alreadyAttendedToday) { setManualAddError(`Worker ${worker.fullName} has already attended a session on ${selectedSession.date}. (Max 1x per hari)`); setLoadingAction(false); return; }
        const { data: newRecords, error } = await supabase.from('attendance_records').insert({
            session_id: selectedSession.id,
            worker_id: worker.id,
            timestamp: new Date(selectedSession.date + 'T' + selectedSession.shiftTime.split(' - ')[0]).toISOString(),
            manual_status: manualAddStatus === 'On Plan' ? null : manualAddStatus,
            is_arrived: false 
        }).select();
        setLoadingAction(false);
        if (error) setManualAddError(`Error adding worker: ${error.message}`);
        else if (newRecords && newRecords.length > 0) {
            const newDbRecord = newRecords[0];
            const newAttendanceRecord: AttendanceRecord = { id: newDbRecord.id, workerId: worker.id, opsId: worker.opsId, fullName: worker.fullName, timestamp: newDbRecord.timestamp, checkout_timestamp: newDbRecord.checkout_timestamp, manual_status: newDbRecord.manual_status, is_takeout: newDbRecord.is_takeout, is_arrived: newDbRecord.is_arrived };
            setAttendanceHistory(prevHistory => prevHistory.map(session => session.id === selectedSession.id ? { ...session, records: [...session.records, newAttendanceRecord] } : session));
            setManualAddOpsId('');
        }
    };
    
    const handleUpdateSession = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedSession) return;
        setLoadingAction(true);
        const formData = new FormData(e.currentTarget);
        const updates = { date: formData.get('date') as string, division: formData.get('division') as string, shiftTime: formData.get('shiftTime') as string, shiftId: formData.get('shiftId') as string, planMpp: parseInt(formData.get('planMpp') as string, 10) };
        const { error } = await supabase.from('attendance_sessions').update(updates).eq('id', selectedSession.id);
        setLoadingAction(false);
        if (error) alert(`Error updating session: ${error.message}`);
        else { setAttendanceHistory(prev => prev.map(s => s.id === selectedSession.id ? { ...s, ...updates } : s)); setSelectedSession(prev => prev ? { ...prev, ...updates } : null); setIsEditingSession(false); }
    };
    
    const openQrModal = (record: AttendanceRecord) => {
        const worker = workers.find(w => w.id === record.workerId);
        setQrWorkerData({ fullName: record.fullName, opsId: record.opsId, department: worker ? worker.department : '-' });
        setQrCodeUrl('');
        setIsQrModalOpen(true);
        QRCode.toDataURL(record.opsId, { width: 300, margin: 2 }).then(url => setQrCodeUrl(url));
    };

    // Fix: Defined handleOpenReportModal to set the selected month and open report modal
    const handleOpenReportModal = (monthIndex: number) => {
        setSelectedReportMonth({ month: monthIndex, year: new Date().getFullYear() });
        setIsReportModalOpen(true);
    };

    const currentMonthReports = useMemo(() => {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        return {
            period1: generatePeriodicReport(attendanceHistory, workers, new Date(year, month, 1), new Date(year, month, 15, 23, 59, 59, 999)),
            period2: generatePeriodicReport(attendanceHistory, workers, new Date(year, month, 16), new Date(year, month + 1, 0, 23, 59, 59, 999))
        };
    }, [attendanceHistory, workers]);

    const modalReportData = useMemo(() => {
        if (!selectedReportMonth) return null;
        const { month, year } = selectedReportMonth;
        return {
            period1: generatePeriodicReport(attendanceHistory, workers, new Date(year, month, 1), new Date(year, month, 15, 23, 59, 59, 999)),
            period2: generatePeriodicReport(attendanceHistory, workers, new Date(year, month, 16), new Date(year, month + 1, 0, 23, 59, 59, 999))
        };
    }, [selectedReportMonth, attendanceHistory, workers]);

    const handleWorkerClickInReport = (workerId: string, workerName: string, period: string, startDate: Date, endDate: Date) => {
        const relevantSessions = attendanceHistory.filter(session => {
            const sessionDate = new Date(session.date + 'T00:00:00');
            return sessionDate >= startDate && sessionDate <= endDate;
        });
        const attendanceDetails = relevantSessions.filter(session => session.records.some(record => record.workerId === workerId && !record.is_takeout && record.is_arrived)).map(session => ({ date: session.date, shiftTime: session.shiftTime, division: session.division })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const uniqueDetails = Array.from(new Map(attendanceDetails.map(item => [`${item.date}-${item.shiftTime}-${item.division}`, item])).values());
        setDetailReportData({ workerName, period, dates: uniqueDetails, total: uniqueDetails.length });
        setIsDetailReportModalOpen(true);
    };

    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const handleCopyOpsIdsOnly = () => {
      if (!selectedSession) return;
      const opsIdsToCopy = selectedSession.records
          .filter(record => !record.is_takeout && record.is_arrived)
          .map(record => String(record.opsId).trim())
          .join('\r\n'); // Use standard Windows line endings for better spreadsheet pasting
      
      if (opsIdsToCopy) {
          navigator.clipboard.writeText(opsIdsToCopy).then(() => {
              setCopyFeedback('ops');
              setTimeout(() => { setCopyFeedback(null); setIsCopyDropdownOpen(false); }, 1500);
          });
      } else alert('Tidak ada data yang hadir untuk disalin.');
    };

    const handleCopyExcelFormat = () => {
        if (!selectedSession) return;
        const textToCopy = selectedSession.records
            .filter(record => !record.is_takeout && record.is_arrived)
            .map(record => `${String(record.opsId).trim()}\t${String(record.opsId).trim()}\t${selectedSession.shiftId}\tSUNTER DC`)
            .join('\r\n');
        
        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                setCopyFeedback('excel');
                setTimeout(() => { setCopyFeedback(null); setIsCopyDropdownOpen(false); }, 1500);
            });
        } else alert('Tidak ada data yang hadir untuk disalin.');
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
                <div className="flex flex-wrap gap-2">
                     <button onClick={() => downloadReport('xlsx')} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-all shadow-sm hover:shadow-md">
                        <DownloadIcon /> Excel
                    </button>
                    <button onClick={() => downloadReport('pdf')} className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg transition-all shadow-sm hover:shadow-md">
                        <DownloadIcon /> PDF
                    </button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-xl shadow-gray-100 border border-gray-100 border-t-4 border-blue-600">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-2">
                    <h2 className="text-lg font-black text-gray-900 tracking-tight uppercase">Ringkasan Kehadiran</h2>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{new Intl.DateTimeFormat('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date())}</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <SummaryItem label="Hari Ini" stats={summaryCounts.today} bgColor="bg-blue-50" textColor="text-blue-800" />
                    <SummaryItem label="Minggu Ini" stats={summaryCounts.thisWeek} bgColor="bg-green-50" textColor="text-green-800" />
                    <SummaryItem label="Bulan Ini" stats={summaryCounts.thisMonth} bgColor="bg-indigo-50" textColor="text-indigo-800" />
                    <SummaryItem label="Periode 1-15" stats={summaryCounts.period1} bgColor="bg-yellow-50" textColor="text-yellow-800" />
                    <SummaryItem label="Periode 16-31" stats={summaryCounts.period2} bgColor="bg-purple-50" textColor="text-purple-800" />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard title="Daily Worker Active" value={activeWorkersCount} description="Total active workers" borderColor="border-red-500" />
                <StatCard title="Fulfillment Periode 1-15" value={calculateFulfillment(1, 15)} description="Based on current month" borderColor="border-green-500" />
                <StatCard title="Fulfillment Periode 16-31" value={calculateFulfillment(16, 31)} description="Based on current month" borderColor="border-yellow-500" />
            </div>

             <div className="bg-white rounded-2xl shadow-xl shadow-gray-100 border border-gray-100 overflow-hidden">
                 <div className="p-6 border-b border-gray-50">
                    <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Attendance History (Bulan Ini)</h2>
                 </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-blue-600 text-white uppercase text-[10px]">
                            <tr>
                                <th className="p-4 font-black tracking-widest">Date</th>
                                <th className="p-4 font-black tracking-widest">Tipe</th>
                                <th className="p-4 font-black tracking-widest">Divisi</th>
                                <th className="p-4 font-black tracking-widest">Shift</th>
                                <th className="p-4 font-black tracking-widest text-center">Plan</th>
                                <th className="p-4 font-black tracking-widest text-center">Actual</th>
                                <th className="p-4 font-black tracking-widest text-center">Gap</th>
                                <th className="p-4 font-black tracking-widest text-center">Status</th>
                                <th className="p-4 font-black tracking-widest text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {currentMonthHistory.length > 0 ? (
                                currentMonthHistory.map((session) => {
                                    const actual = session.records.filter(r => !r.is_takeout && r.is_arrived).length;
                                    const planned = session.planMpp;
                                    const gap = actual - planned;
                                    let status = 'GAP';
                                    if (actual === planned) status = 'FULL FILL';
                                    if (actual > planned) status = 'FULL FILL BUFFER';
                                    const sessionType = session.session_type || 'MANUAL';
                                    const sessionTypeColor = sessionType === 'PUBLIC' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700';
                                    return (
                                        <tr key={session.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="p-4 font-bold text-gray-700">{session.date}</td>
                                            <td className="p-4"><span className={`px-2 py-0.5 text-[9px] font-black rounded uppercase ${sessionTypeColor}`}>{sessionType}</span></td>
                                            <td className="p-4 font-bold text-gray-700">{session.division}</td>
                                            <td className="p-4 font-bold text-gray-700">{session.shiftTime}</td>
                                            <td className="p-4 text-center font-bold text-gray-500">{planned}</td>
                                            <td className="p-4 text-center font-black text-gray-900">{actual}</td>
                                            <td className={`p-4 text-center font-black ${gap >= 0 ? 'text-green-600' : 'text-red-600'}`}>{gap > 0 ? `+${gap}` : gap}</td>
                                            <td className="p-4 text-center">
                                                <span className={`px-2 py-1 text-[9px] rounded-full font-black uppercase ${
                                                    status === 'FULL FILL' ? 'bg-green-100 text-green-700' :
                                                    status === 'GAP' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                                }`}>{status}</span>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex justify-center items-center gap-3">
                                                    <button onClick={() => openManageModal(session)} className="text-blue-500 hover:text-blue-700 transition-transform active:scale-90" aria-label="Manage Session"><ViewIcon /></button>
                                                    <button onClick={() => openDeleteSessionModal(session)} className="text-red-500 hover:text-red-700 transition-transform active:scale-90" aria-label="Delete Session"><DeleteIcon /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr><td colSpan={9} className="text-center p-8 text-gray-400 font-bold uppercase tracking-widest text-[10px]">Belum ada riwayat bulan ini.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-xl shadow-gray-100 border border-gray-100">
                    <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight mb-6">Laporan Periode Bulan Ini</h2>
                    <div className="flex flex-col md:flex-row gap-6">
                       <ReportList title="Periode 1-15" data={currentMonthReports.period1} onWorkerClick={(workerId, workerName) => handleWorkerClickInReport(workerId, workerName, `Periode 1-15 ${months[new Date().getMonth()]}`, new Date(new Date().getFullYear(), new Date().getMonth(), 1), new Date(new Date().getFullYear(), new Date().getMonth(), 15, 23, 59, 59, 999))} />
                       <ReportList title="Periode 16-31" data={currentMonthReports.period2} onWorkerClick={(workerId, workerName) => handleWorkerClickInReport(workerId, workerName, `Periode 16-31 ${months[new Date().getMonth()]}`, new Date(new Date().getFullYear(), new Date().getMonth(), 16), new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999))} />
                    </div>
                </div>
                 <div className="bg-white p-6 rounded-2xl shadow-xl shadow-gray-100 border border-gray-100">
                    <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight mb-6">Arsip Laporan Bulanan</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {months.map((month, index) => (
                             <button 
                                key={month}
                                onClick={() => handleOpenReportModal(index)}
                                className="bg-gray-50 hover:bg-blue-600 text-gray-600 hover:text-white font-black py-3 px-3 rounded-xl transition-all duration-200 text-[10px] uppercase tracking-widest border border-gray-100"
                             >
                                {month}
                             </button>
                        ))}
                    </div>
                </div>
            </div>

            <Modal isOpen={isManageModalOpen} onClose={() => setIsManageModalOpen(false)} title="Manage Attendance Session">
                {selectedSession && (
                    <div className="space-y-4">
                        {isEditingSession ? (
                            <form onSubmit={handleUpdateSession} className="space-y-4 mb-6 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div><label className="block text-[10px] font-black text-gray-400 uppercase ml-1 mb-1.5">Tanggal</label><input name="date" type="date" defaultValue={selectedSession.date} required className="w-full bg-white border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold" /></div>
                                    <div><label className="block text-[10px] font-black text-gray-400 uppercase ml-1 mb-1.5">Divisi</label><select name="division" defaultValue={selectedSession.division} required className="w-full bg-white border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold">{divisionOpts.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
                                    <div><label className="block text-[10px] font-black text-gray-400 uppercase ml-1 mb-1.5">Shift Jam</label><select name="shiftTime" defaultValue={selectedSession.shiftTime} required className="w-full bg-white border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold">{shiftTimeOpts.map(time => (<option key={time} value={time}>{time}</option>))}</select></div>
                                    <div><label className="block text-[10px] font-black text-gray-400 uppercase ml-1 mb-1.5">Shift ID</label><select name="shiftId" defaultValue={selectedSession.shiftId} required className="w-full bg-white border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold">{shiftIdOpts.map(shift => (<option key={shift} value={shift}>{shift}</option>))}</select></div>
                                    <div><label className="block text-[10px] font-black text-gray-400 uppercase ml-1 mb-1.5">Plan MPP</label><input name="planMpp" type="number" defaultValue={selectedSession.planMpp} min="1" required className="w-full bg-white border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold" /></div>
                                </div>
                                <div className="flex justify-end gap-2 mt-4"><button type="button" onClick={() => setIsEditingSession(false)} className="px-5 py-2 bg-white text-gray-500 rounded-xl hover:bg-gray-100 font-black uppercase text-[10px] tracking-widest border border-gray-200">Cancel</button><button type="submit" disabled={loadingAction} className="px-5 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-black uppercase text-[10px] tracking-widest shadow-lg shadow-blue-100">Save Changes</button></div>
                            </form>
                        ) : (
                            <div className="flex justify-between items-start bg-gray-50 p-5 rounded-2xl border border-gray-100 mb-6">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-4 w-full uppercase">
                                    <div><p className="text-[9px] font-black text-gray-400 tracking-widest">Tanggal</p><p className="font-black text-gray-800 text-sm">{selectedSession.date}</p></div>
                                    <div><p className="text-[9px] font-black text-gray-400 tracking-widest">Divisi</p><p className="font-black text-gray-800 text-sm">{selectedSession.division}</p></div>
                                    <div><p className="text-[9px] font-black text-gray-400 tracking-widest">Shift</p><p className="font-black text-gray-800 text-sm">{selectedSession.shiftTime}</p></div>
                                    <div><p className="text-[9px] font-black text-gray-400 tracking-widest">Plan MPP</p><p className="font-black text-gray-800 text-sm">{selectedSession.planMpp}</p></div>
                                    <div className="col-span-2 md:col-span-4 border-t border-gray-200 pt-3"><p className="text-[9px] font-black text-gray-400 tracking-widest">Shift ID</p><p className="text-xs font-black font-mono text-blue-600">{selectedSession.shiftId}</p></div>
                                </div>
                                <button onClick={() => setIsEditingSession(true)} className="ml-4 p-2.5 bg-white text-blue-600 hover:bg-blue-50 border border-gray-100 rounded-xl transition-all shadow-sm active:scale-90"><EditIcon /></button>
                            </div>
                        )}

                        <div className="overflow-x-auto border border-gray-100 rounded-2xl max-h-[400px] no-scrollbar">
                            <table className="w-full text-left text-sm relative">
                                <thead className="bg-blue-600 text-white sticky top-0 z-10 uppercase text-[9px]">
                                    <tr>
                                        <th className="p-3 font-black tracking-widest text-center">Fisik</th>
                                        <th className="p-3 font-black tracking-widest">OpsID</th>
                                        <th className="p-3 font-black tracking-widest">Nama Lengkap</th>
                                        <th className="p-3 font-black tracking-widest">Jam Masuk</th>
                                        <th className="p-3 font-black tracking-widest">Total Jam</th>
                                        <th className="p-3 font-black tracking-widest">Status Plan</th>
                                        <th className="p-3 font-black tracking-widest text-center">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {selectedSession.records.map(record => {
                                        const now = new Date().getTime();
                                        const checkinTime = new Date(record.timestamp).getTime();
                                        const nineHoursInMillis = 9 * 60 * 60 * 1000;
                                        let effectiveCheckoutTimeStr = record.checkout_timestamp || null;
                                        if (!effectiveCheckoutTimeStr && (now - checkinTime) > nineHoursInMillis) effectiveCheckoutTimeStr = new Date(checkinTime + nineHoursInMillis).toISOString();
                                        const isCheckedOut = !!record.checkout_timestamp || !!effectiveCheckoutTimeStr;
                                        let statusText = 'On Plan', statusColor = 'bg-green-100 text-green-800';
                                        if(record.is_takeout) { statusText = 'Take Out'; statusColor = 'bg-gray-100 text-gray-500'; }
                                        else if (record.manual_status === 'Partial') { statusText = 'Partial'; statusColor = 'bg-orange-100 text-orange-800'; }
                                        else if (record.manual_status === 'Buffer') { statusText = 'Buffer'; statusColor = 'bg-yellow-100 text-yellow-800'; }
                                        const isArrived = record.is_arrived ?? true;
                                        return (
                                            <tr key={record.id} className={`hover:bg-blue-50/30 transition-colors ${record.is_takeout ? 'opacity-50' : ''}`}>
                                                <td className="p-3 text-center">
                                                    <div className="flex flex-col items-center">
                                                        <input type="checkbox" checked={isArrived} onChange={() => handleToggleArrival(record.id, isArrived)} className="w-5 h-5 text-blue-600 rounded-lg focus:ring-blue-500 border-gray-300 transition-all cursor-pointer" />
                                                        <span className={`text-[8px] font-black mt-1 px-1.5 py-0.5 rounded uppercase ${isArrived ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>{isArrived ? 'Hadir' : 'OTW'}</span>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-black font-mono font-black">{record.opsId}</td>
                                                <td className="p-3 text-gray-800 font-bold uppercase text-xs">{record.fullName}</td>
                                                <td className="p-3 font-bold text-gray-500">{new Date(record.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</td>
                                                <td className="p-3 font-black font-mono text-gray-800 text-xs">{calculateWorkDuration(record.timestamp, effectiveCheckoutTimeStr)}</td>
                                                <td className="p-3"><span className={`px-2 py-0.5 text-[9px] rounded-full font-black uppercase ${statusColor}`}>{statusText}</span></td>
                                                <td className="p-3">
                                                    <div className="flex justify-center items-center gap-2">
                                                        <button onClick={() => openQrModal(record)} className="text-gray-400 hover:text-gray-900 transition-transform active:scale-90"><PrintIcon /></button>
                                                        <button onClick={() => handleAction('takeout', record.id)} disabled={loadingAction || record.is_takeout} className="text-[9px] bg-gray-100 hover:bg-gray-200 text-gray-600 font-black py-1 px-2 rounded-lg uppercase tracking-widest disabled:opacity-30">TakeOut</button>
                                                        <button onClick={() => handleAction('checkout', record.id)} disabled={loadingAction || !!record.checkout_timestamp || record.is_takeout} className="text-[9px] bg-green-500 hover:bg-green-600 text-white font-black py-1 px-2 rounded-lg uppercase tracking-widest disabled:opacity-30">CheckOut</button>
                                                        <button onClick={() => openDeleteRecordModal(record)} disabled={loadingAction} className="text-red-400 hover:text-red-700 transition-transform active:scale-90"><DeleteIcon /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-100">
                            <form onSubmit={handleManualAdd} className="space-y-4">
                               <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tambah Karyawan Manual</h4>
                               {manualAddError && <p className="text-red-600 bg-red-50 p-3 rounded-xl text-xs font-bold border border-red-100">{manualAddError}</p>}
                               <div className="flex flex-col sm:flex-row gap-3">
                                   <input type="text" value={manualAddOpsId} onChange={(e) => setManualAddOpsId(e.target.value)} placeholder="OpsID Karyawan" className="flex-grow bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold" required />
                                   <select value={manualAddStatus} onChange={(e) => setManualAddStatus(e.target.value as any)} className="bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold">
                                       <option value="On Plan">On Plan</option>
                                       <option value="Partial">Partial</option>
                                       <option value="Buffer">Buffer</option>
                                   </select>
                                   <button type="submit" disabled={loadingAction} className="bg-blue-600 hover:bg-blue-700 text-white font-black py-3 px-6 rounded-xl transition-all uppercase text-[10px] tracking-[0.2em] shadow-lg shadow-blue-100">Add</button>
                               </div>
                           </form>
                        </div>
                        <div className="mt-6 pt-6 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                            <div className="relative" ref={dropdownRef}>
                                <button onClick={() => setIsCopyDropdownOpen(!isCopyDropdownOpen)} className="flex items-center gap-3 bg-slate-900 hover:bg-black text-white font-black py-3 px-6 rounded-xl transition-all uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-gray-200">
                                    <CopyIcon className="w-4 h-4" /> Salin Data
                                    <svg className={`w-3 h-3 transition-transform ${isCopyDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                                </button>
                                {isCopyDropdownOpen && (
                                    <div className="absolute bottom-full mb-3 left-0 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-50 animate-fade-in-up overflow-hidden">
                                        <button onClick={handleCopyOpsIdsOnly} className={`w-full text-left px-5 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${copyFeedback === 'ops' ? 'bg-green-500 text-white' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'}`}>
                                            {copyFeedback === 'ops' ? "Tersalin!" : "Salin OpsID Saja"}
                                        </button>
                                        <button onClick={handleCopyExcelFormat} className={`w-full text-left px-5 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${copyFeedback === 'excel' ? 'bg-green-500 text-white' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700 border-t border-gray-50'}`}>
                                            {copyFeedback === 'excel' ? "Tersalin!" : "Salin Format Excel"}
                                        </button>
                                    </div>
                                )}
                            </div>
                            <button onClick={handleCheckOutAll} className="bg-green-600 hover:bg-green-700 text-white font-black py-3 px-6 rounded-xl transition-all uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-green-100">Check Out Remaining</button>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal isOpen={isDeleteSessionModalOpen} onClose={() => setIsDeleteSessionModalOpen(false)} title="Hapus Sesi">
                <div className="p-4"><p className="text-gray-600 font-bold">Yakin ingin menghapus sesi tanggal <span className="text-red-600">{selectedSession?.date}</span>?</p><div className="flex justify-end gap-3 mt-6"><button onClick={() => setIsDeleteSessionModalOpen(false)} className="px-5 py-2 bg-gray-100 text-gray-500 rounded-xl font-black uppercase text-[10px]">Batal</button><button onClick={handleDeleteSession} className="px-5 py-2 bg-red-600 text-white rounded-xl font-black uppercase text-[10px] shadow-lg shadow-red-100">Ya, Hapus</button></div></div>
            </Modal>
            
            <Modal isOpen={isDeleteRecordModalOpen} onClose={() => setIsDeleteRecordModalOpen(false)} title="Hapus Record">
                <div className="p-4"><p className="text-gray-600 font-bold">Hapus data absen <span className="text-red-600">{recordToDelete?.fullName}</span>?</p><div className="flex justify-end gap-3 mt-6"><button onClick={() => setIsDeleteRecordModalOpen(false)} className="px-5 py-2 bg-gray-100 text-gray-500 rounded-xl font-black uppercase text-[10px]">Batal</button><button onClick={handleConfirmDeleteRecord} className="px-5 py-2 bg-red-600 text-white rounded-xl font-black uppercase text-[10px] shadow-lg shadow-red-100">Ya, Hapus</button></div></div>
            </Modal>

            <Modal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} title="Employee QR Code">
                {qrWorkerData && (
                    <div className="flex flex-col items-center justify-center p-6">
                        <div id="printable-qr" className="flex flex-col items-center text-center p-6 bg-white rounded-3xl border-2 border-dashed border-gray-100">
                            <h1 className="text-xl font-black mb-4 hidden print:block text-black uppercase tracking-widest">ABSENSI NEXUS</h1>
                            <div className="bg-white p-4 rounded-3xl border-4 border-blue-600 print:border-black flex flex-col items-center shadow-2xl">
                                {qrCodeUrl ? <img src={qrCodeUrl} alt="QR" className="w-64 h-64 object-contain" /> : <div className="w-64 h-64 flex items-center justify-center text-gray-400 animate-pulse">Generating...</div>}
                            </div>
                            <div className="mt-8">
                                <h2 className="text-3xl font-black text-gray-900 print:text-black uppercase tracking-tight">{qrWorkerData.fullName}</h2>
                                <p className="text-xl text-blue-600 font-black font-mono tracking-[0.2em] mt-2 print:text-black">{qrWorkerData.opsId}</p>
                                <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.3em] mt-4">{qrWorkerData.department}</p>
                            </div>
                        </div>
                        <div className="mt-10 flex gap-4 print:hidden no-print">
                            <button onClick={() => window.print()} className="flex items-center gap-3 bg-slate-900 hover:bg-black text-white font-black py-4 px-8 rounded-2xl transition-all shadow-xl shadow-gray-200 uppercase text-[10px] tracking-widest"><PrintIcon /> Print Struk</button>
                             <a href={qrCodeUrl} download={`${qrWorkerData.fullName}_QR.png`} className="flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-black py-4 px-8 rounded-2xl transition-all shadow-xl shadow-blue-100 uppercase text-[10px] tracking-widest"><DownloadIcon /> Save PNG</a>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Added Modal for monthly report archives */}
            <Modal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} title={`Laporan Bulanan: ${selectedReportMonth ? months[selectedReportMonth.month] : ''}`}>
                {selectedReportMonth && modalReportData && (
                    <div className="flex flex-col md:flex-row gap-6">
                        <ReportList 
                            title="Periode 1-15" 
                            data={modalReportData.period1} 
                            onWorkerClick={(workerId, workerName) => handleWorkerClickInReport(workerId, workerName, `Periode 1-15 ${months[selectedReportMonth.month]}`, new Date(selectedReportMonth.year, selectedReportMonth.month, 1), new Date(selectedReportMonth.year, selectedReportMonth.month, 15, 23, 59, 59, 999))} 
                        />
                        <ReportList 
                            title="Periode 16-31" 
                            data={modalReportData.period2} 
                            onWorkerClick={(workerId, workerName) => handleWorkerClickInReport(workerId, workerName, `Periode 16-31 ${months[selectedReportMonth.month]}`, new Date(selectedReportMonth.year, selectedReportMonth.month, 16), new Date(selectedReportMonth.year, selectedReportMonth.month + 1, 0, 23, 59, 59, 999))} 
                        />
                    </div>
                )}
            </Modal>

            {/* Added Modal for detailed attendance records per worker */}
            <Modal isOpen={isDetailReportModalOpen} onClose={() => setIsDetailReportModalOpen(false)} title="Detail Kehadiran">
                {detailReportData && (
                    <div className="space-y-4">
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Karyawan</p>
                            <h3 className="text-xl font-black text-blue-900 uppercase">{detailReportData.workerName}</h3>
                            <p className="text-sm font-bold text-blue-600 mt-1">{detailReportData.period}</p>
                            <div className="mt-3 flex items-center gap-2">
                                <span className="text-[10px] font-black bg-blue-600 text-white px-2 py-0.5 rounded uppercase">Total: {detailReportData.total} HK</span>
                            </div>
                        </div>
                        <div className="max-h-64 overflow-y-auto pr-2 no-scrollbar border border-gray-100 rounded-xl">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-gray-50 sticky top-0 uppercase font-black text-gray-400">
                                    <tr>
                                        <th className="p-3">Tanggal</th>
                                        <th className="p-3">Divisi</th>
                                        <th className="p-3">Shift</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {detailReportData.dates.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50/50">
                                            <td className="p-3 font-bold text-gray-700">{item.date}</td>
                                            <td className="p-3 font-black text-blue-600 uppercase">{item.division}</td>
                                            <td className="p-3 text-gray-500 font-bold">{item.shiftTime}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex justify-end pt-2">
                            <button onClick={() => setIsDetailReportModalOpen(false)} className="px-6 py-2 bg-gray-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-gray-200">Tutup</button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Dashboard;
