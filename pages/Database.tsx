import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Worker } from '../types';
import Modal from '../components/Modal';
import ViewIcon from '../components/icons/ViewIcon';
import EditIcon from '../components/icons/EditIcon';
import DeleteIcon from '../components/icons/DeleteIcon';
import DownloadIcon from '../components/icons/DownloadIcon';
import UploadIcon from '../components/icons/UploadIcon';
import AddIcon from '../components/icons/AddIcon';
import { supabase } from '../lib/supabaseClient';
import CopyIcon from '../components/icons/CopyIcon';
import SearchIcon from '../components/icons/SearchIcon';

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
  const [workerToDelete, setWorkerToDelete] = useState<Worker | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [importResults, setImportResults] = useState<{success: any[], failed: any[]}>({success: [], failed: []});
  const [isImportSummaryOpen, setIsImportSummaryOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const importFileRef = useRef<HTMLInputElement>(null);

  const filteredWorkers = useMemo(() => {
    return workers
      .filter(worker => {
        if (departmentFilter === 'All') return true;
        return worker.department === departmentFilter;
      })
      .filter(worker => {
        if (searchTerm.trim() === '') return true;
        const lowercasedSearch = searchTerm.toLowerCase();
        return (
          worker.fullName.toLowerCase().includes(lowercasedSearch) ||
          worker.opsId.toLowerCase().includes(lowercasedSearch)
        );
      });
  }, [workers, searchTerm, departmentFilter]);

  const openViewModal = (worker: Worker) => {
    setSelectedWorker(worker);
    setIsViewModalOpen(true);
  };
  
  const openEditModal = (worker: Worker | null) => {
    setSelectedWorker(worker);
    setIsEditModalOpen(true);
  };
  
  const openDeleteConfirm = (worker: Worker) => {
    setWorkerToDelete(worker);
    setIsDeleteConfirmOpen(true);
  }

  const handleSaveWorker = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoadingAction(true);
    const formData = new FormData(e.currentTarget);
    const workerData = {
        opsId: formData.get('opsId') as string, fullName: formData.get('fullName') as string,
        nik: formData.get('nik') as string, phone: formData.get('phone') as string,
        contractType: formData.get('contractType') as Worker['contractType'],
        department: formData.get('department') as Worker['department'], status: formData.get('status') as Worker['status'],
    };
    let error;
    if (selectedWorker) {
      const { error: updateError } = await supabase.from('workers').update(workerData).eq('id', selectedWorker.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from('workers').insert([{ ...workerData, createdAt: new Date().toISOString() }]);
      error = insertError;
    }
    setLoadingAction(false);
    if (error) alert(`Error saving worker: ${error.message}`);
    else {
      setIsEditModalOpen(false);
      setSelectedWorker(null);
      refreshData();
    }
  };

  const handleDeleteWorker = async () => {
    if(workerToDelete && workerToDelete.id){
        setLoadingAction(true);
        const { error } = await supabase.from('workers').delete().eq('id', workerToDelete.id);
        setLoadingAction(false);
        if (error) alert(`Error deleting worker: ${error.message}`);
        else {
            setIsDeleteConfirmOpen(false);
            setWorkerToDelete(null);
            refreshData();
        }
    }
  }

  const handleDeleteAllWorkers = async () => {
    setLoadingAction(true);
    const { error } = await supabase.from('workers').delete().not('id', 'is', null);
    setLoadingAction(false);
    if (error) alert(`Error deleting all workers: ${error.message}`);
    else {
      alert('All worker data has been successfully deleted.');
      setIsDeleteAllConfirmOpen(false);
      refreshData();
    }
  };
  
  const handleDownloadTemplate = () => {
    const headers = ['opsId', 'fullName', 'nik', 'phone', 'contractType', 'department', 'status'];
    const sampleData = [{ opsId: 'NEX999', fullName: 'John Doe', nik: '3201010101010001', phone: '081298765432',
      contractType: 'Daily Worker Vendor - NEXUS', department: 'SOC Operator', status: 'Active'
    }];
    const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    XLSX.writeFile(workbook, 'Template_Database_Worker.xlsx');
  };
  
  const handleExport = () => {
    const dataToExport = workers.map(({ id, createdAt, ...rest }) => rest);
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Workers');
    XLSX.writeFile(workbook, 'Database_Worker_Export.xlsx');
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        setLoadingAction(true);
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet);

        const departmentValues: Worker['department'][] = ['SOC Operator', 'Cache', 'Return', 'Inventory'];
        const statusValues: Worker['status'][] = ['Active', 'Non Active', 'Blacklist'];
        const existingOpsIds = new Set(workers.map(w => w.opsId.toLowerCase()));
        
        const workersToInsert: Omit<Worker, 'id'>[] = [];
        const failedImports: { row: any; reason: string }[] = [];

        for (const row of json) {
            const opsId = row.opsId?.toString().trim();
            if (!opsId) {
                failedImports.push({ row, reason: "OpsID is missing." });
                continue;
            }
            if (existingOpsIds.has(opsId.toLowerCase())) {
                failedImports.push({ row, reason: "Duplicate OpsID." });
                continue;
            }
            if (!row.fullName || !row.nik || !row.phone) {
                 failedImports.push({ row, reason: "Required field is empty." });
                continue;
            }
            if (!departmentValues.includes(row.department)) {
                 failedImports.push({ row, reason: `Invalid department: ${row.department}` });
                continue;
            }
            if (!statusValues.includes(row.status)) {
                 failedImports.push({ row, reason: `Invalid status: ${row.status}` });
                continue;
            }

            existingOpsIds.add(opsId.toLowerCase());
            workersToInsert.push({
                opsId: opsId, fullName: row.fullName, nik: row.nik.toString(), phone: row.phone.toString(),
                contractType: 'Daily Worker Vendor - NEXUS', department: row.department, status: row.status,
                createdAt: new Date().toISOString(),
            });
        }
        
        const successfulInserts: any[] = [];
        const dbSaveFailed: { row: any; reason: string }[] = [];

        if (workersToInsert.length > 0) {
            const BATCH_SIZE = 100;
            for (let i = 0; i < workersToInsert.length; i += BATCH_SIZE) {
                const batch = workersToInsert.slice(i, i + BATCH_SIZE);
                const { data, error } = await supabase.from('workers').insert(batch).select();

                if (error) {
                    batch.forEach(worker => {
                        dbSaveFailed.push({ row: worker, reason: `Database error on save: ${error.message}` });
                    });
                } else if (data) {
                    successfulInserts.push(...batch);
                }
            }
        }

        setImportResults({ success: successfulInserts, failed: [...failedImports, ...dbSaveFailed] });
        
        if (successfulInserts.length > 0) {
            refreshData();
        }
        
        setIsImportSummaryOpen(true);
        setLoadingAction(false);
    };
    reader.readAsBinaryString(file);
    event.target.value = '';
  };

  const handleCopyOpsIds = () => {
      const opsIdsToCopy = filteredWorkers.map(worker => worker.opsId).join('\n');
      if (opsIdsToCopy) {
          navigator.clipboard.writeText(opsIdsToCopy).then(() => {
              alert(`${filteredWorkers.length} OpsIDs copied to clipboard!`);
          }, (err) => {
              alert('Failed to copy OpsIDs.');
              console.error('Copy failed', err);
          });
      } else {
          alert('No OpsIDs to copy.');
      }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <h1 className="text-3xl font-bold text-gray-800">Worker Database</h1>
        <div className="flex flex-wrap gap-2">
            <button onClick={() => openEditModal(null)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors shadow-sm hover:shadow-md">
                <AddIcon /> Add New
            </button>
            <button onClick={handleCopyOpsIds} className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg transition-colors shadow-sm hover:shadow-md">
                <CopyIcon /> Salin OpsID
            </button>
            <button onClick={handleDownloadTemplate} className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg transition-colors shadow-sm hover:shadow-md">
                <DownloadIcon /> Template
            </button>
            <button onClick={() => importFileRef.current?.click()} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors shadow-sm hover:shadow-md" disabled={loadingAction}>
                <UploadIcon /> {loadingAction ? 'Importing...' : 'Import'}
            </button>
            <input type="file" ref={importFileRef} onChange={handleImport} className="hidden" accept=".xlsx, .xls" />
            <button onClick={handleExport} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition-colors shadow-sm hover:shadow-md">
                <DownloadIcon /> Export
            </button>
             <button onClick={() => setIsDeleteAllConfirmOpen(true)} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors shadow-sm hover:shadow-md">
                <DeleteIcon /> Delete All
            </button>
        </div>
      </div>
      
      <div className="bg-white p-4 rounded-lg shadow-lg border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
              <SearchIcon className="h-5 w-5 text-gray-400" />
            </span>
            <input 
              type="text"
              placeholder="Search by OpsID or Name..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 pl-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <select
              value={departmentFilter}
              onChange={e => setDepartmentFilter(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Departments</option>
              <option value="SOC Operator">SOC Operator</option>
              <option value="Cache">Cache</option>
              <option value="Return">Return</option>
              <option value="Inventory">Inventory</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200 border-t-4 border-blue-500 transition-shadow duration-300 hover:shadow-xl">
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-blue-600 text-white">
                <tr>
                  <th className="p-3 font-semibold rounded-tl-lg">OpsID</th>
                  <th className="p-3 font-semibold">Nama Lengkap</th>
                  <th className="p-3 font-semibold">Departemen</th>
                  <th className="p-3 font-semibold">Tanggal Dibuat</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3 font-semibold text-center rounded-tr-lg">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredWorkers.length > 0 ? (
                  filteredWorkers.map(worker => (
                    <tr key={worker.id} className="hover:bg-gray-50">
                      <td className="p-3">{worker.opsId}</td>
                      <td className="p-3">{worker.fullName}</td>
                      <td className="p-3">{worker.department}</td>
                      <td className="p-3">{new Date(worker.createdAt).toLocaleDateString()}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          worker.status === 'Active' ? 'bg-green-100 text-green-800' : 
                          worker.status === 'Non Active' ? 'bg-yellow-100 text-yellow-800' : 
                          'bg-red-100 text-red-800'
                          }`}>
                          {worker.status}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-center items-center gap-3">
                          <button onClick={() => openViewModal(worker)} className="text-blue-500 hover:text-blue-700"><ViewIcon /></button>
                          <button onClick={() => openEditModal(worker)} className="text-yellow-500 hover:text-yellow-700"><EditIcon /></button>
                          <button onClick={() => openDeleteConfirm(worker)} className="text-red-500 hover:text-red-700"><DeleteIcon /></button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center p-6 text-gray-500">No workers found matching your criteria.</td>
                  </tr>
                )}
              </tbody>
            </table>
        </div>
      </div>
      
      <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title="Worker Details">
        {selectedWorker && (
            <div className="space-y-2 text-gray-600">
                <p><strong>OpsID:</strong> {selectedWorker.opsId}</p>
                <p><strong>Nama Lengkap:</strong> {selectedWorker.fullName}</p>
                <p><strong>NIK:</strong> {selectedWorker.nik}</p>
                <p><strong>No HP:</strong> {selectedWorker.phone}</p>
                <p><strong>Contract Type:</strong> {selectedWorker.contractType}</p>
                <p><strong>Departemen:</strong> {selectedWorker.department}</p>
                <p><strong>Tanggal Dibuat:</strong> {new Date(selectedWorker.createdAt).toLocaleString()}</p>
                <p><strong>Status:</strong> {selectedWorker.status}</p>
            </div>
        )}
      </Modal>

       <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={selectedWorker ? "Edit Worker" : "Add New Worker"}>
        <form onSubmit={handleSaveWorker} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField label="OpsID" name="opsId" defaultValue={selectedWorker?.opsId} required />
            <InputField label="Nama Lengkap" name="fullName" defaultValue={selectedWorker?.fullName} required />
            <InputField label="NIK" name="nik" defaultValue={selectedWorker?.nik} required />
            <InputField label="No HP" name="phone" defaultValue={selectedWorker?.phone} required />
            <SelectField label="Contract Type" name="contractType" defaultValue={selectedWorker?.contractType} options={['Daily Worker Vendor - NEXUS']} required />
            <SelectField label="Departemen" name="department" defaultValue={selectedWorker?.department} options={['SOC Operator', 'Cache', 'Return', 'Inventory']} required />
            <SelectField label="Status" name="status" defaultValue={selectedWorker?.status} options={['Active', 'Non Active', 'Blacklist']} required />
            <div className="md:col-span-2 pt-4">
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors" disabled={loadingAction}>
                    {loadingAction ? 'Saving...' : 'Save Worker'}
                </button>
            </div>
        </form>
       </Modal>
       
      <Modal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} title="Confirm Deletion">
          <div>
            <p className="text-gray-600">Are you sure you want to delete worker <strong className="text-blue-600">{workerToDelete?.fullName}</strong> ({workerToDelete?.opsId})?</p>
            <p className="text-sm text-red-600 mt-2">This action cannot be undone.</p>
            <div className="flex justify-end gap-4 mt-6">
                <button onClick={() => setIsDeleteConfirmOpen(false)} className="py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold">Cancel</button>
                <button onClick={handleDeleteWorker} className="py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold" disabled={loadingAction}>
                    {loadingAction ? 'Deleting...' : 'Delete'}
                </button>
            </div>
          </div>
      </Modal>

      <Modal isOpen={isDeleteAllConfirmOpen} onClose={() => setIsDeleteAllConfirmOpen(false)} title="Confirm Deletion of ALL Workers">
          <div>
            <p className="text-gray-600">Are you sure you want to delete <strong className="text-red-600">ALL {workers.length} worker records</strong> from the database?</p>
            <p className="font-bold text-lg text-red-500 mt-4">This action is permanent and cannot be undone.</p>
            <div className="flex justify-end gap-4 mt-6">
                <button onClick={() => setIsDeleteAllConfirmOpen(false)} className="py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold">Cancel</button>
                <button onClick={handleDeleteAllWorkers} className="py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold" disabled={loadingAction}>
                    {loadingAction ? 'Deleting...' : 'Confirm Delete All'}
                </button>
            </div>
          </div>
      </Modal>
      
      <Modal isOpen={isImportSummaryOpen} onClose={() => setIsImportSummaryOpen(false)} title="Import Summary">
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <h3 className="font-semibold text-lg text-green-700">Successfully Imported ({importResults.success.length})</h3>
            <ul className="text-sm text-gray-600 list-disc pl-5 mt-2 space-y-1">
              {importResults.success.map((item, index) => <li key={index}>{item.fullName} ({item.opsId})</li>)}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-lg text-red-700">Failed to Import ({importResults.failed.length})</h3>
            <ul className="text-sm text-gray-600 list-disc pl-5 mt-2 space-y-1">
              {importResults.failed.map((item, index) => <li key={index}>{item.row.fullName || 'N/A'} ({item.row.opsId || 'N/A'}) - <span className="font-medium text-red-600">{item.reason}</span></li>)}
            </ul>
          </div>
        </div>
      </Modal>

    </div>
  );
};

const InputField: React.FC<{label: string, name: string, defaultValue?: string, required?: boolean}> = ({label, name, defaultValue, required}) => (
    <div>
        <label htmlFor={name} className="block mb-2 text-sm font-medium text-gray-700">{label}</label>
        <input type="text" id={name} name={name} defaultValue={defaultValue} required={required} className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
);

const SelectField: React.FC<{label: string, name: string, defaultValue?: string, options: string[], required?: boolean}> = ({label, name, defaultValue, options, required}) => (
    <div>
        <label htmlFor={name} className="block mb-2 text-sm font-medium text-gray-700">{label}</label>
        <select id={name} name={name} defaultValue={defaultValue} required={required} className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
    </div>
);

export default Database;