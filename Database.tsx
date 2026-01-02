
import React, { useState, useRef, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Worker } from '../types';
import Modal from '../components/Modal';
import DeleteIcon from '../components/icons/DeleteIcon';
import DownloadIcon from '../components/icons/DownloadIcon';
import UploadIcon from '../components/icons/UploadIcon';
import AddIcon from '../components/icons/AddIcon';
import { supabase } from '../lib/supabaseClient';
import SearchIcon from '../components/icons/SearchIcon';
import { useToast } from '../hooks/useToast';
import WorkerDetailModal from '../components/WorkerDetailModal';
import WorkerFormModal from '../components/WorkerFormModal';
import QrCodeModal from '../components/QrCodeModal';
import ViewIcon from '../components/icons/ViewIcon';
import EditIcon from '../components/icons/EditIcon';
import PrintIcon from '../components/icons/PrintIcon';

interface DatabaseProps {
  workers: Worker[];
  refreshData: () => void;
}

const Database: React.FC<DatabaseProps> = ({ workers, refreshData }) => {
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleteAllConfirmOpen, setIsDeleteAllConfirmOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [importResults, setImportResults] = useState<{success: any[], failed: any[]}>({success: [], failed: []});
  const [isImportSummaryOpen, setIsImportSummaryOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [divisionOpts, setDivisionOpts] = useState<string[]>([]);
  const importFileRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const fetchDivisions = async () => {
        const { data } = await supabase.from('master_data').select('value').eq('category', 'DIVISION').order('value', { ascending: true });
        setDivisionOpts(data ? data.map(d => d.value) : ['SOC Operator', 'Cache', 'Return', 'Inventory']);
    };
    fetchDivisions();
  }, []);

  const filteredWorkers = useMemo(() => {
    return workers
      .filter(w => departmentFilter === 'All' || w.department === departmentFilter)
      .filter(w => {
        if (searchTerm.trim() === '') return true;
        const lowercasedSearch = searchTerm.trim().toLowerCase();
        return (w.fullName || '').toLowerCase().includes(lowercasedSearch) || (w.opsId || '').toLowerCase().includes(lowercasedSearch);
      });
  }, [workers, searchTerm, departmentFilter]);

  const openViewModal = (worker: Worker) => { setSelectedWorker(worker); setIsViewModalOpen(true); };
  const openEditModal = (worker: Worker | null) => { setSelectedWorker(worker); setIsEditModalOpen(true); };
  const openDeleteConfirm = (worker: Worker) => { setSelectedWorker(worker); setIsDeleteConfirmOpen(true); };
  const openQrModal = (worker: Worker) => { setSelectedWorker(worker); setIsQrModalOpen(true); };

  const handleDeleteWorker = async () => {
    if(!selectedWorker?.id) return;
    setLoadingAction(true);
    const { error } = await supabase.from('workers').delete().eq('id', selectedWorker.id);
    setLoadingAction(false);
    if (error) showToast(`Error: ${error.message}`, { type: 'error' });
    else {
      setIsDeleteConfirmOpen(false);
      showToast(`${selectedWorker.fullName} berhasil dihapus.`, { type: 'success' });
      refreshData();
    }
  };

  const handleDeleteAllWorkers = async () => {
    setLoadingAction(true);
    const { error } = await supabase.from('workers').delete().not('id', 'is', null);
    setLoadingAction(false);
    if (error) showToast(`Error: ${error.message}`, { type: 'error' });
    else {
      showToast('Semua data karyawan berhasil dihapus.', { type: 'success' });
      setIsDeleteAllConfirmOpen(false);
      refreshData();
    }
  };
  
  const handleDownloadTemplate = () => {
    const sampleData = [{ opsId: 'OPS999', fullName: 'John Doe', nik: '3201010101010001', phone: '081298765432', contractType: 'Daily Worker Vendor', department: 'SOC Operator', status: 'Active' }];
    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    XLSX.writeFile(workbook, 'Template_Import_Karyawan_Baru.xlsx');
  };
  
  const handleExport = () => {
    const dataToExport = workers.map(w => ({ id: w.id, opsId: w.opsId, fullName: w.fullName, nik: w.nik, phone: w.phone, contractType: w.contractType, department: w.department, status: w.status }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Workers');
    XLSX.writeFile(workbook, 'Export_Database_Karyawan.xlsx');
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        setLoadingAction(true);
        try {
            const data = e.target?.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const json: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

            if (json.length === 0) { showToast("File Excel kosong.", { type: 'info' }); setLoadingAction(false); return; }

            const statusValues: Worker['status'][] = ['Active', 'Non Active', 'Blacklist'];
            const failedRecords: { row: any; reason: string }[] = [];
            const isUpdateMode = json[0].hasOwnProperty('id');
            const workersToUpsert: any[] = [];

            const existingWorkerMap = new Map<string, string>();
            workers.forEach(w => { if (w.id) existingWorkerMap.set(w.opsId.toLowerCase(), w.id); });

            for (const row of json) {
                const opsIdStr = row.opsId?.toString().trim();
                if (!opsIdStr) { failedRecords.push({ row, reason: "OpsID kosong." }); continue; }
                if (!divisionOpts.some(d => d.toLowerCase() === row.department?.toLowerCase())) { failedRecords.push({ row, reason: `Divisi tidak valid: ${row.department}` }); continue; }
                if (!statusValues.includes(row.status)) { failedRecords.push({ row, reason: `Status tidak valid: ${row.status}` }); continue; }

                if(isUpdateMode) {
                    if (!row.id) { failedRecords.push({ row, reason: "Mode update, 'id' kosong." }); continue; }
                    const conflictingWorkerId = existingWorkerMap.get(opsIdStr.toLowerCase());
                    if (conflictingWorkerId && conflictingWorkerId !== row.id) {
                        failedRecords.push({ row, reason: `OpsID duplikat.` }); continue;
                    }
                } else {
                    if (existingWorkerMap.has(opsIdStr.toLowerCase())) { failedRecords.push({ row, reason: "OpsID duplikat." }); continue; }
                    if (!row.fullName || !row.nik || !row.phone) { failedRecords.push({ row, reason: "Kolom wajib kosong." }); continue; }
                }
                
                const matchedDept = divisionOpts.find(d => d.toLowerCase() === row.department?.toLowerCase()) || row.department;
                workersToUpsert.push({
                    ...(isUpdateMode && { id: row.id }),
                    ops_id: opsIdStr, full_name: row.fullName, nik: row.nik?.toString() ?? '',
                    phone: row.phone?.toString() ?? '', contract_type: 'Daily Worker Vendor',
                    department: matchedDept, status: row.status,
                });
            }
            let successfulRecords: any[] = [];
            if (workersToUpsert.length > 0) {
                const { data: upsertData, error } = await supabase.from('workers').upsert(workersToUpsert).select();
                if (error) throw error;
                successfulRecords = upsertData || [];
            }
            
            setImportResults({ success: successfulRecords, failed: failedRecords });
            if (successfulRecords.length > 0) showToast(`${successfulRecords.length} data berhasil ${isUpdateMode ? "diperbarui" : "diimpor"}.`, { type: 'success' });
            if (failedRecords.length > 0) showToast(`${failedRecords.length} data gagal. Cek summary.`, { type: 'error' });
            if (successfulRecords.length > 0) refreshData();

        } catch (err: any) {
            showToast(`Error impor: ${err.message}`, { type: 'error' });
        } finally {
            setLoadingAction(false);
            setIsImportSummaryOpen(true);
            if (importFileRef.current) importFileRef.current.value = '';
        }
    };
    reader.readAsBinaryString(file);
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <h1 className="text-3xl font-bold text-gray-800">Database Karyawan</h1>
        <div className="flex flex-wrap gap-2">
            <button onClick={() => openEditModal(null)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm"><AddIcon /> <span className="hidden sm:inline">Add New</span></button>
            <div className="flex items-center rounded-lg shadow-sm border">
                <button onClick={handleDownloadTemplate} className="flex items-center gap-2 bg-white hover:bg-gray-100 text-gray-700 font-bold py-2 px-3 rounded-l-lg" title="Download template"><DownloadIcon /> <span className="hidden xl:inline">Template</span></button>
                <div className="w-px h-full bg-gray-300"></div>
                <button onClick={() => importFileRef.current?.click()} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-r-lg" title="Impor/Update dari Excel"><UploadIcon /> <span className="hidden xl:inline">Import/Update</span></button>
            </div>
            <input type="file" ref={importFileRef} onChange={handleImport} accept=".xlsx, .xls" className="hidden" />
            <button onClick={handleExport} className="flex items-center gap-2 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg shadow-sm" title="Ekspor semua data"><DownloadIcon /> <span className="hidden sm:inline">Export</span></button>
            <button onClick={() => setIsDeleteAllConfirmOpen(true)} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm"><DeleteIcon /> <span className="hidden sm:inline">Reset DB</span></button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow border">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><SearchIcon className="h-5 w-5 text-gray-400" /></div>
            <input type="text" placeholder="Search by OpsID or Name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-blue-500"/>
          </div>
          <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="border rounded-lg px-4 py-2 bg-white">
            <option value="All">All Divisions</option>
            {divisionOpts.map(div => <option key={div} value={div}>{div}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden border">
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
            <thead className="bg-blue-600 text-white uppercase font-semibold"><tr>
                <th className="p-4">OpsID</th><th className="p-4">Full Name</th><th className="p-4 hidden md:table-cell">Division</th>
                <th className="p-4 hidden lg:table-cell">Status</th><th className="p-4 text-center">Actions</th>
            </tr></thead>
            <tbody className="divide-y">
                {filteredWorkers.map((worker) => (
                <tr key={worker.id} className="hover:bg-blue-50">
                    <td className="p-4 font-mono font-medium">{worker.opsId}</td><td className="p-4 font-semibold">{worker.fullName}</td>
                    <td className="p-4 hidden md:table-cell">{worker.department}</td>
                    <td className="p-4 hidden lg:table-cell"><span className={`px-2 py-1 rounded-full text-xs font-bold ${worker.status === 'Active' ? 'bg-green-100 text-green-800' : worker.status === 'Blacklist' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>{worker.status}</span></td>
                    <td className="p-4"><div className="flex justify-center items-center gap-2">
                        <button onClick={() => openQrModal(worker)} className="text-gray-500 p-1" title="QR Code"><PrintIcon /></button>
                        <button onClick={() => openViewModal(worker)} className="text-blue-500 p-1" title="View Details"><ViewIcon /></button>
                        <button onClick={() => openEditModal(worker)} className="text-yellow-500 p-1" title="Edit"><EditIcon /></button>
                        <button onClick={() => openDeleteConfirm(worker)} className="text-red-500 p-1" title="Delete"><DeleteIcon /></button>
                    </div></td>
                </tr>
                ))}
                {filteredWorkers.length === 0 && (<tr><td colSpan={5} className="p-8 text-center text-gray-500">No workers found.</td></tr>)}
            </tbody>
            </table>
        </div>
      </div>
      
      <WorkerDetailModal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} worker={selectedWorker} onEdit={openEditModal} onDelete={openDeleteConfirm} onPrintQr={openQrModal} />
      <WorkerFormModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} worker={selectedWorker} refreshData={refreshData} divisionOpts={divisionOpts} />
      <QrCodeModal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} workerData={selectedWorker ? { fullName: selectedWorker.fullName, opsId: selectedWorker.opsId, department: selectedWorker.department } : null} />

      <Modal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} title="Confirm Deletion" size="sm">
        {selectedWorker && (<div>
            <p className="text-red-700">Are you sure you want to delete <strong>{selectedWorker.fullName}</strong> ({selectedWorker.opsId})?</p>
            <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setIsDeleteConfirmOpen(false)} className="px-4 py-2 bg-gray-200 rounded-lg">Cancel</button>
                <button onClick={handleDeleteWorker} disabled={loadingAction} className="px-4 py-2 bg-red-600 text-white rounded-lg">{loadingAction ? 'Deleting...' : 'Yes, Delete'}</button>
            </div>
        </div>)}
      </Modal>

      <Modal isOpen={isDeleteAllConfirmOpen} onClose={() => setIsDeleteAllConfirmOpen(false)} title="DANGER: Reset Database" size="md">
        <div>
            <div className="bg-red-100 p-4 mb-6"><h3 className="text-red-800 font-bold">WARNING: IRREVERSIBLE ACTION</h3>
                <p className="text-red-700">You are about to delete <strong>ALL WORKER DATA</strong>. Are you absolutely sure?</p>
            </div>
            <div className="flex justify-end gap-3">
                <button onClick={() => setIsDeleteAllConfirmOpen(false)} className="px-4 py-2 bg-gray-200 rounded-lg">Cancel</button>
                <button onClick={handleDeleteAllWorkers} disabled={loadingAction} className="px-6 py-2 bg-red-600 text-white rounded-lg">{loadingAction ? 'Reseting...' : 'CONFIRM RESET ALL'}</button>
            </div>
        </div>
      </Modal>

      <Modal isOpen={isImportSummaryOpen} onClose={() => setIsImportSummaryOpen(false)} title="Import Summary" size="lg">
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 p-4 rounded-lg border text-center"><p className="text-green-800 font-bold text-2xl">{importResults.success.length}</p><p className="text-green-600 text-sm">Success</p></div>
                <div className="bg-red-50 p-4 rounded-lg border text-center"><p className="text-red-800 font-bold text-2xl">{importResults.failed.length}</p><p className="text-red-600 text-sm">Failed/Skipped</p></div>
            </div>
            {importResults.failed.length > 0 && (<div className="mt-4"><h4 className="font-bold mb-2">Failed Items:</h4>
                <div className="bg-gray-50 rounded-lg border max-h-48 overflow-y-auto p-2"><table className="w-full text-xs text-left">
                    <thead><tr><th className="p-1">OpsID</th><th className="p-1">Name</th><th className="p-1">Reason</th></tr></thead>
                    <tbody>{importResults.failed.map((fail, idx) => (<tr key={idx}><td className="p-1 font-mono">{fail.row.opsId || '-'}</td><td className="p-1">{fail.row.fullName || '-'}</td><td className="p-1 text-red-600">{fail.reason}</td></tr>))}</tbody>
                </table></div>
            </div>)}
            <div className="flex justify-end pt-2"><button onClick={() => setIsImportSummaryOpen(false)} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Done</button></div>
        </div>
      </Modal>
    </div>
  );
};

export default Database;
