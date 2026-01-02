
import React, { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import Modal from './Modal';
import { Worker } from '../types';
import { useToast } from '../hooks/useToast';
import IdCardIcon from './icons/IdCardIcon';
import PhoneIcon from './icons/PhoneIcon';
import CopyIcon from './icons/CopyIcon';
import EditIcon from './icons/EditIcon';
import DeleteIcon from './icons/DeleteIcon';
import PrintIcon from './icons/PrintIcon';

interface WorkerDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    worker: Worker | null;
    onEdit: (worker: Worker) => void;
    onDelete: (worker: Worker) => void;
    onPrintQr: (worker: Worker) => void;
}

const getInitials = (name: string) => {
    if (!name) return '?';
    const names = name.split(' ');
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
};

const WorkerDetailModal: React.FC<WorkerDetailModalProps> = ({ isOpen, onClose, worker, onEdit, onDelete, onPrintQr }) => {
    const [qrCodeUrl, setQrCodeUrl] = useState('');
    const { showToast } = useToast();

    useEffect(() => {
        if (isOpen && worker?.opsId) {
            const generateQrWithLogo = async (opsId: string) => {
                try {
                    const canvas = document.createElement('canvas');
                    await QRCode.toCanvas(canvas, opsId, { width: 256, margin: 2, errorCorrectionLevel: 'H' });
                    const ctx = canvas.getContext('2d');
                    if (!ctx) { setQrCodeUrl(canvas.toDataURL()); return; }
                    
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
                    logo.onerror = () => setQrCodeUrl(canvas.toDataURL('image/png'));
                } catch (err) {
                    console.error("Error generating QR for view modal", err);
                }
            };
            generateQrWithLogo(worker.opsId);
        }
    }, [isOpen, worker]);

    const statusBadge = useMemo(() => {
        if (!worker) return { bg: '', text: '', border: '' };
        switch (worker.status) {
            case 'Active': return { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' };
            case 'Blacklist': return { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200' };
            case 'Non Active': return { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200' };
            default: return { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200' };
        }
    }, [worker]);

    const handleCopy = (text: string, fieldName: string) => {
        navigator.clipboard.writeText(text).then(() => {
            showToast(`${fieldName} disalin ke clipboard.`, { type: 'success', title: 'Tersalin!' });
        }, () => {
            showToast(`Gagal menyalin ${fieldName}.`, { type: 'error' });
        });
    };
    
    if (!worker) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Detail Karyawan" size="lg" scrollable={false}>
            <div className="font-sans flex flex-col">
                {/* Header */}
                <div className="relative flex justify-between items-start px-6 pt-4 pb-3 bg-gray-50 rounded-t-lg">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 tracking-tight">{worker.fullName}</h2>
                        <p className="text-base font-mono text-blue-600 select-all">{worker.opsId}</p>
                    </div>
                    <span className={`px-3 py-1 text-xs font-black uppercase tracking-widest rounded-full ${statusBadge.bg} ${statusBadge.text} border ${statusBadge.border}`}>
                        {worker.status}
                    </span>
                </div>

                {/* Main Content */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 px-6 py-6">
                    {/* Left Column: Info */}
                    <div className="space-y-5">
                        <div className="flex items-center gap-4">
                            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center shrink-0 border-4 border-white ring-2 ring-blue-200">
                                <span className="text-3xl font-bold text-blue-600">{getInitials(worker.fullName)}</span>
                            </div>
                            <div>
                                <p className="font-bold text-gray-700 text-lg">{worker.department}</p>
                                <p className="text-sm text-gray-500">{worker.contractType}</p>
                            </div>
                        </div>

                        <div className="space-y-4 border-t border-gray-100 pt-4">
                            <div className="flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                    <IdCardIcon className="text-gray-400" />
                                    <div>
                                        <p className="text-xs text-gray-500">NIK KTP</p>
                                        <p className="text-gray-700 font-mono font-medium">{worker.nik}</p>
                                    </div>
                                </div>
                                <button onClick={() => handleCopy(worker.nik, 'NIK')} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 transition-opacity p-2 rounded-lg hover:bg-blue-50">
                                    <CopyIcon />
                                </button>
                            </div>
                            <div className="flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                    <PhoneIcon className="text-gray-400" />
                                    <div>
                                        <p className="text-xs text-gray-500">Phone / WA</p>
                                        <p className="text-gray-700 font-mono font-medium">{worker.phone}</p>
                                    </div>
                                </div>
                                <button onClick={() => handleCopy(worker.phone, 'No. Telepon')} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 transition-opacity p-2 rounded-lg hover:bg-blue-50">
                                    <CopyIcon />
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    {/* Right Column: QR Code */}
                    <div className="flex flex-col items-center justify-center bg-gray-50 p-4 rounded-xl border border-dashed">
                        {qrCodeUrl ? (
                            <img src={qrCodeUrl} alt="QR Code" className="w-44 h-44 rounded-lg" />
                        ) : (
                            <div className="w-44 h-44 bg-gray-200 animate-pulse rounded-lg flex items-center justify-center text-xs text-gray-400">Generating QR...</div>
                        )}
                        <p className="mt-3 text-xs text-gray-500 font-semibold uppercase tracking-wider">Scan for Quick Actions</p>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex justify-end gap-3 p-4 mt-2 border-t bg-gray-50 rounded-b-lg">
                    <button onClick={() => { onEdit(worker); onClose(); }} className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors">
                        <EditIcon /> Edit
                    </button>
                    <button onClick={() => { onDelete(worker); onClose(); }} className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-red-600 bg-red-100 rounded-lg hover:bg-red-200 transition-colors">
                        <DeleteIcon /> Delete
                    </button>
                    <button onClick={() => onPrintQr(worker)} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                        <PrintIcon /> Print ID Card
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default WorkerDetailModal;
