import 'server-only';

// The morning agent is a Claude Code routine. Its API trigger (claude.ai/code/routines
// → Edit → Trigger → + → API) gives the routine id and a token shown once.
export const agentReady = Boolean(process.env.AGENT_ROUTINE_ID && process.env.AGENT_ROUTINE_TOKEN);
