import React, { useState, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Worker, AttendanceSession, AttendanceRecord } from '../types';
import DownloadIcon from '../components/icons/DownloadIcon';
import Modal from '../components/Modal';
import ViewIcon from '../components/icons/ViewIcon';
import DeleteIcon from '../components/icons/DeleteIcon';
import { supabase } from '../lib/supabaseClient';


interface DashboardProps {
    workers: Worker[];
    attendanceHistory: AttendanceSession[];
    refreshData: () => void;
}

type PeriodicReportData = {
  workerId: string;
  opsId: string;
  fullName: string;
  attendanceCount: number;
}[];

const generatePeriodicReport = (
  sessions: AttendanceSession[],
  workers: Worker[],
  startDate: Date,
  endDate: Date
): PeriodicReportData => {
  const attendanceCounts: { [workerId: string]: number } = {};

  const relevantSessions = sessions.filter(session => {
    const sessionDate = new Date(session.date + 'T00:00:00Z');
    return sessionDate >= startDate && sessionDate <= endDate;
  });

  for (const session of relevantSessions) {
    // Count each worker only once per day, excluding takeouts
    const uniqueWorkerIdsThisDay = new Set<string>();
    for (const record of session.records) {
      if (!record.is_takeout) {
        uniqueWorkerIdsThisDay.add(record.workerId);
      }
    }
    uniqueWorkerIdsThisDay.forEach(workerId => {
        attendanceCounts[workerId] = (attendanceCounts[workerId] || 0) + 1;
    });
  }

  const report = Object.entries(attendanceCounts).map(([workerId, count]) => {
    const worker = workers.find(w => w.id === workerId);
    return {
      workerId,
      opsId: worker?.opsId || 'N/A',
      fullName: worker?.fullName || 'Unknown',
      attendanceCount: count
    };
  });

  return report.sort((a, b) => b.attendanceCount - a.attendanceCount);
};

const ReportList: React.FC<{ title: string; data: PeriodicReportData }> = ({ title, data }) => (
    <div className="flex-1">
        <h4 className="text-lg font-semibold text-teal-400 mb-2 border-b border-gray-600 pb-2">{title}</h4>
        <div className="max-h-64 overflow-y-auto pr-2">
            {data.length > 0 ? (
                <ul className="space-y-2">
                    {data.map(item => (
                        <li key={item.workerId} className="flex justify-between items-center text-sm bg-gray-700/50 p-2 rounded">
                            <div>
                                <p className="font-semibold text-white">{item.fullName}</p>
                                <p className="text-xs text-gray-400">{item.opsId}</p>
                            </div>
                            <span className="font-bold text-lg text-teal-300">{item.attendanceCount} HK</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-gray-500 text-center pt-8">No data for this period.</p>
            )}
        </div>
    </div>
);


const StatCard: React.FC<{ title: string; value: string | number; description: string }> = ({ title, value, description }) => (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700 hover:border-teal-500 transition-all duration-300">
        <h3 className="text-lg font-semibold text-gray-400">{title}</h3>
        <p className="text-4xl font-bold text-teal-400 my-2">{value}</p>
        <p className="text-sm text-gray-500">{description}</p>
    </div>
);

const SummaryItem: React.FC<{ label: string; value: number }> = ({ label, value }) => (
    <div className="text-center bg-gray-700/50 p-4 rounded-lg">
        <p className="text-sm text-gray-400">{label}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
    </div>
);

const calculateWorkDuration = (checkin: string, checkout: string | null | undefined): string => {
    if (!checkout) return '-';
    const checkinTime = new Date(checkin).getTime();
    const checkoutTime = new Date(checkout).getTime();
    if (isNaN(checkinTime) || isNaN(checkoutTime) || checkoutTime < checkinTime) return '-';

    let diff = Math.abs(checkoutTime - checkinTime) / 1000;
    
    const nineHoursInSeconds = 9 * 3600;
    const isAutoCheckout = (new Date(checkout).getTime() - new Date(checkin).getTime()) === nineHoursInSeconds * 1000;
     if (isAutoCheckout || diff > nineHoursInSeconds) {
        diff = nineHoursInSeconds;
    }

    const hours = Math.floor(diff / 3600);
    diff %= 3600;
    const minutes = Math.floor(diff / 60);

    return `${hours}h ${minutes}m`;
};


const Dashboard: React.FC<DashboardProps> = ({ workers, attendanceHistory, refreshData }) => {
    const [selectedSession, setSelectedSession] = useState<AttendanceSession | null>(null);
    const [isManageModalOpen, setIsManageModalOpen] = useState(false);
    const [isDeleteSessionModalOpen, setIsDeleteSessionModalOpen] = useState(false);
    const [isDeleteRecordModalOpen, setIsDeleteRecordModalOpen] = useState(false);
    const [recordToDelete, setRecordToDelete] = useState<AttendanceRecord | null>(null);
    const [loadingAction, setLoadingAction] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [selectedReportMonth, setSelectedReportMonth] = useState<{ month: number; year: number } | null>(null);
    const [manualAddOpsId, setManualAddOpsId] = useState('');
    const [manualAddStatus, setManualAddStatus] = useState<'Partial' | 'Buffer'>('Partial');
    const [manualAddError, setManualAddError] = useState<string | null>(null);

    const activeWorkers = workers.filter(w => w.status === 'Active').length;

    const calculateFulfillment = (startDay: number, endDay: number) => {
        const today = new Date();
        const relevantSessions = attendanceHistory.filter(session => {
            const sessionDate = new Date(session.date + 'T00:00:00Z');
            if (isNaN(sessionDate.getTime())) return false;
            return sessionDate.getUTCMonth() === today.getUTCMonth() &&
                   sessionDate.getUTCFullYear() === today.getUTCFullYear() &&
                   sessionDate.getUTCDate() >= startDay &&
                   sessionDate.getUTCDate() <= endDay;
        });

        if (relevantSessions.length === 0) return '0%';

        const totalPlanned = relevantSessions.reduce((sum, s) => sum + s.planMpp, 0);
        const totalActual = relevantSessions.reduce((sum, s) => sum + s.records.filter(r => !r.is_takeout).length, 0);

        if (totalPlanned === 0) return 'N/A';
        
        const percentage = (totalActual / totalPlanned) * 100;
        return `${percentage.toFixed(1)}%`;
    };

    const fulfillmentPeriod1 = calculateFulfillment(1, 15);
    const fulfillmentPeriod2 = calculateFulfillment(16, 31);
    
    const downloadReport = (format: 'xlsx' | 'pdf') => {
        const reportData = attendanceHistory.flatMap(session => 
            session.records.map(record => ({
                'Tanggal': session.date,
                'Shift Jam': session.shiftTime,
                'Shift ID': session.shiftId,
                'Ops ID': record.opsId,
                'Nama Lengkap': record.fullName,
                'Jam Masuk': new Date(record.timestamp).toLocaleTimeString('id-ID'),
                'Jam Pulang': record.checkout_timestamp ? new Date(record.checkout_timestamp).toLocaleTimeString('id-ID') : '-',
                'Total Jam Kerja': calculateWorkDuration(record.timestamp, record.checkout_timestamp),
                'Status': record.is_takeout ? 'Take Out' : record.manual_status || 'On Plan'
            }))
        );

        if (format === 'xlsx') {
            const worksheet = XLSX.utils.json_to_sheet(reportData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Report');
            XLSX.writeFile(workbook, 'Absensi_Report.xlsx');
        } else {
            const doc = new jsPDF();
            autoTable(doc, {
                head: [['Tanggal', 'Shift Jam', 'Shift ID', 'Ops ID', 'Nama Lengkap', 'Jam Masuk', 'Jam Pulang', 'Total Jam Kerja', 'Status']],
                body: reportData.map(Object.values),
            });
            doc.save('Absensi_Report.pdf');
        }
    };
    
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const currentYear = today.getUTCFullYear();
    const currentMonth = today.getUTCMonth();

    const startOfWeek = new Date(today);
    const day = startOfWeek.getUTCDay();
    const diff = startOfWeek.getUTCDate() - day + (day === 0 ? -6 : 1); 
    startOfWeek.setUTCDate(diff);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);

    const counts = { today: 0, thisWeek: 0, thisMonth: 0, period1: 0, period2: 0 };

    attendanceHistory.forEach(session => {
        const sessionDate = new Date(session.date + 'T00:00:00Z');
        if (isNaN(sessionDate.getTime())) return;

        const attendanceCount = session.records.filter(r => !r.is_takeout).length;

        if (sessionDate >= startOfWeek && sessionDate <= endOfWeek) {
            counts.thisWeek += attendanceCount;
        }

        if (sessionDate.getUTCFullYear() === currentYear && sessionDate.getUTCMonth() === currentMonth) {
            counts.thisMonth += attendanceCount;
            if (sessionDate.getTime() === today.getTime()) {
                counts.today += attendanceCount;
            }
            const dayOfMonth = sessionDate.getUTCDate();
            if (dayOfMonth >= 1 && dayOfMonth <= 15) {
                counts.period1 += attendanceCount;
            } else if (dayOfMonth >= 16) {
                counts.period2 += attendanceCount;
            }
        }
    });

    const formattedDate = new Intl.DateTimeFormat('id-ID', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    }).format(new Date());

    const openManageModal = (session: AttendanceSession) => {
        setSelectedSession(session);
        setManualAddError(null);
        setManualAddOpsId('');
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
        
        const { error } = await supabase
            .from('attendance_sessions')
            .delete()
            .match({ id: selectedSession.id });
        
        setLoadingAction(false);
        if (error) {
            alert(`Error deleting session: ${error.message}`);
        } else {
            setIsDeleteSessionModalOpen(false);
            setSelectedSession(null);
            refreshData();
        }
    };

    const handleConfirmDeleteRecord = async () => {
        if (!recordToDelete) return;
        setLoadingAction(true);
        const { error } = await supabase
            .from('attendance_records')
            .delete()
            .eq('id', recordToDelete.id);

        setLoadingAction(false);
        if (error) {
            alert(`Error removing record: ${error.message}`);
        } else {
            setIsDeleteRecordModalOpen(false);
            // Optimistically update UI to feel faster
            setSelectedSession(prev => prev ? { ...prev, records: prev.records.filter(r => r.id !== recordToDelete.id) } : null);
            setRecordToDelete(null);
            refreshData(); // Fetch fresh data in the background
        }
    };
    
    const handleAction = async (action: 'checkout' | 'takeout', recordId: number) => {
        setLoadingAction(true);
        
        const updateData = action === 'checkout'
            ? { checkout_timestamp: new Date().toISOString() }
            : { is_takeout: true };
            
        const { data, error } = await supabase
            .from('attendance_records')
            .update(updateData)
            .eq('id', recordId)
            .select()
            .single();
            
        setLoadingAction(false);
        if (error) {
            alert(`Error updating record: ${error.message}`);
        } else {
            // Optimistically update UI
            setSelectedSession(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    records: prev.records.map(r => r.id === recordId ? { ...r, ...data } : r)
                };
            });
            refreshData(); // Fetch fresh data in the background
        }
    };

    const handleCheckOutAll = async () => {
        if (!selectedSession) return;

        const now = new Date().getTime();
        const nineHoursInMillis = 9 * 60 * 60 * 1000;

        const recordsToCheckOut = selectedSession.records.filter(r => {
            const checkinTime = new Date(r.timestamp).getTime();
            return !r.checkout_timestamp && !r.is_takeout && (now - checkinTime) < nineHoursInMillis;
        });

        if (recordsToCheckOut.length === 0) {
            alert("All remaining workers have been auto-checked out or already checked out manually.");
            return;
        }
        
        const recordIdsToCheckOut = recordsToCheckOut.map(r => r.id);

        setLoadingAction(true);
        const { error } = await supabase
            .from('attendance_records')
            .update({ checkout_timestamp: new Date().toISOString() })
            .in('id', recordIdsToCheckOut)
            .is('checkout_timestamp', null);
        
        setLoadingAction(false);
        if (error) {
            alert(`Error checking out all: ${error.message}`);
        } else {
            refreshData();
            setIsManageModalOpen(false);
        }
    };
    
    const handleManualAdd = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedSession || !manualAddOpsId) return;

        setManualAddError(null);
        setLoadingAction(true);

        const worker = workers.find(w => w.opsId.toLowerCase() === manualAddOpsId.toLowerCase());
        if (!worker || !worker.id) {
            setManualAddError(`Worker with OpsID "${manualAddOpsId}" not found.`);
            setLoadingAction(false);
            return;
        }
        
        if (selectedSession.records.some(r => r.workerId === worker.id)) {
            setManualAddError(`Worker ${worker.fullName} is already in this session.`);
            setLoadingAction(false);
            return;
        }

        const { data, error } = await supabase.from('attendance_records').insert({
            session_id: selectedSession.id,
            worker_id: worker.id,
            timestamp: new Date(selectedSession.date + 'T' + selectedSession.shiftTime).toISOString(),
            manual_status: manualAddStatus,
            is_takeout: false
        }).select().single();
        
        setLoadingAction(false);
        if (error) {
            setManualAddError(`Error adding worker: ${error.message}`);
        } else {
            setManualAddOpsId('');
            // Optimistically update UI
            if (data) {
                const newRecord: AttendanceRecord = {
                    id: data.id,
                    workerId: worker.id,
                    opsId: worker.opsId,
                    fullName: worker.fullName,
                    timestamp: data.timestamp,
                    checkout_timestamp: data.checkout_timestamp,
                    manual_status: data.manual_status,
                    is_takeout: data.is_takeout,
                };
                setSelectedSession(prev => prev ? { ...prev, records: [...prev.records, newRecord] } : null);
            }
            refreshData();
        }
    };
    
    // --- New Report Logic ---
    const currentMonthReports = useMemo(() => {
        const year = new Date().getFullYear();
        const month = new Date().getMonth();
        const period1Start = new Date(Date.UTC(year, month, 1));
        const period1End = new Date(Date.UTC(year, month, 15, 23, 59, 59, 999));
        const period2Start = new Date(Date.UTC(year, month, 16));
        const period2End = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
        
        return {
            period1: generatePeriodicReport(attendanceHistory, workers, period1Start, period1End),
            period2: generatePeriodicReport(attendanceHistory, workers, period2Start, period2End)
        };
    }, [attendanceHistory, workers]);

    const modalReportData = useMemo(() => {
        if (!selectedReportMonth) return null;
        const { month, year } = selectedReportMonth;
        const modalPeriod1Start = new Date(Date.UTC(year, month, 1));
        const modalPeriod1End = new Date(Date.UTC(year, month, 15, 23, 59, 59, 999));
        const modalPeriod2Start = new Date(Date.UTC(year, month, 16));
        const modalPeriod2End = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

        return {
            period1: generatePeriodicReport(attendanceHistory, workers, modalPeriod1Start, modalPeriod1End),
            period2: generatePeriodicReport(attendanceHistory, workers, modalPeriod2Start, modalPeriod2End)
        };
    }, [selectedReportMonth, attendanceHistory, workers]);

    const handleOpenReportModal = (monthIndex: number) => {
        setSelectedReportMonth({ month: monthIndex, year: new Date().getFullYear() });
        setIsReportModalOpen(true);
    };

    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h1 className="text-4xl font-bold text-white">Dashboard</h1>
                <div className="flex gap-2">
                     <button onClick={() => downloadReport('xlsx')} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                        <DownloadIcon />
                        Download Excel
                    </button>
                    <button onClick={() => downloadReport('pdf')} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                        <DownloadIcon />
                        Download PDF
                    </button>
                </div>
            </div>

            <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 gap-2">
                    <h2 className="text-2xl font-semibold text-white">Ringkasan Kehadiran</h2>
                    <p className="text-md text-gray-400">{formattedDate}</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <SummaryItem label="Hari Ini" value={counts.today} />
                    <SummaryItem label="Minggu Ini" value={counts.thisWeek} />
                    <SummaryItem label="Bulan Ini" value={counts.thisMonth} />
                    <SummaryItem label="Periode 1-15" value={counts.period1} />
                    <SummaryItem label="Periode 16-31" value={counts.period2} />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard title="Daily Worker Active" value={activeWorkers} description="Total active workers" />
                <StatCard title="Fulfillment Periode 1-15" value={fulfillmentPeriod1} description="Based on current month" />
                <StatCard title="Fulfillment Periode 16-31" value={fulfillmentPeriod2} description="Based on current month" />
            </div>

             <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
                <h2 className="text-2xl font-semibold text-white mb-4">Attendance History</h2>
                <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-left">
                        <thead className="bg-gray-700 sticky top-0">
                            <tr>
                                <th className="p-3">Date</th>
                                <th className="p-3">Shift</th>
                                <th className="p-3">Plan MPP</th>
                                <th className="p-3">Actual</th>
                                <th className="p-3">Status</th>
                                <th className="p-3 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {attendanceHistory.length > 0 ? (
                                [...attendanceHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((session) => {
                                    const actual = session.records.filter(r => !r.is_takeout).length;
                                    const planned = session.planMpp;
                                    let status = 'GAP';
                                    if (actual === planned) status = 'FULL FILL';
                                    if (actual > planned) status = 'FULL FILL BUFFER';
                                    
                                    return (
                                        <tr key={session.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                                            <td className="p-3">{session.date}</td>
                                            <td className="p-3">{session.shiftTime} ({session.shiftId})</td>
                                            <td className="p-3">{planned}</td>
                                            <td className="p-3">{actual}</td>
                                            <td className={`p-3 font-semibold ${
                                                status === 'FULL FILL' ? 'text-green-400' :
                                                status === 'GAP' ? 'text-red-400' : 'text-yellow-400'
                                            }`}>{status}</td>
                                            <td className="p-3 flex justify-center items-center gap-3">
                                                <button onClick={() => openManageModal(session)} className="text-blue-400 hover:text-blue-300" aria-label="Manage Session"><ViewIcon /></button>
                                                <button onClick={() => openDeleteSessionModal(session)} className="text-red-400 hover:text-red-300" aria-label="Delete Session"><DeleteIcon /></button>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={6} className="text-center p-6 text-gray-500">No attendance history found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* New Report Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
                    <h2 className="text-2xl font-semibold text-white mb-4">Laporan Periode Bulan Ini</h2>
                    <div className="flex flex-col md:flex-row gap-6">
                       <ReportList title="Periode 1-15" data={currentMonthReports.period1} />
                       <ReportList title="Periode 16-31" data={currentMonthReports.period2} />
                    </div>
                </div>
                 <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
                    <h2 className="text-2xl font-semibold text-white mb-4">Arsip Laporan Bulanan</h2>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                        {months.map((month, index) => (
                             <button 
                                key={month}
                                onClick={() => handleOpenReportModal(index)}
                                className="bg-gray-700 hover:bg-teal-600 text-gray-300 hover:text-white font-semibold py-2 px-3 rounded-lg transition-colors text-sm"
                             >
                                {month}
                             </button>
                        ))}
                    </div>
                </div>
            </div>


            {/* Manage Attendance Modal */}
            <Modal isOpen={isManageModalOpen} onClose={() => setIsManageModalOpen(false)} title="Manage Attendance Session">
                {selectedSession && (
                    <>
                        <div className="max-h-[50vh] overflow-y-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-700 sticky top-0">
                                    <tr>
                                        <th className="p-2">OpsID</th>
                                        <th className="p-2">Nama Lengkap</th>
                                        <th className="p-2">Jam Masuk</th>
                                        <th className="p-2">Jam Pulang</th>
                                        <th className="p-2">Total Jam</th>
                                        <th className="p-2">Status</th>
                                        <th className="p-2 text-center">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedSession.records.map(record => {
                                        const now = new Date().getTime();
                                        const checkinTime = new Date(record.timestamp).getTime();
                                        const nineHoursInMillis = 9 * 60 * 60 * 1000;

                                        let effectiveCheckoutTimeStr: string | null = record.checkout_timestamp || null;
                                        let isAutoCheckout = false;

                                        if (!effectiveCheckoutTimeStr && (now - checkinTime) > nineHoursInMillis) {
                                            effectiveCheckoutTimeStr = new Date(checkinTime + nineHoursInMillis).toISOString();
                                            isAutoCheckout = true;
                                        }
                                        
                                        const isCheckedOut = !!record.checkout_timestamp || isAutoCheckout;
                                        
                                        let statusText = 'On Plan';
                                        let statusColor = 'text-green-400 bg-green-900/50';
                                        if(record.is_takeout) {
                                            statusText = 'Take Out';
                                            statusColor = 'text-gray-400 bg-gray-700/50';
                                        } else if (record.manual_status === 'Partial') {
                                            statusText = 'Partial';
                                            statusColor = 'text-orange-400 bg-orange-900/50';
                                        } else if (record.manual_status === 'Buffer') {
                                            statusText = 'Buffer';
                                            statusColor = 'text-yellow-400 bg-yellow-900/50';
                                        }

                                        return (
                                            <tr key={record.id} className={`border-b border-gray-700 ${record.is_takeout ? 'opacity-50' : ''}`}>
                                                <td className="p-2">{record.opsId}</td>
                                                <td className="p-2">{record.fullName}</td>
                                                <td className="p-2">{new Date(record.timestamp).toLocaleTimeString('id-ID')}</td>
                                                <td className="p-2">
                                                    {effectiveCheckoutTimeStr ? new Date(effectiveCheckoutTimeStr).toLocaleTimeString('id-ID') : '-'}
                                                    {isAutoCheckout && <span className="text-xs text-yellow-400 ml-1">(Auto)</span>}
                                                </td>
                                                <td className="p-2 font-mono">{calculateWorkDuration(record.timestamp, effectiveCheckoutTimeStr)}</td>
                                                <td className="p-2"><span className={`px-2 py-1 text-xs rounded-full font-semibold ${statusColor}`}>{statusText}</span></td>
                                                <td className="p-2 text-center">
                                                    <div className="flex justify-center items-center gap-2">
                                                        <button 
                                                            onClick={() => handleAction('takeout', record.id)}
                                                            disabled={loadingAction || record.is_takeout}
                                                            className="text-xs bg-gray-600 hover:bg-gray-500 text-white font-bold py-1 px-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            TakeOut
                                                        </button>
                                                        <button 
                                                            onClick={() => handleAction('checkout', record.id)}
                                                            disabled={loadingAction || isCheckedOut || record.is_takeout}
                                                            className="text-xs bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            CheckOut
                                                        </button>
                                                        <button
                                                            onClick={() => openDeleteRecordModal(record)}
                                                            disabled={loadingAction}
                                                            className="text-red-400 hover:text-red-300 disabled:opacity-50"
                                                            aria-label={`Remove ${record.fullName}`}
                                                        >
                                                            <DeleteIcon />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-700">
                            <form onSubmit={handleManualAdd} className="space-y-3">
                               <h4 className="text-lg font-semibold text-teal-400">Tambah Karyawan Manual</h4>
                               {manualAddError && <p className="text-red-400 bg-red-900/50 p-2 rounded-lg text-sm">{manualAddError}</p>}
                               <div className="flex gap-2">
                                   <input
                                      type="text"
                                      value={manualAddOpsId}
                                      onChange={(e) => setManualAddOpsId(e.target.value)}
                                      placeholder="OpsID Karyawan"
                                      className="flex-grow bg-gray-700 border border-gray-600 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                                      required
                                   />
                                   <select
                                      value={manualAddStatus}
                                      onChange={(e) => setManualAddStatus(e.target.value as 'Partial' | 'Buffer')}
                                      className="bg-gray-700 border border-gray-600 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                                   >
                                       <option value="Partial">Partial</option>
                                       <option value="Buffer">Buffer</option>
                                   </select>
                                   <button type="submit" disabled={loadingAction} className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50">
                                       {loadingAction ? '...' : 'Add'}
                                   </button>
                               </div>
                           </form>
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-700 flex justify-end">
                            <button
                                onClick={handleCheckOutAll}
                                disabled={loadingAction || !selectedSession.records.some(r => {
                                    const checkinTime = new Date(r.timestamp).getTime();
                                    return !r.checkout_timestamp && !r.is_takeout && (new Date().getTime() - checkinTime) < (9 * 60 * 60 * 1000);
                                })}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loadingAction ? 'Processing...' : 'Check Out All Remaining'}
                            </button>
                        </div>
                    </>
                )}
            </Modal>

            {/* Delete Session Confirmation Modal */}
            <Modal isOpen={isDeleteSessionModalOpen} onClose={() => setIsDeleteSessionModalOpen(false)} title="Confirm Session Deletion">
                {selectedSession && (
                    <div className="text-gray-300">
                        <p>Are you sure you want to delete the attendance session for <strong className="text-teal-400">{selectedSession.date} ({selectedSession.shiftTime})</strong>?</p>
                        <p className="text-sm text-red-400 mt-2">This will remove all {selectedSession.records.length} attendance records for this session. This action cannot be undone.</p>
                        <div className="flex justify-end gap-4 mt-6">
                            <button onClick={() => setIsDeleteSessionModalOpen(false)} className="py-2 px-4 bg-gray-600 hover:bg-gray-500 rounded-lg">Cancel</button>
                            <button onClick={handleDeleteSession} className="py-2 px-4 bg-red-600 hover:bg-red-500 rounded-lg" disabled={loadingAction}>
                                {loadingAction ? 'Deleting...' : 'Delete Session'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Delete Record Confirmation Modal */}
            <Modal isOpen={isDeleteRecordModalOpen} onClose={() => setIsDeleteRecordModalOpen(false)} title="Confirm Record Deletion">
                {recordToDelete && (
                    <div className="text-gray-300">
                        <p>Are you sure you want to delete the attendance record for <strong className="text-teal-400">{recordToDelete.fullName}</strong>?</p>
                        <p className="text-sm text-red-400 mt-2">This action is permanent and cannot be undone.</p>
                        <div className="flex justify-end gap-4 mt-6">
                            <button onClick={() => setIsDeleteRecordModalOpen(false)} className="py-2 px-4 bg-gray-600 hover:bg-gray-500 rounded-lg">Cancel</button>
                            <button onClick={handleConfirmDeleteRecord} className="py-2 px-4 bg-red-600 hover:bg-red-500 rounded-lg" disabled={loadingAction}>
                                {loadingAction ? 'Deleting...' : 'Delete Record'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
            
            {/* Monthly Report Modal */}
            <Modal 
                isOpen={isReportModalOpen} 
                onClose={() => setIsReportModalOpen(false)} 
                title={`Laporan Detail Bulan ${selectedReportMonth ? months[selectedReportMonth.month] : ''}`}
            >
                {modalReportData && (
                    <div className="flex flex-col md:flex-row gap-6">
                        <ReportList title="Periode 1-15" data={modalReportData.period1} />
                        <ReportList title="Periode 16-31" data={modalReportData.period2} />
                    </div>
                )}
            </Modal>

        </div>
    );
};

export default Dashboard;