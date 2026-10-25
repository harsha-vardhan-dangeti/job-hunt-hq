import { useState } from 'react';
import {
  CLOSED,
  LABEL,
  STAGES,
  STATUSES,
  daysAgo,
  deadlinePassed,
  dueReason,
  fmtDate,
  isStale,
  nextStepText,
  sourceName,
} from './model';
import { Fit } from './parts';

export const DEFAULT_FILTERS = { filter: 'open', query: '', minFit: 0, sort: 'priority' };

export function applyFilters(jobs, { filter, query, minFit, sort }) {
  const q = query.trim().toLowerCase();
  let list = jobs.filter((j) => {
    if (filter === 'due' && !dueReason(j)) return false;
    if (filter === 'stale' && !isStale(j)) return false;
    if (filter === 'open' && CLOSED.has(j.status)) return false;
    if (!['all', 'due', 'stale', 'open'].includes(filter) && j.status !== filter) return false;
    if (minFit && (j.fit || 0) < minFit) return false;
    if (q) {
      const hay = `${j.company} ${j.role} ${j.contact} ${j.source} ${j.jobId} ${j.notes}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const byCompany = (a, b) => String(a.company).localeCompare(String(b.company));
  if (sort === 'company') list = [...list].sort(byCompany);
  else if (sort === 'fit') list = [...list].sort((a, b) => (b.fit || 0) - (a.fit || 0) || byCompany(a, b));
  else if (sort === 'added') list = [...list].sort((a, b) => String(b.addedOn).localeCompare(String(a.addedOn)));
  else if (sort === 'updated')
    list = [...list].sort((a, b) => String(b._updatedAt || '').localeCompare(String(a._updatedAt || '')));
  else
    list = [...list].sort(
      (a, b) =>
        Boolean(dueReason(b)) - Boolean(dueReason(a)) || (b.fit || 0) - (a.fit || 0) || byCompany(a, b)
    );
  return list;
}

export function countBy(jobs) {
  const c = {
    all: jobs.length,
    open: jobs.filter((j) => !CLOSED.has(j.status)).length,
    due: jobs.filter((j) => dueReason(j)).length,
    stale: jobs.filter(isStale).length,
  };
  for (const [k] of STATUSES) c[k] = jobs.filter((j) => j.status === k).length;
  return c;
}

/** Search, fit, sort and the quick filters, shared by Pipeline and Roles. */
export function Filters({ filters, setFilters, counts, searchRef, showPills = true, onAdd, readOnly }) {
  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const pills = [
    ['open', 'Open'],
    ['due', 'Needs action'],
    ['stale', 'Stale'],
    ['all', 'All'],
    ...STATUSES.filter(([k]) => counts[k] > 0),
  ];
  return (
    <div className="filters">
      <div className="toolbar">
        <div className="toolbar-left">
          <input
            id="q"
            ref={searchRef}
            type="search"
            placeholder="Search company, role, contact or notes  ( / )"
            aria-label="Search roles"
            value={filters.query}
            onChange={(e) => set('query', e.target.value)}
          />
          <select aria-label="Minimum fit" value={filters.minFit} onChange={(e) => set('minFit', Number(e.target.value))}>
            <option value={0}>Any fit</option>
            <option value={4}>Fit 4 and up</option>
            <option value={5}>Fit 5 only</option>
          </select>
          <select aria-label="Sort by" value={filters.sort} onChange={(e) => set('sort', e.target.value)}>
            <option value="priority">Most urgent first</option>
            <option value="fit">Best fit first</option>
            <option value="updated">Recently updated</option>
            <option value="added">Newest added</option>
            <option value="company">Company A–Z</option>
          </select>
        </div>
        <button className="primary" onClick={onAdd} disabled={readOnly}>
          Add a role
        </button>
      </div>
      {showPills ? (
        <div className="stats" role="group" aria-label="Show">
          {pills.map(([k, label]) => (
            <button
              key={k}
              className={`stat${(k === 'due' || k === 'stale') && counts[k] ? ' alert' : ''}`}
              aria-pressed={filters.filter === k}
              onClick={() => set('filter', k)}
            >
              <b>{counts[k]}</b>
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function cardHint(j) {
  const due = dueReason(j);
  if (deadlinePassed(j)) return { text: 'Deadline passed', late: true };
  if (due === 'deadline') return { text: `Due ${fmtDate(j.deadline)}`, late: true };
  if (due === 'interview') return { text: `Interview ${fmtDate(j.interviewAt)}`, late: true };
  if (due === 'follow-up') return { text: 'Follow up', late: true };
  if (j.postedOn) return { text: `Posted ${daysAgo(j.postedOn)}d ago`, late: false };
  return { text: '', late: false };
}

/** The pipeline as columns. Drag a card to another column to move it. */
export function PipelineView({ rows, openRole, act, readOnly }) {
  const [over, setOver] = useState(null);
  const [dragId, setDragId] = useState(null);

  function drop(status) {
    setOver(null);
    const j = rows.find((r) => r.id === dragId);
    setDragId(null);
    if (!j || j.status === status || readOnly) return;
    act(j, { status }, `${j.company} moved to ${LABEL[status]}`);
  }

  return (
    <>
      <p className="hint">Drag a card into another column to change its stage. Click it to open the role.</p>
      <div className="board">
        {STAGES.map((status) => {
          const items = rows.filter((j) => j.status === status);
          return (
            <section
              className={`col${over === status ? ' over' : ''}`}
              key={status}
              aria-label={LABEL[status]}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((o) => (o === status ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                drop(status);
              }}
            >
              <div className="col-head">
                <span className={`dot s-${status}`} aria-hidden="true" />
                <b>{LABEL[status]}</b>
                <span className="col-count">{items.length}</span>
              </div>
              <div className="col-body">
                {items.length === 0 ? (
                  <p className="col-empty">{dragId ? 'Drop here' : 'Nothing here'}</p>
                ) : (
                  items.map((j) => {
                    const hint = cardHint(j);
                    return (
                      <button
                        key={j.id}
                        className={`jcard f${j.fit || 3}${hint.late ? ' due' : ''}${dragId === j.id ? ' dragging' : ''}`}
                        draggable={!readOnly}
                        onDragStart={(e) => {
                          setDragId(j.id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOver(null);
                        }}
                        onClick={() => openRole(j.id)}
                      >
                        <span className="co">{j.company}</span>
                        <span className="role">{j.role || 'Role to pick'}</span>
                        <span className="jcard-foot">
                          <Fit n={j.fit} />
                          <span className={`small${hint.late ? ' late' : ' muted'}`}>{hint.text}</span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

export function RolesView({ rows, total, openRole }) {
  return (
    <div className="tablebox">
      <table>
        <thead>
          <tr>
            <th>Company and role</th>
            <th>Stage</th>
            <th>Fit</th>
            <th>Next step</th>
            <th>Updated</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="empty">
                {total ? 'No roles match. Clear the search or pick another filter.' : 'No roles yet. Add one to start tracking.'}
              </td>
            </tr>
          ) : (
            rows.map((j) => {
              const late = Boolean(dueReason(j)) || deadlinePassed(j);
              return (
                <tr
                  key={j.id}
                  className="row"
                  tabIndex={0}
                  onClick={() => openRole(j.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openRole(j.id);
                    }
                  }}
                >
                  <td>
                    <div className="co">{j.company}</div>
                    <div className="role">{j.role || 'Role to pick'}</div>
                  </td>
                  <td>
                    <span className={`chip s-${j.status}`}>{LABEL[j.status] || j.status}</span>
                  </td>
                  <td>
                    <Fit n={j.fit} />
                  </td>
                  <td className={late ? 'late' : ''}>{nextStepText(j)}</td>
                  <td className="num-text">{fmtDate(j.updatedOn)}</td>
                  <td className="role">{sourceName(j)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
