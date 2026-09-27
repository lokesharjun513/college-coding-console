import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getTestCases, createTestCase, deleteTestCase } from '../../api/trainer';
import Spinner from '../../components/ui/Spinner';

export default function TestCasesList() {
  const { problemId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [testCases, setTestCases] = useState([]);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState(null);

  const fetchData = async () => {
    try {
      const res = await getTestCases(problemId);
      setTestCases(res.data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load test cases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [problemId]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setAddLoading(true);
    setAddError(null);
    try {
      await createTestCase(problemId, { input, output });
      setInput('');
      setOutput('');
      await fetchData();
    } catch (err) {
      setAddError(err?.response?.data?.message || 'Failed to add test case');
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async (testCaseId) => {
    if (!window.confirm('Delete this test case?')) return;
    try {
      await deleteTestCase(problemId, testCaseId);
      await fetchData();
    } catch (err) {}
  };

  if (loading) return <Spinner />;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;

  return (
    <div>
      <h2>Test Cases</h2>
      {/* Add test case form */}
      <form onSubmit={handleAdd} style={{ marginBottom: '1rem' }}>
        <div>
          <label>Input:</label><br />
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={3} required />
        </div>
        <div>
          <label>Output:</label><br />
          <textarea value={output} onChange={(e) => setOutput(e.target.value)} rows={3} required />
        </div>
        <button type="submit" disabled={addLoading}>
          {addLoading ? 'Adding…' : 'Add Test Case'}
        </button>
        {addError && <div style={{ color: 'red' }}>{addError}</div>}
      </form>
      {testCases.length === 0 ? (
        <p>No test cases.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Input</th>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Output</th>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {testCases.map((tc) => (
              <tr key={tc.id}>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{tc.input}</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{tc.output}</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>
                  <button onClick={() => handleDelete(tc.id)} style={{ color: 'red' }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
