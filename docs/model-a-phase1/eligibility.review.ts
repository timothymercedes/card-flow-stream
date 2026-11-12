// Review-only pure policy. Not imported by the app; no provider or database access.
export function deliveryUnlockBps(deliveries: number): number | null {
  if (!Number.isSafeInteger(deliveries) || deliveries < 0) throw new Error('Invalid delivery count');
  if (deliveries < 25) return null; // Below-25 terms not approved: no invented policy.
  if (deliveries < 50) return 1000;
  if (deliveries < 75) return 3000;
  if (deliveries < 100) return 7000;
  return 9500;
}

export function availableEntitlement(input: {
  verifiedDeliveredNetCents: bigint;
  deliveries: number;
  transferredCents: bigint;
  reservedCents: bigint;
  recoveryDebtCents: bigint;
  held: boolean;
  policyApproved: boolean;
  legacyDestination: boolean;
}): bigint {
  for (const value of [input.verifiedDeliveredNetCents,input.transferredCents,input.reservedCents,input.recoveryDebtCents]) {
    if (value < 0n) throw new Error('Invalid negative amount');
  }
  const bps=deliveryUnlockBps(input.deliveries);
  if (bps===null || !input.policyApproved || input.held || input.legacyDestination) return 0n;
  const cumulativeCap=input.verifiedDeliveredNetCents*BigInt(bps)/10000n;
  const remaining=cumulativeCap-input.transferredCents-input.reservedCents-input.recoveryDebtCents;
  return remaining>0n ? remaining : 0n;
}