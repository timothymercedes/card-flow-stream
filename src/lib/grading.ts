export const CERT_GRADERS = ['PSA', 'CGC', 'BGS', 'SGC'] as const;
export type CertificateGrader = typeof CERT_GRADERS[number];
export type CertificateSubmission = { grader: CertificateGrader; cert: string };
export type CertificateResult = CertificateSubmission & {
  status: 'verified' | 'not_found' | 'unavailable' | 'unverified';
  description: string | null; grade: string | null; images: string[];
  source: string | null; checkedAt: string | null; message: string;
};
export function certificateNumber(value: string): string | null {
  const cert = value.trim();
  return /^\d{4,20}$/.test(cert) ? cert : null;
}
export function certificateFromScan(value: string, grader: CertificateGrader): string | null {
  const plain = certificateNumber(value);
  if (plain) return plain;
  try {
    const url = new URL(value);
    const hosts: Record<CertificateGrader, string[]> = { PSA: ['psacard.com'], CGC: ['cgccards.com', 'cgccomics.com'], BGS: ['beckett.com'], SGC: ['gosgc.com'] };
    if (url.protocol !== 'https:' || !hosts[grader].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) return null;
    return certificateNumber(url.searchParams.get('cert') || url.searchParams.get('certNumber') || url.pathname.split('/').filter(Boolean).at(-1) || '');
  } catch { return null; }
}
export function officialCertificateUrl({ grader, cert }: CertificateSubmission): string {
  const safe = encodeURIComponent(cert);
  return grader === 'PSA' ? `https://www.psacard.com/cert/${safe}` : grader === 'CGC' ? `https://www.cgccards.com/certlookup/${safe}/` : grader === 'BGS' ? 'https://www.beckett.com/grading/card-lookup' : 'https://www.gosgc.com/cert-code-lookup';
}
export function unverifiedCertificate(input: CertificateSubmission, message = 'Certificate information is seller-submitted, not verified.'): CertificateResult {
  return { ...input, status: 'unverified', description: null, grade: null, images: [], source: null, checkedAt: null, message };
}
export function safeCertImages(values: unknown[]): string[] {
  return values.filter((value): value is string => typeof value === 'string' && /^https:\/\//.test(value) && value.length < 2048).slice(0, 2);
}
export function normalizeGemrate(input: CertificateSubmission, raw: unknown): CertificateResult {
  const fallback = { ...unverifiedCertificate(input), status: 'unavailable' as const, message: 'The provider did not confirm a matching certificate.' };
  if (!raw || typeof raw !== 'object') return fallback;
  const data = (raw as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return fallback;
  const record = data as Record<string, unknown>;
  const details = record['grader_data'];
  if (!details || typeof details !== 'object') return fallback;
  const card = details as Record<string, unknown>;
  const providerGrader = input.grader === 'BGS' ? 'beckett' : input.grader.toLowerCase();
  if (record['grader'] !== providerGrader || String(card['cert']) !== input.cert || typeof card['grade_label'] !== 'string' || !card['grade_label'] || typeof record['description'] !== 'string' || !record['description']) return fallback;
  if (input.grader === 'BGS' && card['division'] !== 'beckett') return fallback;
  return { ...input, status: 'verified', description: record['description'], grade: card['grade_label'], images: [], source: 'GemRate partner certificate record', checkedAt: new Date().toISOString(), message: 'Certificate record confirmed. This does not authenticate the physical item.' };
}