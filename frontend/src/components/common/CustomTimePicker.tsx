import { useState, useRef, useEffect } from 'react';
import { Clock, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

interface CustomTimePickerProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
}

export default function CustomTimePicker({ value, onChange, className }: CustomTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse HH:mm
  const [h, m] = value ? value.split(':') : ['00', '00'];

  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutes = ['00', '15', '30', '45'];

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

  return (
    <div ref={containerRef} className={cn("relative min-w-[120px]", className)}>
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full input-field-no-arrow flex items-center justify-between cursor-pointer select-none bg-[#121418] border-surfaceBorder hover:border-blue-500/50 transition-all shadow-md group min-h-[38px] px-3"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-primary-500 group-hover:text-blue-400 transition-colors" />
          <span className="text-sm text-white font-black font-mono tracking-tighter">
            {value || '--:--'}
          </span>
        </div>
        <ChevronDown className={cn("w-3.5 h-3.5 text-primary-500 group-hover:text-blue-400 transition-transform duration-300", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute z-[110] mt-2 w-[200px] bg-surface/98 backdrop-blur-2xl border border-surfaceBorder rounded-xl shadow-2xl overflow-hidden animate-fade-in p-4 right-0 sm:left-0">
          <div className="flex gap-4 h-48 overflow-hidden">
            {/* Hours */}
            <div className="flex-1 flex flex-col space-y-1 overflow-y-auto pr-1 custom-scrollbar scroll-smooth">
              <p className="text-[10px] font-black text-primary-600 uppercase mb-2 sticky top-0 bg-[#1c1e22]/98 py-1 z-10">Hora</p>
              {hours.map(hour => (
                <button
                  key={hour}
                  onClick={() => setTime(hour, m)}
                  className={cn(
                    "px-3 py-1.5 rounded text-xs font-bold transition-all text-center",
                    h === hour ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "text-primary-500 hover:bg-white/5 hover:text-white"
                  )}
                >
                  {hour}
                </button>
              ))}
            </div>

            {/* Minutes */}
            <div className="flex-1 flex flex-col space-y-1 overflow-y-auto pr-1 custom-scrollbar">
              <p className="text-[10px] font-black text-primary-600 uppercase mb-2 sticky top-0 bg-[#1c1e22]/98 py-1 z-10">Min</p>
              {minutes.map(min => (
                <button
                  key={min}
                  onClick={() => { setTime(h, min); setIsOpen(false); }}
                  className={cn(
                    "px-3 py-1.5 rounded text-xs font-bold transition-all text-center",
                    m === min ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "text-primary-500 hover:bg-white/5 hover:text-white"
                  )}
                >
                  {min}
                </button>
              ))}
              <div className="mt-2 pt-2 border-t border-surfaceBorder/20 text-center">
                 <button onClick={() => setIsOpen(false)} className="text-[10px] text-primary-400 hover:text-blue-400 font-bold uppercase transition-colors">Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
