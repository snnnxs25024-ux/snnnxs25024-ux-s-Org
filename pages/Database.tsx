
import React, { useState, useRef, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';
import { Worker } from '../types';
import Modal from '../components/Modal';
import ViewIcon from '../components/icons/ViewIcon';
import EditIcon from '../components/icons/EditIcon';
import DeleteIcon from '../components/icons/DeleteIcon';
import DownloadIcon from '../components/icons/DownloadIcon';
import UploadIcon from '../components/icons/UploadIcon';
import AddIcon from '../components/icons/AddIcon';
import PrintIcon from '../components/icons/PrintIcon';
import { supabase } from '../lib/supabaseClient';
import CopyIcon from '../components/icons/CopyIcon';
import SearchIcon from '../components/icons/SearchIcon';
import { useToast } from '../hooks/useToast';

// Helper Icon Components for the new Worker Detail Card
import IdCardIcon from '../components/icons/IdCardIcon';
import PhoneIcon from '../components/icons/PhoneIcon';

// Helper function to get initials from a name
const getInitials = (name: string) => {
  if (!name) return '?';
  const names = name.split(' ');
  if (names.length === 1) return names[0].charAt(0).toUpperCase();
  return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
};

interface DatabaseProps {
  workers: Worker[];
  refreshData: () => void;
}

// Helper Components
const InputField = ({ label, name, type = "text", defaultValue, required = false, ...props }: any) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <input 
      type={type} 
      name={name} 
      defaultValue={defaultValue} 
      required={required}
      className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
      {...props}
    />
  </div>
);

const SelectField = ({ label, name, defaultValue, options, required = false }: any) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <select 
      name={name} 
      defaultValue={defaultValue} 
      required={required}
      className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="">Select {label}</option>
      {options.map((opt: string) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  </div>
);

const Database: React.FC<DatabaseProps> = ({ workers, refreshData }) => {
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleteAllConfirmOpen, setIsDeleteAllConfirmOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [workerToDelete, setWorkerToDelete] = useState<Worker | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [importResults, setImportResults] = useState<{success: any[], failed: any[]}>({success: [], failed: []});
  const [isImportSummaryOpen, setIsImportSummaryOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [divisionOpts, setDivisionOpts] = useState<string[]>([]);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [viewQrCodeUrl, setViewQrCodeUrl] = useState('');
  const importFileRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  // Fetch Divisions for Dropdown & Validation
  useEffect(() => {
    const fetchDivisions = async () => {
        const { data } = await supabase.from('master_data').select('value').eq('category', 'DIVISION').order('value', { ascending: true });
        if (data && data.length > 0) {
            setDivisionOpts(data.map(d => d.value));
        } else {
            setDivisionOpts(['SOC Operator', 'Cache', 'Return', 'Inventory']);
        }
    };
    fetchDivisions();
  }, []);

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
  
  // QR Code Generation for the new View Modal
  useEffect(() => {
    if (isViewModalOpen && selectedWorker?.opsId) {
        const generateQrWithLogo = async (opsId: string) => {
            try {
                const canvas = document.createElement('canvas');
                await QRCode.toCanvas(canvas, opsId, { width: 256, margin: 2, errorCorrectionLevel: 'H' });
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    setViewQrCodeUrl(canvas.toDataURL());
                    return;
                }
                const logo = new Image();
                logo.crossOrigin = 'Anonymous';
                logo.src = 'https://i.imgur.com/lie9EMX.png';
                logo.onload = () => {
                    const logoSize = canvas.width * 0.25;
                    const logoX = (canvas.width - logoSize) / 2;
                    const logoY = (canvas.height - logoSize) / 2;
                    ctx.fillStyle = 'white';
                    ctx.beginPath();
                    if (ctx.roundRect) {
                        ctx.roundRect(logoX - 5, logoY - 5, logoSize + 10, logoSize + 10, 8);
                    } else {
                        ctx.rect(logoX - 5, logoY - 5, logoSize + 10, logoSize + 10);
                    }
                    ctx.fill();
                    ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
                    setViewQrCodeUrl(canvas.toDataURL('image/png'));
                };
                logo.onerror = () => setViewQrCodeUrl(canvas.toDataURL('image/png'));
            } catch (err) {
                console.error("Error generating QR for view modal", err);
            }
        };
        generateQrWithLogo(selectedWorker.opsId);
    }
}, [isViewModalOpen, selectedWorker]);

  const statusBadge = useMemo(() => {
    if (!selectedWorker) return { bg: '', text: '', border: '' };
    switch (selectedWorker.status) {
        case 'Active': return { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' };
        case 'Blacklist': return { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200' };
        case 'Non Active': return { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200' };
        default: return { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200' };
    }
  }, [selectedWorker]);

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text).then(() => {
        showToast(`${fieldName} disalin ke clipboard.`, { type: 'success', title: 'Tersalin!' });
    }, (err) => {
        showToast(`Gagal menyalin ${fieldName}.`, { type: 'error', title: 'Error' });
    });
  };

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

  const openQrModal = (worker: Worker) => {
    setSelectedWorker(worker);
    setQrCodeUrl('');
    setIsQrModalOpen(true);

    const generateQrWithLogo = async (opsId: string) => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 300;
            canvas.height = 300;

            await QRCode.toCanvas(canvas, opsId, {
                width: 300,
                margin: 2,
                errorCorrectionLevel: 'H'
            });

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                setQrCodeUrl(canvas.toDataURL());
                return;
            };

            const logo = new Image();
            logo.crossOrigin = 'Anonymous';
            logo.src = 'https://i.imgur.com/lie9EMX.png';

            logo.onload = () => {
                const logoSize = canvas.width * 0.25;
                const logoX = (canvas.width - logoSize) / 2;
                const logoY = (canvas.height - logoSize) / 2;
                
                ctx.fillStyle = 'white';
                ctx.beginPath();
                 if (ctx.roundRect) {
                    ctx.roundRect(logoX - 5, logoY - 5, logoSize + 10, logoSize + 10, 8);
                } else {
                    ctx.rect(logoX - 5, logoY - 5, logoSize + 10, logoSize + 10);
                }
                ctx.fill();
                
                ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
                setQrCodeUrl(canvas.toDataURL('image/png'));
            };

            logo.onerror = () => {
                console.error("Logo could not be loaded.");
                setQrCodeUrl(canvas.toDataURL('image/png'));
            };
        } catch (err) {
            console.error("Error generating QR", err);
        }
    };

    if (worker.opsId) {
        generateQrWithLogo(worker.opsId);
    }
  }

  const handlePrintQr = () => {
      window.print();
  };

  const handleDownloadQrReceipt = async () => {
    if (!qrCodeUrl || !selectedWorker) return;

    const scale = 2; // For higher resolution
    const canvas = document.createElement('canvas');
    const width = 400;
    const height = 550;
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        showToast('Gagal membuat gambar.', { type: 'error', title: 'Error' });
        return;
    }
    ctx.scale(scale, scale);

    const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });

    try {
        const [topLogoImg, qrImg] = await Promise.all([
            loadImage('https://i.imgur.com/lie9EMX.png'), // Main branding logo
            loadImage(qrCodeUrl) // The generated QR code with embedded logo
        ]);

        // --- Drawing a professional ID card ---
        // 1. Card Background & Border
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = '#e5e7eb'; // light gray border
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, width, height);

        // 2. Top Branding Logo
        const topLogoHeight = 35;
        const topLogoWidth = topLogoHeight * (topLogoImg.width / topLogoImg.height);
        ctx.drawImage(topLogoImg, (width - topLogoWidth) / 2, 40, topLogoWidth, topLogoHeight);

        // 3. QR Code
        const qrSize = 220;
        ctx.drawImage(qrImg, (width - qrSize) / 2, 95, qrSize, qrSize);

        // 4. Separator Line
        ctx.beginPath();
        ctx.moveTo(40, 345);
        ctx.lineTo(width - 40, 345);
        ctx.strokeStyle = '#f1f5f9'; // very light gray
        ctx.lineWidth = 3;
        ctx.stroke();

        // 5. Text information
        ctx.textAlign = 'center';

        // Full Name (Bold and large)
        ctx.font = `900 32px 'Inter', sans-serif`;
        ctx.fillStyle = '#111827';
        ctx.fillText(selectedWorker.fullName, width / 2, 395);

        // Ops ID (Medium, gray)
        ctx.font = `500 18px 'Inter', sans-serif`;
        ctx.fillStyle = '#6b7280';
        ctx.fillText(selectedWorker.opsId, width / 2, 430);

        // Department (Lighter gray)
        ctx.font = `500 16px 'Inter', sans-serif`;
        ctx.fillStyle = '#9ca3af';
        ctx.fillText(selectedWorker.department, width / 2, 460);

        // --- Trigger Download ---
        const link = document.createElement('a');
        const safeName = selectedWorker.fullName.replace(/[^a-zA-Z0-9]/g, '_');
        link.download = `ID_Card_${safeName}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

    } catch (error) {
        console.error("Failed to load images for download:", error);
        showToast('Gagal memuat gambar untuk diunduh.', { type: 'error', title: 'Error' });
    }
  };

  const handleSaveWorker = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoadingAction(true);
    const formData = new FormData(e.currentTarget);
    const workerData = {
        ops_id: formData.get('opsId') as string,
        full_name: formData.get('fullName') as string,
        nik: formData.get('nik') as string,
        phone: formData.get('phone') as string,
        contract_type: formData.get('contractType') as Worker['contractType'],
        department: formData.get('department') as string,
        status: formData.get('status') as Worker['status'],
    };
    
    let error;
    if (selectedWorker) {
      const { error: updateError } = await supabase.from('workers').update(workerData).eq('id', selectedWorker.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from('workers').insert([{ ...workerData, created_at: new Date().toISOString() }]);
      error = insertError;
    }
    
    setLoadingAction(false);
    if (error) {
        showToast(`Error: ${error.message}`, { type: 'error', title: 'Gagal Menyimpan' });
    } else {
      setIsEditModalOpen(false);
      setSelectedWorker(null);
      showToast('Data karyawan berhasil disimpan.', { type: 'success', title: 'Berhasil' });
      refreshData();
    }
  };

  const handleDeleteWorker = async () => {
    if(workerToDelete && workerToDelete.id){
        setLoadingAction(true);
        const { error } = await supabase.from('workers').delete().eq('id', workerToDelete.id);
        setLoadingAction(false);
        if (error) {
            showToast(`Error: ${error.message}`, { type: 'error', title: 'Gagal Menghapus' });
        } else {
            setIsDeleteConfirmOpen(false);
            setWorkerToDelete(null);
            showToast(`${workerToDelete.fullName} berhasil dihapus.`, { type: 'success', title: 'Berhasil Dihapus' });
            refreshData();
        }
    }
  }

  const handleDeleteAllWorkers = async () => {
    setLoadingAction(true);
    const { error } = await supabase.from('workers').delete().not('id', 'is', null);
    setLoadingAction(false);
    if (error) {
        showToast(`Error: ${error.message}`, { type: 'error', title: 'Gagal Reset' });
    } else {
      showToast('Semua data karyawan berhasil dihapus.', { type: 'success', title: 'Database Direset' });
      setIsDeleteAllConfirmOpen(false);
      refreshData();
    }
  };
  
  const handleDownloadTemplate = () => {
    const headers = ['opsId', 'fullName', 'nik', 'phone', 'contractType', 'department', 'status'];
    const sampleData = [{ opsId: 'OPS999', fullName: 'John Doe', nik: '3201010101010001', phone: '081298765432',
      contractType: 'Daily Worker Vendor', department: 'SOC Operator', status: 'Active'
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

        const departmentValues = divisionOpts;
        const statusValues: Worker['status'][] = ['Active', 'Non Active', 'Blacklist'];
        const existingOpsIds = new Set(workers.map(w => w.opsId.toLowerCase()));
        
        const workersToInsert: any[] = [];
        const failedImports: { row: any; reason: string }[] = [];

        for (const row of json) {
            const opsId = row.opsId?.toString().trim();
            if (!opsId) { failedImports.push({ row, reason: "OpsID is missing." }); continue; }
            if (existingOpsIds.has(opsId.toLowerCase())) { failedImports.push({ row, reason: "Duplicate OpsID." }); continue; }
            if (!row.fullName || !row.nik || !row.phone) { failedImports.push({ row, reason: "Required field is empty." }); continue; }
            
            // Validate against dynamic divisions (case-insensitive)
            if (!departmentValues.some(d => d.toLowerCase() === row.department?.toLowerCase())) {
                 failedImports.push({ row, reason: `Invalid department: ${row.department}` });
                continue;
            }
            if (!statusValues.includes(row.status)) { failedImports.push({ row, reason: `Invalid status: ${row.status}` }); continue; }

            existingOpsIds.add(opsId.toLowerCase());
            // Normalize department casing
            const matchedDept = departmentValues.find(d => d.toLowerCase() === row.department?.toLowerCase()) || row.department;

            workersToInsert.push({
                ops_id: opsId, 
                full_name: row.fullName, 
                nik: row.nik.toString(), 
                phone: row.phone.toString(),
                contract_type: 'Daily Worker Vendor', 
                department: matchedDept, 
                status: row.status,
                created_at: new Date().toISOString(),
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
                        dbSaveFailed.push({ row: worker, reason: `DB Error: ${error.message}` });
                    });
                } else if (data) {
                    successfulInserts.push(...data);
                }
            }
        }

        setImportResults({
            success: successfulInserts,
            failed: [...failedImports, ...dbSaveFailed]
        });
        
        if (successfulInserts.length > 0) {
            showToast(`${successfulInserts.length} data berhasil diimpor.`, { type: 'success', title: 'Impor Berhasil' });
            refreshData();
        }
        if (failedImports.length > 0 || dbSaveFailed.length > 0) {
            showToast(`${failedImports.length + dbSaveFailed.length} data gagal diimpor. Cek summary.`, { type: 'error', title: 'Impor Gagal Sebagian' });
        }
        
        setLoadingAction(false);
        setIsImportSummaryOpen(true);
        if (importFileRef.current) importFileRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <h1 className="text-3xl font-bold text-gray-800">Database Karyawan</h1>
        <div className="flex flex-wrap gap-2">
            <button 
                onClick={() => openEditModal(null)} 
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm hover:shadow-md transition-all"
            >
                <AddIcon /> <span className="hidden sm:inline">Add New</span>
            </button>
            <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2 bg-white hover:bg-gray-100 text-gray-700 font-bold py-2 px-4 rounded-lg shadow-sm hover:shadow-md transition-all border border-gray-300"
            >
                <DownloadIcon /> <span className="hidden sm:inline">Download Template</span>
            </button>
            <button 
                onClick={() => importFileRef.current?.click()}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm hover:shadow-md transition-all"
            >
                <UploadIcon /> <span className="hidden sm:inline">Import Excel</span>
            </button>
            <input type="file" ref={importFileRef} onChange={handleImport} accept=".xlsx, .xls" className="hidden" />
            <button onClick={handleExport} className="flex items-center gap-2 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg shadow-sm hover:shadow-md transition-all">
                <DownloadIcon /> <span className="hidden sm:inline">Export</span>
            </button>
             <button onClick={() => setIsDeleteAllConfirmOpen(true)} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm hover:shadow-md transition-all">
                <DeleteIcon /> <span className="hidden sm:inline">Reset DB</span>
            </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <SearchIcon className="h-5 w-5 text-gray-400" />
             </div>
            <input
              type="text"
              placeholder="Search by OpsID or Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="All">All Divisions</option>
            {divisionOpts.map(div => <option key={div} value={div}>{div}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
            <thead className="bg-blue-600 text-white uppercase font-semibold">
                <tr>
                <th className="p-4">OpsID</th>
                <th className="p-4">Full Name</th>
                <th className="p-4 hidden md:table-cell">Division</th>
                <th className="p-4 hidden lg:table-cell">Status</th>
                <th className="p-4 text-center">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
                {filteredWorkers.map((worker) => (
                <tr key={worker.id} className="hover:bg-blue-50 transition-colors">
                    <td className="p-4 font-mono font-medium text-black">{worker.opsId}</td>
                    <td className="p-4 font-semibold text-gray-800">{worker.fullName}</td>
                    <td className="p-4 hidden md:table-cell">{worker.department}</td>
                    <td className="p-4 hidden lg:table-cell">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${worker.status === 'Active' ? 'bg-green-100 text-green-800' : worker.status === 'Blacklist' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                            {worker.status}
                        </span>
                    </td>
                    <td className="p-4">
                    <div className="flex justify-center items-center gap-2">
                        <button onClick={() => openQrModal(worker)} className="text-gray-500 hover:text-black p-1 transition-colors" title="QR Code"><PrintIcon /></button>
                        <button onClick={() => openViewModal(worker)} className="text-blue-500 hover:text-blue-700 p-1 transition-colors" title="View Details"><ViewIcon /></button>
                        <button onClick={() => openEditModal(worker)} className="text-yellow-500 hover:text-yellow-700 p-1 transition-colors" title="Edit"><EditIcon /></button>
                        <button onClick={() => openDeleteConfirm(worker)} className="text-red-500 hover:text-red-700 p-1 transition-colors" title="Delete"><DeleteIcon /></button>
                    </div>
                    </td>
                </tr>
                ))}
                {filteredWorkers.length === 0 && (
                    <tr>
                        <td colSpan={5} className="p-8 text-center text-gray-500">No workers found matching your criteria.</td>
                    </tr>
                )}
            </tbody>
            </table>
        </div>
      </div>
      
      {/* New Worker Detail Modal */}
      <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title="Detail Karyawan" size="lg" scrollable={false}>
        {selectedWorker && (
            <div className="font-sans flex flex-col">
                {/* Header */}
                <div className="relative flex justify-between items-start px-6 pt-4 pb-3 bg-gray-50 rounded-t-lg">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 tracking-tight">{selectedWorker.fullName}</h2>
                        <p className="text-base font-mono text-blue-600 select-all">{selectedWorker.opsId}</p>
                    </div>
                    <span className={`px-3 py-1 text-xs font-black uppercase tracking-widest rounded-full ${statusBadge.bg} ${statusBadge.text} border ${statusBadge.border}`}>
                        {selectedWorker.status}
                    </span>
                </div>

                {/* Main Content */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 px-6 py-6">
                    {/* Left Column: Info */}
                    <div className="space-y-5">
                        <div className="flex items-center gap-4">
                            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center shrink-0 border-4 border-white ring-2 ring-blue-200">
                                <span className="text-3xl font-bold text-blue-600">{getInitials(selectedWorker.fullName)}</span>
                            </div>
                            <div>
                                <p className="font-bold text-gray-700 text-lg">{selectedWorker.department}</p>
                                <p className="text-sm text-gray-500">{selectedWorker.contractType}</p>
                            </div>
                        </div>

                        <div className="space-y-4 border-t border-gray-100 pt-4">
                            <div className="flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                    <IdCardIcon className="text-gray-400" />
                                    <div>
                                        <p className="text-xs text-gray-500">NIK KTP</p>
                                        <p className="text-gray-700 font-mono font-medium">{selectedWorker.nik}</p>
                                    </div>
                                </div>
                                <button onClick={() => handleCopy(selectedWorker.nik, 'NIK')} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 transition-opacity p-2 rounded-lg hover:bg-blue-50">
                                    <CopyIcon />
                                </button>
                            </div>
                            <div className="flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                    <PhoneIcon className="text-gray-400" />
                                    <div>
                                        <p className="text-xs text-gray-500">Phone / WA</p>
                                        <p className="text-gray-700 font-mono font-medium">{selectedWorker.phone}</p>
                                    </div>
                                </div>
                                <button onClick={() => handleCopy(selectedWorker.phone, 'No. Telepon')} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 transition-opacity p-2 rounded-lg hover:bg-blue-50">
                                    <CopyIcon />
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    {/* Right Column: QR Code */}
                    <div className="flex flex-col items-center justify-center bg-gray-50 p-4 rounded-xl border border-dashed">
                        {viewQrCodeUrl ? (
                            <img src={viewQrCodeUrl} alt="QR Code" className="w-44 h-44 rounded-lg" />
                        ) : (
                            <div className="w-44 h-44 bg-gray-200 animate-pulse rounded-lg flex items-center justify-center text-xs text-gray-400">Generating QR...</div>
                        )}
                        <p className="mt-3 text-xs text-gray-500 font-semibold uppercase tracking-wider">Scan for Quick Actions</p>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex justify-end gap-3 p-4 mt-2 border-t bg-gray-50 rounded-b-lg">
                    <button onClick={() => { openEditModal(selectedWorker); setIsViewModalOpen(false); }} className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors">
                        <EditIcon /> Edit
                    </button>
                    <button onClick={() => { openDeleteConfirm(selectedWorker); setIsViewModalOpen(false); }} className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-red-600 bg-red-100 rounded-lg hover:bg-red-200 transition-colors">
                        <DeleteIcon /> Delete
                    </button>
                    <button onClick={() => openQrModal(selectedWorker!)} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                        <PrintIcon /> Print ID Card
                    </button>
                </div>
            </div>
        )}
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={selectedWorker ? "Edit Worker" : "Add New Worker"}>
        <form onSubmit={handleSaveWorker} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField label="OpsID" name="opsId" defaultValue={selectedWorker?.opsId} required placeholder="e.g. OPS001" />
                <InputField label="Full Name" name="fullName" defaultValue={selectedWorker?.fullName} required placeholder="e.g. John Doe" />
                <InputField label="NIK KTP" name="nik" defaultValue={selectedWorker?.nik} required type="number" placeholder="16 digits" />
                <InputField label="Phone Number" name="phone" defaultValue={selectedWorker?.phone} required type="tel" placeholder="e.g. 0812..." />
                
                <SelectField 
                    label="Contract Type" 
                    name="contractType" 
                    defaultValue={selectedWorker?.contractType || "Daily Worker Vendor"} 
                    options={["Daily Worker Vendor"]} 
                    required 
                />
                
                <SelectField 
                    label="Division" 
                    name="department" 
                    defaultValue={selectedWorker?.department} 
                    options={divisionOpts} 
                    required 
                />

                <SelectField 
                    label="Status" 
                    name="status" 
                    defaultValue={selectedWorker?.status || "Active"} 
                    options={["Active", "Non Active", "Blacklist"]} 
                    required 
                />
            </div>
            <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-gray-100">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium transition-colors">Cancel</button>
                <button type="submit" disabled={loadingAction} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold transition-colors shadow-lg shadow-blue-200">
                    {loadingAction ? 'Saving...' : 'Save Worker'}
                </button>
            </div>
        </form>
      </Modal>

      <Modal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} title="Confirm Deletion" size="sm">
        {workerToDelete && (
            <div>
                <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
                    <p className="text-red-700">Are you sure you want to delete <strong>{workerToDelete.fullName}</strong> ({workerToDelete.opsId})?</p>
                    <p className="text-sm text-red-600 mt-1">This action cannot be undone.</p>
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={() => setIsDeleteConfirmOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium">Cancel</button>
                    <button onClick={handleDeleteWorker} disabled={loadingAction} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold shadow-lg shadow-red-200">
                        {loadingAction ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                </div>
            </div>
        )}
      </Modal>

      <Modal isOpen={isDeleteAllConfirmOpen} onClose={() => setIsDeleteAllConfirmOpen(false)} title="DANGER ZONE: Reset Database" size="md">
        <div>
            <div className="bg-red-100 border-l-4 border-red-600 p-4 mb-6">
                <h3 className="text-red-800 font-bold text-lg mb-2">WARNING: IRREVERSIBLE ACTION</h3>
                <p className="text-red-700">You are about to delete <strong>ALL WORKER DATA</strong> from the database.</p>
                <p className="text-red-700 mt-2">This will remove all employee records permanently. Attendance history might be affected if linked to deleted workers.</p>
                <p className="text-red-800 font-bold mt-2">Are you absolutely sure?</p>
            </div>
            <div className="flex justify-end gap-3">
                <button onClick={() => setIsDeleteAllConfirmOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium">Cancel</button>
                <button onClick={handleDeleteAllWorkers} disabled={loadingAction} className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold shadow-lg shadow-red-200">
                    {loadingAction ? 'Reseting...' : 'CONFIRM RESET ALL'}
                </button>
            </div>
        </div>
      </Modal>

      <Modal isOpen={isImportSummaryOpen} onClose={() => setIsImportSummaryOpen(false)} title="Import Summary" size="lg">
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 p-4 rounded-lg border border-green-200 text-center">
                    <p className="text-green-800 font-bold text-2xl">{importResults.success.length}</p>
                    <p className="text-green-600 text-sm">Successfully Imported</p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg border border-red-200 text-center">
                    <p className="text-red-800 font-bold text-2xl">{importResults.failed.length}</p>
                    <p className="text-red-600 text-sm">Failed / Skipped</p>
                </div>
            </div>
            
            {importResults.failed.length > 0 && (
                <div className="mt-4">
                    <h4 className="font-bold text-gray-700 mb-2">Failed Items Details:</h4>
                    <div className="bg-gray-50 rounded-lg border border-gray-200 max-h-48 overflow-y-auto p-2">
                        <table className="w-full text-xs text-left">
                            <thead className="text-gray-500 border-b">
                                <tr>
                                    <th className="p-1">OpsID</th>
                                    <th className="p-1">Name</th>
                                    <th className="p-1">Reason</th>
                                </tr>
                            </thead>
                            <tbody>
                                {importResults.failed.map((fail, idx) => (
                                    <tr key={idx} className="border-b border-gray-100 last:border-0">
                                        <td className="p-1 font-mono">{fail.row.opsId || '-'}</td>
                                        <td className="p-1">{fail.row.fullName || '-'}</td>
                                        <td className="p-1 text-red-600">{fail.reason}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
            <div className="flex justify-end pt-2">
                <button onClick={() => setIsImportSummaryOpen(false)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold">Done</button>
            </div>
        </div>
      </Modal>

      <Modal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} title="Employee QR Code" size="md">
        {selectedWorker && (
            <div className="flex flex-col items-center justify-center p-4">
                <div id="printable-qr" className="flex flex-col items-center text-center">
                    <h1 className="text-xl font-bold mb-2 hidden print:block text-black">ABSENIN</h1>
                    <div className="relative bg-white p-2 rounded-lg border border-gray-200 print:border-0 flex flex-col items-center">
                        {qrCodeUrl ? (
                            <img src={qrCodeUrl} alt={`QR Code for ${selectedWorker.opsId}`} className="w-64 h-auto max-w-full object-contain print:w-48 print:h-48" />
                        ) : (
                            <div className="w-64 h-64 flex items-center justify-center text-gray-400 bg-gray-50 rounded animate-pulse">Generating QR...</div>
                        )}
                    </div>
                    <div className="mt-6 text-center">
                        <h2 className="text-2xl font-bold text-gray-800 print:text-black print:text-xl">{selectedWorker.fullName}</h2>
                        <p className="text-lg text-black font-mono tracking-wider mt-1 print:text-black print:text-lg">{selectedWorker.opsId}</p>
                        <p className="text-sm text-gray-500 mt-2 print:block print:text-black print:text-sm">{selectedWorker.department}</p>
                    </div>
                </div>

                <div className="mt-8 flex gap-3 print:hidden no-print">
                    <button onClick={handlePrintQr} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white font-bold py-2 px-6 rounded-lg transition-colors shadow-lg">
                        <PrintIcon /> Print Struk
                    </button>
                     <button onClick={handleDownloadQrReceipt} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors shadow-lg">
                        <DownloadIcon /> Save Image
                    </button>
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

export default Database;
