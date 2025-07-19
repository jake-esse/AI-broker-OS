// ===============================================================================
// AI-Broker MVP · CORS Configuration
// ===============================================================================
//
// BUSINESS PURPOSE:
// Provides consistent CORS (Cross-Origin Resource Sharing) headers across all
// Edge Functions to enable secure cross-origin requests from the Broker UI
// and other frontend applications.
//
// SECURITY CONSIDERATIONS:
// - Allows requests from trusted origins only
// - Supports preflight OPTIONS requests
// - Enables secure credential sharing
// - Prevents unauthorized cross-origin access
//
// USAGE:
// Import and use in all Edge Functions to maintain consistent CORS policy
// ===============================================================================

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400', // 24 hours
}