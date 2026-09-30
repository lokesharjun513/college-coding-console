import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createAdminProblem, getAdminProblem, updateAdminProblem } from '../../api/admin';
import Spinner from '../../components/ui/Spinner';
import PageHeader from '../../components/ui/PageHeader';
import Toast from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import '../../styles/pages/admin-problems.css';

export default function ProblemEditor() {
  const { problemId } = useParams();
  const navigate = useNavigate();
  const isEdit = !!problemId;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState('EASY');
  const [constraints, setConstraints] = useState('');
  const [inputFormat, setInputFormat] = useState('');
  const [outputFormat, setOutputFormat] = useState('');
  const [status, setStatus] = useState('DRAFT');
  const [batch, setBatch] = useState('');
  const [allowedLanguages, setAllowedLanguages] = useState([]);

  useEffect(() => {
    if (isEdit) {
      getAdminProblem(problemId)
        .then(res => {
          const p = res.data?.data;
          if (!p) return;
          setTitle(p.title || '');
          setDescription(p.description || '');
          setDifficulty(p.difficulty || 'EASY');
          setConstraints(p.constraints || '');
          setInputFormat(p.inputFormat || '');
          setOutputFormat(p.outputFormat || '');
          setStatus(p.status || 'DRAFT');
          setBatch(p.batch?.id || '');
          setAllowedLanguages(p.allowedLanguages || []);
        })
        .catch(err => setError(err?.response?.data?.message || 'Failed to load problem'))
        .finally(() => setLoading(false));
    }
  }, [problemId, isEdit]);

  const handleLanguageToggle = (lang) => {
    setAllowedLanguages(prev =>
      prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title,
        description,
        difficulty,
        constraints,
        inputFormat,
        outputFormat,
        status,
        allowedLanguages,
        ...(batch ? { batch } : {}),
      };
      if (isEdit) {
        await updateAdminProblem(problemId, payload);
        setToast({ message: 'Problem updated', type: 'success' });
      } else {
        await createAdminProblem(payload);
        setToast({ message: 'Problem created', type: 'success' });
      }
      setTimeout(() => navigate('/admin/problems'), 1000);
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Save failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const LANG_OPTIONS = ['c', 'cpp', 'java', 'python', 'javascript'];

  if (loading) return <Spinner />;
  if (error) return <div style={{ color: 'var(--color-danger)' }}>{error}</div>;

  return (
    <div className="problem-editor">
      <PageHeader
        title={isEdit ? 'Edit Problem' : 'Create Problem'}
        description="Manage problem details and settings"
        className="problem-editor__header"
      />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <Card elevation="card">
        <form onSubmit={handleSubmit} className="problem-editor__form">
          {/* Title */}
          <div className="problem-editor__field">
            <label htmlFor="title" className="problem-editor__label">Title *</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              className="problem-editor__input"
            />
          </div>
          {/* Description */}
          <div className="problem-editor__field">
            <label htmlFor="description" className="problem-editor__label">Description *</label>
            <textarea
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={5}
              required
              className="problem-editor__textarea"
            />
          </div>
          {/* Difficulty + Status row */}
          <div className="problem-editor__row">
            <div className="problem-editor__field">
              <label htmlFor="difficulty" className="problem-editor__label">Difficulty *</label>
              <select
                id="difficulty"
                value={difficulty}
                onChange={e => setDifficulty(e.target.value)}
                className="problem-editor__select"
              >
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </div>
            <div className="problem-editor__field">
              <label htmlFor="status" className="problem-editor__label">Status</label>
              <select
                id="status"
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="problem-editor__select"
              >
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
          </div>
          {/* Batch */}
          {batch !== undefined && (
            <div className="problem-editor__field">
              <label htmlFor="batch" className="problem-editor__label">Batch ID (optional)</label>
              <input
                id="batch"
                type="text"
                value={batch}
                onChange={e => setBatch(e.target.value)}
                placeholder="MongoDB ObjectId"
                className="problem-editor__input"
              />
            </div>
          )}
          {/* Input/Output format */}
          <div className="problem-editor__row">
            <div className="problem-editor__field">
              <label htmlFor="inputFormat" className="problem-editor__label">Input Format</label>
              <textarea
                id="inputFormat"
                value={inputFormat}
                onChange={e => setInputFormat(e.target.value)}
                rows={2}
                className="problem-editor__textarea"
              />
            </div>
            <div className="problem-editor__field">
              <label htmlFor="outputFormat" className="problem-editor__label">Output Format</label>
              <textarea
                id="outputFormat"
                value={outputFormat}
                onChange={e => setOutputFormat(e.target.value)}
                rows={2}
                className="problem-editor__textarea"
              />
            </div>
          </div>
          {/* Constraints */}
          <div className="problem-editor__field">
            <label htmlFor="constraints" className="problem-editor__label">Constraints</label>
            <textarea
              id="constraints"
              value={constraints}
              onChange={e => setConstraints(e.target.value)}
              rows={3}
              className="problem-editor__textarea"
            />
          </div>
          {/* Allowed Languages */}
          <div className="problem-editor__field">
            <label className="problem-editor__label">Allowed Languages</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
              {LANG_OPTIONS.map(lang => (
                <label key={lang} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={allowedLanguages.includes(lang)}
                    onChange={() => handleLanguageToggle(lang)}
                  />
                  {lang}
                </label>
              ))}
            </div>
          </div>
          {/* Submit */}
          <div className="problem-editor__actions">
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            <Button variant="secondary" onClick={() => navigate('/admin/problems')}>Cancel</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}