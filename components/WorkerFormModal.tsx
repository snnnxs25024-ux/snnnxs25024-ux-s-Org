
import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { Worker } from '../types';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../hooks/useToast';

interface WorkerFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    worker: Worker | null;
    refreshData: () => void;
    divisionOpts: string[];
}

// Helper Components
const InputField = (props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
    <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{props.label}</label>
        <input
            {...props}
            className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
    </div>
);

const SelectField = (props: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: string[] }) => (
    <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{props.label}</label>
        <select
            {...props}
            className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
            <option value="">Select {props.label}</option>
            {props.options.map((opt: string) => (
                <option key={opt} value={opt}>{opt}</option>
            ))}
        </select>
    </div>
);


const WorkerFormModal: React.FC<WorkerFormModalProps> = ({ isOpen, onClose, worker, refreshData, divisionOpts }) => {
    const [loadingAction, setLoadingAction] = useState(false);
    const { showToast } = useToast();

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
        if (worker) { // Editing existing worker
            const { error: updateError } = await supabase.from('workers').update(workerData).eq('id', worker.id);
            error = updateError;
        } else { // Adding new worker
            const { error: insertError } = await supabase.from('workers').insert([{ ...workerData, created_at: new Date().toISOString() }]);
            error = insertError;
        }

        setLoadingAction(false);
        if (error) {
            showToast(`Error: ${error.message}`, { type: 'error', title: 'Gagal Menyimpan' });
        } else {
            onClose();
            showToast('Data karyawan berhasil disimpan.', { type: 'success', title: 'Berhasil' });
            refreshData();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={worker ? "Edit Worker" : "Add New Worker"}>
            <form onSubmit={handleSaveWorker} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InputField label="OpsID" name="opsId" defaultValue={worker?.opsId} required placeholder="e.g. OPS001" />
                    <InputField label="Full Name" name="fullName" defaultValue={worker?.fullName} required placeholder="e.g. John Doe" />
                    <InputField label="NIK KTP" name="nik" defaultValue={worker?.nik} required type="number" placeholder="16 digits" />
                    <InputField label="Phone Number" name="phone" defaultValue={worker?.phone} required type="tel" placeholder="e.g. 0812..." />

                    <SelectField
                        label="Contract Type"
                        name="contractType"
                        defaultValue={worker?.contractType || "Daily Worker Vendor"}
                        options={["Daily Worker Vendor"]}
                        required
                    />

                    <SelectField
                        label="Division"
                        name="department"
                        defaultValue={worker?.department}
                        options={divisionOpts}
                        required
                    />

                    <SelectField
                        label="Status"
                        name="status"
                        defaultValue={worker?.status || "Active"}
                        options={["Active", "Non Active", "Blacklist"]}
                        required
                    />
                </div>
                <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-gray-100">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium transition-colors">Cancel</button>
                    <button type="submit" disabled={loadingAction} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold transition-colors shadow-lg shadow-blue-200">
                        {loadingAction ? 'Saving...' : 'Save Worker'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default WorkerFormModal;
