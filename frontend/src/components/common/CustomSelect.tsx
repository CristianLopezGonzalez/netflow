import { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

interface Option {
  value: string | number;
  label: string;
}

interface CustomSelectProps {
  value: string | number;
  onChange: (val: any) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
}

export default function CustomSelect({ value, onChange, options, placeholder = "Seleccionar...", className }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => String(o.value) === String(value));

  // Portal container positioned to match the trigger button
  const [portalPos, setPortalPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPortalPos({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    } else {
      setPortalPos(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onScroll = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setPortalPos(prev => prev ? { ...prev, top: rect.bottom + 6, left: rect.left, width: rect.width } : null);
      }
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll); };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const dropdown = useMemo(() => (
    <div
      className="fixed z-[9999] bg-surface/98 backdrop-blur-2xl border border-surfaceBorder rounded-lg shadow-2xl overflow-hidden animate-fade-in ring-1 ring-white/5"
      style={portalPos ? { top: `${portalPos.top}px`, left: `${portalPos.left}px`, width: `${portalPos.width}px` } : {}}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <ul className="max-h-60 overflow-auto custom-scrollbar py-1 text-left">
        {options.map((opt) => (
          <li
            key={opt.value}
            onClick={() => {
              onChange(opt.value);
              setIsOpen(false);
            }}
            className={cn(
              "px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all flex items-center justify-between",
              String(opt.value) === String(value)
                ? "bg-blue-600 text-white shadow-inner"
                : "text-primary-400 hover:bg-white/5 hover:text-white"
            )}
          >
            {opt.label}
            {String(opt.value) === String(value) && <div className="w-1 h-1 rounded-full bg-white shadow-[0_0_8px_white]" />}
          </li>
        ))}
        {options.length === 0 && (
          <li className="px-3 py-4 text-[10px] text-primary-600 italic text-center uppercase tracking-widest font-bold opacity-50">Sin opciones</li>
        )}
      </ul>
    </div>
  ), [options, value, onChange, portalPos]);

  return (
    <div ref={containerRef} className={cn("relative min-w-[140px]", className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full input-field-no-arrow flex items-center justify-between cursor-pointer select-none bg-[#121418] border-surfaceBorder hover:border-blue-500/50 transition-all shadow-md group min-h-[38px] px-3"
      >
        <span className={cn("text-xs transition-colors", !selectedOption ? "text-primary-600 italic" : "text-white font-bold uppercase tracking-tight")}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-primary-500 group-hover:text-blue-400 transition-transform duration-300 ease-out", isOpen && "rotate-180")} />
      </button>

      {isOpen && ReactDOM.createPortal(dropdown, document.body)}
    </div>
  );
}
