import { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

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
  hSize?: string;
  disabled?: boolean;
}

export default function CustomSelect({ 
  value, 
  onChange, 
  options, 
  placeholder = "Seleccionar...", 
  className,
  hSize = "h-11",
  disabled = false
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => String(o.value) === String(value));

  // Portal container positioned to match the trigger button
  const [portalPos, setPortalPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const scrollY = window.scrollY;
      setPortalPos({ 
        top: rect.bottom + scrollY + 8, 
        left: rect.left, 
        width: rect.width 
      });
    } else {
      setPortalPos(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onScroll = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const scrollY = window.scrollY;
        setPortalPos({ 
          top: rect.bottom + scrollY + 8, 
          left: rect.left, 
          width: rect.width 
        });
      }
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => { 
      window.removeEventListener('scroll', onScroll, true); 
      window.removeEventListener('resize', onScroll); 
    };
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
      className="absolute z-[9999] glass-panel border border-[var(--color-surface-border)] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in zoom-in duration-200"
      style={portalPos ? { 
        top: `${portalPos.top}px`, 
        left: `${portalPos.left}px`, 
        width: `${portalPos.width}px`,
        maxHeight: '300px'
      } : {}}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <ul className="overflow-auto custom-scrollbar py-1.5">
        {options.map((opt) => (
          <li
            key={opt.value}
            onClick={() => {
              onChange(opt.value);
              setIsOpen(false);
            }}
            className={cn(
              "px-4 py-2.5 text-xs font-bold uppercase tracking-wide cursor-pointer transition-all flex items-center justify-between group",
              String(opt.value) === String(value)
                ? "bg-[var(--primary-600)] text-white"
                : "text-[var(--primary-300)] hover:bg-[var(--color-surface-hover)] hover:text-white"
            )}
          >
            <span>{opt.label}</span>
            {String(opt.value) === String(value) && <Check className="w-3.5 h-3.5" />}
          </li>
        ))}
        {options.length === 0 && (
          <li className="px-4 py-6 text-xs text-[var(--primary-500)] italic text-center uppercase tracking-widest font-bold opacity-60">
            Sin opciones
          </li>
        )}
      </ul>
    </div>
  ), [options, value, onChange, portalPos]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "glass-input w-full flex items-center justify-between px-4 transition-all duration-300",
          isOpen ? "ring-2 ring-[var(--primary-500)] border-[var(--primary-500)]" : "",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-[var(--primary-400)]",
          hSize
        )}
      >
        <span className={cn(
          "text-xs font-bold tracking-tight uppercase truncate mr-2",
          !selectedOption ? "text-[var(--primary-500)] italic" : "text-[var(--primary-50)]"
        )}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className={cn(
          "w-4 h-4 text-[var(--primary-500)] transition-transform duration-300 ease-out",
          isOpen && "rotate-180"
        )} />
      </button>

      {isOpen && ReactDOM.createPortal(dropdown, document.body)}
    </div>
  );
}
