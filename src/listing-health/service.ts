import type { Actor } from '../domain/types';
import { sha256 } from '../lib/hash';
import { AppError } from '../lib/errors';
import { newId } from '../lib/id';
import type { ListingHealthStore } from './store';
import type { BusinessFactVersion, CanonicalBusinessFacts, ListingComparisonRun, ListingCorrectionAttempt, ListingHealthFinding, ListingHealthSnapshot, ListingSourceObservation, ListingSeverity } from './types';

export interface ListingHealthConfig { enabled: boolean; }
export interface ListingHealthFactory { (env: CloudflareBindings): ListingHealthService; }

export function normalizePhone(value: string): string { const digits=value.replace(/\D/g,''); return digits.length>10?`+${digits}`:digits; }
export function normalizeUrl(value: string): string { try { const url=new URL(/^https?:\/\//i.test(value)?value:`https://${value}`); return `${url.hostname.replace(/^www\./,'').toLowerCase()}${url.pathname.replace(/\/$/,'')}`; } catch { return value.trim().toLowerCase().replace(/\/$/,''); } }
export function normalizeAddress(value: string): string { return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim(); }
export function normalizeHours(value: Record<string,string[]>): string { return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([day,ranges])=>[day.toLowerCase(),[...ranges].map(v=>v.trim()).sort()]))); }
function normalizeValue(field:string,value:unknown):unknown {
  if(value===null||value===undefined)return value;
  if(field==='phone'&&typeof value==='string')return normalizePhone(value);
  if(['website','orderingUrl','reservationUrl','menuUrl'].includes(field)&&typeof value==='string')return normalizeUrl(value);
  if(field==='address'&&typeof value==='string')return normalizeAddress(value);
  if(['hours','holidayHours'].includes(field)&&typeof value==='object')return normalizeHours(value as Record<string,string[]>);
  if(['latitude','longitude'].includes(field)&&typeof value==='number')return Number(value.toFixed(5));
  if(Array.isArray(value))return [...value].map(String).sort();
  return typeof value==='string'?value.trim().toLowerCase():value;
}
function severityFor(field:string):ListingSeverity { if(['phone','address','hours','holidayHours'].includes(field))return'high'; if(['orderingUrl','reservationUrl','menuUrl','latitude','longitude'].includes(field))return'medium'; return'low'; }

export class ListingHealthService {
  constructor(readonly store:ListingHealthStore,readonly config:ListingHealthConfig){}
  private assertEnabled(){if(!this.config.enabled)throw new AppError('Phase 5 listing-health engine is disabled.',503,'listing_disabled');}

  async createCanonical(actor:Actor,restaurantId:string,facts:CanonicalBusinessFacts,confirmationSource:string,effectiveAt?:string,expiresAt?:string){
    this.assertEnabled(); if(!confirmationSource.trim())throw new AppError('Confirmation source is required.',422,'confirmation_required');
    const versions=await this.store.listFactVersions(restaurantId); await this.store.supersedeFacts(restaurantId);
    const value:BusinessFactVersion={id:newId(),restaurantId,version:Math.max(0,...versions.map(v=>v.version))+1,status:'active',facts,confirmationSource,confirmedBy:actor.id,effectiveAt:effectiveAt??new Date().toISOString(),...(expiresAt?{expiresAt}:{}),createdAt:new Date().toISOString()};
    return this.store.createFactVersion(value);
  }

  async observe(actor:Actor,restaurantId:string,input:Omit<ListingSourceObservation,'id'|'restaurantId'|'createdBy'|'createdAt'>){
    this.assertEnabled(); const value:ListingSourceObservation={id:newId(),restaurantId,...input,createdBy:actor.id,createdAt:new Date().toISOString()}; return this.store.createObservation(value);
  }

  async compare(restaurantId:string,observationId:string):Promise<{run:ListingComparisonRun;findings:ListingHealthFinding[];reused:boolean}>{
    this.assertEnabled(); const canonical=(await this.store.listFactVersions(restaurantId)).find(v=>v.status==='active'); if(!canonical)throw new AppError('Active canonical facts are required.',409,'canonical_facts_required');
    const observation=await this.store.getObservation(observationId); if(!observation||observation.restaurantId!==restaurantId)throw new AppError('Listing observation not found.',404,'not_found');
    const inputHash=await sha256(JSON.stringify({canonical:canonical.facts,observation:observation.facts,canonicalVersion:canonical.version})); const existing=await this.store.findRunByHash(restaurantId,inputHash);
    if(existing)return{run:existing,findings:(await this.store.listFindings(restaurantId)).filter(f=>f.comparisonRunId===existing.id),reused:true};
    const differences:Array<{field:string;canonicalValue:unknown;observedValue:unknown}>=[];
    const fields=new Set([...Object.keys(canonical.facts),...Object.keys(observation.facts)]);
    for(const field of fields){const canonicalValue=(canonical.facts as Record<string,unknown>)[field];const observedValue=(observation.facts as Record<string,unknown>)[field];if(JSON.stringify(normalizeValue(field,canonicalValue))!==JSON.stringify(normalizeValue(field,observedValue)))differences.push({field,canonicalValue,observedValue});}
    const run:ListingComparisonRun={id:newId(),restaurantId,canonicalVersionId:canonical.id,observationId,inputHash,status:'completed',findingCount:differences.length,createdAt:new Date().toISOString()}; await this.store.createRun(run);
    const findings:ListingHealthFinding[]=[]; for(const difference of differences){const now=new Date().toISOString();findings.push(await this.store.createFinding({id:newId(),restaurantId,comparisonRunId:run.id,field:difference.field,canonicalValue:difference.canonicalValue,observedValue:difference.observedValue,severity:severityFor(difference.field),confidence:observation.confidence,status:'needs_confirmation',createdAt:now,updatedAt:now}));}
    return{run,findings,reused:false};
  }

  async decideFinding(actor:Actor,restaurantId:string,findingId:string,decision:'confirm'|'dismiss',reason:string){
    this.assertEnabled(); const finding=await this.store.getFinding(findingId); if(!finding||finding.restaurantId!==restaurantId)throw new AppError('Listing finding not found.',404,'not_found'); if(finding.status!=='needs_confirmation')throw new AppError('Finding is not awaiting confirmation.',409,'invalid_state');
    return this.store.updateFinding(findingId,{status:decision==='confirm'?'confirmed_issue':'dismissed',ownerConfirmation:`${reason} [${actor.id}]`,updatedAt:new Date().toISOString()});
  }

  async assign(restaurantId:string,findingId:string,assignedTo:string,dueAt?:string){this.assertEnabled();const finding=await this.store.getFinding(findingId);if(!finding||finding.restaurantId!==restaurantId)throw new AppError('Listing finding not found.',404,'not_found');if(finding.status!=='confirmed_issue')throw new AppError('Only confirmed issues can be assigned.',409,'invalid_state');return this.store.updateFinding(findingId,{status:'action_required',assignedTo,...(dueAt?{dueAt}:{}),updatedAt:new Date().toISOString()});}

  async recordCorrection(actor:Actor,restaurantId:string,findingId:string,evidence:string){
    this.assertEnabled();const finding=await this.store.getFinding(findingId);if(!finding||finding.restaurantId!==restaurantId)throw new AppError('Listing finding not found.',404,'not_found');if(!['confirmed_issue','action_required'].includes(finding.status))throw new AppError('Finding is not ready for correction evidence.',409,'invalid_state');
    const attempt:ListingCorrectionAttempt={id:newId(),restaurantId,findingId,evidence,performedBy:actor.id,attemptedAt:new Date().toISOString(),verificationStatus:'pending'};await this.store.createCorrection(attempt);await this.store.updateFinding(findingId,{status:'verification_pending',updatedAt:new Date().toISOString()});return attempt;
  }

  async verifyCorrection(actor:Actor,restaurantId:string,attemptId:string,verified:boolean,evidence:string){
    this.assertEnabled();const attempt=await this.store.getCorrection(attemptId);if(!attempt||attempt.restaurantId!==restaurantId)throw new AppError('Correction attempt not found.',404,'not_found');if(attempt.verificationStatus!=='pending')throw new AppError('Correction was already verified.',409,'invalid_state');
    const updated=await this.store.updateCorrection(attemptId,{verificationStatus:verified?'verified':'failed',verificationEvidence:evidence,verifiedBy:actor.id,verifiedAt:new Date().toISOString()});await this.store.updateFinding(attempt.findingId,{status:verified?'closed':'action_required',updatedAt:new Date().toISOString()});return updated;
  }

  async snapshot(restaurantId:string):Promise<ListingHealthSnapshot>{
    this.assertEnabled();const [versions,observations,findings]=await Promise.all([this.store.listFactVersions(restaurantId),this.store.listObservations(restaurantId),this.store.listFindings(restaurantId)]);const byStatus:Record<string,number>={};const bySeverity:Record<string,number>={};for(const f of findings){byStatus[f.status]=(byStatus[f.status]??0)+1;bySeverity[f.severity]=(bySeverity[f.severity]??0)+1;}return{restaurantId,canonicalVersion:versions.find(v=>v.status==='active')?.version??null,observations:observations.length,findings:byStatus,bySeverity,generatedAt:new Date().toISOString()};
  }
}
