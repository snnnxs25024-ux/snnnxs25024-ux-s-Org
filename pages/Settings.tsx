
import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabaseClient';
import { MasterData } from '../types';
import DeleteIcon from '../components/icons/DeleteIcon';
import AddIcon from '../components/icons/AddIcon';
import UploadIcon from '../components/icons/UploadIcon';
import DownloadIcon from '../components/icons/DownloadIcon';

const Settings: React.FC = () => {
    const [divisions, setDivisions] = useState<MasterData[]>([]);
    const [shiftTimes, setShiftTimes] = useState<MasterData[]>([]);
    const [shiftIds, setShiftIds] = useState<MasterData[]>([]);
    const [loading, setLoading] = useState(true);
    const [newItemValue, setNewItemValue] = useState('');
    const [activeTab, setActiveTab] = useState<'DIVISION' | 'SHIFT_TIME' | 'SHIFT_ID'>('DIVISION');
    const [actionLoading, setActionLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchMasterData();
    }, []);

    const fetchMasterData = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('master_data').select('*').order('value', { ascending: true });
        if (data) {
            setDivisions(data.filter(d => d.category === 'DIVISION'));
            setShiftTimes(data.filter(d => d.category === 'SHIFT_TIME'));
            setShiftIds(data.filter(d => d.category === 'SHIFT_ID'));
        }
        if (error) {
            console.error("Error fetching master data (Make sure table 'master_data' exists):", error);
        }
        setLoading(false);
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newItemValue.trim()) return;
        
        setActionLoading(true);
        const { data, error } = await supabase.from('master_data').insert({
            category: activeTab,
            value: newItemValue.trim()
        }).select().single();

        if (error) {
            alert("Gagal menambah data: " + error.message);
        } else if (data) {
            setNewItemValue('');
            updateLocalState(data, 'add');
        }
        setActionLoading(false);
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm("Yakin hapus data ini?")) return;
        
        setActionLoading(true);
        const { error } = await supabase.from('master_data').delete().eq('id', id);
        
        if (error) {
            alert("Gagal menghapus: " + error.message);
        } else {
            updateLocalState({ id, category: activeTab, value: '' }, 'delete');
        }
        setActionLoading(false);
    };

    const updateLocalState = (item: MasterData, action: 'add' | 'delete') => {
        const listMap = {
            'DIVISION': { get: divisions, set: setDivisions },
            'SHIFT_TIME': { get: shiftTimes, set: setShiftTimes },
            'SHIFT_ID': { get: shiftIds, set: setShiftIds }
        };
        
        const target = listMap[item.category];
        if (!target) return;

        if (action === 'add') {
            target.set([...target.get, item].sort((a, b) => a.value.localeCompare(b.value)));
        } else {
            target.set(target.get.filter(d => d.id !== item.id));
        }
    };

    const handleDownloadTemplate = () => {
        const exampleValue = activeTab === 'DIVISION' ? 'NAMA DIVISI BARU' 
                           : activeTab === 'SHIFT_TIME' ? '08:00 - 17:00' 
                           : 'SOCSTROPSxxxx';
        
        const data = [
            { value: exampleValue },
            { value: 'Data Lainnya...' }
        ];
        
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
        XLSX.writeFile(workbook, `Template_Import_${activeTab}.xlsx`);
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            setActionLoading(true);
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws) as { value: string }[];

                if (data.length === 0) {
                    alert("File kosong atau format salah. Pastikan ada kolom 'value'.");
                    setActionLoading(false);
                    return;
                }

                // Get current list to check duplicates locally first
                const currentList = activeTab === 'DIVISION' ? divisions 
                                  : activeTab === 'SHIFT_TIME' ? shiftTimes 
                                  : shiftIds;
                
                const existingValues = new Set(currentList.map(item => item.value.toLowerCase()));
                
                const toInsert = data
                    .map(row => row.value ? String(row.value).trim() : '')
                    .filter(val => val !== '' && !existingValues.has(val.toLowerCase()))
                    .map(val => ({
                        category: activeTab,
                        value: val
                    }));

                // Remove duplicates within the import file itself
                const uniqueToInsert = toInsert.filter((v, i, a) => a.findIndex(t => t.value.toLowerCase() === v.value.toLowerCase()) === i);

                if (uniqueToInsert.length === 0) {
                    alert("Tidak ada data baru untuk diimpor (semua data mungkin sudah ada).");
                } else {
                    const { data: insertedData, error } = await supabase.from('master_data').insert(uniqueToInsert).select();
                    
                    if (error) throw error;
                    
                    if (insertedData) {
                        alert(`Berhasil mengimpor ${insertedData.length} data baru.`);
                        // Refresh data manually to ensure sync
                        fetchMasterData();
                    }
                }
            } catch (err: any) {
                alert("Gagal import: " + err.message);
                console.error(err);
            } finally {
                setActionLoading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const renderList = (items: MasterData[]) => (
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <ul className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                {items.length === 0 ? (
                    <li className="p-4 text-center text-gray-400 italic">Belum ada data. Tambahkan di atas.</li>
                ) : (
                    items.map(item => (
                        <li key={item.id} className="p-3 flex justify-between items-center hover:bg-gray-50">
                            <span className="font-medium text-gray-700">{item.value}</span>
                            <button 
                                onClick={() => handleDelete(item.id)} 
                                disabled={actionLoading}
                                className="text-red-400 hover:text-red-600 p-1 rounded-full hover:bg-red-50 transition-colors"
                            >
                                <DeleteIcon />
                            </button>
                        </li>
                    ))
                )}
            </ul>
        </div>
    );

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-800">Pengaturan Master Data</h1>
            <p className="text-gray-500">Kelola daftar pilihan Divisi, Jam Shift, dan Shift ID agar muncul di menu Absensi.</p>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                {/* Tabs */}
                <div className="flex border-b border-gray-200 mb-4 overflow-x-auto">
                    <button 
                        onClick={() => setActiveTab('DIVISION')}
                        className={`px-4 py-2 font-semibold text-sm transition-colors border-b-2 whitespace-nowrap ${activeTab === 'DIVISION' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Divisi ({divisions.length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('SHIFT_TIME')}
                        className={`px-4 py-2 font-semibold text-sm transition-colors border-b-2 whitespace-nowrap ${activeTab === 'SHIFT_TIME' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Jam Shift ({shiftTimes.length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('SHIFT_ID')}
                        className={`px-4 py-2 font-semibold text-sm transition-colors border-b-2 whitespace-nowrap ${activeTab === 'SHIFT_ID' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Shift ID ({shiftIds.length})
                    </button>
                </div>

                {/* Bulk Actions */}
                <div className="flex flex-col sm:flex-row justify-end gap-2 mb-6 bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <button 
                        onClick={handleDownloadTemplate}
                        className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                    >
                        <DownloadIcon /> Download Template
                    </button>
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={actionLoading}
                        className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50"
                    >
                        <UploadIcon /> {actionLoading ? 'Importing...' : 'Import Excel'}
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleImport} 
                        className="hidden" 
                        accept=".xlsx, .xls" 
                    />
                </div>

                {/* Add Form */}
                <form onSubmit={handleAdd} className="flex gap-2 mb-6">
                    <input 
                        type="text" 
                        value={newItemValue}
                        onChange={e => setNewItemValue(e.target.value)}
                        placeholder={`Ketik manual ${activeTab === 'DIVISION' ? 'Nama Divisi' : activeTab === 'SHIFT_TIME' ? 'Jam (ex: 08:00 - 17:00)' : 'Kode Shift ID'}...`}
                        className="flex-1 bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button 
                        type="submit" 
                        disabled={actionLoading || !newItemValue.trim()}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 disabled:opacity-50 shrink-0"
                    >
                        <AddIcon /> Tambah
                    </button>
                </form>

                {/* List Data */}
                {loading ? (
                    <div className="text-center py-8 text-gray-500 animate-pulse">Memuat data...</div>
                ) : (
                    activeTab === 'DIVISION' ? renderList(divisions) :
                    activeTab === 'SHIFT_TIME' ? renderList(shiftTimes) :
                    renderList(shiftIds)
                )}
            </div>
            
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 text-sm text-yellow-800">
                <p><strong>Catatan:</strong></p>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                    <li>Data yang dihapus tidak akan menghapus data absensi lama yang sudah menggunakan nama tersebut.</li>
                    <li>Fitur Import Excel akan otomatis melewati data yang sudah ada di database (tidak duplikat).</li>
                </ul>
            </div>
        </div>
    );
};

export default Settings;
