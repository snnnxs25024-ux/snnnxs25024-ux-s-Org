import React, { useState } from 'react';
import { Download, FileSpreadsheet, Info, CheckCircle, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

// Mock Data
const MOCK_ATTENDANCE = [
  { id: 1, name: 'Budi Santoso', department: 'Security', shift: 'Shift 1', status: 'Tepat Waktu', time: '07:45', date: '2024-03-08' },
  { id: 2, name: 'Siti Aminah', department: 'Security', shift: 'Shift 1', status: 'Terlambat', time: '08:15', date: '2024-03-08' },
  { id: 3, name: 'Agus Setiawan', department: 'Maintenance', shift: 'Shift 1', status: 'Tepat Waktu', time: '07:50', date: '2024-03-08' },
  { id: 4, name: 'Dewi Lestari', department: 'Maintenance', shift: 'Shift 1', status: 'Tepat Waktu', time: '07:55', date: '2024-03-08' },
  { id: 5, name: 'Eko Prasetyo', department: 'Security', shift: 'Shift 2', status: 'Tepat Waktu', time: '15:45', date: '2024-03-08' },
  { id: 6, name: 'Lani Wijaya', department: 'Security', shift: 'Shift 2', status: 'Terlambat', time: '16:10', date: '2024-03-08' },
];

const App: React.FC = () => {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadExcel = () => {
    setIsDownloading(true);
    
    try {
      // 1. Metadata Sesi (Suggestion #4)
      const metadata = [
        ['LAPORAN ABSENSI HARIAN'],
        ['Sesi:', 'Shift 1 & 2'],
        ['Divisi:', 'Security & Maintenance'],
        ['Tanggal Cetak:', new Date().toLocaleString()],
        ['Admin:', 'Admin Utama'],
        [''], // Spacer
      ];

      // 2. Data Mentah (Suggestion #2)
      const rawDataHeader = ['ID', 'Nama', 'Departemen', 'Shift', 'Status', 'Waktu', 'Tanggal'];
      const rawDataRows = MOCK_ATTENDANCE.map(item => [
        item.id,
        item.name,
        item.department,
        item.shift,
        item.status,
        item.time,
        item.date
      ]);

      // 3. Ringkasan / Pivot (Suggestion #1)
      const summaryData: (string | number)[][] = [
        ['RINGKASAN KEHADIRAN'],
        ['Departemen', 'Total', 'Tepat Waktu', 'Terlambat'],
      ];

      const departments = [...new Set(MOCK_ATTENDANCE.map(i => i.department))];
      departments.forEach(dept => {
        const deptData = MOCK_ATTENDANCE.filter(i => i.department === dept);
        const total = deptData.length;
        const onTime = deptData.filter(i => i.status === 'Tepat Waktu').length;
        const late = deptData.filter(i => i.status === 'Terlambat').length;
        summaryData.push([dept, total, onTime, late]);
      });

      // Create Workbook
      const wb = XLSX.utils.book_new();

      // Sheet 1: Data Mentah
      const wsRaw = XLSX.utils.aoa_to_sheet([...metadata, rawDataHeader, ...rawDataRows]);
      
      // Formatting Visual Dasar (Suggestion #5) - Note: xlsx basic doesn't support styles well without xlsx-js-style
      // But we can set column widths
      wsRaw['!cols'] = [
        { wch: 5 },  // ID
        { wch: 20 }, // Nama
        { wch: 15 }, // Departemen
        { wch: 10 }, // Shift
        { wch: 15 }, // Status
        { wch: 10 }, // Waktu
        { wch: 12 }, // Tanggal
      ] as XLSX.ColInfo[];

      XLSX.utils.book_append_sheet(wb, wsRaw, 'Data Absensi');

      // Sheet 2: Ringkasan
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      wsSummary['!cols'] = [
        { wch: 20 }, // Departemen
        { wch: 10 }, // Total
        { wch: 15 }, // Tepat Waktu
        { wch: 15 }, // Terlambat
      ] as XLSX.ColInfo[];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan');

      // 4. Penamaan File Informatif (Suggestion #3)
      const fileName = `Absensi_Security_Maintenance_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      XLSX.writeFile(wb, fileName);
    } catch (error) {
      console.error('Error generating excel:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 max-w-4xl mx-auto">
      <header className="mb-12">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-2">Absenin Dashboard</h1>
        <p className="text-slate-500">Sistem manajemen absensi dengan fitur ekspor laporan yang ditingkatkan.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Export Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <FileSpreadsheet size={24} />
            </div>
            <h2 className="text-xl font-semibold">Ekspor Laporan</h2>
          </div>
          
          <p className="text-slate-600 text-sm mb-6">
            Unduh laporan absensi dalam format Excel dengan ringkasan otomatis dan metadata lengkap.
          </p>

          <button
            onClick={handleDownloadExcel}
            disabled={isDownloading}
            className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium transition-all ${
              isDownloading 
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                : 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 shadow-lg shadow-emerald-200'
            }`}
          >
            {isDownloading ? (
              <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            ) : (
              <Download size={20} />
            )}
            {isDownloading ? 'Menyiapkan...' : 'Download Laporan Excel'}
          </button>
        </div>

        {/* Info Card */}
        <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-slate-800 text-slate-300 rounded-lg">
              <Info size={24} />
            </div>
            <h2 className="text-xl font-semibold">Fitur Baru</h2>
          </div>
          
          <ul className="space-y-3 text-sm text-slate-300">
            <li className="flex gap-2">
              <CheckCircle size={16} className="text-emerald-400 shrink-0" />
              <span>Sheet Ringkasan (Pivot) otomatis</span>
            </li>
            <li className="flex gap-2">
              <CheckCircle size={16} className="text-emerald-400 shrink-0" />
              <span>Metadata sesi (Admin, Waktu Cetak)</span>
            </li>
            <li className="flex gap-2">
              <CheckCircle size={16} className="text-emerald-400 shrink-0" />
              <span>Format penamaan file yang informatif</span>
            </li>
            <li className="flex gap-2">
              <CheckCircle size={16} className="text-emerald-400 shrink-0" />
              <span>Standarisasi format data mentah</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Table Preview */}
      <div className="mt-12">
        <h3 className="text-lg font-semibold mb-4">Preview Data Hari Ini</h3>
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-bottom border-slate-200">
              <tr>
                <th className="px-6 py-4 font-medium text-slate-600">Nama</th>
                <th className="px-6 py-4 font-medium text-slate-600">Departemen</th>
                <th className="px-6 py-4 font-medium text-slate-600">Status</th>
                <th className="px-6 py-4 font-medium text-slate-600">Waktu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MOCK_ATTENDANCE.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900">{item.name}</td>
                  <td className="px-6 py-4 text-slate-600">{item.department}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      item.status === 'Tepat Waktu' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {item.status === 'Tepat Waktu' ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{item.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default App;
