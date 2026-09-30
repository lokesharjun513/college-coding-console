// frontend/src/components/CompilerSelector.jsx
import React, { useEffect, useState } from 'react';
import { getCompilers } from '../api/student';
import Button from './ui/Button';

export default function CompilerSelector({ selectedId, onChange, disabled }) {
  const [compilers, setCompilers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchCompilers() {
      setLoading(true);
      try {
        const res = await getCompilers();
        setCompilers(res.data?.data || []);
      } catch (err) {
        setError('Unable to load available languages.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchCompilers();
  }, []);

  if (loading) {
    return <div>Loading languages...</div>;
  }
  if (error) {
    return <div style={{ color: '#dc2626' }}>{error}</div>;
  }

  return (
    <select
      value={selectedId}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
    >
      {compilers.map(c => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
