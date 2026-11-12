import { describe,it,expect } from 'vitest';
import { availableEntitlement,deliveryUnlockBps } from './eligibility.review';

describe('proposed delivery policy (review-only)',()=>{
  it.each([[25,1000],[50,3000],[75,7000],[100,9500]])('at %i deliveries unlocks %i basis points',(count,bps)=>{
    expect(deliveryUnlockBps(count)).toBe(bps);
  });
  it('does not invent below-25 release terms',()=>expect(deliveryUnlockBps(24)).toBeNull());
  it.each([[49,1000],[74,3000],[99,7000],[101,9500]])('holds boundary %i at %i',(count,bps)=>{
    expect(deliveryUnlockBps(count)).toBe(bps);
  });
  const basis={verifiedDeliveredNetCents:9500n,deliveries:100,transferredCents:0n,reservedCents:0n,recoveryDebtCents:0n,held:false,policyApproved:true,legacyDestination:false};
  it('keeps 5% of seller net distinct from commission',()=>expect(availableEntitlement(basis)).toBe(9025n));
  it('never releases undelivered earnings',()=>expect(availableEntitlement({...basis,verifiedDeliveredNetCents:0n})).toBe(0n));
  it('subtracts accepted and reserved amounts exactly once',()=>expect(availableEntitlement({...basis,transferredCents:2000n,reservedCents:1000n,recoveryDebtCents:25n})).toBe(6000n));
  it('cannot retransfer legacy destination earnings',()=>expect(availableEntitlement({...basis,legacyDestination:true})).toBe(0n));
  it('cannot activate unapproved reserve policy',()=>expect(availableEntitlement({...basis,policyApproved:false})).toBe(0n));
  it('freezes active holds',()=>expect(availableEntitlement({...basis,held:true})).toBe(0n));
});