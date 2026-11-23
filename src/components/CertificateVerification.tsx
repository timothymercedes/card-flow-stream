import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Camera, Loader2, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CERT_GRADERS, certificateFromScan, certificateNumber, officialCertificateUrl, type CertificateResult, type CertificateSubmission } from '@/lib/grading';
import { verifyCertificate } from '@/lib/grading.functions';

export function CertificateVerification({ value, onChange }: { value?: CertificateSubmission; onChange?: (value: CertificateSubmission) => void }) {
  const [local, setLocal] = useState<CertificateSubmission>({ grader: 'PSA', cert: '' });
  const input = value ?? local;
  const [result, setResult] = useState<CertificateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const version = useRef(0);
  const video = useRef<HTMLVideoElement>(null);
  const lookup = useServerFn(verifyCertificate);
  function change(next: CertificateSubmission) { setLocal(next); onChange?.(next); }
  useEffect(() => { version.current += 1; setResult(null); setError(''); setBusy(false); }, [input.grader, input.cert]);
  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    void (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled || !video.current) return;
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video.current, (decoded) => {
          if (!decoded || cancelled) return;
          const cert = certificateFromScan(decoded.getText(), input.grader);
          if (!cert) { setError('This code does not contain a certificate for the selected grader.'); return; }
          change({ grader: input.grader, cert });
          setScanning(false);
        });
        stop = () => controls.stop();
        if (cancelled) stop();
      } catch { if (!cancelled) { setError('Camera unavailable. Enter the certificate number manually.'); setScanning(false); } }
    })();
    return () => { cancelled = true; stop?.(); };
  }, [scanning, input.grader]);

  async function verify() {
    const cert = certificateNumber(input.cert);
    if (!cert) { setError('Enter a certificate number using 4–20 digits.'); return; }
    const current = ++version.current;
    setBusy(true); setError('');
    try {
      const response = await lookup({ data: { grader: input.grader, cert } });
      if (current === version.current) setResult(response);
    } catch { if (current === version.current) setError('Sign in to verify a certificate, then try again.'); }
    finally { if (current === version.current) setBusy(false); }
  }
  return <section className="space-y-3 border-y border-border py-4">
    <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> Grading certificate</h2>
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
      <label className="text-xs text-muted-foreground">Grading company<select aria-label="Grading company" value={input.grader} onChange={event => change({ ...input, grader: event.target.value as CertificateSubmission['grader'] })} className="mt-1 h-10 w-full rounded-md border border-border bg-input px-2 text-sm text-foreground">{CERT_GRADERS.map(grader => <option key={grader}>{grader}</option>)}</select></label>
      <label className="text-xs text-muted-foreground">Certificate number<input aria-label="Certificate number" inputMode="numeric" maxLength={20} value={input.cert} onChange={event => change({ ...input, cert: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground" /></label>
    </div>
    <div className="flex flex-wrap gap-2"><Button type="button" onClick={verify} disabled={busy || !input.cert.trim()}>{busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Verify certificate</Button><Button type="button" variant="outline" onClick={() => setScanning(true)}><Camera /> Scan barcode / QR</Button></div>
    {scanning && <div className="relative aspect-video overflow-hidden rounded-md bg-muted"><video ref={video} playsInline muted className="h-full w-full object-cover" /><Button type="button" size="icon" aria-label="Close certificate scanner" className="absolute right-2 top-2" onClick={() => setScanning(false)}><X /></Button></div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div role="status" aria-live="polite" className="space-y-2 text-sm">
      <p className={result?.status === 'verified' ? 'font-semibold text-primary' : 'font-semibold text-muted-foreground'}>{result ? { verified: 'Verified', not_found: 'Not Found', unavailable: 'Unavailable', unverified: 'Unverified' }[result.status] : 'Unverified'}</p>
      {result && <><p>{result.message}</p><p>{result.grader} · {result.cert}</p>{result.description && <p>{result.description}</p>}{result.grade && <p>Grade: {result.grade}</p>}{result.source && <p className="text-xs text-muted-foreground">{result.source} · {result.checkedAt ? new Date(result.checkedAt).toLocaleString() : ''}</p>}{result.images.length > 0 && <div className="grid grid-cols-2 gap-2">{result.images.map((image, index) => <a key={image} href={image} target="_blank" rel="noopener noreferrer"><img src={image} alt={`Certification ${index === 0 ? 'front' : 'back'}`} className="aspect-[3/4] w-full object-contain" loading="lazy" /></a>)}</div>}</>}
      {certificateNumber(input.cert) && <a href={officialCertificateUrl(input)} target="_blank" rel="noopener noreferrer" className="inline-block text-primary underline">Open {input.grader} certificate lookup</a>}
    </div>
  </section>;
}