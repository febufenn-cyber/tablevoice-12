import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../lib/errors';
import type { BusinessFactVersion, ListingComparisonRun, ListingCorrectionAttempt, ListingHealthFinding, ListingSourceObservation } from './types';

export interface ListingHealthStore {
  listFactVersions(restaurantId: string): Promise<BusinessFactVersion[]>;
  createFactVersion(value: BusinessFactVersion): Promise<BusinessFactVersion>;
  supersedeFacts(restaurantId: string): Promise<void>;
  createObservation(value: ListingSourceObservation): Promise<ListingSourceObservation>;
  getObservation(id: string): Promise<ListingSourceObservation | null>;
  listObservations(restaurantId: string): Promise<ListingSourceObservation[]>;
  findRunByHash(restaurantId: string, inputHash: string): Promise<ListingComparisonRun | null>;
  createRun(value: ListingComparisonRun): Promise<ListingComparisonRun>;
  createFinding(value: ListingHealthFinding): Promise<ListingHealthFinding>;
  getFinding(id: string): Promise<ListingHealthFinding | null>;
  updateFinding(id: string, patch: Partial<ListingHealthFinding>): Promise<ListingHealthFinding>;
  listFindings(restaurantId: string): Promise<ListingHealthFinding[]>;
  createCorrection(value: ListingCorrectionAttempt): Promise<ListingCorrectionAttempt>;
  getCorrection(id: string): Promise<ListingCorrectionAttempt | null>;
  updateCorrection(id: string, patch: Partial<ListingCorrectionAttempt>): Promise<ListingCorrectionAttempt>;
  listCorrections(findingId: string): Promise<ListingCorrectionAttempt[]>;
}

function clone<T>(value: T): T { return structuredClone(value); }

export class MemoryListingHealthStore implements ListingHealthStore {
  facts = new Map<string, BusinessFactVersion>(); observations = new Map<string, ListingSourceObservation>(); runs = new Map<string, ListingComparisonRun>(); findings = new Map<string, ListingHealthFinding>(); corrections = new Map<string, ListingCorrectionAttempt>();
  async listFactVersions(restaurantId: string) { return [...this.facts.values()].filter((item) => item.restaurantId === restaurantId).sort((a,b)=>b.version-a.version).map(clone); }
  async createFactVersion(value: BusinessFactVersion) { this.facts.set(value.id, clone(value)); return clone(value); }
  async supersedeFacts(restaurantId: string) { for (const [id,item] of this.facts) if (item.restaurantId === restaurantId && item.status === 'active') this.facts.set(id,{...item,status:'superseded'}); }
  async createObservation(value: ListingSourceObservation) { this.observations.set(value.id, clone(value)); return clone(value); }
  async getObservation(id: string) { return clone(this.observations.get(id) ?? null); }
  async listObservations(restaurantId: string) { return [...this.observations.values()].filter((item)=>item.restaurantId===restaurantId).map(clone); }
  async findRunByHash(restaurantId: string,inputHash:string) { return clone([...this.runs.values()].find((item)=>item.restaurantId===restaurantId&&item.inputHash===inputHash) ?? null); }
  async createRun(value: ListingComparisonRun) { this.runs.set(value.id,clone(value)); return clone(value); }
  async createFinding(value: ListingHealthFinding) { this.findings.set(value.id,clone(value)); return clone(value); }
  async getFinding(id:string) { return clone(this.findings.get(id) ?? null); }
  async updateFinding(id:string,patch:Partial<ListingHealthFinding>) { const current=this.findings.get(id); if(!current) throw new AppError('Listing finding not found.',404,'not_found'); const value={...current,...patch}; this.findings.set(id,clone(value)); return clone(value); }
  async listFindings(restaurantId:string) { return [...this.findings.values()].filter((item)=>item.restaurantId===restaurantId).map(clone); }
  async createCorrection(value:ListingCorrectionAttempt) { this.corrections.set(value.id,clone(value)); return clone(value); }
  async getCorrection(id:string) { return clone(this.corrections.get(id) ?? null); }
  async updateCorrection(id:string,patch:Partial<ListingCorrectionAttempt>) { const current=this.corrections.get(id); if(!current) throw new AppError('Correction attempt not found.',404,'not_found'); const value={...current,...patch}; this.corrections.set(id,clone(value)); return clone(value); }
  async listCorrections(findingId:string) { return [...this.corrections.values()].filter((item)=>item.findingId===findingId).map(clone); }
}

type Row=Record<string,unknown>;
const snake=(value:object):Row=>Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k.replace(/[A-Z]/g,l=>`_${l.toLowerCase()}`),v]));
const camel=(row:Row):Row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k.replace(/_([a-z])/g,(_,l:string)=>l.toUpperCase()),v]));
function one<T>(data:T|null,error:{message:string}|null,label:string):T { if(error) throw new AppError(`${label}: ${error.message}`,500,'listing_store_error'); if(!data) throw new AppError(`${label} returned no data.`,500,'listing_store_error'); return data; }

export class SupabaseListingHealthStore implements ListingHealthStore {
  private client:SupabaseClient;
  constructor(url:string,key:string){if(!url||!key)throw new AppError('Listing-health storage is not configured.',503,'listing_not_configured');this.client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});}
  async listFactVersions(restaurantId:string){const{data,error}=await this.client.from('business_fact_versions').select('*').eq('restaurant_id',restaurantId).order('version',{ascending:false});if(error)throw new AppError(error.message,500,'listing_store_error');return(data??[]).map(r=>camel(r) as unknown as BusinessFactVersion);}
  async createFactVersion(value:BusinessFactVersion){const{data,error}=await this.client.from('business_fact_versions').insert(snake(value)).select().single();return camel(one(data,error,'Create business facts')) as unknown as BusinessFactVersion;}
  async supersedeFacts(restaurantId:string){const{error}=await this.client.from('business_fact_versions').update({status:'superseded'}).eq('restaurant_id',restaurantId).eq('status','active');if(error)throw new AppError(error.message,500,'listing_store_error');}
  async createObservation(value:ListingSourceObservation){const{data,error}=await this.client.from('listing_source_observations').insert(snake(value)).select().single();return camel(one(data,error,'Create listing observation')) as unknown as ListingSourceObservation;}
  async getObservation(id:string){const{data,error}=await this.client.from('listing_source_observations').select('*').eq('id',id).maybeSingle();if(error)throw new AppError(error.message,500,'listing_store_error');return data?camel(data) as unknown as ListingSourceObservation:null;}
  async listObservations(restaurantId:string){const{data,error}=await this.client.from('listing_source_observations').select('*').eq('restaurant_id',restaurantId).order('observed_at',{ascending:false});if(error)throw new AppError(error.message,500,'listing_store_error');return(data??[]).map(r=>camel(r) as unknown as ListingSourceObservation);}
  async findRunByHash(restaurantId:string,inputHash:string){const{data,error}=await this.client.from('listing_comparison_runs').select('*').eq('restaurant_id',restaurantId).eq('input_hash',inputHash).maybeSingle();if(error)throw new AppError(error.message,500,'listing_store_error');return data?camel(data) as unknown as ListingComparisonRun:null;}
  async createRun(value:ListingComparisonRun){const{data,error}=await this.client.from('listing_comparison_runs').insert(snake(value)).select().single();return camel(one(data,error,'Create comparison run')) as unknown as ListingComparisonRun;}
  async createFinding(value:ListingHealthFinding){const{data,error}=await this.client.from('listing_health_findings').insert(snake(value)).select().single();return camel(one(data,error,'Create listing finding')) as unknown as ListingHealthFinding;}
  async getFinding(id:string){const{data,error}=await this.client.from('listing_health_findings').select('*').eq('id',id).maybeSingle();if(error)throw new AppError(error.message,500,'listing_store_error');return data?camel(data) as unknown as ListingHealthFinding:null;}
  async updateFinding(id:string,patch:Partial<ListingHealthFinding>){const mutable={...patch} as Row;delete mutable.id;delete mutable.restaurantId;const{data,error}=await this.client.from('listing_health_findings').update(snake(mutable)).eq('id',id).select().single();return camel(one(data,error,'Update listing finding')) as unknown as ListingHealthFinding;}
  async listFindings(restaurantId:string){const{data,error}=await this.client.from('listing_health_findings').select('*').eq('restaurant_id',restaurantId).order('created_at',{ascending:false});if(error)throw new AppError(error.message,500,'listing_store_error');return(data??[]).map(r=>camel(r) as unknown as ListingHealthFinding);}
  async createCorrection(value:ListingCorrectionAttempt){const{data,error}=await this.client.from('listing_correction_attempts').insert(snake(value)).select().single();return camel(one(data,error,'Create correction attempt')) as unknown as ListingCorrectionAttempt;}
  async getCorrection(id:string){const{data,error}=await this.client.from('listing_correction_attempts').select('*').eq('id',id).maybeSingle();if(error)throw new AppError(error.message,500,'listing_store_error');return data?camel(data) as unknown as ListingCorrectionAttempt:null;}
  async updateCorrection(id:string,patch:Partial<ListingCorrectionAttempt>){const mutable={...patch} as Row;delete mutable.id;delete mutable.restaurantId;const{data,error}=await this.client.from('listing_correction_attempts').update(snake(mutable)).eq('id',id).select().single();return camel(one(data,error,'Update correction attempt')) as unknown as ListingCorrectionAttempt;}
  async listCorrections(findingId:string){const{data,error}=await this.client.from('listing_correction_attempts').select('*').eq('finding_id',findingId).order('attempted_at',{ascending:false});if(error)throw new AppError(error.message,500,'listing_store_error');return(data??[]).map(r=>camel(r) as unknown as ListingCorrectionAttempt);}
}
