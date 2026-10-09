import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStudentDashboard } from '../../api/student';
import DailyTraining from './DailyTraining';
import './Batch.css';

export default function Batch() {
  const [batch, setBatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = useCallback(async () => { setLoading(true); setError(null); try { const response = await getStudentDashboard(); setBatch(response.data?.data?.batch || null); } catch (err) { setError(err?.response?.data?.message || 'Unable to load your batch.'); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  if (loading) return <main className="batch-page" role="status"><div className="batch-page__loading">Loading your batch…</div></main>;
  if (error) return <main className="batch-page"><div className="batch-page__error" role="alert"><p>{error}</p><button type="button" onClick={load}>Retry</button></div></main>;
  if (!batch) return <main className="batch-page"><section className="batch-page__empty"><span>Batch access</span><h1>You are not enrolled in any batch.</h1><p>Your global practice environment is still available.</p><Link to="/student/practice">Practice Global →</Link></section></main>;
  return <main className="batch-page"><header className="batch-page__header"><div><span>Current batch</span><h1>{batch.name}</h1><p>{[batch.branch, batch.academicYear].filter(Boolean).join(' · ') || 'Your assigned training space'}</p></div><strong>{batch.status || 'Active'}</strong><p className="batch-page__trainer">{batch.trainer ? `Trainer: ${batch.trainer}` : ''}</p></header><DailyTraining /> </main>;
}
