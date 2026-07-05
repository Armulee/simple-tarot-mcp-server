/**
 * Fallback alias: clients that fail to discover the authorization server
 * metadata use the MCP-spec default endpoint paths at the origin root
 * (/register, /authorize, /token). Same handlers as /oauth/*.
 */
export { POST, OPTIONS, maxDuration } from "../oauth/register/route";
