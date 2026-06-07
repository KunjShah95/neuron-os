export { PositionClaim, ArbitratorConfig, Disagreement, Verdict, DecisionRecord } from "./types"
export type {
  PositionClaim as PositionClaimType,
  ArbitratorConfig as ArbitratorConfigType,
  Disagreement as DisagreementType,
  Verdict as VerdictType,
  DecisionRecord as DecisionRecordType,
} from "./types"
export { DisagreementDetector, globalDetector } from "./detector"
export { createArbitrator, signDecisionRecord, verifyDecisionRecord } from "./arbitrator"
export type { Arbitrator } from "./arbitrator"
export { resolveDisagreement, loadDecisionRecord, listDecisionRecords } from "./record"
