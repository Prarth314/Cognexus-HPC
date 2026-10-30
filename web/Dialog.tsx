import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Dialog({ title,children,onClose,wide=false }: { title:string;children:ReactNode;onClose:()=>void;wide?:boolean }) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ const element=ref.current; element?.showModal(); element?.querySelector<HTMLElement>('input,select,textarea')?.focus(); return ()=>element?.close(); },[]);
  return <dialog ref={ref} className={`dialog ${wide?'dialog-wide':''}`} onCancel={event=>{ event.preventDefault();onClose(); }} aria-labelledby="dialog-title">
    <header className="dialog-head"><h2 id="dialog-title">{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></header>
    <div className="dialog-body">{children}</div>
  </dialog>;
}
