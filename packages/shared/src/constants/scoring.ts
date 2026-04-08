export const DEFAULT_DIMENSION_WEIGHTS = {
  relevance: 0.2,
  necessity: 0.2,
  importance: 0.2,
  urgency: 0.2,
  logic: 0.2,
};

// Supervisor's fixed share of the final heat score (regardless of team size)
export const SUPERVISOR_SCORE_SHARE = 0.4;
export const DEFAULT_SUPERVISOR_WEIGHT = 2.0;
export const DEFAULT_MEMBER_WEIGHT = 1.0;
export const DEFAULT_GUEST_TOKEN_EXPIRY_HOURS = 720; // 30 days
export const SCORE_MIN = 0;
export const SCORE_MAX = 5;
export const AUTO_COMPLETE_HOURS = 24;

// Note: TAG_DOMAIN_MAP, MAIN_DOMAINS, and Domain are now exported from
// ./tags.js (single source of truth for the tag taxonomy).
