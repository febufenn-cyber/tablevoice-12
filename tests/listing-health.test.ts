import { describe, expect, it } from 'vitest';
import type { Actor } from '../src/domain/types';
import { ListingHealthService, normalizeAddress, normalizeHours, normalizePhone, normalizeUrl } from '../src/listing-health/service';
import { MemoryListingHealthStore } from '../src/listing-health/store';

const actor:Actor={id:'11111111-1111-4111-8111-111111111111',platformRole:'user'};
const restaurantId='22222222-2222-4222-8222-222222222222';

describe('Phase 5 listing-health engine',()=>{
  it('normalizes phones, urls, addresses, and hours deterministically',()=>{
    expect(normalizePhone('+91 (98765) 43210')).toBe('+919876543210');
    expect(normalizeUrl('https://www.Example.com/menu/')).toBe('example.com/menu');
    expect(normalizeAddress('12, Main-Road  Madurai')).toBe('12 main road madurai');
    expect(normalizeHours({Tue:['18:00-22:00'],Mon:['09:00-17:00']})).toBe('{"mon":["09:00-17:00"],"tue":["18:00-22:00"]}');
  });

  it('creates idempotent comparison runs and never labels a difference as an issue before confirmation',async()=>{
    const store=new MemoryListingHealthStore();const service=new ListingHealthService(store,{enabled:true});
    await service.createCanonical(actor,restaurantId,{phone:'+91 98765 43210',website:'https://example.com',hours:{Mon:['09:00-17:00']}},'Owner confirmation');
    const observation=await service.observe(actor,restaurantId,{source:'manual',facts:{phone:'9876543210',website:'www.example.com/',hours:{Mon:['10:00-17:00']}},confidence:'high',observedAt:new Date().toISOString()});
    const first=await service.compare(restaurantId,observation.id);const second=await service.compare(restaurantId,observation.id);
    expect(first.findings).toHaveLength(1);expect(first.findings[0]?.field).toBe('hours');expect(first.findings[0]?.status).toBe('needs_confirmation');expect(second.reused).toBe(true);expect(second.run.id).toBe(first.run.id);
  });

  it('keeps correction evidence and independent verification as separate states',async()=>{
    const store=new MemoryListingHealthStore();const service=new ListingHealthService(store,{enabled:true});
    await service.createCanonical(actor,restaurantId,{phone:'1111111111'},'Owner');
    const observation=await service.observe(actor,restaurantId,{source:'manual',facts:{phone:'2222222222'},confidence:'high',observedAt:new Date().toISOString()});
    const comparison=await service.compare(restaurantId,observation.id);const finding=comparison.findings[0]!;
    await expect(service.assign(restaurantId,finding.id,actor.id)).rejects.toMatchObject({code:'invalid_state'});
    await service.decideFinding(actor,restaurantId,finding.id,'confirm','Owner confirmed the canonical phone.');
    await service.assign(restaurantId,finding.id,actor.id);
    const attempt=await service.recordCorrection(actor,restaurantId,finding.id,'Screenshot after source update.');
    expect((await store.getFinding(finding.id))?.status).toBe('verification_pending');
    await service.verifyCorrection(actor,restaurantId,attempt.id,true,'Independent check shows the canonical phone.');
    expect((await store.getFinding(finding.id))?.status).toBe('closed');
  });

  it('keeps snapshots and records restaurant scoped',async()=>{
    const store=new MemoryListingHealthStore();const service=new ListingHealthService(store,{enabled:true});
    await service.createCanonical(actor,restaurantId,{name:'Cafe One'},'Owner');
    const snapshot=await service.snapshot(restaurantId);expect(snapshot.canonicalVersion).toBe(1);expect(snapshot.observations).toBe(0);
    await expect(service.compare('99999999-9999-4999-8999-999999999999','00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({code:'canonical_facts_required'});
  });
});
