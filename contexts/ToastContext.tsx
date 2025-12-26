import React, { createContext, useState, useCallback, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import ToastContainer from '../components/ToastContainer';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message: string;
}

interface ToastContextData {
  showToast: (message: string, options?: Partial<Omit<ToastMessage, 'id' | 'message'>>) => void;
}

export const ToastContext = createContext<ToastContextData>({} as ToastContextData);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, options: Partial<Omit<ToastMessage, 'id' | 'message'>> = {}) => {
    const newToast: ToastMessage = {
      id: uuidv4(),
      message,
      type: options.type || 'info',
      title: options.title || 'Notifikasi',
    };
    setToasts(prevToasts => [newToast, ...prevToasts]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
};