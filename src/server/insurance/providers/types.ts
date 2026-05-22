export type InsuranceReason = "lost" | "damaged" | "stolen";

export interface InsuranceQuoteArgs {
  coverageCents: number;
  carrier?: string | null;
  destinationCountry?: string | null;
}

export interface InsuranceQuoteResult {
  feeCents: number;
  coverageCents: number;
  supportsReasons: InsuranceReason[];
  estResolutionDays: number;
  providerCode: string;
}

export interface InsurancePurchaseArgs extends InsuranceQuoteArgs {
  orderId: string;
}

export interface InsurancePurchaseResult {
  providerRef: string;
  feeCents: number;
  coverageCents: number;
}

export interface InsuranceFileClaimArgs {
  orderId: string;
  providerRef?: string | null;
  reason: InsuranceReason;
  amountCents: number;
  description?: string;
}

export interface InsuranceProvider {
  code: string;
  isActive: boolean;
  quote(args: InsuranceQuoteArgs): Promise<InsuranceQuoteResult>;
  purchase(args: InsurancePurchaseArgs): Promise<InsurancePurchaseResult>;
  fileClaim(args: InsuranceFileClaimArgs): Promise<{ providerClaimRef: string }>;
  refreshClaim(providerClaimRef: string): Promise<{
    status: "submitted" | "under_review" | "approved" | "denied" | "paid";
    reimbursedCents?: number;
  }>;
}
