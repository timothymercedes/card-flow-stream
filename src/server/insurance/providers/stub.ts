import type { InsuranceProvider } from "./types";

// Inactive stub used for shipsurance / usps / ups / fedex until wired.
export function makeStubProvider(code: string): InsuranceProvider {
  return {
    code,
    isActive: false,
    async quote() {
      throw new Error(`${code} insurance is not enabled yet`);
    },
    async purchase() {
      throw new Error(`${code} insurance is not enabled yet`);
    },
    async fileClaim() {
      throw new Error(`${code} insurance is not enabled yet`);
    },
    async refreshClaim() {
      throw new Error(`${code} insurance is not enabled yet`);
    },
  };
}
