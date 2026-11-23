import { describe, expect, it, vi } from 'vitest';
import { CERT_GRADERS, certificateFromScan, certificateNumber, normalizeGemrate } from './grading';
import { lookupCertificate } from './gradingProvider';
describe('certificate verification', () => {
  for (const grader of CERT_GRADERS) {
    const input = { grader, cert: '69437824' };
    const data = { description: 'Provider contract fixture, not a live certificate', grader: grader === 'BGS' ? 'beckett' : grader.toLowerCase(), grader_data: { cert: input.cert, grade_label: '10', division: 'beckett' } };
    it(`${grader} confirms only matching provider records`, () => {
      expect(normalizeGemrate(input, { data }).status).toBe('verified');
      expect(normalizeGemrate(input, { data: { ...data, grader_data: { ...data.grader_data, cert: '99999999' } } }).status).toBe('unavailable');
      expect(normalizeGemrate(input, { data: { ...data, grader: 'wrong' } }).status).toBe('unavailable');
    });
    it(`${grader} missing access is unavailable, not verified or not-found`, async () => {
      expect((await lookupCertificate(input, {})).status).toBe('unavailable');
    });
    it(`${grader} distinguishes not-found from service failures`, async () => {
      const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }));
      expect((await lookupCertificate(input, { gemrateKey: 'contract-test' }, request)).status).toBe('not_found');
      request.mockResolvedValue(new Response('', { status: 429 }));
      expect((await lookupCertificate(input, { gemrateKey: 'contract-test' }, request)).status).toBe('unavailable');
    });
    it(`${grader} uses documented provider and image contracts`, async () => {
      const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ data })).mockResolvedValueOnce(Response.json({ data: { grader: data.grader, cert: input.cert, image_front: 'https://images.example.test/front.jpg', image_back: 'javascript:bad' } }));
      const result = await lookupCertificate(input, { gemrateKey: 'contract-test' }, request);
      expect(result.status).toBe('verified');
      expect(result.images).toEqual(['https://images.example.test/front.jpg']);
      expect(request.mock.calls[0]?.[0]).toBe(`https://api.gemrate.com/v1/certs/${data.grader}/${input.cert}`);
    });
  }
  it('does not mislabel BVG as BGS', () => {
    expect(normalizeGemrate({ grader: 'BGS', cert: '12345678' }, { data: { grader: 'beckett', description: 'Card', grader_data: { cert: '12345678', grade_label: '9', division: 'bvg' } } }).status).toBe('unavailable');
  });
  it('rejects empty, scripts and unrelated QR links', () => {
    expect(certificateNumber('')).toBeNull();
    expect(certificateFromScan('https://example.com/cert/12345678', 'PSA')).toBeNull();
    expect(certificateFromScan('https://www.psacard.com/cert/69437824', 'PSA')).toBe('69437824');
    expect(certificateNumber('00123456')).toBe('00123456');
  });
  it('never verifies an empty PSA success response', async () => {
    expect((await lookupCertificate({ grader: 'PSA', cert: '69437824' }, { psaToken: 'contract-test' }, vi.fn<typeof fetch>().mockResolvedValue(Response.json({})))).status).toBe('unavailable');
  });
});