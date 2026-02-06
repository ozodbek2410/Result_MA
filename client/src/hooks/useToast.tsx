import { useState, useCallback } from 'react';
import { Toast, ToastType } from '@/components/ui/Toast';
import { createRoot } from 'react-dom/client';

let toastContainer: HTMLDivElement | null = null;

export function useToast() {
  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 3000) => {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }

    const toastElement = document.createElement('div');
    toastContainer.appendChild(toastElement);
    const root = createRoot(toastElement);

    const handleClose = () => {
      try {
        root.unmount();
        // Проверяем, что элемент все еще является дочерним элементом контейнера
        if (toastContainer && toastContainer.contains(toastElement)) {
          toastContainer.removeChild(toastElement);
        }
      } catch (error) {
        console.warn('Error closing toast:', error);
      }
    };

    root.render(<Toast message={message} type={type} duration={duration} onClose={handleClose} />);
  }, []);

  return {
    toast: showToast,
    success: (message: string) => showToast(message, 'success'),
    error: (message: string) => showToast(message, 'error'),
    info: (message: string) => showToast(message, 'info'),
    warning: (message: string) => showToast(message, 'warning'),
  };
}
