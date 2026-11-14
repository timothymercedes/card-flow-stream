import { useState } from 'react';
import { departmentPhotography } from '@/lib/departmentPhotography';

export function DepartmentPhoto({value, className = '', eager = false}: {value: string; className?: string; eager?: boolean}) {
  const [failed, setFailed] = useState(false);
  if (failed || !departmentPhotography[value]) return <div aria-hidden className={`bg-muted ${className}`} />;
  return <img src={departmentPhotography[value]} alt="" width={384} height={341} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} className={`object-cover ${className}`} />;
}