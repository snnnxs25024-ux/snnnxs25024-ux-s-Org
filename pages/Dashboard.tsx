import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Worker, AttendanceSession, AttendanceRecord } from '../types';
import DownloadIcon from '../components/icons/DownloadIcon';
import Modal from '../components/Modal';
import ViewIcon from '../components/icons/ViewIcon';
import EditIcon from '../components/icons/EditIcon';
import DeleteIcon from '../components/icons/DeleteIcon';
import { supabase } from '../lib/supabaseClient';


interface DashboardProps {
    workers: Worker[];
    attendanceHistory: AttendanceSession[];
    refreshData: () => void;
}

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


const Dashboard: React.FC<DashboardProps> = ({ workers, attendanceHistory, refreshData }) => {
    const [selectedSession, setSelectedSession] = useState<AttendanceSession | null>(null);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [loadingAction, setLoadingAction] = useState(false);


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
        const totalActual = relevantSessions.reduce((sum, s) => sum + s.records.length, 0);

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
                'Waktu Absen': new Date(record.timestamp).toLocaleTimeString(),
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
                head: [['Tanggal', 'Shift Jam', 'Shift ID', 'Ops ID', 'Nama Lengkap', 'Waktu Absen']],
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

        const attendanceCount = session.records.length;

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

    const openViewModal = (session: AttendanceSession) => {
        setSelectedSession(session);
        setIsViewModalOpen(true);
    };

    const openEditModal = (session: AttendanceSession) => {
        setSelectedSession(JSON.parse(JSON.stringify(session))); // Deep copy to avoid direct state mutation
        setIsEditModalOpen(true);
    };

    const openDeleteModal = (session: AttendanceSession) => {
        setSelectedSession(session);
        setIsDeleteModalOpen(true);
    };

    const handleRemoveRecord = async (recordToRemove: AttendanceRecord) => {
        if (!selectedSession) return;
        setLoadingAction(true);
        const { error } = await supabase
            .from('attendance_records')
            .delete()
            .match({ session_id: selectedSession.id, worker_id: recordToRemove.workerId });
        
        setLoadingAction(false);
        if (error) {
            alert(`Error removing record: ${error.message}`);
        } else {
            const updatedRecords = selectedSession.records.filter(r => r.workerId !== recordToRemove.workerId);
            setSelectedSession({ ...selectedSession, records: updatedRecords });
            refreshData(); // Refresh all data to ensure consistency
        }
    };

    const handleDeleteSession = async () => {
        if (!selectedSession) return;
        setLoadingAction(true);
        // First delete records, then the session
        const { error: recordsError } = await supabase
            .from('attendance_records')
            .delete()
            .match({ session_id: selectedSession.id });
        
        if (recordsError) {
             setLoadingAction(false);
             alert(`Error deleting records: ${recordsError.message}`);
             return;
        }

        const { error: sessionError } = await supabase
            .from('attendance_sessions')
            .delete()
            .match({ id: selectedSession.id });
        
        setLoadingAction(false);
        if (sessionError) {
            alert(`Error deleting session: ${sessionError.message}`);
        } else {
            setIsDeleteModalOpen(false);
            setSelectedSession(null);
            refreshData();
        }
    };


    return (
        <div>
            <div className="flex justify-between items-center mb-8">
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

            <div className="mb-8 bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
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

             <div className="mt-10 bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
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
                                [...attendanceHistory].map((session) => {
                                    const actual = session.records.length;
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
                                                <button onClick={() => openViewModal(session)} className="text-blue-400 hover:text-blue-300"><ViewIcon /></button>
                                                <button onClick={() => openEditModal(session)} className="text-yellow-400 hover:text-yellow-300"><EditIcon /></button>
                                                <button onClick={() => openDeleteModal(session)} className="text-red-400 hover:text-red-300"><DeleteIcon /></button>
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

            {/* View Modal */}
            <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title="Attendance Details">
                {selectedSession && (
                    <div className="max-h-96 overflow-y-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-700 sticky top-0">
                                <tr>
                                    <th className="p-2">OpsID</th>
                                    <th className="p-2">Nama Lengkap</th>
                                    <th className="p-2">Waktu Absen</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedSession.records.map(record => (
                                    <tr key={record.workerId} className="border-b border-gray-700">
                                        <td className="p-2">{record.opsId}</td>
                                        <td className="p-2">{record.fullName}</td>
                                        <td className="p-2">{new Date(record.timestamp).toLocaleTimeString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Modal>

            {/* Edit Modal */}
            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Attendance Session">
                {selectedSession && (
                     <div className="max-h-96 overflow-y-auto">
                        <p className="text-sm text-yellow-400 bg-yellow-900/50 p-3 rounded-lg mb-4">Click the trash icon to remove a worker from this attendance record.</p>
                        <table className="w-full text-left">
                            <thead className="bg-gray-700 sticky top-0">
                                <tr>
                                    <th className="p-2">OpsID</th>
                                    <th className="p-2">Nama Lengkap</th>
                                    <th className="p-2 text-center">Remove</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedSession.records.map(record => (
                                    <tr key={record.workerId} className="border-b border-gray-700">
                                        <td className="p-2">{record.opsId}</td>
                                        <td className="p-2">{record.fullName}</td>
                                        <td className="p-2 text-center">
                                            <button onClick={() => handleRemoveRecord(record)} className="text-red-400 hover:text-red-300" disabled={loadingAction}>
                                                <DeleteIcon />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Confirm Session Deletion">
                {selectedSession && (
                    <div className="text-gray-300">
                        <p>Are you sure you want to delete the attendance session for <strong className="text-teal-400">{selectedSession.date} ({selectedSession.shiftTime})</strong>?</p>
                        <p className="text-sm text-red-400 mt-2">This will remove all {selectedSession.records.length} attendance records for this session. This action cannot be undone.</p>
                        <div className="flex justify-end gap-4 mt-6">
                            <button onClick={() => setIsDeleteModalOpen(false)} className="py-2 px-4 bg-gray-600 hover:bg-gray-500 rounded-lg">Cancel</button>
                            <button onClick={handleDeleteSession} className="py-2 px-4 bg-red-600 hover:bg-red-500 rounded-lg" disabled={loadingAction}>
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