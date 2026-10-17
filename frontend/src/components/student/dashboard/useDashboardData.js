import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getStudentAssignments,
  getStudentDashboard,
  getStudentProblems,
  getStudentSubmissions,
} from '../../../api/student';

/**
 * Every student endpoint answers with the `{ success, data }` envelope, so the
 * payload always sits at `response.data.data`. Reading `response.data` instead
 * silently yields the envelope and turns real metrics into `undefined`.
 */
const payload = (response) => response?.data?.data;

const EMPTY_ARRAY = (data) => (Array.isArray(data) ? data : []);

/**
 * Guards against a slow request overwriting a newer one. Each call to
 * `begin()` takes a ticket and returns a predicate reporting whether its own
 * response has since been superseded — including by unmount, so no state is
 * written after the section is gone.
 *
 * `mounted` is re-armed in the effect BODY, not only cleared in the cleanup.
 * React 18 StrictMode (enabled in main.jsx) mounts, unmounts and remounts every
 * component in development; a cleanup-only flag stays `false` after that
 * simulated unmount, so every response was judged superseded, no section ever
 * left its loading state, and the dashboard showed placeholders instead of real
 * metrics while every request had actually succeeded.
 */
function useRequestSequence() {
  const issued = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return useCallback(() => {
    issued.current += 1;
    const ticket = issued.current;
    return () => !mounted.current || ticket !== issued.current;
  }, []);
}

/**
 * One independently loading section.
 *
 * `status` is 'loading' | 'ready' | 'error'. An error never becomes an empty
 * success: previously loaded data is kept and the section reports the failure,
 * so a metric is never silently shown as zero.
 */
function useSection(getter, select) {
  const [state, setState] = useState({ status: 'loading', data: select(null), error: null });
  const begin = useRequestSequence();
  const getterRef = useRef(getter);
  const selectRef = useRef(select);
  getterRef.current = getter;
  selectRef.current = select;

  const load = useCallback(async () => {
    let previous = null;
    setState((current) => {
      previous = current.data;
      return { ...current, status: 'loading', error: null };
    });
    const isSuperseded = begin();
    try {
      const response = await getterRef.current();
      if (isSuperseded()) return;
      setState({ status: 'ready', data: selectRef.current(payload(response)), error: null });
    } catch (error) {
      if (isSuperseded()) return;
      setState({
        status: 'error',
        data: previous,
        error: error?.response?.data?.message || 'Something went wrong. Please try again.',
      });
    }
  }, [begin]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}

/** Builds the last 7 day buckets (oldest first) from real submission timestamps. */
export function buildWeeklyActivity(submissions) {
  const days = [];
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(midnight);
    date.setDate(date.getDate() - offset);
    days.push({ key: date.toISOString(), date, total: 0, accepted: 0 });
  }

  for (const submission of submissions) {
    if (!submission?.createdAt) continue;
    const stamp = new Date(submission.createdAt);
    if (Number.isNaN(stamp.getTime())) continue;
    // Today has no following bucket, so its window runs to the end of the day.
    const index = days.findIndex(
      (day, position) =>
        stamp >= day.date && (position === days.length - 1 || stamp < days[position + 1].date),
    );
    if (index === -1) continue;
    days[index].total += 1;
    if (submission.verdict === 'ACCEPTED') days[index].accepted += 1;
  }

  return days;
}

/**
 * Loads the four student endpoints the dashboard reads. Each owns its own
 * loading/error state so one failing section cannot blank the page, and each
 * endpoint is requested exactly once on mount.
 */
export default function useDashboardData() {
  const dashboard = useSection(getStudentDashboard, (data) => data ?? null);
  const assignments = useSection(getStudentAssignments, EMPTY_ARRAY);
  const problems = useSection(getStudentProblems, EMPTY_ARRAY);
  const submissions = useSection(getStudentSubmissions, EMPTY_ARRAY);

  return useMemo(() => ({
    dashboard,
    assignments,
    problems,
    submissions,
    weeklyActivity: buildWeeklyActivity(submissions.data),
    reloadAll: () => {
      dashboard.reload();
      assignments.reload();
      problems.reload();
      submissions.reload();
    },
  }), [dashboard, assignments, problems, submissions]);
}