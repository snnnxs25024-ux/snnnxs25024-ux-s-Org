import React, { useState, useRef } from 'react';
// @ts-ignore
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { Worker } from '../types';
import Modal from '../components/Modal';
import ViewIcon from '../components/icons/ViewIcon';
import EditIcon from '../components/icons/EditIcon';
import DeleteIcon from '../components/icons/DeleteIcon';
import DownloadIcon from '../components/icons/DownloadIcon';
import UploadIcon from '../components/icons/UploadIcon';
import AddIcon from '../components/icons/AddIcon';


interface DatabaseProps {
  workers: Worker[];
  setWorkers: React.Dispatch<React.SetStateAction<Worker[]>>;
}

const Database: React.FC<DatabaseProps> = ({ workers, setWorkers }) => {
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [workerToDelete, setWorkerToDelete] = useState<Worker | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const openViewModal = (worker: Worker) => {
    setSelectedWorker(worker);
    setIsViewModalOpen(true);
  };
  
  const openEditModal = (worker: Worker | null) => {
    setSelectedWorker(worker); // if null, it's a new worker
    setIsEditModalOpen(true);
  };
  
  const openDeleteConfirm = (worker: Worker) => {
    setWorkerToDelete(worker);
    setIsDeleteConfirmOpen(true);
  }

  const handleSaveWorker = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const workerData: Omit<Worker, 'id' | 'createdAt'> & { id?: string } = {
        opsId: formData.get('opsId') as string,
        fullName: formData.get('fullName') as string,
        nik: formData.get('nik') as string,
        phone: formData.get('phone') as string,
        contractType: formData.get('contractType') as Worker['contractType'],
        department: formData.get('department') as Worker['department'],
        status: formData.get('status') as Worker['status'],
    };

    if (selectedWorker) { // Editing existing worker
      setWorkers(workers.map(w => w.id === selectedWorker.id ? { ...selectedWorker, ...workerData } : w));
    } else { // Adding new worker
      const newWorker: Worker = {
          ...workerData,
          id: uuidv4(),
          createdAt: new Date().toISOString(),
      };
      setWorkers([...workers, newWorker]);
    }
    setIsEditModalOpen(false);
    setSelectedWorker(null);
  };

  const handleDeleteWorker = () => {
    if(workerToDelete){
        setWorkers(workers.filter(w => w.id !== workerToDelete.id));
        setIsDeleteConfirmOpen(false);
        setWorkerToDelete(null);
    }
  }
  
  const handleDownloadTemplate = () => {
    const headers = ['opsId', 'fullName', 'nik', 'phone', 'contractType', 'department', 'status'];
    const sampleData = [{
      opsId: 'NEX999',
      fullName: 'John Doe',
      nik: '3201010101010001',
      phone: '081298765432',
      contractType: 'Daily Worker Vendor - NEXUS',
      department: 'SOC Operator',
      status: 'Active'
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
    reader.onload = (e) => {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet);

        const departmentValues: Worker['department'][] = ['SOC Operator', 'Cache', 'Return', 'Inventory'];
        const statusValues: Worker['status'][] = ['Active', 'Non Active', 'Blacklist'];
        const existingOpsIds = new Set(workers.map(w => w.opsId.toLowerCase()));
        
        let importedCount = 0;
        let skippedCount = 0;

        const newWorkers = json.reduce<Worker[]>((acc, row) => {
            const opsId = row.opsId?.toString().trim();
            if (!opsId || existingOpsIds.has(opsId.toLowerCase()) || acc.some(w => w.opsId.toLowerCase() === opsId.toLowerCase())) {
                skippedCount++;
                return acc;
            }

            if (!row.fullName || !row.nik || !row.phone || !departmentValues.includes(row.department) || !statusValues.includes(row.status)) {
                skippedCount++;
                return acc;
            }
            
            existingOpsIds.add(opsId.toLowerCase());
            importedCount++;

            acc.push({
                id: uuidv4(),
                opsId: opsId,
                fullName: row.fullName,
                nik: row.nik.toString(),
                phone: row.phone.toString(),
                contractType: 'Daily Worker Vendor - NEXUS',
                department: row.department,
                status: row.status,
                createdAt: new Date().toISOString(),
            });

            return acc;
        }, []);

        if (newWorkers.length > 0) {
            setWorkers(prev => [...prev, ...newWorkers]);
        }
        
        alert(`Import Complete!\nSuccessfully imported: ${importedCount}\nSkipped (duplicates or invalid data): ${skippedCount}`);
    };
    reader.readAsBinaryString(file);
    event.target.value = ''; // Reset file input
  };


  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
        <h1 className="text-4xl font-bold text-white">Worker Database</h1>
        <div className="flex flex-wrap gap-2">
            <button onClick={() => openEditModal(null)} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                <AddIcon /> Add New
            </button>
            <button onClick={handleDownloadTemplate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                <DownloadIcon /> Template
            </button>
            <button onClick={() => importFileRef.current?.click()} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                <UploadIcon /> Import
            </button>
            <input type="file" ref={importFileRef} onChange={handleImport} className="hidden" accept=".xlsx, .xls" />
            <button onClick={handleExport} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                <DownloadIcon /> Export
            </button>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden border border-gray-700">
        <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-700">
                <tr>
                  <th className="p-3">OpsID</th>
                  <th className="p-3">Nama Lengkap</th>
                  <th className="p-3">Departemen</th>
                  <th className="p-3">Tanggal Dibuat</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {workers.map(worker => (
                  <tr key={worker.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="p-3">{worker.opsId}</td>
                    <td className="p-3">{worker.fullName}</td>
                    <td className="p-3">{worker.department}</td>
                    <td className="p-3">{new Date(worker.createdAt).toLocaleDateString()}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        worker.status === 'Active' ? 'bg-green-500/20 text-green-400' : 
                        worker.status === 'Non Active' ? 'bg-yellow-500/20 text-yellow-400' : 
                        'bg-red-500/20 text-red-400'
                        }`}>
                        {worker.status}
                      </span>
                    </td>
                    <td className="p-3 flex justify-center items-center gap-3">
                        <button onClick={() => openViewModal(worker)} className="text-blue-400 hover:text-blue-300"><ViewIcon /></button>
                        <button onClick={() => openEditModal(worker)} className="text-yellow-400 hover:text-yellow-300"><EditIcon /></button>
                        <button onClick={() => openDeleteConfirm(worker)} className="text-red-400 hover:text-red-300"><DeleteIcon /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
      </div>
      
      {/* View Worker Modal */}
      <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title="Worker Details">
        {selectedWorker && (
            <div className="space-y-3 text-gray-300">
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

      {/* Edit/Add Worker Modal */}
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
                <button type="submit" className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-lg transition-colors">
                    Save Worker
                </button>
            </div>
        </form>
       </Modal>
       
      {/* Delete Confirmation Modal */}
      <Modal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} title="Confirm Deletion">
          <div className="text-gray-300">
            <p>Are you sure you want to delete worker <strong className="text-teal-400">{workerToDelete?.fullName}</strong> ({workerToDelete?.opsId})?</p>
            <p className="text-sm text-red-400 mt-2">This action cannot be undone.</p>
            <div className="flex justify-end gap-4 mt-6">
                <button onClick={() => setIsDeleteConfirmOpen(false)} className="py-2 px-4 bg-gray-600 hover:bg-gray-500 rounded-lg">Cancel</button>
                <button onClick={handleDeleteWorker} className="py-2 px-4 bg-red-600 hover:bg-red-500 rounded-lg">Delete</button>
            </div>
          </div>
      </Modal>

    </div>
  );
};

// Helper components for form fields
const InputField: React.FC<{label: string, name: string, defaultValue?: string, required?: boolean}> = ({label, name, defaultValue, required}) => (
    <div>
        <label htmlFor={name} className="block mb-2 text-sm font-medium text-gray-300">{label}</label>
        <input type="text" id={name} name={name} defaultValue={defaultValue} required={required} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
    </div>
);

const SelectField: React.FC<{label: string, name: string, defaultValue?: string, options: string[], required?: boolean}> = ({label, name, defaultValue, options, required}) => (
    <div>
        <label htmlFor={name} className="block mb-2 text-sm font-medium text-gray-300">{label}</label>
        <select id={name} name={name} defaultValue={defaultValue} required={required} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500">
            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
    </div>
);


export default Database;
