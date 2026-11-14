import { describe, it, expect } from 'vitest';
import { visitorGateDecision } from './personalProfileRelease';
const live = 'https://yklpitgmqyclscnsswte.supabase.co';
describe('personal profile release switch', () => {
  it('is OFF by default on the live backend', () => expect(visitorGateDecision({ releaseFlag: undefined, backendUrl: live, requestUrl: 'https://pullbidlive.com/x' }).allowed).toBe(false));
  it('stays OFF for any value other than exactly "true"', () => {
    for (const v of ['', 'false', 'TRUE', '1', 'yes', ' true']) expect(visitorGateDecision({ releaseFlag: v, backendUrl: live, requestUrl: 'https://pullbidlive.com/x' }).allowed).toBe(false);
  });
  it('OFF blocks published domains even on an isolated backend', () => expect(visitorGateDecision({ releaseFlag: undefined, backendUrl: 'http://localhost:54321', requestUrl: 'https://pullbidlive.com/x' }).allowed).toBe(false));
  it('OFF still allows the isolated test environment', () => expect(visitorGateDecision({ releaseFlag: undefined, backendUrl: 'http://127.0.0.1:54321', requestUrl: 'http://localhost:8080/x' }).allowed).toBe(true));
  it('ON allows the published site', () => expect(visitorGateDecision({ releaseFlag: 'true', backendUrl: live, requestUrl: 'https://pullbidlive.com/x' }).allowed).toBe(true));
  it('fails closed on a missing backend', () => expect(visitorGateDecision({ releaseFlag: undefined, backendUrl: undefined, requestUrl: 'http://localhost/x' }).allowed).toBe(false));
});
