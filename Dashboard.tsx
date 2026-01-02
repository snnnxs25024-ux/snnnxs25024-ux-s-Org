
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Worker, AttendanceSession } from '../types';
import DownloadIcon from '../components/icons/DownloadIcon';
import Modal from '../components/Modal';
import ViewIcon from '../components/icons/ViewIcon';
import DeleteIcon from '../components/icons/DeleteIcon';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../hooks/useToast';
import ManageSessionModal from '../components/ManageSessionModal';

interface DashboardProps {
    workers: Worker[];
    attendanceHistory: AttendanceSession[];
    refreshData: () => void;
    setAttendanceHistory: React.Dispatch<React.SetStateAction<AttendanceSession[]>>;
    autoOpenSessionId?: string | null;
    clearAutoOpenSessionId: () => void;
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
            workerDetails[record.workerId] = { opsId: record.opsId, fullName: record.fullName };
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
    return { workerId, opsId: opsId || 'N/A', fullName: fullName || 'Unknown', attendanceCount: count };
  });

  return report.sort((a, b) => b.attendanceCount - a.attendanceCount);
};

const calculateWorkDuration = (checkin: string, checkout: string | null | undefined): string => {
    if (!checkout) return '-';
    const checkinTime = new Date(checkin).getTime();
    const checkoutTime = new Date(checkout).getTime();
    if (isNaN(checkinTime) || isNaN(checkoutTime) || checkoutTime < checkinTime) return '-';
    let diff = Math.abs(checkoutTime - checkinTime);
    const nineHoursInMillis = 9 * 3600 * 1000;
    if (diff > nineHoursInMillis) diff = nineHoursInMillis;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}j ${minutes}m`;
};

// --- UI Sub-components for Dashboard ---

const ReportList: React.FC<{ title: string; data: PeriodicReportData; onWorkerClick: (workerId: string, workerName: string) => void; }> = ({ title, data, onWorkerClick }) => (
    <div className="flex-1">
        <h4 className="text-md font-semibold text-gray-700 mb-2 border-b pb-2">{title}</h4>
        <div className="max-h-64 overflow-y-auto pr-2">
            {data.length > 0 ? (
                <ul className="space-y-2">{data.map(item => (
                    <li key={item.workerId} className="flex justify-between items-center text-sm bg-gray-50 p-2 rounded-md border cursor-pointer hover:bg-blue-50" onClick={() => onWorkerClick(item.workerId, item.fullName)}>
                        <div><p className="font-semibold">{item.fullName}</p><p className="text-xs font-mono">{item.opsId}</p></div>
                        <span className="font-bold text-lg text-blue-600">{item.attendanceCount} HK</span>
                    </li>))}
                </ul>
            ) : <p className="text-gray-500 text-center pt-8">No data for this period.</p>}
        </div>
    </div>
);

const StatCard: React.FC<{ title: string; value: string | number; description: string; borderColor: string }> = ({ title, value, description, borderColor }) => (
    <div className={`bg-white p-6 rounded-lg shadow-lg border-t-4 transition-all hover:shadow-xl ${borderColor}`}>
        <h3 className="text-sm font-medium text-gray-500">{title}</h3>
        <p className="text-3xl font-bold text-blue-600 my-2">{value}</p>
        <p className="text-xs text-gray-400">{description}</p>
    </div>
);

const SummaryItem: React.FC<{ label: string; stats: SummaryStats; bgColor: string; textColor: string }> = ({ label, stats, bgColor, textColor }) => (
    <div className={`text-center p-3 rounded-lg ${bgColor} flex flex-col justify-between h-full`}>
        <p className={`text-[10px] md:text-xs uppercase font-extrabold ${textColor} opacity-80 mb-2`}>{label}</p>
        <div className="space-y-1">
            <div className="flex justify-between items-center border-b border-black/10 pb-1"><span className="text-[10px] opacity-70">Plan</span><span className={`text-sm font-bold ${textColor}`}>{stats.plan}</span></div>
            <div className="flex justify-between items-center border-b border-black/10 pb-1"><span className="text-[10px] opacity-70">Actual</span><span className={`text-xl font-bold ${textColor}`}>{stats.actual}</span></div>
            <div className="flex justify-between items-center pt-1"><span className="text-[10px] opacity-70">Gap</span><span className={`text-sm font-bold ${stats.gap >= 0 ? 'text-green-700' : 'text-red-600'}`}>{stats.gap > 0 ? `+${stats.gap}` : stats.gap}</span></div>
        </div>
    </div>
);

// --- Main Dashboard Component ---

const Dashboard: React.FC<DashboardProps> = ({ workers, attendanceHistory, refreshData, setAttendanceHistory, autoOpenSessionId, clearAutoOpenSessionId }) => {
    const [selectedSession, setSelectedSession] = useState<AttendanceSession | null>(null);
    const [isManageModalOpen, setIsManageModalOpen] = useState(false);
    // @ts-ignore
    const [isDeleteSessionModalOpen, setIsDeleteSessionModalOpen] = useState(false);
    // @ts-ignore
    const [loadingAction, setLoadingAction] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [selectedReportMonth, setSelectedReportMonth] = useState<{ month: number; year: number } | null>(null);
    const [isDetailReportModalOpen, setIsDetailReportModalOpen] = useState(false);
    const [detailReportData, setDetailReportData] = useState<{ workerName: string; opsId: string; period: string; dates: { date: string; shiftTime: string; division: string }[], total: number } | null>(null);
    const { showToast } = useToast();

    const openManageModal = useCallback((session: AttendanceSession) => {
        setSelectedSession(session);
        setIsManageModalOpen(true);
    }, []);

    // @ts-ignore
    const openDeleteSessionModal = (session: AttendanceSession) => {
        setSelectedSession(session);
        setIsDeleteSessionModalOpen(true);
    };

    // @ts-ignore
    const handleDeleteSession = async () => {
        if (!selectedSession) return;
        setLoadingAction(true);
        const { error } = await supabase.from('attendance_sessions').delete().match({ id: selectedSession.id });
        setLoadingAction(false);
        if (error) {
            showToast(`Error: ${error.message}`, { type: 'error', title: 'Gagal Hapus Sesi' });
        } else {
            setIsDeleteSessionModalOpen(false);
            setSelectedSession(null);
            showToast('Sesi absensi berhasil dihapus.', { type: 'success', title: 'Berhasil' });
            refreshData();
        }
    };

    useEffect(() => {
        if (autoOpenSessionId && attendanceHistory.length > 0) {
            const session = attendanceHistory.find(s => s.id === autoOpenSessionId);
            if (session) {
                openManageModal(session);
                clearAutoOpenSessionId();
            }
        }
    }, [autoOpenSessionId, attendanceHistory, openManageModal, clearAutoOpenSessionId]);
    
    const activeWorkers = workers.filter(w => w.status === 'Active').length;

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

    const fulfillmentPeriod1 = calculateFulfillment(1, 15);
    const fulfillmentPeriod2 = calculateFulfillment(16, 31);
    
    const currentMonthHistory = useMemo(() => {
        const today = new Date();
        return attendanceHistory
            .filter(session => {
                const sessionDate = new Date(session.date + 'T00:00:00');
                return sessionDate.getMonth() === today.getMonth() && sessionDate.getFullYear() === today.getFullYear();
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [attendanceHistory]);

    const downloadReport = (format: 'xlsx' | 'pdf') => {
        const reportData = currentMonthHistory.flatMap(session => 
            session.records.map(record => ({
                'Tanggal': session.date, 'Divisi': session.division, 'Shift Jam': session.shiftTime,
                'Shift ID': session.shiftId, 'Ops ID': record.opsId, 'Nama Lengkap': record.fullName,
                'Jam Masuk (Shift)': new Date(record.timestamp).toLocaleTimeString('id-ID'),
                'Jam Scan (Aktual)': record.scan_timestamp ? new Date(record.scan_timestamp).toLocaleTimeString('id-ID') : '-',
                'Jam Pulang': record.checkout_timestamp ? new Date(record.checkout_timestamp).toLocaleTimeString('id-ID') : '-',
                'Total Jam Kerja': calculateWorkDuration(record.timestamp, record.checkout_timestamp),
                'Status': record.is_takeout ? 'Take Out' : record.manual_status || 'On Plan',
                'Kehadiran Fisik': record.is_arrived ? 'Hadir' : 'Sedang di jalan', 'Tipe Sesi': session.session_type || 'MANUAL'
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
                head: [['Tanggal', 'Divisi', 'Shift Jam', 'Shift ID', 'Ops ID', 'Nama Lengkap', 'Jam Masuk (Shift)', 'Jam Scan (Aktual)', 'Jam Pulang', 'Total Jam Kerja', 'Status']],
                body: reportData.map(Object.values),
            });
            doc.save('Absensi_Report_Bulan_Ini.pdf');
        }
    };
    
    const summaryCounts = useMemo(() => {
        const today_local = new Date();
        const year = today_local.getFullYear(), month = (today_local.getMonth() + 1).toString().padStart(2, '0'), day = today_local.getDate().toString().padStart(2, '0');
        const todayString = `${year}-${month}-${day}`;
        const startOfWeek = new Date(today_local);
        startOfWeek.setDate(startOfWeek.getDate() - today_local.getDay() + (today_local.getDay() === 0 ? -6 : 1));
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);
        const counts = { today: { plan: 0, actual: 0, gap: 0 }, thisWeek: { plan: 0, actual: 0, gap: 0 }, thisMonth: { plan: 0, actual: 0, gap: 0 }, period1: { plan: 0, actual: 0, gap: 0 }, period2: { plan: 0, actual: 0, gap: 0 } };
        const addToStats = (key: keyof typeof counts, planned: number, actual: number) => { counts[key].plan += planned; counts[key].actual += actual; };

        attendanceHistory.forEach(session => {
            const sessionDate = new Date(session.date + 'T00:00:00');
            if (isNaN(sessionDate.getTime())) return;
            const planned = session.planMpp || 0;
            const actual = session.records.filter(r => !r.is_takeout && r.is_arrived).length;
            if (session.date === todayString) addToStats('today', planned, actual);
            if (sessionDate >= startOfWeek && sessionDate <= endOfWeek) addToStats('thisWeek', planned, actual);
            if (sessionDate.getFullYear() === year && sessionDate.getMonth() === today_local.getMonth()) {
                addToStats('thisMonth', planned, actual);
                if (sessionDate.getDate() <= 15) addToStats('period1', planned, actual);
                else addToStats('period2', planned, actual);
            }
        });
        Object.keys(counts).forEach(k => { const key = k as keyof typeof counts; counts[key].gap = counts[key].actual - counts[key].plan; });
        return counts;
    }, [attendanceHistory]);

    const formattedDate = new Intl.DateTimeFormat('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());

    const currentMonthReports = useMemo(() => {
        const today = new Date(), year = today.getFullYear(), month = today.getMonth();
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

    const handleOpenReportModal = (monthIndex: number) => {
        setSelectedReportMonth({ month: monthIndex, year: new Date().getFullYear() });
        setIsReportModalOpen(true);
    };

    const handleWorkerClickInReport = (workerId: string, workerName: string, period: string, startDate: Date, endDate: Date) => {
        const relevantSessions = attendanceHistory.filter(session => {
            const sessionDate = new Date(session.date + 'T00:00:00');
            return sessionDate >= startDate && sessionDate <= endDate;
        });
        const attendanceDetails = relevantSessions
            .filter(session => session.records.some(record => record.workerId === workerId && !record.is_takeout && record.is_arrived))
            .map(session => ({ date: session.date, shiftTime: session.shiftTime, division: session.division }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const uniqueDetails = Array.from(new Map(attendanceDetails.map(item => [`${item.date}-${item.shiftTime}-${item.division}`, item])).values());
        const worker = workers.find(w => w.id === workerId);
        setDetailReportData({ workerName, opsId: worker?.opsId || 'N/A', period, dates: uniqueDetails, total: uniqueDetails.length });
        setIsDetailReportModalOpen(true);
    };
    
    const handleDownloadDetailReportJpeg = async () => {
        if (!detailReportData) return;
        // ... (JPEG download logic can be implemented here if needed, keeping component smaller for now)
        showToast('Fungsi download JPEG untuk laporan detail belum diimplementasikan.', {type: 'info'});
    };
    
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
                <div className="flex flex-wrap gap-2">
                     <button onClick={() => downloadReport('xlsx')} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"><DownloadIcon /> Excel</button>
                    <button onClick={() => downloadReport('pdf')} className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg"><DownloadIcon /> PDF</button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-lg border-t-4 border-blue-500">
                <div className="flex justify-between items-center mb-4"><h2 className="text-lg font-semibold text-blue-800">Ringkasan Kehadiran</h2><p className="text-sm text-gray-500">{formattedDate}</p></div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <SummaryItem label="Hari Ini" stats={summaryCounts.today} bgColor="bg-blue-200" textColor="text-blue-800" />
                    <SummaryItem label="Minggu Ini" stats={summaryCounts.thisWeek} bgColor="bg-green-200" textColor="text-green-800" />
                    <SummaryItem label="Bulan Ini" stats={summaryCounts.thisMonth} bgColor="bg-indigo-200" textColor="text-indigo-800" />
                    <SummaryItem label="Periode 1-15" stats={summaryCounts.period1} bgColor="bg-yellow-200" textColor="text-yellow-800" />
                    <SummaryItem label="Periode 16-31" stats={summaryCounts.period2} bgColor="bg-purple-200" textColor="text-purple-800" />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard title="Daily Worker Active" value={activeWorkers} description="Total active workers" borderColor="border-red-500" />
                <StatCard title="Fulfillment Periode 1-15" value={fulfillmentPeriod1} description="Based on current month" borderColor="border-green-500" />
                <StatCard title="Fulfillment Periode 16-31" value={fulfillmentPeriod2} description="Based on current month" borderColor="border-yellow-500" />
            </div>

             <div className="bg-white rounded-lg shadow-lg border-t-4 border-indigo-500">
                 <div className="p-4 sm:p-6"><h2 className="text-lg font-semibold text-gray-800 mb-4">Attendance History (Bulan Ini)</h2></div>
                <div className="max-h-[490px] overflow-auto"><div className="overflow-x-auto">
                    <table className="w-full text-left text-sm relative">
                        <thead className="bg-blue-600 text-white sticky top-0 z-10"><tr>
                            <th className="p-3">Date</th><th className="p-3">Tipe</th><th className="p-3">Divisi</th>
                            <th className="p-3">Shift</th><th className="p-3 text-center">Plan</th><th className="p-3 text-center">Actual</th>
                            <th className="p-3 text-center">Gap</th><th className="p-3 text-center">Status</th><th className="p-3 text-center">Actions</th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-200">
                            {currentMonthHistory.length > 0 ? currentMonthHistory.map((session) => {
                                const actual = session.records.filter(r => !r.is_takeout && r.is_arrived).length;
                                const planned = session.planMpp;
                                const gap = actual - planned;
                                let status = 'GAP';
                                if (actual === planned) status = 'FULL FILL';
                                if (actual > planned) status = 'FULL FILL BUFFER';
                                const sessionTypeColor = (session.session_type || 'MANUAL') === 'PUBLIC' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700';
                                return (
                                    <tr key={session.id} className="hover:bg-gray-50">
                                        <td className="p-3">{session.date}</td>
                                        <td className="p-3"><span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${sessionTypeColor}`}>{session.session_type || 'MANUAL'}</span></td>
                                        <td className="p-3">{session.division}</td><td className="p-3">{session.shiftTime}</td>
                                        <td className="p-3 text-center">{planned}</td><td className="p-3 text-center font-bold">{actual}</td>
                                        <td className={`p-3 text-center font-bold ${gap >= 0 ? 'text-green-600' : 'text-red-600'}`}>{gap > 0 ? `+${gap}` : gap}</td>
                                        <td className="p-3 text-center"><span className={`px-2 py-1 text-xs rounded-full font-bold ${status === 'FULL FILL' ? 'bg-green-100 text-green-700' : status === 'GAP' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{status}</span></td>
                                        <td className="p-3"><div className="flex justify-center items-center gap-3">
                                            <button onClick={() => openManageModal(session)} className="text-blue-500 hover:text-blue-700"><ViewIcon /></button>
                                            {/* @FIX: Use a proper handler for deleting sessions instead of a faulty boolean expression. */}
                                            <button onClick={() => openDeleteSessionModal(session)} className="text-red-500 hover:text-red-700"><DeleteIcon /></button>
                                        </div></td>
                                    </tr>
                                );
                            }) : (<tr><td colSpan={9} className="text-center p-6 text-gray-500">No attendance history found for this month.</td></tr>)}
                        </tbody>
                    </table>
                </div></div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-lg shadow-lg border-t-4 border-purple-500">
                    <h2 className="text-lg font-semibold mb-4">Laporan Periode Bulan Ini</h2>
                    <div className="flex flex-col md:flex-row gap-6">
                       <ReportList title="Periode 1-15" data={currentMonthReports.period1} onWorkerClick={(workerId, workerName) => handleWorkerClickInReport(workerId, workerName, `Periode 1-15 ${months[new Date().getMonth()]}`, new Date(new Date().getFullYear(), new Date().getMonth(), 1), new Date(new Date().getFullYear(), new Date().getMonth(), 15, 23, 59, 59, 999))} />
                       <ReportList title="Periode 16-31" data={currentMonthReports.period2} onWorkerClick={(workerId, workerName) => handleWorkerClickInReport(workerId, workerName, `Periode 16-31 ${months[new Date().getMonth()]}`, new Date(new Date().getFullYear(), new Date().getMonth(), 16), new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999))} />
                    </div>
                </div>
                 <div className="bg-white p-6 rounded-lg shadow-lg border-t-4 border-pink-500">
                    <h2 className="text-lg font-semibold mb-4">Arsip Laporan Bulanan</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {months.map((month, index) => (<button key={month} onClick={() => handleOpenReportModal(index)} className="bg-gray-100 hover:bg-blue-600 text-gray-700 hover:text-white font-medium py-2 px-3 rounded-lg text-sm border">{month}</button>))}
                    </div>
                </div>
            </div>

            {isManageModalOpen && (
                <ManageSessionModal
                    isOpen={isManageModalOpen}
                    onClose={() => setIsManageModalOpen(false)}
                    session={selectedSession}
                    workers={workers}
                    attendanceHistory={attendanceHistory}
                    refreshData={refreshData}
                    setAttendanceHistory={setAttendanceHistory}
                />
            )}

            <Modal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} title={`Laporan Detail Bulan ${selectedReportMonth ? months[selectedReportMonth.month] : ''}`}>
                {modalReportData && selectedReportMonth && (
                    <div className="flex flex-col md:flex-row gap-6">
                        <ReportList title="Periode 1-15" data={modalReportData.period1} onWorkerClick={(workerId, workerName) => handleWorkerClickInReport(workerId, workerName, `Periode 1-15 ${months[selectedReportMonth.month]}`, new Date(selectedReportMonth.year, selectedReportMonth.month, 1), new Date(selectedReportMonth.year, selectedReportMonth.month, 15, 23, 59, 59, 999))} />
                        <ReportList title="Periode 16-31" data={modalReportData.period2} onWorkerClick={(workerId, workerName) => handleWorkerClickInReport(workerId, workerName, `Periode 16-31 ${months[selectedReportMonth.month]}`, new Date(selectedReportMonth.year, selectedReportMonth.month, 16), new Date(selectedReportMonth.year, selectedReportMonth.month + 1, 0, 23, 59, 59, 999))} />
                    </div>
                )}
            </Modal>
            
            <Modal isOpen={isDetailReportModalOpen} onClose={() => setIsDetailReportModalOpen(false)} title="Detail Kehadiran" scrollable={true}>
                {detailReportData && (
                    <div className="flex flex-col">
                        <div className="shrink-0 bg-blue-50 p-5 rounded-lg mb-4 text-center border">
                             <h3 className="text-xl font-bold">{detailReportData.workerName}</h3>
                             <p className="text-sm font-mono mt-1">{detailReportData.opsId}</p>
                             <p className="font-semibold text-blue-600 text-lg mt-2">{detailReportData.period}</p>
                        </div>
                        <div className="border rounded-lg bg-white shadow-sm"><ul className="divide-y">
                            {detailReportData.dates.length > 0 ? (
                                detailReportData.dates.map((item, index) => (
                                    <li key={index} className="p-4 flex justify-between items-center hover:bg-blue-50">
                                        <div>
                                            <span className="font-medium text-sm">{new Intl.DateTimeFormat('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(item.date + 'T00:00:00'))}</span>
                                            <div className="mt-1"><span className="px-2 py-0.5 text-xs font-bold text-gray-600 bg-gray-200 rounded border">{item.division}</span></div>
                                        </div>
                                        <span className="text-xs font-bold text-blue-700 bg-blue-100 px-3 py-1.5 rounded-full border">{item.shiftTime}</span>
                                    </li>
                                ))
                            ) : <li className="p-6 text-center text-gray-500">Tidak ada catatan kehadiran pada periode ini.</li>}
                        </ul></div>
                        <div className="shrink-0 mt-4 flex flex-col sm:flex-row gap-3 justify-between items-center">
                            <div className="w-full bg-gray-50 p-4 rounded-lg flex justify-between items-center border">
                                 <span className="font-medium">Total Kehadiran</span>
                                 <span className="text-xl font-bold text-blue-600">{detailReportData.total} Hari Kerja</span>
                            </div>
                            <button onClick={handleDownloadDetailReportJpeg} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-5 rounded-lg"><DownloadIcon /> Download JPEG</button>
                        </div>
                    </div>
                )}
            </Modal>
            
            <Modal isOpen={isDeleteSessionModalOpen} onClose={() => setIsDeleteSessionModalOpen(false)} title="Confirm Session Deletion" size="md" scrollable={false}>
                {selectedSession && (
                    <div>
                        <p className="text-gray-600">Are you sure you want to delete the attendance session for <strong className="text-blue-600">{selectedSession.date} ({selectedSession.shiftTime})</strong>?</p>
                        <p className="text-sm text-red-600 mt-2">This will remove all {selectedSession.records.length} attendance records for this session. This action cannot be undone.</p>
                        <div className="flex justify-end gap-4 mt-6">
                            <button onClick={() => setIsDeleteSessionModalOpen(false)} className="py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold">Cancel</button>
                            <button onClick={handleDeleteSession} className="py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold" disabled={loadingAction}>
                                {loadingAction ? 'Deleting...' : 'Delete Session'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Dashboard;
