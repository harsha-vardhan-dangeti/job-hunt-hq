import Tracker from '../components/Tracker';
import { listJobs, getBrief, getResume, listEvents, hasDb } from '../lib/db';
import { agentReady } from '../lib/agent';
import { gateConfigured } from '../lib/gate';

export const dynamic = 'force-dynamic';

export default async function Page() {
  let jobs = [];
  let brief = {};
  let resume = {};
  let events = [];
  let error = '';

  try {
    // The resume is optional: without it (or its table) the tracker still loads.
    [jobs, brief, resume, events] = await Promise.all([
      listJobs(),
      getBrief(),
      getResume().catch(() => ({})),
      listEvents(90),
    ]);
  } catch (err) {
    error = String(err.message || err);
  }

  return (
    <Tracker
      initialJobs={jobs}
      initialBrief={brief}
      initialResume={resume}
      events={events}
      readOnly={!hasDb}
      loadError={error}
      agentReady={agentReady}
      gated={gateConfigured()}
    />
  );
}
