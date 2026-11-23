import { normalizeGemrate, safeCertImages, unverifiedCertificate, type CertificateSubmission, type CertificateResult } from './grading';

/** Credential-free module; the server handler supplies approved provider credentials. */
export async function lookupCertificate(input: CertificateSubmission, credentials: { psaToken?: string; gemrateKey?: string }, request: typeof fetch = fetch): Promise<CertificateResult> {
  const unavailable = (message: string): CertificateResult => ({ ...unverifiedCertificate(input), status: 'unavailable', message });
  const missing = (): CertificateResult => ({ ...unverifiedCertificate(input), status: 'not_found', source: credentials.gemrateKey ? 'GemRate' : 'PSA', checkedAt: new Date().toISOString(), message: 'No matching certificate was found by the provider.' });
  try {
    if (credentials.gemrateKey) {
      const grader = input.grader === 'BGS' ? 'beckett' : input.grader.toLowerCase();
      const url = `https://api.gemrate.com/v1/certs/${grader}/${encodeURIComponent(input.cert)}`;
      const options = { headers: { 'x-api-key': credentials.gemrateKey }, signal: AbortSignal.timeout(12000) };
      const res = await request(url, options);
      if (res.status === 404) return missing();
      if (!res.ok || res.status === 202) return unavailable('Verification service is unavailable or still processing. Please retry later.');
      const result = normalizeGemrate(input, await res.json());
      if (result.status === 'verified') {
        try {
          const images = await request(`${url}/images`, { ...options, signal: AbortSignal.timeout(5000) });
          if (images.status === 200) {
            const body = await images.json() as { data?: { grader?: string; cert?: string; image_front?: unknown; image_back?: unknown } };
            if (body.data?.grader === grader && String(body.data.cert) === input.cert) result.images = safeCertImages([body.data.image_front, body.data.image_back]);
          }
        } catch { /* Certification remains valid when licensed images are unavailable. */ }
      }
      return result;
    }
    if (input.grader === 'PSA' && credentials.psaToken) {
      const res = await request(`https://api.psacard.com/publicapi/cert/GetByCertNumber/${encodeURIComponent(input.cert)}`, { headers: { Authorization: `bearer ${credentials.psaToken}` }, signal: AbortSignal.timeout(12000) });
      if (res.status === 404) return missing();
      if (!res.ok) return unavailable('PSA verification is unavailable. Please retry later.');
      const body = await res.json() as { PSACert?: Record<string, unknown> };
      const card = body.PSACert;
      if (!card || String(card['CertNumber']) !== input.cert || !card['CardGrade'] || !card['Subject']) return unavailable('PSA did not confirm a matching certificate.');
      return { ...input, status: 'verified', grade: String(card['CardGrade']), description: [card['Year'], card['Brand'], card['Subject'], card['CardNumber'], card['Variety']].filter(Boolean).join(' '), images: [], source: 'PSA official certificate API', checkedAt: new Date().toISOString(), message: 'Certificate record confirmed. This does not authenticate the physical item.' };
    }
    return unavailable(`${input.grader} verification requires approved provider access. Manual entry remains unverified.`);
  } catch { return unavailable('Verification service could not be reached. Please retry later.'); }
}