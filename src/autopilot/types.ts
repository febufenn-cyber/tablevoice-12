import type{ReviewCategory}from'../domain/types';
export type AutomationLevel=0|1|2|3;
export interface AutomationPolicy{id:string;restaurantId:string;version:number;status:'draft'|'shadow'|'active'|'paused'|'revoked';level:AutomationLevel;allowedSources:string[];allowedCategories:ReviewCategory[];allowedLanguages:string[];maxRisk:'green';voiceProfileId:string;voiceProfileVersion:number;promptVersion:string;model:string;minimumShadowDecisions:number;minimumAgreementRate:number;consentEvidence?:string;consentedBy?:string;consentedAt?:string;createdAt:string;updatedAt:string;}
export interface ShadowDecision{id:string;restaurantId:string;policyId:string;reviewId:string;eligible:boolean;reason:string;proposedAction:'manual'|'auto_approve'|'auto_publish';humanDecision?:string;agreed?:boolean;createdAt:string;}
export interface AutomationExecution{id:string;restaurantId:string;policyId:string;reviewId:string;idempotencyKey:string;action:'auto_approve'|'auto_publish';status:'blocked'|'executed'|'failed';reason:string;createdAt:string;completedAt?:string;}
export interface AutomationKillSwitch{id:string;restaurantId:string;scope:'restaurant'|'global';active:boolean;reason:string;activatedBy:string;activatedAt:string;clearedBy?:string;clearedAt?:string;}
export interface AutomationEvaluation{eligible:boolean;reason:string;action:'manual'|'auto_approve'|'auto_publish';}
