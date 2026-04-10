import { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Clock, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CustomTimePickerProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  hSize?: string;
}

export default function CustomTimePicker({ 
  value, 
  onChange, 
  className,
  hSize = "h-11"
}: CustomTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse HH:mm
  const [h, m] = value ? value.split(':') : ['00', '00'];

  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutes = ['00', '15', '30', '45'];

  // Portal positioning
  const [portalPos, setPortalPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const scrollY = window.scrollY;
      setPortalPos({ 
        top: rect.bottom + scrollY + 8, 
        left: rect.left, 
        width: 200 
      });
    } else {
      setPortalPos(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const setTime = (hour: string, min: string) => {
    onChange(`${hour}:${min}`);
  };

  const dropdown = useMemo(() => (
    <div
      className="absolute z-[9999] glass-panel border border-[var(--color-surface-border)] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in zoom-in duration-200 p-4"
      style={portalPos ? { 
        top: `${portalPos.top}px`, 
        left: `${portalPos.left}px`, 
        width: `${portalPos.width}px` 
      } : {}}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex gap-4 h-48 overflow-hidden">
        {/* Hours */}
        <div className="flex-1 flex flex-col space-y-1 overflow-y-auto pr-1 custom-scrollbar scroll-smooth">
          <p className="text-[9px] font-black text-[var(--primary-600)] uppercase mb-2 sticky top-0 bg-[var(--color-surface)]/90 backdrop-blur py-1 z-10">Hora</p>
          {hours.map(hour => (
            <button
              key={hour}
              type="button"
              onClick={() => setTime(hour, m)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all text-center",
                h === hour ? "bg-[var(--primary-600)] text-white shadow-lg shadow-blue-500/20" : "text-[var(--primary-400)] hover:bg-white/5 hover:text-white"
              )}
            >
              {hour}
            </button>
          ))}
        </div>

        {/* Minutes */}
        <div className="flex-1 flex flex-col space-y-1 overflow-y-auto pr-1 custom-scrollbar">
          <p className="text-[9px] font-black text-[var(--primary-600)] uppercase mb-2 sticky top-0 bg-[var(--color-surface)]/90 backdrop-blur py-1 z-10">Min</p>
          {minutes.map(min => (
            <button
              key={min}
              type="button"
              onClick={() => { setTime(h, min); setIsOpen(false); }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all text-center",
                m === min ? "bg-[var(--primary-600)] text-white shadow-lg shadow-blue-500/20" : "text-[var(--primary-400)] hover:bg-white/5 hover:text-white"
              )}
            >
              {min}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-[var(--color-surface-border)] text-center">
        <button onClick={() => setIsOpen(false)} className="text-[9px] text-[var(--primary-400)] hover:text-[var(--primary-200)] font-black uppercase transition-colors">Cerrar</button>
      </div>
    </div>
  ), [h, m, portalPos]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "glass-input w-full flex items-center justify-between px-4 transition-all duration-300 cursor-pointer",
          isOpen ? "ring-2 ring-[var(--primary-500)] border-[var(--primary-500)]" : "hover:border-[var(--primary-400)]",
          hSize
        )}
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[var(--primary-500)]" />
          <span className="text-sm text-[var(--primary-50)] font-bold font-mono tracking-tighter">
            {value || '--:--'}
          </span>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-[var(--primary-500)] transition-transform duration-300", isOpen && "rotate-180")} />
      </button>

      {isOpen && ReactDOM.createPortal(dropdown, document.body)}
    </div>
  );
}
