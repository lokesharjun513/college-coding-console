import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createProblem, getProblem, updateProblem } from '../../api/trainer';
import Spinner from '../../components/ui/Spinner';

export default function ProblemEditor() {
  const { batchId, problemId } = useParams();
  const navigate = useNavigate();
  const isEdit = !!problemId;
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState('EASY');
  const [status, setStatus] = useState('DRAFT');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit) {
      const fetchData = async () => {
        try {
          const res = await getProblem(batchId, problemId);
          const p = res.data?.data;
          setTitle(p.title);
          setDescription(p.description);
          setDifficulty(p.difficulty);
          setStatus(p.status);
        } catch (err) {
          setError(err?.response?.data?.message || 'Failed to load problem');
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }
  }, [batchId, problemId, isEdit]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await updateProblem(batchId, problemId, { title, description, difficulty, status });
      } else {
        await createProblem(batchId, { title, description, difficulty, status });
      }
      navigate(`/trainer/batches/${batchId}/pro``);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save problem');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <h2>{isEdit ? 'Edit Problem' : 'Create Problem'}</h2>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div>
          <label>Title:</label><br />
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label>Description:</label><br />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} required />
        </div>
        <div>
          <label>Difficulty:</label><br />
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
        </div>
        <div>
          <label>Status:</label><br />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </form>
    </div>
  );
}
