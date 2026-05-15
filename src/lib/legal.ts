import type { User } from "@supabase/supabase-js";

export const REQUIRED_LEGAL_VERSION = "1.1";
export const SELLER_AGREEMENT_VERSION = "1.0";

export const REQUIRED_LEGAL_DOCS = ["tos", "community_guidelines", "age_18_plus"] as const;

export function hasCompletedRequiredAgreementsFromMetadata(user: User | null | undefined) {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  return (
    meta.age_verified === true &&
    meta.tos_accepted === true &&
    meta.guidelines_accepted === true &&
    meta.agreements_version === REQUIRED_LEGAL_VERSION &&
    meta.agreements_review_required !== true
  );
}

export function legalAcceptanceMetadata() {
  const acceptedAt = new Date().toISOString();
  return {
    age_verified: true,
    age_verified_at: acceptedAt,
    tos_accepted: true,
    tos_accepted_at: acceptedAt,
    guidelines_accepted: true,
    guidelines_accepted_at: acceptedAt,
    agreements_version: REQUIRED_LEGAL_VERSION,
    agreements_completed_at: acceptedAt,
    agreements_review_required: false,
  };
}