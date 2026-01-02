
import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import Modal from './Modal';
import PrintIcon from './icons/PrintIcon';
import DownloadIcon from './icons/DownloadIcon';
import { useToast } from '../hooks/useToast';

interface QrCodeModalProps {
    isOpen: boolean;
    onClose: () => void;
    workerData: {
        fullName: string;
        opsId: string;
        department: string;
    } | null;
}

const QrCodeModal: React.FC<QrCodeModalProps> = ({ isOpen, onClose, workerData }) => {
    const [qrCodeUrl, setQrCodeUrl] = useState('');
    const { showToast } = useToast();

    useEffect(() => {
        if (isOpen && workerData?.opsId) {
            const generateQrWithLogo = async (opsId: string) => {
                try {
                    const canvas = document.createElement('canvas');
                    await QRCode.toCanvas(canvas, opsId, { width: 300, margin: 2, errorCorrectionLevel: 'H' });
                    
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
                    console.error("Error generating QR", err);
                }
            };
            generateQrWithLogo(workerData.opsId);
        }
    }, [isOpen, workerData]);

    const handlePrintQr = () => window.print();

    const handleDownloadQrReceipt = async () => {
        if (!qrCodeUrl || !workerData) return;
        const scale = 2;
        const canvas = document.createElement('canvas');
        const width = 400, height = 550;
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) { showToast('Gagal membuat gambar.', { type: 'error' }); return; }
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
                loadImage('https://i.imgur.com/lie9EMX.png'),
                loadImage(qrCodeUrl)
            ]);
            
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 1;
            ctx.strokeRect(0, 0, width, height);

            const topLogoHeight = 35;
            const topLogoWidth = topLogoHeight * (topLogoImg.width / topLogoImg.height);
            ctx.drawImage(topLogoImg, (width - topLogoWidth) / 2, 40, topLogoWidth, topLogoHeight);

            const qrSize = 220;
            ctx.drawImage(qrImg, (width - qrSize) / 2, 95, qrSize, qrSize);

            ctx.beginPath();
            ctx.moveTo(40, 345);
            ctx.lineTo(width - 40, 345);
            ctx.strokeStyle = '#f1f5f9';
            ctx.lineWidth = 3;
            ctx.stroke();

            ctx.textAlign = 'center';
            ctx.font = `900 32px 'Inter', sans-serif`;
            ctx.fillStyle = '#111827';
            ctx.fillText(workerData.fullName, width / 2, 395);
            ctx.font = `500 18px 'Inter', sans-serif`;
            ctx.fillStyle = '#6b7280';
            ctx.fillText(workerData.opsId, width / 2, 430);
            ctx.font = `500 16px 'Inter', sans-serif`;
            ctx.fillStyle = '#9ca3af';
            ctx.fillText(workerData.department, width / 2, 460);

            const link = document.createElement('a');
            const safeName = workerData.fullName.replace(/[^a-zA-Z0-9]/g, '_');
            link.download = `ID_Card_${safeName}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (error) {
            console.error("Failed to load images for download:", error);
            showToast('Gagal memuat gambar untuk diunduh.', { type: 'error' });
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Employee QR Code" size="md">
            {workerData && (
                <div className="flex flex-col items-center justify-center p-4">
                    <div id="printable-qr" className="flex flex-col items-center text-center">
                        <h1 className="text-xl font-bold mb-2 hidden print:block text-black">ABSENIN</h1>
                        <div className="relative bg-white p-2 rounded-lg border border-gray-200 print:border-0 flex flex-col items-center">
                            {qrCodeUrl ? (
                                <img src={qrCodeUrl} alt={`QR Code for ${workerData.opsId}`} className="w-64 h-auto max-w-full object-contain print:w-48 print:h-48" />
                            ) : (
                                <div className="w-64 h-64 flex items-center justify-center text-gray-400 bg-gray-50 rounded animate-pulse">Generating QR...</div>
                            )}
                        </div>
                        <div className="mt-6 text-center">
                            <h2 className="text-2xl font-bold text-gray-800 print:text-black print:text-xl">{workerData.fullName}</h2>
                            <p className="text-lg text-black font-mono tracking-wider mt-1 print:text-black print:text-lg">{workerData.opsId}</p>
                            <p className="text-sm text-gray-500 mt-2 print:block print:text-black print:text-sm">{workerData.department}</p>
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
                        *Klik "Print Struk" untuk mencetak langsung ke printer thermal (58mm/80mm).
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default QrCodeModal;
