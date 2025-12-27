
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
import { useToast } from '../hooks/useToast';


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

// Interface for Summary Stats
interface SummaryStats {
    plan: number;
    actual: number;
    gap: number;
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
      // LOGIC UPDATE: Only count if NOT takeout AND IS arrived (Physical Presence)
      if (!record.is_takeout && record.is_arrived) {
        uniqueWorkerIdsThisDay.add(record.workerId);
        
        // Prioritize details from the record itself. 
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
                                <p className="text-xs text-black font-mono">{item.opsId}</p>
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

const SummaryItem: React.FC<{ label: string; stats: SummaryStats; bgColor: string; textColor: string }> = ({ label, stats, bgColor, textColor }) => (
    <div className={`text-center p-3 rounded-lg ${bgColor} flex flex-col justify-between h-full`}>
        <p className={`text-[10px] md:text-xs uppercase font-extrabold ${textColor} opacity-80 mb-2 tracking-wide`}>{label}</p>
        <div className="space-y-1">
            <div className="flex justify-between items-center border-b border-black/10 pb-1">
                <span className="text-[10px] font-medium opacity-70">Plan</span>
                <span className={`text-sm font-bold ${textColor}`}>{stats.plan}</span>
            </div>
             <div className="flex justify-between items-center border-b border-black/10 pb-1">
                <span className="text-[10px] font-medium opacity-70">Actual</span>
                <span className={`text-xl font-bold ${textColor}`}>{stats.actual}</span>
            </div>
             <div className="flex justify-between items-center pt-1">
                <span className="text-[10px] font-medium opacity-70">Gap</span>
                <span className={`text-sm font-bold ${stats.gap >= 0 ? 'text-green-700' : 'text-red-600'}`}>
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

const Dashboard: React.FC<DashboardProps> = ({ workers, attendanceHistory, refreshData, setAttendanceHistory, autoOpenSessionId, clearAutoOpenSessionId }) => {
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
    const [detailReportData, setDetailReportData] = useState<{ workerName: string; opsId: string; period: string; dates: { date: string; shiftTime: string; division: string }[], total: number } | null>(null);
    const [isEditingSession, setIsEditingSession] = useState(false);
    const [isCopyDropdownOpen, setIsCopyDropdownOpen] = useState(false);
    const [copyFeedback, setCopyFeedback] = useState<'ops' | 'excel' | null>(null);
    const [isQrModalOpen, setIsQrModalOpen] = useState(false);
    const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
    const [qrWorkerData, setQrWorkerData] = useState<{ fullName: string; opsId: string; department: string } | null>(null);
    const { showToast } = useToast();
    
    const [manualAddSuggestions, setManualAddSuggestions] = useState<Worker[]>([]);
    const manualAddSearchRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Dynamic Options
    const [shiftIdOpts, setShiftIdOpts] = useState<string[]>(defaultShiftIds);
    const [divisionOpts, setDivisionOpts] = useState<string[]>(defaultDivisions);
    const [shiftTimeOpts, setShiftTimeOpts] = useState<string[]>(defaultShiftTimes);

    const openManageModal = useCallback((session: AttendanceSession) => {
        setSelectedSession(session);
        setManualAddError(null);
        setManualAddOpsId('');
        setIsEditingSession(false);
        setIsCopyDropdownOpen(false);
        setIsManageModalOpen(true);
    }, []);

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

    // Auto-open modal logic based on prop
    useEffect(() => {
        if (autoOpenSessionId && attendanceHistory.length > 0) {
            const session = attendanceHistory.find(s => s.id === autoOpenSessionId);
            if (session) {
                openManageModal(session);
                // Reset the ID after opening the modal to prevent re-opening on data refresh
                clearAutoOpenSessionId();
            }
        }
    }, [autoOpenSessionId, attendanceHistory, openManageModal, clearAutoOpenSessionId]);

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

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsCopyDropdownOpen(false);
            }
            if (manualAddSearchRef.current && !manualAddSearchRef.current.contains(event.target as Node)) {
                setManualAddSuggestions([]);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

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
        // LOGIC UPDATE: Calculate Actual based on is_arrived check
        const totalActual = relevantSessions.reduce((sum, s) => sum + s.records.filter(r => !r.is_takeout && r.is_arrived).length, 0);
        if (totalPlanned === 0) return 'N/A';
        const percentage = (totalActual / totalPlanned) * 100;
        return `${percentage.toFixed(1)}%`;
    };

    const fulfillmentPeriod1 = calculateFulfillment(1, 15);
    const fulfillmentPeriod2 = calculateFulfillment(16, 31);
    
    // Filter attendance history to only show current month
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
                'Jam Masuk (Shift)': new Date(record.timestamp).toLocaleTimeString('id-ID'),
                'Jam Scan (Aktual)': record.scan_timestamp ? new Date(record.scan_timestamp).toLocaleTimeString('id-ID') : '-',
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
                head: [['Tanggal', 'Divisi', 'Shift Jam', 'Shift ID', 'Ops ID', 'Nama Lengkap', 'Jam Masuk (Shift)', 'Jam Scan (Aktual)', 'Jam Pulang', 'Total Jam Kerja', 'Status']],
                body: reportData.map(Object.values),
            });
            doc.save('Absensi_Report_Bulan_Ini.pdf');
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

        // Initial Stats Structure
        const counts: { 
            today: SummaryStats, 
            thisWeek: SummaryStats, 
            thisMonth: SummaryStats, 
            period1: SummaryStats, 
            period2: SummaryStats 
        } = { 
            today: { plan: 0, actual: 0, gap: 0 }, 
            thisWeek: { plan: 0, actual: 0, gap: 0 }, 
            thisMonth: { plan: 0, actual: 0, gap: 0 }, 
            period1: { plan: 0, actual: 0, gap: 0 }, 
            period2: { plan: 0, actual: 0, gap: 0 } 
        };

        const addToStats = (key: keyof typeof counts, planned: number, actual: number) => {
            counts[key].plan += planned;
            counts[key].actual += actual;
        };

        attendanceHistory.forEach(session => {
            const sessionDate = new Date(session.date + 'T00:00:00'); 
            if (isNaN(sessionDate.getTime())) return;
            
            const planned = session.planMpp || 0;
            // LOGIC UPDATE: Actual only counts physical presence (is_arrived)
            const actual = session.records.filter(r => !r.is_takeout && r.is_arrived).length;

            if (session.date === todayString) {
                addToStats('today', planned, actual);
            }

            if (sessionDate >= startOfWeek && sessionDate <= endOfWeek) {
                 addToStats('thisWeek', planned, actual);
            }

            if (sessionDate.getFullYear() === currentYear && sessionDate.getMonth() === currentMonth) {
                 addToStats('thisMonth', planned, actual);
                const dayOfMonth = sessionDate.getDate();
                if (dayOfMonth <= 15) {
                     addToStats('period1', planned, actual);
                } else {
                     addToStats('period2', planned, actual);
                }
            }
        });

        // Calculate Gap Final (Actual - Plan)
        Object.keys(counts).forEach(k => {
            const key = k as keyof typeof counts;
            counts[key].gap = counts[key].actual - counts[key].plan;
        });

        return counts;
    }, [attendanceHistory]);


    const formattedDate = new Intl.DateTimeFormat('id-ID', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    }).format(new Date());

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
        if (error) {
            showToast(`Error: ${error.message}`, { type: 'error', title: 'Gagal Hapus Sesi' });
        } else {
            setIsDeleteSessionModalOpen(false);
            setSelectedSession(null);
            showToast('Sesi absensi berhasil dihapus.', { type: 'success', title: 'Berhasil' });
            refreshData();
        }
    };

    const handleConfirmDeleteRecord = async () => {
        if (!recordToDelete || !selectedSession) return;
        setLoadingAction(true);
        const { error } = await supabase.from('attendance_records').delete().eq('id', recordToDelete.id);
        setLoadingAction(false);
        if (error) {
            showToast(`Error: ${error.message}`, { type: 'error', title: 'Gagal Hapus Data' });
        } else {
            showToast(`Data absensi untuk ${recordToDelete.fullName} telah dihapus.`, { type: 'success', title: 'Berhasil' });
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
            showToast(`Error: ${error.message}`, { type: 'error', title: 'Gagal Update' });
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

    // Toggle Arrival Status (Hadir vs Sedang di jalan)
    const handleToggleArrival = async (recordId: number, currentStatus: boolean) => {
        const newStatus = !currentStatus;
        // Optimistic Update
        if (selectedSession) {
            setAttendanceHistory(prevHistory =>
                prevHistory.map(session =>
                    session.id === selectedSession.id
                        ? { ...session, records: session.records.map(r => r.id === recordId ? { ...r, is_arrived: newStatus } : r) }
                        : session
                )
            );
        }

        const { error } = await supabase
            .from('attendance_records')
            .update({ is_arrived: newStatus })
            .eq('id', recordId);

        if (error) {
            showToast('Gagal update status: ' + error.message, { type: 'error', title: 'Error' });
            refreshData(); // Revert on error
        }
    };

    const handleCheckOutAll = async () => {
        if (!selectedSession) return;
        const now = new Date().getTime();
        const nineHoursInMillis = 9 * 60 * 60 * 1000;
        const recordsToCheckOut = selectedSession.records.filter(r => !r.checkout_timestamp && !r.is_takeout && (now - new Date(r.timestamp).getTime()) < nineHoursInMillis);
        if (recordsToCheckOut.length === 0) {
            showToast("Semua karyawan yang tersisa sudah checkout.", { type: 'info', title: 'Informasi' });
            return;
        }
        const recordIdsToCheckOut = recordsToCheckOut.map(r => r.id);
        setLoadingAction(true);
        const { error } = await supabase.from('attendance_records').update({ checkout_timestamp: new Date().toISOString() }).in('id', recordIdsToCheckOut).is('checkout_timestamp', null);
        setLoadingAction(false);
        if (error) {
            showToast(`Error: ${error.message}`, { type: 'error', title: 'Gagal Checkout' });
        } else {
            showToast(`${recordIdsToCheckOut.length} karyawan berhasil di-checkout.`, { type: 'success', title: 'Berhasil' });
            refreshData();
            setIsManageModalOpen(false);
        }
    };

    const handleManualAddOpsIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value;
        setManualAddOpsId(query);
        setManualAddError(null);

        if (query.length > 1 && selectedSession) {
            const sessionRecordOpsIds = new Set(selectedSession.records.map(r => r.opsId));
            const availableWorkers = workers.filter(w => 
                !sessionRecordOpsIds.has(w.opsId) &&
                w.status === 'Active' &&
                (w.opsId.toLowerCase().includes(query.toLowerCase()) || w.fullName.toLowerCase().includes(query.toLowerCase()))
            );
            setManualAddSuggestions(availableWorkers.slice(0, 5));
        } else {
            setManualAddSuggestions([]);
        }
    };
    
    const handleManualAddSuggestionClick = (worker: Worker) => {
        setManualAddOpsId(worker.opsId);
        setManualAddSuggestions([]);
    };
    
    const handleManualAdd = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setManualAddSuggestions([]);
        if (!selectedSession || !manualAddOpsId) return;
        setManualAddError(null);
        setLoadingAction(true);

        const worker = workers.find(w => w.opsId.toLowerCase() === manualAddOpsId.toLowerCase());
        if (!worker || !worker.id) {
            setManualAddError(`Worker with OpsID "${manualAddOpsId}" not found.`);
            setLoadingAction(false);
            return;
        }

        // VALIDATION 1: Duplicate in Current Session
        const alreadyInSession = selectedSession.records.some(r => r.workerId === worker.id);
        if (alreadyInSession) {
             setManualAddError(`Worker ${worker.fullName} is already in this session.`);
             setLoadingAction(false);
             return;
        }

        // VALIDATION 2: 1 Attendance Per Day (Cross-Session)
        const alreadyAttendedToday = attendanceHistory.some(session => 
            session.date === selectedSession.date && 
            session.records.some(r => r.workerId === worker.id)
        );

        if (alreadyAttendedToday) {
             setManualAddError(`Worker ${worker.fullName} has already attended a session on ${selectedSession.date}. (Max 1x per hari)`);
             setLoadingAction(false);
             return;
        }

        const { data: newRecords, error } = await supabase.from('attendance_records').insert({
            session_id: selectedSession.id,
            worker_id: worker.id,
            timestamp: new Date(selectedSession.date + 'T' + selectedSession.shiftTime.split(' - ')[0]).toISOString(),
            scan_timestamp: new Date().toISOString(),
            manual_status: manualAddStatus === 'On Plan' ? null : manualAddStatus,
            is_arrived: false // Manual Add starts as 'Sedang di jalan' usually, let admin check it.
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
                scan_timestamp: newDbRecord.scan_timestamp,
                checkout_timestamp: newDbRecord.checkout_timestamp,
                manual_status: newDbRecord.manual_status,
                is_takeout: newDbRecord.is_takeout,
                is_arrived: newDbRecord.is_arrived,
            };

            setAttendanceHistory(prevHistory =>
                prevHistory.map(session =>
                    session.id === selectedSession.id
                        ? { ...session, records: [...session.records, newAttendanceRecord] }
                        : session
                )
            );
            showToast(`${worker.fullName} berhasil ditambahkan.`, { type: 'success', title: 'Karyawan Ditambahkan' });
            setManualAddOpsId('');
        }
    };
    
    const handleUpdateSession = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedSession) return;
        setLoadingAction(true);
        const formData = new FormData(e.currentTarget);
        const updates = {
            date: formData.get('date') as string,
            division: formData.get('division') as string,
            shiftTime: formData.get('shiftTime') as string,
            shiftId: formData.get('shiftId') as string,
            planMpp: parseInt(formData.get('planMpp') as string, 10),
        };

        const { error } = await supabase
            .from('attendance_sessions')
            .update(updates)
            .eq('id', selectedSession.id);

        setLoadingAction(false);

        if (error) {
            showToast(`Error: ${error.message}`, { type: 'error', title: 'Gagal Update Sesi' });
        } else {
            // Update local state
            setAttendanceHistory(prev => prev.map(s => 
                s.id === selectedSession.id ? { ...s, ...updates } : s
            ));
            // Update selected session to reflect changes immediately in the view
            setSelectedSession(prev => prev ? { ...prev, ...updates } : null);
            showToast('Detail sesi berhasil diperbarui.', { type: 'success', title: 'Berhasil' });
            setIsEditingSession(false);
        }
    };
    
    const openQrModal = (record: AttendanceRecord) => {
        const worker = workers.find(w => w.id === record.workerId);
        const department = worker ? worker.department : '-';
        
        setQrWorkerData({
            fullName: record.fullName,
            opsId: record.opsId,
            department: department
        });
        setQrCodeUrl('');
        setIsQrModalOpen(true);
        QRCode.toDataURL(record.opsId, { width: 300, margin: 2 })
            .then(url => setQrCodeUrl(url))
            .catch(err => console.error("Error generating QR", err));
    };

    const handlePrintQr = () => {
        window.print();
    };

    const handleDownloadJpeg = async () => {
        if (!selectedSession) return;
    
        const presentRecords = selectedSession.records.filter(r => r.is_arrived && !r.is_takeout);
    
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
    
        // --- Dimensions and Configuration ---
        const width = 800;
        const rowHeight = 40; 
        const headerHeight = 100;
        const tableHeaderHeight = 40;
        const footerHeight = 50;
        const sidePadding = 40;
        const height = headerHeight + tableHeaderHeight + (presentRecords.length * rowHeight) + footerHeight;
    
        canvas.width = width;
        canvas.height = height;
    
        // --- Load Logo for Watermark ---
        const logo = new Image();
        logo.crossOrigin = 'anonymous'; // Fix for tainted canvas
        logo.src = 'https://i.imgur.com/lie9EMX.png';
        try {
            await new Promise((resolve, reject) => { 
                logo.onload = resolve;
                logo.onerror = reject;
            });
        } catch (e) {
            console.error("Could not load cross-origin image for canvas.", e);
        }
    
        // --- Drawing ---
        // 1. Background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
    
        // 2. Watermark
        if (logo.complete && logo.naturalHeight !== 0) {
            ctx.globalAlpha = 0.2; // Increased opacity
            const logoWidth = 400;
            const logoHeight = logo.height * (logoWidth / logo.width);
            ctx.drawImage(logo, (width - logoWidth) / 2, (height - logoHeight) / 2, logoWidth, logoHeight);
            ctx.globalAlpha = 1.0; // Reset opacity
        }
    
        // 3. Main Header
        ctx.fillStyle = '#1e3a8a'; // Dark Blue
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Laporan Kehadiran', width / 2, 45);
    
        // 4. Sub Header
        ctx.fillStyle = '#4b5563'; // Gray
        ctx.font = '16px Arial';
        ctx.fillText(`${selectedSession.division} | ${selectedSession.date} | ${selectedSession.shiftTime}`, width / 2, 70);
    
        // 5. Table
        const tableYStart = headerHeight;
        const tableWidth = width - (sidePadding * 2);
        const col1Width = 150;
        const col3Width = 150;
        const col2Width = tableWidth - col1Width - col3Width;
    
        // Table Header Background
        ctx.fillStyle = '#3b82f6'; // Blue
        ctx.fillRect(sidePadding, tableYStart, tableWidth, tableHeaderHeight);
    
        // Table Header Text
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('OPS ID', sidePadding + 20, tableYStart + 25);
        ctx.fillText('NAMA LENGKAP', sidePadding + col1Width + 20, tableYStart + 25);
        ctx.textAlign = 'right';
        ctx.fillText('JAM MASUK', width - sidePadding - 20, tableYStart + 25);
        
        // Vertical separators in header
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sidePadding + col1Width, tableYStart);
        ctx.lineTo(sidePadding + col1Width, tableYStart + tableHeaderHeight);
        ctx.moveTo(sidePadding + col1Width + col2Width, tableYStart);
        ctx.lineTo(sidePadding + col1Width + col2Width, tableYStart + tableHeaderHeight);
        ctx.stroke();

        // Table Body
        ctx.font = '14px Arial';
        ctx.strokeStyle = '#e5e7eb'; // Light Gray for borders
        ctx.lineWidth = 1;

        // Draw bottom line for the header which is the top line for the first row
        ctx.beginPath();
        ctx.moveTo(sidePadding, tableYStart + tableHeaderHeight);
        ctx.lineTo(sidePadding + tableWidth, tableYStart + tableHeaderHeight);
        ctx.stroke();

        presentRecords.forEach((record, index) => {
            const y = tableYStart + tableHeaderHeight + (index * rowHeight);
    
            // Draw text for the row
            ctx.fillStyle = '#1f2937'; // Dark Gray Text
            ctx.textAlign = 'left';
            ctx.fillText(record.opsId, sidePadding + 20, y + 25);
            ctx.fillText(record.fullName, sidePadding + col1Width + 20, y + 25);
            
            ctx.textAlign = 'right';
            const scanTime = record.scan_timestamp ? new Date(record.scan_timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
            ctx.fillText(scanTime, width - sidePadding - 20, y + 25);
    
            // Draw horizontal line at the bottom of the row
            ctx.beginPath();
            ctx.moveTo(sidePadding, y + rowHeight);
            ctx.lineTo(sidePadding + tableWidth, y + rowHeight);
            ctx.stroke();
        });
        
        // 6. Footer
        const footerY = height - footerHeight + 30;
        ctx.fillStyle = '#4b5563';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Total Hadir: ${presentRecords.length} / ${selectedSession.planMpp} Plan`, width / 2, footerY);
    
        // --- Trigger Download ---
        const link = document.createElement('a');
        const safeDivision = selectedSession.division.replace(/[^a-zA-Z0-9]/g, '_');
        link.download = `Absensi_${safeDivision}_${selectedSession.date}.jpeg`;
        link.href = canvas.toDataURL('image/jpeg', 0.9);
        link.click();
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
            // LOGIC UPDATE: Filter for Physical Presence in Report Drilldown
            .filter(session => session.records.some(record => record.workerId === workerId && !record.is_takeout && record.is_arrived))
            .map(session => ({
                date: session.date,
                shiftTime: session.shiftTime,
                division: session.division
            }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        const uniqueDetails = Array.from(new Map(attendanceDetails.map(item => [`${item.date}-${item.shiftTime}-${item.division}`, item])).values());
        
        const worker = workers.find(w => w.id === workerId);

        setDetailReportData({
            workerName,
            opsId: worker?.opsId || 'N/A',
            period,
            dates: uniqueDetails,
            total: uniqueDetails.length
        });
        setIsDetailReportModalOpen(true);
    };
    
    const handleDownloadDetailReportJpeg = async () => {
        if (!detailReportData) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // --- Dimensions and Configuration ---
        const width = 800;
        const rowHeight = 60; 
        const headerHeight = 150;
        const footerHeight = 80;
        const sidePadding = 40;
        const height = headerHeight + (detailReportData.dates.length * rowHeight) + footerHeight;

        canvas.width = width;
        canvas.height = height;

        // --- Load Logo for Watermark ---
        const logo = new Image();
        logo.crossOrigin = 'anonymous';
        logo.src = 'https://i.imgur.com/lie9EMX.png';
        try {
            await new Promise((resolve, reject) => { 
                logo.onload = resolve;
                logo.onerror = reject;
            });
        } catch (e) {
            console.error("Could not load cross-origin image for canvas.", e);
        }

        // --- Drawing ---
        // 1. Background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);

        // 2. Watermark
        if (logo.complete && logo.naturalHeight !== 0) {
            ctx.globalAlpha = 0.15;
            const logoWidth = 400;
            const logoHeight = logo.height * (logoWidth / logo.width);
            ctx.drawImage(logo, (width - logoWidth) / 2, (height - logoHeight) / 2, logoWidth, logoHeight);
            ctx.globalAlpha = 1.0;
        }

        // 3. Main Header
        ctx.fillStyle = '#1e3a8a';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Detail Laporan Kehadiran', width / 2, 50);

        // 4. Sub Header (Worker Info)
        ctx.fillStyle = '#1f2937';
        ctx.font = 'bold 22px Arial';
        ctx.fillText(detailReportData.workerName, width / 2, 85);
        
        ctx.fillStyle = '#6b7280';
        ctx.font = '16px "Courier New", Courier, monospace';
        ctx.fillText(detailReportData.opsId, width / 2, 105);

        ctx.fillStyle = '#3b82f6';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(detailReportData.period, width / 2, 130);

        // 5. List of Dates
        ctx.font = '16px Arial';
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1;

        detailReportData.dates.forEach((item, index) => {
            const y = headerHeight + (index * rowHeight);
            const yCenter = y + rowHeight / 2;

            ctx.beginPath();
            ctx.moveTo(sidePadding, y + rowHeight);
            ctx.lineTo(width - sidePadding, y + rowHeight);
            ctx.stroke();

            ctx.fillStyle = '#1f2937';
            ctx.textAlign = 'left';
            ctx.font = 'bold 16px Arial';
            const formattedDateStr = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(item.date + 'T00:00:00'));
            ctx.fillText(formattedDateStr, sidePadding + 20, yCenter - 5);
            
            ctx.font = '12px Arial';
            ctx.fillStyle = '#4b5563';
            ctx.fillText(item.division, sidePadding + 20, yCenter + 15);

            ctx.fillStyle = '#3b82f6';
            ctx.textAlign = 'right';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(item.shiftTime, width - sidePadding - 20, yCenter + 5);
        });

        // 6. Footer (Total)
        const footerY = height - footerHeight + 45;
        ctx.fillStyle = '#1f2937';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Total Kehadiran: ${detailReportData.total} Hari Kerja`, width / 2, footerY);

        // --- Trigger Download ---
        const link = document.createElement('a');
        const safeName = detailReportData.workerName.replace(/[^a-zA-Z0-9]/g, '_');
        link.download = `Laporan_Kehadiran_${safeName}.jpeg`;
        link.href = canvas.toDataURL('image/jpeg', 0.9);
        link.click();
    };

    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const handleCopyOpsIdsOnly = () => {
      if (!selectedSession) return;
      const opsIdsToCopy = selectedSession.records
          // Copy only present workers
          .filter(record => !record.is_takeout && record.is_arrived)
          .map(record => record.opsId)
          .join('\n');
      
      if (opsIdsToCopy) {
          navigator.clipboard.writeText(opsIdsToCopy).then(() => {
              setCopyFeedback('ops');
              showToast('OpsID berhasil disalin ke clipboard.', { type: 'success', title: 'Tersalin!' });
              setTimeout(() => {
                  setCopyFeedback(null);
                  setIsCopyDropdownOpen(false);
              }, 1500);
          }, (err) => {
              showToast('Gagal menyalin OpsID.', { type: 'error', title: 'Error' });
              console.error('Copy failed', err);
          });
      } else {
          showToast('Tidak ada OpsID yang hadir (dicentang) untuk disalin.', { type: 'info', title: 'Info' });
      }
    };

    const handleCopyExcelFormat = () => {
        if (!selectedSession) return;
        const textToCopy = selectedSession.records
            // Copy only present workers
            .filter(record => !record.is_takeout && record.is_arrived)
            .map(record => `${record.opsId}\t${record.opsId}\t${selectedSession.shiftId}\tSUNTER DC`)
            .join('\n');
        
        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                setCopyFeedback('excel');
                showToast('Data format Excel berhasil disalin.', { type: 'success', title: 'Tersalin!' });
                setTimeout(() => {
                    setCopyFeedback(null);
                    setIsCopyDropdownOpen(false);
                }, 1500);
            }, (err) => {
                showToast('Gagal menyalin data.', { type: 'error', title: 'Error' });
                console.error('Copy failed', err);
            });
        } else {
            showToast('Tidak ada data yang hadir (dicentang) untuk disalin.', { type: 'info', title: 'Info' });
        }
    };
    
    const sessionSummary = useMemo(() => {
        if (!selectedSession) return { absen: 0, actual: 0 };
        return {
            absen: selectedSession.records.length,
            actual: selectedSession.records.filter(r => r.is_arrived).length
        }
    }, [selectedSession]);

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

             <div className="bg-white rounded-lg shadow-lg border border-gray-200 border-t-4 border-indigo-500 transition-shadow duration-300 hover:shadow-xl">
                 <div className="p-4 sm:p-6">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4">Attendance History (Bulan Ini)</h2>
                 </div>
                <div className="max-h-[490px] overflow-auto">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm relative">
                            <thead className="bg-blue-600 text-white sticky top-0 z-10">
                                <tr>
                                    <th className="p-3 font-semibold">Date</th>
                                    <th className="p-3 font-semibold">Tipe</th>
                                    <th className="p-3 font-semibold">Divisi</th>
                                    <th className="p-3 font-semibold">Shift</th>
                                    <th className="p-3 font-semibold text-center">Plan</th>
                                    <th className="p-3 font-semibold text-center">Actual</th>
                                    <th className="p-3 font-semibold text-center">Gap</th>
                                    <th className="p-3 font-semibold text-center">Status</th>
                                    <th className="p-3 font-semibold text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {currentMonthHistory.length > 0 ? (
                                    currentMonthHistory.map((session) => {
                                        // LOGIC UPDATE: Actual calculation based on physical presence
                                        const actual = session.records.filter(r => !r.is_takeout && r.is_arrived).length;
                                        const planned = session.planMpp;
                                        const gap = actual - planned;
                                        
                                        let status = 'GAP';
                                        if (actual === planned) status = 'FULL FILL';
                                        if (actual > planned) status = 'FULL FILL BUFFER';
                                        
                                        // Session Type Badge logic
                                        const sessionType = session.session_type || 'MANUAL';
                                        const sessionTypeColor = sessionType === 'PUBLIC' 
                                            ? 'bg-purple-100 text-purple-700' 
                                            : 'bg-gray-100 text-gray-700';

                                        return (
                                            <tr key={session.id} className="hover:bg-gray-50">
                                                <td className="p-3">{session.date}</td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${sessionTypeColor}`}>
                                                        {sessionType}
                                                    </span>
                                                </td>
                                                <td className="p-3">{session.division}</td>
                                                <td className="p-3">{session.shiftTime}</td>
                                                <td className="p-3 text-center">{planned}</td>
                                                <td className="p-3 text-center font-bold text-gray-800">{actual}</td>
                                                <td className={`p-3 text-center font-bold ${gap >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {gap > 0 ? `+${gap}` : gap}
                                                </td>
                                                <td className="p-3 text-center">
                                                    <span className={`px-2 py-1 text-xs rounded-full font-bold ${
                                                        status === 'FULL FILL' ? 'bg-green-100 text-green-700' :
                                                        status === 'GAP' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                                    }`}>{status}</span>
                                                </td>
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
                                        <td colSpan={9} className="text-center p-6 text-gray-500">No attendance history found for this month.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
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

            <Modal isOpen={isManageModalOpen} onClose={() => setIsManageModalOpen(false)} title="Manage Attendance Session" scrollable={true}>
                {selectedSession && (
                    <div className="flex flex-col">
                        {/* --- TOP SECTION --- */}
                        <div className="shrink-0">
                            {isEditingSession ? (
                                <form onSubmit={handleUpdateSession} className="space-y-4 mb-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase">Tanggal</label>
                                            <input name="date" type="date" defaultValue={selectedSession.date} required className="w-full bg-white border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase">Divisi</label>
                                            <select name="division" defaultValue={selectedSession.division} required className="w-full bg-white border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                                {divisionOpts.map(d => <option key={d} value={d}>{d}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase">Shift Jam</label>
                                            <select name="shiftTime" defaultValue={selectedSession.shiftTime} required className="w-full bg-white border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                                {shiftTimeOpts.map(time => (<option key={time} value={time}>{time}</option>))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase">Shift ID</label>
                                            <select name="shiftId" defaultValue={selectedSession.shiftId} required className="w-full bg-white border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                                {shiftIdOpts.map(shift => (<option key={shift} value={shift}>{shift}</option>))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase">Plan MPP</label>
                                            <input name="planMpp" type="number" defaultValue={selectedSession.planMpp} min="1" required className="w-full bg-white border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2 mt-4">
                                        <button type="button" onClick={() => setIsEditingSession(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">Cancel</button>
                                        <button type="submit" disabled={loadingAction} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Save Changes</button>
                                    </div>
                                </form>
                            ) : (
                                <div className="relative bg-white p-5 rounded-xl shadow-md border border-gray-100 mb-4">
                                    <button onClick={() => setIsEditingSession(true)} className="absolute top-3 right-3 p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-600 rounded-full transition-colors" title="Edit Session Details">
                                        <EditIcon />
                                    </button>
                                    <div className="flex flex-col sm:flex-row items-start gap-4">
                                        <div className="flex items-center gap-4 flex-grow">
                                            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-2xl font-black shrink-0">
                                                {selectedSession.division.substring(0, 2)}
                                            </div>
                                            <div className="flex flex-col">
                                                <h3 className="text-xl font-bold text-gray-800">{selectedSession.division}</h3>
                                                <p className="text-sm text-gray-500 font-medium mt-1">
                                                    {selectedSession.date} <span className="mx-2 text-gray-300">|</span> {selectedSession.shiftTime}
                                                </p>
                                                <div className="mt-2 bg-gray-100 px-2 py-1 rounded w-fit">
                                                    <p className="text-xs font-mono text-gray-600 select-all" title="Shift ID">
                                                        {selectedSession.shiftId}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="w-full sm:w-auto grid grid-cols-3 gap-3 pt-2 sm:pt-0">
                                            <div className="text-center bg-gray-50 p-3 rounded-lg border border-gray-200">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Plan</p>
                                                <p className="text-2xl font-black text-gray-700 mt-1">{selectedSession.planMpp}</p>
                                            </div>
                                            <div className="text-center bg-gray-50 p-3 rounded-lg border border-gray-200">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Absen</p>
                                                <p className="text-2xl font-black text-gray-700 mt-1">{sessionSummary.absen}</p>
                                            </div>
                                            <div className="text-center bg-blue-50 p-3 rounded-lg border border-blue-200">
                                                <p className="text-[10px] font-black text-blue-500 uppercase tracking-wider">Actual</p>
                                                <p className="text-2xl font-black text-blue-600 mt-1">{sessionSummary.actual}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {/* --- MIDDLE SECTION --- */}
                        <div className="overflow-x-auto border rounded-lg">
                            <table className="w-full text-left text-sm relative">
                                <thead className="bg-blue-600 text-white sticky top-0 z-10">
                                    <tr>
                                        <th className="p-2 font-semibold">Kehadiran Fisik</th>
                                        <th className="p-2 font-semibold">OpsID</th>
                                        <th className="p-2 font-semibold">Nama Lengkap</th>
                                        <th className="p-2 font-semibold">Jam Scan</th>
                                        <th className="p-2 font-semibold">Jam Shift In</th>
                                        <th className="p-2 font-semibold">Jam Shift Out</th>
                                        <th className="p-2 font-semibold">Total Jam</th>
                                        <th className="p-2 font-semibold">Status Plan</th>
                                        <th className="p-2 font-semibold text-center">Aksi</th>
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
                                        
                                        const [shiftInTime, shiftOutTimeDefault] = selectedSession.shiftTime.split(' - ');
                                        const showShiftOut = isAutoCheckout || record.checkout_timestamp || record.is_takeout;
                                        
                                        // Status Plan Logic
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
                                        
                                        // Physical Presence Logic
                                        const isArrived = record.is_arrived ?? true; // Default true if legacy data

                                        return (
                                            <tr key={record.id} className={`hover:bg-blue-50 transition-colors ${record.is_takeout ? 'opacity-60 bg-gray-100' : ''}`}>
                                                <td className="p-2 text-center">
                                                    <div className="flex flex-col items-center">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={isArrived} 
                                                            onChange={() => handleToggleArrival(record.id, isArrived)}
                                                            className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                                                        />
                                                        <span className={`text-[10px] font-bold mt-1 px-1.5 py-0.5 rounded ${isArrived ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                                                            {isArrived ? 'HADIR' : 'OTW'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-2 text-black font-mono font-bold">{record.opsId}</td>
                                                <td className="p-2 text-gray-800 font-semibold">{record.fullName}</td>
                                                <td className="p-2 font-mono">{record.scan_timestamp ? new Date(record.scan_timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}</td>
                                                <td className="p-2">{shiftInTime}</td>
                                                <td className="p-2">{showShiftOut ? shiftOutTimeDefault : '-'}</td>
                                                <td className="p-2 font-mono">{calculateWorkDuration(record.timestamp, effectiveCheckoutTimeStr)}</td>
                                                <td className="p-2"><span className={`px-2 py-1 text-xs rounded-full font-black uppercase ${statusColor}`}>{statusText}</span></td>
                                                <td className="p-2">
                                                    <div className="flex justify-center items-center gap-2">
                                                        <button onClick={() => openQrModal(record)} className="text-gray-600 hover:text-black p-1" title="Print QR Code">
                                                            <PrintIcon />
                                                        </button>
                                                        <button onClick={() => handleAction('takeout', record.id)} disabled={loadingAction || record.is_takeout} className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-1 px-2 rounded disabled:opacity-50 disabled:cursor-not-allowed">TakeOut</button>
                                                        <button onClick={() => handleAction('checkout', record.id)} disabled={loadingAction || !!effectiveCheckoutTimeStr || record.is_takeout} className="text-xs bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-2 rounded disabled:opacity-50 disabled:cursor-not-allowed">CheckOut</button>
                                                        <button onClick={() => openDeleteRecordModal(record)} disabled={loadingAction} className="text-red-500 hover:text-red-700 disabled:opacity-50 p-1" aria-label={`Remove ${record.fullName}`}><DeleteIcon /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* --- BOTTOM SECTION --- */}
                        <div className="shrink-0 mt-4 pt-4 border-t border-gray-200">
                           <form onSubmit={handleManualAdd} className="space-y-3">
                               <h4 className="text-md font-semibold text-gray-700">Tambah Karyawan Manual</h4>
                               {manualAddError && <p className="text-red-600 bg-red-50 p-2 rounded-lg text-sm">{manualAddError}</p>}
                               <div className="flex flex-col sm:flex-row gap-2">
                                   <div className="relative flex-grow" ref={manualAddSearchRef}>
                                       <input 
                                           type="text" 
                                           value={manualAddOpsId} 
                                           onChange={handleManualAddOpsIdChange} 
                                           placeholder="Ketik OpsID atau Nama Karyawan..." 
                                           className="w-full flex-grow bg-gray-50 border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                                           required 
                                           autoComplete="off"
                                       />
                                       {manualAddSuggestions.length > 0 && (
                                           <ul className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-xl mt-1 max-h-48 overflow-y-auto bottom-full mb-2">
                                               {manualAddSuggestions.map(worker => (
                                                   <li 
                                                       key={worker.id} 
                                                       onClick={() => handleManualAddSuggestionClick(worker)} 
                                                       className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-0"
                                                   >
                                                       <p className="font-semibold text-sm text-gray-800">{worker.fullName}</p>
                                                       <p className="text-xs text-black font-mono">{worker.opsId}</p>
                                                   </li>
                                               ))}
                                           </ul>
                                       )}
                                   </div>
                                   <select value={manualAddStatus} onChange={(e) => setManualAddStatus(e.target.value as 'Partial' | 'Buffer' | 'On Plan')} className="bg-gray-50 border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                       <option value="On Plan">On Plan</option>
                                       <option value="Partial">Partial</option>
                                       <option value="Buffer">Buffer</option>
                                   </select>
                                   <button type="submit" disabled={loadingAction} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50">
                                       {loadingAction ? '...' : 'Add'}
                                   </button>
                               </div>
                               <p className="text-xs text-gray-500">Note: Karyawan yang ditambah manual akan berstatus "Sedang di jalan" (OTW). Centang kehadiran fisik jika sudah sampai.</p>
                           </form>

                            <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap justify-between items-center gap-3">
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleDownloadJpeg}
                                        className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg transition-colors shadow-sm hover:shadow-md"
                                    >
                                        <DownloadIcon /> Download JPEG
                                    </button>
                                    <div className="relative" ref={dropdownRef}>
                                        <button 
                                            onClick={() => setIsCopyDropdownOpen(!isCopyDropdownOpen)} 
                                            className="flex items-center gap-2 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors shadow-sm hover:shadow-md"
                                        >
                                            <CopyIcon /> Salin Data
                                            <svg className={`w-4 h-4 ml-1 transition-transform ${isCopyDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        </button>
                                        {isCopyDropdownOpen && (
                                            <div className="absolute bottom-full mb-2 left-0 w-56 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-10 animate-fade-in-up overflow-hidden">
                                                <button 
                                                    onClick={handleCopyOpsIdsOnly}
                                                    className={`w-full text-left px-4 py-3 text-sm transition-all duration-300 border-b border-gray-100 ${
                                                        copyFeedback === 'ops'
                                                        ? 'bg-green-500 text-white font-bold'
                                                        : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                                                    }`}
                                                >
                                                    {copyFeedback === 'ops' ? (
                                                        <div className="flex items-center gap-2">
                                                            <svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                            Tersalin!
                                                        </div>
                                                    ) : (
                                                        "Salin OpsID Saja"
                                                    )}
                                                </button>
                                                <button 
                                                    onClick={handleCopyExcelFormat}
                                                    className={`w-full text-left px-4 py-3 text-sm transition-all duration-300 ${
                                                        copyFeedback === 'excel'
                                                        ? 'bg-green-500 text-white font-bold'
                                                        : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                                                    }`}
                                                >
                                                    {copyFeedback === 'excel' ? (
                                                        <div className="flex items-center gap-2">
                                                            <svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                            Tersalin!
                                                        </div>
                                                    ) : (
                                                        <>
                                                            Salin Format Excel
                                                            <span className="block text-xs mt-0.5 text-gray-400">Format 4 Kolom (Tab)</span>
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button onClick={handleCheckOutAll} disabled={loadingAction || !selectedSession.records.some(r => !r.checkout_timestamp && !r.is_takeout && (new Date().getTime() - new Date(r.timestamp).getTime()) < (9 * 60 * 60 * 1000))} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                    {loadingAction ? 'Processing...' : 'Check Out All Remaining'}
                                </button>
                            </div>
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

            <Modal isOpen={isDeleteRecordModalOpen} onClose={() => setIsDeleteRecordModalOpen(false)} title="Confirm Record Deletion" size="md" scrollable={false}>
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
            
            <Modal isOpen={isDetailReportModalOpen} onClose={() => setIsDetailReportModalOpen(false)} title="Detail Kehadiran" scrollable={true}>
                {detailReportData && (
                    <div className="flex flex-col">
                        <div className="shrink-0 border-b pb-3 mb-3 text-center">
                             <h3 className="text-xl font-bold text-gray-800">{detailReportData.workerName}</h3>
                             <p className="text-sm text-gray-500 font-mono mt-1">{detailReportData.opsId}</p>
                             <p className="font-semibold text-blue-600 text-lg mt-2">{detailReportData.period}</p>
                        </div>
                        <div className="border rounded-lg bg-white shadow-sm">
                             <ul className="divide-y divide-gray-100">
                                {detailReportData.dates.length > 0 ? (
                                    detailReportData.dates.map((item, index) => (
                                        <li key={index} className="p-4 flex justify-between items-center hover:bg-blue-50 transition-colors duration-150">
                                            <div className="flex flex-col">
                                                <span className="font-medium text-gray-800 text-sm">
                                                    {new Intl.DateTimeFormat('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(item.date + 'T00:00:00'))}
                                                </span>
                                                <div className="mt-1">
                                                     <span className="inline-block px-2 py-0.5 text-xs font-bold text-gray-600 bg-gray-200 rounded border border-gray-300 shadow-sm">
                                                        {item.division}
                                                    </span>
                                                </div>
                                            </div>
                                            <span className="text-xs font-bold text-blue-700 bg-blue-100 px-3 py-1.5 rounded-full border border-blue-200">
                                                {item.shiftTime}
                                            </span>
                                        </li>
                                    ))
                                ) : (
                                    <li className="p-6 text-center text-gray-500 italic">Tidak ada catatan kehadiran pada periode ini.</li>
                                )}
                             </ul>
                        </div>
                        <div className="shrink-0 mt-4 flex flex-col sm:flex-row gap-3 justify-between items-center">
                            <div className="w-full bg-gray-50 p-4 rounded-lg flex justify-between items-center border border-gray-200">
                                 <span className="text-gray-600 font-medium">Total Kehadiran</span>
                                 <span className="text-xl font-bold text-blue-600">{detailReportData.total} Hari Kerja</span>
                            </div>
                            <button
                                onClick={handleDownloadDetailReportJpeg}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-5 rounded-lg transition-colors shadow-sm hover:shadow-md"
                            >
                                <DownloadIcon /> Download JPEG
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} title="Employee QR Code" size="md">
                {qrWorkerData && (
                    <div className="flex flex-col items-center justify-center p-4">
                        <div id="printable-qr" className="flex flex-col items-center text-center">
                            <h1 className="text-xl font-bold mb-2 hidden print:block text-black">ABSENIN</h1>
                            <div className="bg-white p-2 rounded-lg border border-gray-200 print:border-0 flex flex-col items-center">
                                {qrCodeUrl ? (
                                    <img src={qrCodeUrl} alt={`QR Code for ${qrWorkerData.opsId}`} className="w-64 h-auto max-w-full object-contain print:w-48 print:h-48" />
                                ) : (
                                    <div className="w-64 h-64 flex items-center justify-center text-gray-400 bg-gray-50 rounded">Generating QR...</div>
                                )}
                            </div>
                            <div className="mt-6 text-center">
                                <h2 className="text-2xl font-bold text-gray-800 print:text-black print:text-xl">{qrWorkerData.fullName}</h2>
                                <p className="text-lg text-black font-mono tracking-wider mt-1 print:text-black print:text-lg">{qrWorkerData.opsId}</p>
                                <p className="text-sm text-gray-500 mt-2 print:hidden">{qrWorkerData.department}</p>
                            </div>
                        </div>

                        <div className="mt-8 flex gap-3 print:hidden no-print">
                            <button onClick={handlePrintQr} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white font-bold py-2 px-6 rounded-lg transition-colors shadow-lg">
                                <PrintIcon /> Print Struk
                            </button>
                             <a href={qrCodeUrl} download={`${qrWorkerData.fullName}_QR.png`} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors shadow-lg">
                                <DownloadIcon /> Save Image
                            </a>
                        </div>
                        <div className="mt-4 text-xs text-gray-400 print:hidden text-center max-w-xs no-print">
                            *Klik "Print Struk" untuk mencetak langsung ke printer thermal (58mm/80mm). Pastikan printer sudah terhubung.
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Dashboard;
