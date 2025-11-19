
import React, { useState, useMemo, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Worker, AttendanceSession, AttendanceRecord } from '../types';
import DownloadIcon from '../components/icons/DownloadIcon';
import Modal from '../components/Modal';
import ViewIcon from '../components/icons/ViewIcon';
import DeleteIcon from '../components/icons/DeleteIcon';
import { supabase } from '../lib/supabaseClient';
import CopyIcon from '../components/icons/CopyIcon';


interface DashboardProps {
    workers: Worker[];
    attendanceHistory: AttendanceSession[];
    refreshData: () => void;
    setAttendanceHistory: React.Dispatch<React.SetStateAction<AttendanceSession[]>>;
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
  const workerDetails: { [workerId: string]: { opsId: string; fullName: string } } = {};

  const relevantSessions = sessions.filter(session => {
    // Use local time for comparison by avoiding 'Z'
    const sessionDate = new Date(session.date + 'T00:00:00');
    return sessionDate >= startDate && sessionDate <= endDate;
  });

  for (const session of relevantSessions) {
    const uniqueWorkerIdsThisDay = new Set<string>();
    for (const record of session.records) {
      if (!record.is_takeout) {
        uniqueWorkerIdsThisDay.add(record.workerId);
        
        // Prioritize details from the record itself. 
        // This fixes issues where a worker might be missing from the 'workers' array 
        // but exists in the history logs (e.g., deleted workers or ID mismatches).
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
    // 1. Try to get details from the attendance records first (most accurate for history)
    let opsId = workerDetails[workerId]?.opsId;
    let fullName = workerDetails[workerId]?.fullName;

    // 2. Fallback: Try to look up in the current workers list if record details are missing/unknown
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
        <h4 className="text-md font-semibold text-gray-700 mb-2 border-b border-gray-200 pb-2">{title}</h4>
        <div className="max-h-64 overflow-y-auto pr-2">
            {data.length > 0 ? (
                <ul className="space-y-2">
                    {data.map(item => (
                        <li key={item.workerId} 
                            className="flex justify-between items-center text-sm bg-gray-50 p-2 rounded-md border border-gray-200 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors"
                            onClick={() => onWorkerClick(item.workerId, item.fullName)}
                        >
                            <div>
                                <p className="font-semibold text-gray-800">{item.fullName}</p>
                                <p className="text-xs text-gray-500">{item.opsId}</p>
                            </div>
                            <span className="font-bold text-lg text-blue-600">{item.attendanceCount} HK</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-gray-500 text-center pt-8">No data for this period.</p>
            )}
        </div>
    </div>
);

const StatCard: React.FC<{ title: string; value: string | number; description: string; borderColor: string }> = ({ title, value, description, borderColor }) => (
    <div className={`bg-white p-6 rounded-lg shadow-lg border border-gray-200 transition-all duration-300 hover:shadow-xl hover:border-blue-400 border-t-4 ${borderColor}`}>
        <h3 className="text-sm font-medium text-gray-500">{title}</h3>
        <p className="text-3xl font-bold text-blue-600 my-2">{value}</p>
        <p className="text-xs text-gray-400">{description}</p>
    </div>
);

const SummaryItem: React.FC<{ label: string; value: number; bgColor: string; textColor: string }> = ({ label, value, bgColor, textColor }) => (
    <div className={`text-center p-4 rounded-lg ${bgColor}`}>
        <p className={`text-xs uppercase font-semibold ${textColor} opacity-75`}>{label}</p>
        <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
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

const Dashboard: React.FC<DashboardProps> = ({ workers, attendanceHistory, refreshData, setAttendanceHistory }) => {
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
    const [detailReportData, setDetailReportData] = useState<{ workerName: string; period: string; dates: { date: string; shiftTime: string }[], total: number } | null>(null);

    useEffect(() => {
        if (selectedSession?.id) {
            const updatedSession = attendanceHistory.find(s => s.id === selectedSession.id);
            if (updatedSession) {
                setSelectedSession(updatedSession);
            } else {
                // Session was deleted, so close the modal.
                setIsManageModalOpen(false);
            }
        }
    }, [attendanceHistory, selectedSession?.id]);

    const activeWorkers = workers.filter(w => w.status === 'Active').length;

    const calculateFulfillment = (startDay: number, endDay: number) => {
        const today = new Date();
        const relevantSessions = attendanceHistory.filter(session => {
            // Use local time parsing
            const sessionDate = new Date(session.date + 'T00:00:00');
            if (isNaN(sessionDate.getTime())) return false;
            return sessionDate.getMonth() === today.getMonth() &&
                   sessionDate.getFullYear() === today.getFullYear() &&
                   sessionDate.getDate() >= startDay &&
                   sessionDate.getDate() <= endDay;
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
                'Divisi': session.division,
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
                head: [['Tanggal', 'Divisi', 'Shift Jam', 'Shift ID', 'Ops ID', 'Nama Lengkap', 'Jam Masuk', 'Jam Pulang', 'Total Jam Kerja', 'Status']],
                body: reportData.map(Object.values),
            });
            doc.save('Absensi_Report.pdf');
        }
    };
    
    const summaryCounts = useMemo(() => {
        const today_local = new Date();
        
        // Fix for timezone issue: create YYYY-MM-DD string from local date components
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

        const counts = { today: 0, thisWeek: 0, thisMonth: 0, period1: 0, period2: 0 };

        attendanceHistory.forEach(session => {
            const sessionDate = new Date(session.date + 'T00:00:00'); 
            if (isNaN(sessionDate.getTime())) return;
            
            const attendanceCount = session.records.filter(r => !r.is_takeout).length;

            if (session.date === todayString) {
                counts.today += attendanceCount;
            }

            if (sessionDate >= startOfWeek && sessionDate <= endOfWeek) {
                counts.thisWeek += attendanceCount;
            }

            if (sessionDate.getFullYear() === currentYear && sessionDate.getMonth() === currentMonth) {
                counts.thisMonth += attendanceCount;
                const dayOfMonth = sessionDate.getDate();
                if (dayOfMonth <= 15) {
                    counts.period1 += attendanceCount;
                } else {
                    counts.period2 += attendanceCount;
                }
            }
        });
        return counts;
    }, [attendanceHistory]);


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
        if (error) {
            alert(`Error removing record: ${error.message}`);
        } else {
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
        
        const { data: updatedRecord, error } = await supabase
            .from('attendance_records')
            .update(updateData)
            .eq('id', recordId)
            .select()
            .single();

        setLoadingAction(false);
        if (error) {
            alert(`Error updating record: ${error.message}`);
        } else if (updatedRecord && selectedSession) {
             const updatedFields = {
                checkout_timestamp: updatedRecord.checkout_timestamp,
                is_takeout: updatedRecord.is_takeout,
            };
            setAttendanceHistory(prevHistory =>
                prevHistory.map(session =>
                    session.id === selectedSession.id
                        ? { ...session, records: session.records.map(r => r.id === recordId ? { ...r, ...updatedFields } : r) }
                        : session
                )
            );
        }
    };

    const handleCheckOutAll = async () => {
        if (!selectedSession) return;
        const now = new Date().getTime();
        const nineHoursInMillis = 9 * 60 * 60 * 1000;
        const recordsToCheckOut = selectedSession.records.filter(r => !r.checkout_timestamp && !r.is_takeout && (now - new Date(r.timestamp).getTime()) < nineHoursInMillis);
        if (recordsToCheckOut.length === 0) {
            alert("All remaining workers have been auto-checked out or already checked out manually.");
            return;
        }
        const recordIdsToCheckOut = recordsToCheckOut.map(r => r.id);
        setLoadingAction(true);
        const { error } = await supabase.from('attendance_records').update({ checkout_timestamp: new Date().toISOString() }).in('id', recordIdsToCheckOut).is('checkout_timestamp', null);
        setLoadingAction(false);
        if (error) alert(`Error checking out all: ${error.message}`);
        else {
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

        const { data: newRecords, error } = await supabase.from('attendance_records').insert({
            session_id: selectedSession.id,
            worker_id: worker.id,
            timestamp: new Date(selectedSession.date + 'T' + selectedSession.shiftTime.split(' - ')[0]).toISOString(),
            manual_status: manualAddStatus === 'On Plan' ? null : manualAddStatus,
        }).select();

        setLoadingAction(false);

        if (error) {
            setManualAddError(`Error adding worker: ${error.message}`);
        } else if (newRecords && newRecords.length > 0) {
            const newDbRecord = newRecords[0];
            const newAttendanceRecord: AttendanceRecord = {
                id: newDbRecord.id,
                workerId: worker.id,
                opsId: worker.opsId,
                fullName: worker.fullName,
                timestamp: newDbRecord.timestamp,
                checkout_timestamp: newDbRecord.checkout_timestamp,
                manual_status: newDbRecord.manual_status,
                is_takeout: newDbRecord.is_takeout,
            };

            setAttendanceHistory(prevHistory =>
                prevHistory.map(session =>
                    session.id === selectedSession.id
                        ? { ...session, records: [...session.records, newAttendanceRecord] }
                        : session
                )
            );
            setManualAddOpsId('');
        }
    };
    
    const currentMonthReports = useMemo(() => {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        const period1Start = new Date(year, month, 1);
        const period1End = new Date(year, month, 15, 23, 59, 59, 999);
        const period2Start = new Date(year, month, 16);
        const period2End = new Date(year, month + 1, 0, 23, 59, 59, 999);
        return {
            period1: generatePeriodicReport(attendanceHistory, workers, period1Start, period1End),
            period2: generatePeriodicReport(attendanceHistory, workers, period2Start, period2End)
        };
    }, [attendanceHistory, workers]);

    const modalReportData = useMemo(() => {
        if (!selectedReportMonth) return null;
        const { month, year } = selectedReportMonth;
        const modalPeriod1Start = new Date(year, month, 1);
        const modalPeriod1End = new Date(year, month, 15, 23, 59, 59, 999);
        const modalPeriod2Start = new Date(year, month, 16);
        const modalPeriod2End = new Date(year, month + 1, 0, 23, 59, 59, 999);
        return {
            period1: generatePeriodicReport(attendanceHistory, workers, modalPeriod1Start, modalPeriod1End),
            period2: generatePeriodicReport(attendanceHistory, workers, modalPeriod2Start, modalPeriod2End)
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
            .filter(session => session.records.some(record => record.workerId === workerId && !record.is_takeout))
            .map(session => ({
                date: session.date,
                shiftTime: session.shiftTime
            }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        const uniqueDetails = Array.from(new Map(attendanceDetails.map(item => [`${item.date}-${item.shiftTime}`, item])).values());

        setDetailReportData({
            workerName,
            period,
            dates: uniqueDetails,
            total: uniqueDetails.length
        });
        setIsDetailReportModalOpen(true);
    };

    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const handleCopyOpsIds = () => {
      if (!selectedSession) return;
      const opsIdsToCopy = selectedSession.records
          .filter(record => !record.is_takeout)
          .map(record => record.opsId)
          .join('\n');
      
      if (opsIdsToCopy) {
          navigator.clipboard.writeText(opsIdsToCopy).then(() => {
              alert(`${opsIdsToCopy.split('\n').length} OpsIDs copied to clipboard!`);
          }, (err) => {
              alert('Failed to copy OpsIDs.');
              console.error('Copy failed', err);
          });
      } else {
          alert('No OpsIDs to copy in this session.');
      }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
                <div className="flex flex-wrap gap-2">
                     <button onClick={() => downloadReport('xlsx')} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md">
                        <DownloadIcon /> Excel
                    </button>
                    <button onClick={() => downloadReport('pdf')} className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md">
                        <DownloadIcon /> PDF
                    </button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-lg border border-blue-800 border-t-4 border-blue-500 transition-shadow duration-300 hover:shadow-xl">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 gap-2">
                    <h2 className="text-lg font-semibold text-blue-800">Ringkasan Kehadiran</h2>
                    <p className="text-sm text-gray-500">{formattedDate}</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <SummaryItem label="Hari Ini" value={summaryCounts.today} bgColor="bg-blue-200" textColor="text-blue-800" />
                    <SummaryItem label="Minggu Ini" value={summaryCounts.thisWeek} bgColor="bg-green-200" textColor="text-green-800" />
                    <SummaryItem label="Bulan Ini" value={summaryCounts.thisMonth} bgColor="bg-indigo-200" textColor="text-indigo-800" />
                    <SummaryItem label="Periode 1-15" value={summaryCounts.period1} bgColor="bg-yellow-200" textColor="text-yellow-800" />
                    <SummaryItem label="Periode 16-31" value={summaryCounts.period2} bgColor="bg-purple-200" textColor="text-purple-800" />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard title="Daily Worker Active" value={activeWorkers} description="Total active workers" borderColor="border-red-500" />
                <StatCard title="Fulfillment Periode 1-15" value={fulfillmentPeriod1} description="Based on current month" borderColor="border-green-500" />
                <StatCard title="Fulfillment Periode 16-31" value={fulfillmentPeriod2} description="Based on current month" borderColor="border-yellow-500" />
            </div>

             <div className="bg-white rounded-lg shadow-lg border border-gray-200 border-t-4 border-indigo-500 transition-shadow duration-300 hover:shadow-xl">
                 <div className="p-4 sm:p-6">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4">Attendance History</h2>
                 </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-blue-600 text-white">
                            <tr>
                                <th className="p-3 font-semibold rounded-tl-lg">Date</th>
                                <th className="p-3 font-semibold">Divisi</th>
                                <th className="p-3 font-semibold">Shift</th>
                                <th className="p-3 font-semibold">Plan</th>
                                <th className="p-3 font-semibold">Actual</th>
                                <th className="p-3 font-semibold">Status</th>
                                <th className="p-3 font-semibold text-center rounded-tr-lg">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {attendanceHistory.length > 0 ? (
                                [...attendanceHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((session) => {
                                    const actual = session.records.filter(r => !r.is_takeout).length;
                                    const planned = session.planMpp;
                                    let status = 'GAP';
                                    if (actual === planned) status = 'FULL FILL';
                                    if (actual > planned) status = 'FULL FILL BUFFER';
                                    
                                    return (
                                        <tr key={session.id} className="hover:bg-gray-50">
                                            <td className="p-3">{session.date}</td>
                                            <td className="p-3">{session.division}</td>
                                            <td className="p-3">{session.shiftTime}</td>
                                            <td className="p-3">{planned}</td>
                                            <td className="p-3">{actual}</td>
                                            <td className={`p-3 font-semibold ${
                                                status === 'FULL FILL' ? 'text-green-600' :
                                                status === 'GAP' ? 'text-red-600' : 'text-yellow-600'
                                            }`}>{status}</td>
                                            <td className="p-3">
                                                <div className="flex justify-center items-center gap-3">
                                                    <button onClick={() => openManageModal(session)} className="text-blue-500 hover:text-blue-700" aria-label="Manage Session"><ViewIcon /></button>
                                                    <button onClick={() => openDeleteSessionModal(session)} className="text-red-500 hover:text-red-700" aria-label="Delete Session"><DeleteIcon /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={7} className="text-center p-6 text-gray-500">No attendance history found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 border-t-4 border-purple-500 transition-shadow duration-300 hover:shadow-xl">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4">Laporan Periode Bulan Ini</h2>
                    <div className="flex flex-col md:flex-row gap-6">
                       <ReportList title="Periode 1-15" data={currentMonthReports.period1} onWorkerClick={(workerId, workerName) => handleWorkerClickInReport(workerId, workerName, `Periode 1-15 ${months[new Date().getMonth()]}`, new Date(new Date().getFullYear(), new Date().getMonth(), 1), new Date(new Date().getFullYear(), new Date().getMonth(), 15, 23, 59, 59, 999))} />
                       <ReportList title="Periode 16-31" data={currentMonthReports.period2} onWorkerClick={(workerId, workerName) => handleWorkerClickInReport(workerId, workerName, `Periode 16-31 ${months[new Date().getMonth()]}`, new Date(new Date().getFullYear(), new Date().getMonth(), 16), new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999))} />
                    </div>
                </div>
                 <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 border-t-4 border-pink-500 transition-shadow duration-300 hover:shadow-xl">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4">Arsip Laporan Bulanan</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {months.map((month, index) => (
                             <button 
                                key={month}
                                onClick={() => handleOpenReportModal(index)}
                                className="bg-gray-100 hover:bg-blue-600 text-gray-700 hover:text-white font-medium py-2 px-3 rounded-lg transition-all duration-200 text-sm border border-gray-200 hover:border-blue-600"
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
                        <div className="overflow-x-auto border rounded-lg">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-blue-600 text-white">
                                    <tr>
                                        <th className="p-2 font-semibold rounded-tl-lg">OpsID</th>
                                        <th className="p-2 font-semibold">Nama Lengkap</th>
                                        <th className="p-2 font-semibold">Jam Masuk</th>
                                        <th className="p-2 font-semibold">Jam Pulang</th>
                                        <th className="p-2 font-semibold">Total Jam</th>
                                        <th className="p-2 font-semibold">Status</th>
                                        <th className="p-2 font-semibold text-center rounded-tr-lg">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
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
                                        let statusColor = 'bg-green-100 text-green-800';
                                        if(record.is_takeout) {
                                            statusText = 'Take Out';
                                            statusColor = 'bg-gray-200 text-gray-600';
                                        } else if (record.manual_status === 'Partial') {
                                            statusText = 'Partial';
                                            statusColor = 'bg-orange-100 text-orange-800';
                                        } else if (record.manual_status === 'Buffer') {
                                            statusText = 'Buffer';
                                            statusColor = 'bg-yellow-100 text-yellow-800';
                                        }

                                        return (
                                            <tr key={record.id} className={`hover:bg-gray-50 ${record.is_takeout ? 'opacity-60 bg-gray-100' : ''}`}>
                                                <td className="p-2">{record.opsId}</td>
                                                <td className="p-2">{record.fullName}</td>
                                                <td className="p-2">{new Date(record.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</td>
                                                <td className="p-2">
                                                    {effectiveCheckoutTimeStr ? new Date(effectiveCheckoutTimeStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                                                    {isAutoCheckout && <span className="text-xs text-yellow-600 ml-1">(Auto)</span>}
                                                </td>
                                                <td className="p-2 font-mono">{calculateWorkDuration(record.timestamp, effectiveCheckoutTimeStr)}</td>
                                                <td className="p-2"><span className={`px-2 py-1 text-xs rounded-full font-semibold ${statusColor}`}>{statusText}</span></td>
                                                <td className="p-2">
                                                    <div className="flex justify-center items-center gap-2">
                                                        <button onClick={() => handleAction('takeout', record.id)} disabled={loadingAction || record.is_takeout} className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-1 px-2 rounded disabled:opacity-50 disabled:cursor-not-allowed">TakeOut</button>
                                                        <button onClick={() => handleAction('checkout', record.id)} disabled={loadingAction || isCheckedOut || record.is_takeout} className="text-xs bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-2 rounded disabled:opacity-50 disabled:cursor-not-allowed">CheckOut</button>
                                                        <button onClick={() => openDeleteRecordModal(record)} disabled={loadingAction} className="text-red-500 hover:text-red-700 disabled:opacity-50 p-1" aria-label={`Remove ${record.fullName}`}><DeleteIcon /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-200">
                            <form onSubmit={handleManualAdd} className="space-y-3">
                               <h4 className="text-md font-semibold text-gray-700">Tambah Karyawan Manual</h4>
                               {manualAddError && <p className="text-red-600 bg-red-50 p-2 rounded-lg text-sm">{manualAddError}</p>}
                               <div className="flex flex-col sm:flex-row gap-2">
                                   <input type="text" value={manualAddOpsId} onChange={(e) => setManualAddOpsId(e.target.value)} placeholder="OpsID Karyawan" className="flex-grow bg-gray-50 border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                                   <select value={manualAddStatus} onChange={(e) => setManualAddStatus(e.target.value as 'Partial' | 'Buffer' | 'On Plan')} className="bg-gray-50 border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                       <option value="On Plan">On Plan</option>
                                       <option value="Partial">Partial</option>
                                       <option value="Buffer">Buffer</option>
                                   </select>
                                   <button type="submit" disabled={loadingAction} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50">
                                       {loadingAction ? '...' : 'Add'}
                                   </button>
                               </div>
                           </form>
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
                            <button onClick={handleCopyOpsIds} className="flex items-center gap-2 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors shadow-sm hover:shadow-md">
                                <CopyIcon /> Salin OpsID
                            </button>
                            <button onClick={handleCheckOutAll} disabled={loadingAction || !selectedSession.records.some(r => !r.checkout_timestamp && !r.is_takeout && (new Date().getTime() - new Date(r.timestamp).getTime()) < (9 * 60 * 60 * 1000))} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                {loadingAction ? 'Processing...' : 'Check Out All Remaining'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal isOpen={isDeleteSessionModalOpen} onClose={() => setIsDeleteSessionModalOpen(false)} title="Confirm Session Deletion">
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

            <Modal isOpen={isDeleteRecordModalOpen} onClose={() => setIsDeleteRecordModalOpen(false)} title="Confirm Record Deletion">
                {recordToDelete && (
                    <div>
                        <p className="text-gray-600">Are you sure you want to delete the attendance record for <strong className="text-blue-600">{recordToDelete.fullName}</strong>?</p>
                        <p className="text-sm text-red-600 mt-2">This action is permanent and cannot be undone.</p>
                        <div className="flex justify-end gap-4 mt-6">
                            <button onClick={() => setIsDeleteRecordModalOpen(false)} className="py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold">Cancel</button>
                            <button onClick={handleConfirmDeleteRecord} className="py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold" disabled={loadingAction}>
                                {loadingAction ? 'Deleting...' : 'Delete Record'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
            
            <Modal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} title={`Laporan Detail Bulan ${selectedReportMonth ? months[selectedReportMonth.month] : ''}`}>
                {modalReportData && selectedReportMonth && (
                    <div className="flex flex-col md:flex-row gap-6">
                        <ReportList title="Periode 1-15" data={modalReportData.period1} onWorkerClick={(workerId, workerName) => handleWorkerClickInReport(workerId, workerName, `Periode 1-15 ${months[selectedReportMonth.month]}`, new Date(selectedReportMonth.year, selectedReportMonth.month, 1), new Date(selectedReportMonth.year, selectedReportMonth.month, 15, 23, 59, 59, 999))} />
                        <ReportList title="Periode 16-31" data={modalReportData.period2} onWorkerClick={(workerId, workerName) => handleWorkerClickInReport(workerId, workerName, `Periode 16-31 ${months[selectedReportMonth.month]}`, new Date(selectedReportMonth.year, selectedReportMonth.month, 16), new Date(selectedReportMonth.year, selectedReportMonth.month + 1, 0, 23, 59, 59, 999))} />
                    </div>
                )}
            </Modal>
            
            <Modal isOpen={isDetailReportModalOpen} onClose={() => setIsDetailReportModalOpen(false)} title={`Detail Kehadiran: ${detailReportData?.workerName}`}>
                {detailReportData && (
                    <div className="space-y-4">
                        <p className="font-semibold text-gray-700">{detailReportData.period}</p>
                        <div className="max-h-60 overflow-y-auto border rounded-lg">
                             <ul className="divide-y divide-gray-200">
                                {detailReportData.dates.length > 0 ? (
                                    detailReportData.dates.map((item, index) => (
                                        <li key={index} className="p-3 flex justify-between items-center">
                                            <span>
                                                {new Intl.DateTimeFormat('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(item.date + 'T00:00:00'))}
                                            </span>
                                            <span className="text-sm font-semibold text-blue-600 bg-blue-100 px-2 py-1 rounded-md">
                                                {item.shiftTime}
                                            </span>
                                        </li>
                                    ))
                                ) : (
                                    <li className="p-3 text-gray-500">Tidak ada catatan kehadiran pada periode ini.</li>
                                )}
                             </ul>
                        </div>
                        <p className="font-bold text-right pt-2 border-t">Total Kehadiran: {detailReportData.total} Hari Kerja</p>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Dashboard;
