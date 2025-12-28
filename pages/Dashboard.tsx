
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
// FIX: Import uuidv4 to generate unique IDs for public sessions.
import { v4 as uuidv4 } from 'uuid';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';
import { Worker, AttendanceSession, AttendanceRecord, Profile } from '../types';
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
    profile: Profile;
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

const Dashboard: React.FC<DashboardProps> = ({ profile, workers, attendanceHistory, refreshData, setAttendanceHistory, autoOpenSessionId, clearAutoOpenSessionId }) => {
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
            if (!profile.company_id) return;
            const { data } = await supabase.from('master_data').select('*').eq('company_id', profile.company_id);
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
    }, [profile.company_id]);

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

    const handleDeleteSession = async () => {
        if (!selectedSession) return;
        setLoadingAction(true);
        const { error } = await supabase.from('attendance_sessions').delete().eq('id', selectedSession.id);
        if (error) {
            showToast(`Error deleting session: ${error.message}`, { type: 'error' });
        } else {
            showToast('Sesi berhasil dihapus.', { type: 'success' });
            setAttendanceHistory(prev => prev.filter(s => s.id !== selectedSession.id));
            setIsDeleteSessionModalOpen(false);
            setSelectedSession(null);
        }
        setLoadingAction(false);
    };

    const openDeleteRecordModal = (record: AttendanceRecord) => {
        setRecordToDelete(record);
        setIsDeleteRecordModalOpen(true);
    };

    const handleDeleteRecord = async () => {
        if (!recordToDelete || !selectedSession) return;
        setLoadingAction(true);
        const { error } = await supabase.from('attendance_records').delete().eq('id', recordToDelete.id);
        if (error) {
            showToast(`Error deleting record: ${error.message}`, { type: 'error' });
        } else {
            showToast('Data kehadiran berhasil dihapus.', { type: 'success' });
            // Optimistic update
            const updatedRecords = selectedSession.records.filter(r => r.id !== recordToDelete.id);
            const updatedSession = { ...selectedSession, records: updatedRecords };
            setAttendanceHistory(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));
            setIsDeleteRecordModalOpen(false);
            setRecordToDelete(null);
        }
        setLoadingAction(false);
    };

    const handleManualAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedSession || !manualAddOpsId) return;
        setManualAddError(null);
        setLoadingAction(true);

        const worker = workers.find(w => w.opsId.toLowerCase() === manualAddOpsId.toLowerCase() && w.status === 'Active');
        if (!worker || !worker.id) {
            setManualAddError('OpsID tidak ditemukan atau non-aktif.');
            setLoadingAction(false);
            return;
        }

        const isAlreadyInSession = selectedSession.records.some(r => r.workerId === worker!.id);
        if (isAlreadyInSession) {
            setManualAddError('Karyawan sudah ada di sesi ini.');
            setLoadingAction(false);
            return;
        }

        const shiftStartTime = selectedSession.shiftTime.split(' - ')[0];
        const sessionDateIso = selectedSession.date + 'T' + shiftStartTime;
        const officialTimestamp = new Date(sessionDateIso).toISOString();
        const actualScanTimestamp = new Date().toISOString();

        const { data, error } = await supabase.from('attendance_records').insert({
            session_id: selectedSession.id,
            worker_id: worker.id,
            timestamp: officialTimestamp,
            scan_timestamp: actualScanTimestamp,
            manual_status: manualAddStatus,
            is_arrived: true
        }).select().single();

        if (error) {
            setManualAddError(`DB Error: ${error.message}`);
        } else if (data) {
            const newRecord: AttendanceRecord = {
                id: data.id,
                workerId: worker.id,
                opsId: worker.opsId,
                fullName: worker.fullName,
                timestamp: data.timestamp,
                scan_timestamp: data.scan_timestamp,
                checkout_timestamp: data.checkout_timestamp,
                manual_status: data.manual_status as any,
                is_takeout: data.is_takeout,
                is_arrived: data.is_arrived,
            };
            const updatedRecords = [...selectedSession.records, newRecord];
            const updatedSession = { ...selectedSession, records: updatedRecords };
            setAttendanceHistory(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));
            setManualAddOpsId('');
            showToast('Karyawan berhasil ditambahkan.', { type: 'success' });
        }
        setLoadingAction(false);
    };
    
     const handleManualAddSearch = (query: string) => {
        setManualAddOpsId(query);
        setManualAddError(null);

        if (query.length > 1 && selectedSession) {
            const activeRecordWorkerIds = new Set(selectedSession.records.map(r => r.workerId));
            const availableWorkers = workers.filter(w => 
                !activeRecordWorkerIds.has(w.id!) &&
                w.status === 'Active' &&
                (w.opsId.toLowerCase().includes(query.toLowerCase()) || w.fullName.toLowerCase().includes(query.toLowerCase()))
            );
            setManualAddSuggestions(availableWorkers.slice(0, 5));
        } else {
            setManualAddSuggestions([]);
        }
    };
    
    const selectManualAddSuggestion = (worker: Worker) => {
        setManualAddOpsId(worker.opsId);
        setManualAddSuggestions([]);
    };

    const handleSaveSession = async (updatedSession: AttendanceSession) => {
        if (!profile.company_id) {
            showToast('Company ID not found.', { type: 'error' });
            return;
        }
        setLoadingAction(true);
        const { error } = await supabase
            .from('attendance_sessions')
            .update({
                date: updatedSession.date,
                division: updatedSession.division,
                shiftTime: updatedSession.shiftTime,
                shiftId: updatedSession.shiftId,
                planMpp: updatedSession.planMpp,
                company_id: profile.company_id
            })
            .eq('id', updatedSession.id);
        
        if (error) {
            showToast(`Error saving: ${error.message}`, { type: 'error' });
        } else {
            showToast('Sesi berhasil diperbarui.', { type: 'success' });
            setAttendanceHistory(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));
            setIsEditingSession(false);
        }
        setLoadingAction(false);
    };

    const handleCheckout = async (recordId: number, workerId: string) => {
        setLoadingAction(true);
        const checkout_timestamp = new Date().toISOString();
        const { data, error } = await supabase
            .from('attendance_records')
            .update({ checkout_timestamp })
            .eq('id', recordId)
            .select()
            .single();
        
        if (error) {
            showToast(`Gagal checkout: ${error.message}`, { type: 'error' });
        } else {
            showToast('Checkout berhasil.', { type: 'success' });
             const updatedRecords = selectedSession!.records.map(r => r.id === recordId ? { ...r, checkout_timestamp } : r);
             const updatedSession = { ...selectedSession!, records: updatedRecords };
             setAttendanceHistory(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));
        }
        setLoadingAction(false);
    };

    const handleCopyOpsIds = () => {
        if (!selectedSession) return;
        const opsIds = selectedSession.records.map(r => r.opsId).join('\n');
        navigator.clipboard.writeText(opsIds);
        setCopyFeedback('ops');
        setTimeout(() => setCopyFeedback(null), 1500);
    };

    const handleCopyExcelFormat = () => {
        if (!selectedSession) return;
        const excelData = selectedSession.records.map(r => `${r.opsId}\t${r.fullName}`).join('\n');
        navigator.clipboard.writeText(excelData);
        setCopyFeedback('excel');
        setTimeout(() => setCopyFeedback(null), 1500);
    };

    const handleGenerateQrCode = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!profile.company_id) return;

        setLoadingAction(true);
        const formData = new FormData(e.currentTarget);
        const newSessionId = `pub_${uuidv4()}`;

        const sessionData = {
            id: newSessionId,
            date: formData.get('qrDate') as string,
            division: formData.get('qrDivision') as string,
            shiftTime: formData.get('qrShiftTime') as string,
            shiftId: formData.get('qrShiftId') as string,
            planMpp: parseInt(formData.get('qrPlanMpp') as string, 10),
            company_id: profile.company_id,
            session_type: 'PUBLIC' as const,
            status: 'OPEN' as const,
            auto_close: formData.get('qrAutoClose') === 'on'
        };

        const { error } = await supabase.from('attendance_sessions').insert(sessionData);

        if (error) {
            showToast(`Error creating QR session: ${error.message}`, { type: 'error' });
        } else {
            const publicUrl = `${window.location.origin}/attend/${newSessionId}`;
            try {
                const qrUrl = await QRCode.toDataURL(publicUrl, { width: 250, margin: 2 });
                setQrCodeUrl(qrUrl);
                const workerData = { 
                    fullName: sessionData.division, 
                    opsId: sessionData.shiftTime, 
                    department: `Plan: ${sessionData.planMpp} | ${sessionData.date}`
                };
                setQrWorkerData(workerData);
                showToast('QR Code link berhasil dibuat!', { type: 'success' });
            } catch (err) {
                 showToast('Gagal generate QR Code.', { type: 'error' });
            }
        }
        setLoadingAction(false);
    };

    const handlePrintQr = () => window.print();

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
                    <p className="text-gray-500">{formattedDate}</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => downloadReport('xlsx')} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm hover:shadow-md transition-all">
                        <DownloadIcon /> Export Excel
                    </button>
                    <button onClick={() => setIsReportModalOpen(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm hover:shadow-md transition-all">
                        <DownloadIcon /> Laporan HK
                    </button>
                    <button onClick={() => setIsQrModalOpen(true)} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white font-bold py-2 px-4 rounded-lg shadow-sm hover:shadow-md transition-all">
                       <PrintIcon /> Link Publik
                    </button>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Total Karyawan Aktif" value={activeWorkers} description="Data dari Database" borderColor="border-t-blue-500" />
                <StatCard title="Total Sesi Bulan Ini" value={currentMonthHistory.length} description="Sesi manual & publik" borderColor="border-t-indigo-500" />
                <StatCard title="Fulfilment Periode 1" value={fulfillmentPeriod1} description="Tanggal 1-15 bulan ini" borderColor="border-t-green-500" />
                <StatCard title="Fulfilment Periode 2" value={fulfillmentPeriod2} description="Tanggal 16-31 bulan ini" borderColor="border-t-yellow-500" />
            </div>

            {/* Summary Grid */}
            <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
                <h3 className="font-bold text-gray-700 mb-4">Ringkasan Kehadiran</h3>
                 <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <SummaryItem label="Hari Ini" stats={summaryCounts.today} bgColor="bg-blue-50" textColor="text-blue-800" />
                    <SummaryItem label="Minggu Ini" stats={summaryCounts.thisWeek} bgColor="bg-indigo-50" textColor="text-indigo-800" />
                    <SummaryItem label="Bulan Ini" stats={summaryCounts.thisMonth} bgColor="bg-purple-50" textColor="text-purple-800" />
                    <SummaryItem label="Periode 1" stats={summaryCounts.period1} bgColor="bg-green-50" textColor="text-green-800" />
                    <SummaryItem label="Periode 2" stats={summaryCounts.period2} bgColor="bg-yellow-50" textColor="text-yellow-800" />
                </div>
            </div>

            {/* Attendance History */}
            <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Riwayat Sesi (Bulan Ini)</h2>
                <div className="space-y-4">
                    {currentMonthHistory.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">Belum ada sesi absensi bulan ini.</p>
                    ) : (
                        currentMonthHistory.map(session => (
                            <div key={session.id} className="bg-white rounded-lg shadow-md border border-gray-200 transition-shadow hover:shadow-lg">
                                <div className="p-4 flex flex-col sm:flex-row justify-between sm:items-center border-b">
                                    <div className="mb-2 sm:mb-0">
                                        <div className="flex items-center gap-3">
                                            <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider ${session.session_type === 'PUBLIC' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                                                {session.session_type || 'MANUAL'}
                                            </span>
                                            <h3 className="font-bold text-lg text-gray-800">{session.date}</h3>
                                        </div>
                                        <p className="text-sm text-gray-500">{session.division} - {session.shiftTime}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="text-right">
                                            <p className="font-bold text-xl">{session.records.length} / {session.planMpp}</p>
                                            <p className="text-xs text-gray-400">Actual / Plan</p>
                                        </div>
                                        <button onClick={() => openManageModal(session)} className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-lg flex items-center gap-2 text-sm font-semibold transition-colors">
                                            <ViewIcon /> Kelola
                                        </button>
                                        <button onClick={() => openDeleteSessionModal(session)} className="bg-red-100 hover:bg-red-200 text-red-600 p-2 rounded-lg transition-colors">
                                            <DeleteIcon />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
            
            {/* Modals will go here */}
        </div>
    );
};

export default Dashboard;
