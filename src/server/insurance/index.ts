import type { InsuranceProvider } from "./providers/types";
import { shippoProvider } from "./providers/shippo";
import { makeStubProvider } from "./providers/stub";

const REGISTRY: Record<string, InsuranceProvider> = {
  shippo: shippoProvider,
  shipsurance: makeStubProvider("shipsurance"),
  usps: makeStubProvider("usps"),
  ups: makeStubProvider("ups"),
  fedex: makeStubProvider("fedex"),
};

export function getInsuranceProvider(code: string): InsuranceProvider {
  const p = REGISTRY[code];
  if (!p) throw new Error(`Unknown insurance provider: ${code}`);
  return p;
}

export function getDefaultProvider(): InsuranceProvider {
  return shippoProvider;
}

export type { InsuranceProvider } from "./providers/types";
