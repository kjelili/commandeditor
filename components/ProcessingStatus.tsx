'use client';

import { useEffect, useState } from 'react';

interface ProcessingStatusProps {
  isProcessing: boolean;
  message?: string;
}

export default function ProcessingStatus({ isProcessing, message = 'Processing your document...' }: ProcessingStatusProps) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!isProcessing) return;
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 400);
    return () => clearInterval(interval);
  }, [isProcessing]);

  if (!isProcessing) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 backdrop-blur-sm">
      <div className="card flex flex-col items-center gap-6 px-10 py-8 max-w-sm w-full mx-4 shadow-float">
        {/* Animated spinner */}
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-gold-400/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-gold-400 animate-spin" />
          <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-gold-300/50 animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-6 h-6 text-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        </div>

        <div className="text-center">
          <p className="body-md text-ink-800 font-medium">{message}{dots}</p>
          <p className="caption text-ink-500 mt-1">Processing locally — your files never leave your device</p>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-ink-200 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-gold-400 to-gold-500 rounded-full animate-shimmer" style={{ width: '60%', backgroundSize: '200% 100%' }} />
        </div>
      </div>
    </div>
  );
}
