import Tracker from '../components/Tracker';
import { listJobs, getBrief, listEvents, hasDb } from '../lib/db';
import { agentReady } from '../lib/agent';

export const dynamic = 'force-dynamic';

export default async function Page() {
  let jobs = [];
  let brief = {};
  let events = [];
  let error = '';

  try {
    [jobs, brief, events] = await Promise.all([listJobs(), getBrief(), listEvents(90)]);
  } catch (err) {
    error = String(err.message || err);
  }

  return (
    <Tracker
      initialJobs={jobs}
      initialBrief={brief}
      events={events}
      readOnly={!hasDb}
      loadError={error}
      agentReady={agentReady}
      gated={Boolean(process.env.APP_PASSWORD)}
    />
  );
}
