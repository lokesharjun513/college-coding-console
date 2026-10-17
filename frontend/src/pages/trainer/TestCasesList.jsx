import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createTestCase, deleteTestCase, getTestCases } from '../../api/trainer';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Icon from '../../components/ui/Icon';
import TrainerBreadcrumb from '../../components/trainer/TrainerBreadcrumb';
import {
  TrainerEmptyState,
  TrainerErrorState,
  TrainerLoadingState,
  TrainerSectionCard,
} from '../../components/trainer';
import { NOT_AVAILABLE } from '../../utils/trainerDisplay';
import '../../styles/pages/trainer-problems.css';

/**
 * Test cases — /trainer/batches/:batchId/problems/:problemId/testcases
 *
 * Test cases are addressed by problem id alone
 * (GET /api/trainer/problems/:problemId/test-cases). Ownership is enforced
 * server-side; the batch id in the URL is only used for navigation.
 *
 * Deletion asks for confirmation in a real dialog rather than window.confirm.
 */
export default function TestCasesList() {
  const { batchId, problemId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [testCases, setTestCases] = useState([]);

  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getTestCases(problemId);
      setTestCases(res?.data?.data || []);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load test cases');
    } finally {
      setLoading(false);
    }
  }, [problemId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (event) => {
    event.preventDefault();
    setAddLoading(true);
    setAddError(null);
    try {
      await createTestCase(problemId, { input, output });
      setInput('');
      setOutput('');
      await load();
    } catch (err) {
      setAddError(err?.response?.data?.message || 'Failed to add test case');
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteSaving(true);
    try {
      await deleteTestCase(problemId, deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to delete test case');
      setDeleteTarget(null);
    } finally {
      setDeleteSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="trainer-page">
        <TrainerLoadingState label="Loading test cases…" />
      </div>
    );
  }

  return (
    <div className="trainer-page">
      <TrainerBreadcrumb
        items={[
          { label: 'Trainer', to: '/trainer' },
          { label: 'Problems', to: `/trainer/batches/${batchId}/problems` },
          { label: 'Problem', to: `/trainer/batches/${batchId}/problems/${problemId}` },
          { label: 'Test Cases' },
        ]}
      />

      <PageHeader
        title="Test Cases"
        description="Input and expected output pairs used to grade submissions."
        actions={
          <div className="trainer-page__actions">
            <Button
              variant="secondary"
              onClick={() => navigate(`/trainer/batches/${batchId}/problems/${problemId}`)}
            >
              Back to problem
            </Button>
          </div>
        }
      />

      {error ? (
        <div className="trainer-notice trainer-notice--error" role="alert">
          <Icon name="alertTriangle" size={16} />
          <span>{error}</span>
          <button type="button" className="trainer-notice__close" onClick={load}>
            Retry
          </button>
        </div>
      ) : null}

      <TrainerSectionCard title="Add a test case" headingId="trainer-testcases-add">
        <div className="trainer-section-card__body--padded">
          <form className="trainer-form" onSubmit={handleAdd}>
            <div className="trainer-form__field">
              <label className="trainer-form__label" htmlFor="trainer-testcase-input">
                Input
              </label>
              <textarea
                id="trainer-testcase-input"
                className="trainer-form__textarea"
                rows={4}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                required
              />
            </div>

            <div className="trainer-form__field">
              <label className="trainer-form__label" htmlFor="trainer-testcase-output">
                Expected output
              </label>
              <textarea
                id="trainer-testcase-output"
                className="trainer-form__textarea"
                rows={4}
                value={output}
                onChange={(e) => setOutput(e.target.value)}
                required
              />
            </div>

            {addError ? (
              <div className="trainer-form__error" role="alert">
                {addError}
              </div>
            ) : null}

            <div className="trainer-form__actions">
              <Button variant="primary" type="submit" loading={addLoading}>
                <Icon name="plus" size={14} />
                Add test case
              </Button>
            </div>
          </form>
        </div>
      </TrainerSectionCard>

      <TrainerSectionCard title="Existing test cases" headingId="trainer-testcases-list">
        <div className="trainer-section-card__body--padded">
          {testCases.length === 0 ? (
            <TrainerEmptyState
              icon="inbox"
              title="No test cases yet"
              description="Add an input and expected output pair so submissions can be graded against it."
            />
          ) : (
            <div className="trainer-table-wrapper">
              <table className="admin-table">
                <caption className="trainer-sr-only">Test cases for this problem</caption>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Input</th>
                    <th scope="col">Expected output</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {testCases.map((testCase, index) => (
                    <tr key={testCase.id}>
                      <td className="trainer-table__muted">{index + 1}</td>
                      <th scope="row" className="trainer-table__row-head">
                        <pre className="trainer-problem-text">{testCase.input || NOT_AVAILABLE}</pre>
                      </th>
                      <th scope="row" className="trainer-table__row-head">
                        <pre className="trainer-problem-text">{testCase.output || NOT_AVAILABLE}</pre>
                      </th>
                      <td>
                        <span className="trainer-table__actions">
                          <button
                            type="button"
                            className="trainer-table__icon-action trainer-table__icon-action--danger"
                            onClick={() => setDeleteTarget(testCase)}
                            aria-label={`Delete test case ${index + 1}`}
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </TrainerSectionCard>

      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Delete Test Case">
        <p>Delete this test case? Submissions already graded with it are unaffected.</p>
        <div className="trainer-form__actions trainer-form__actions--modal">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleteSaving}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} loading={deleteSaving}>
            Delete
          </Button>
        </div>
      </Modal>

      <div className="trainer-form__actions">
        <Link
          className="btn btn-secondary"
          to={`/trainer/batches/${batchId}/problems/${problemId}`}
        >
          <Icon name="chevronLeft" size={14} />
          Back to problem
        </Link>
      </div>
    </div>
  );
}