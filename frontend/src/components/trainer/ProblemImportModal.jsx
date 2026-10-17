// frontend/src/components/trainer/ProblemImportModal.jsx
import React, { useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import TrainerNotice, { apiErrorMessage } from './TrainerNotice';
import { bulkImportProblems, downloadProblemTemplate } from '../../api/trainer';

/**
 * The import contract, mirrored from the server.
 *
 * Two shapes are accepted, told apart by the presence of `topic`:
 *
 * 1. Grouped (preferred):
 *      { topic: "Arrays", problems: [ {title, description, ...}, ... ] }
 *    The collection is chosen once in the UI, and `topic` is a NAME resolved by
 *    the server against that collection — reused when it matches, created once
 *    when it does not. Every row is then linked to that one Day.
 *
 * 2. Legacy per-problem:
 *      [ {collectionId, topicId, problem} | problem, ... ]
 *    Still accepted so existing files keep importing.
 *
 * In both shapes the batch comes from the route and is never read from the file.
 * A row is rejected unless `title`, `description` and `difficulty` are present,
 * `difficulty` is one of EASY/MEDIUM/HARD, and — legacy only — the
 * `collectionId`/`topicId` pair, when given, is valid and consistent.
 *
 * These checks run here purely to give the trainer a preview *before* the
 * request. They are a convenience, never the authority: the server re-validates
 * every row and reports its own `errors` array, which is what the summary
 * renders.
 */
const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];
const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
const LANGUAGES = ['c', 'cpp', 'java', 'python', 'typescript', 'php', 'ruby', 'haskell', 'go', 'rust', 'csharp', 'fsharp'];
const MAX_ROWS = 100;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/** Text fields the server trims before saving; a non-string would break it. */
const TEXT_FIELDS = ['title', 'description', 'constraints', 'inputFormat', 'outputFormat'];

/**
 * Mirrors the server slug rule (backend/src/services/problemSlug.js) so an
 * in-file duplicate is visible before upload. Declared before `validateRow`,
 * which uses it.
 */
const slugify = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Unwrap a row into `{problem, collectionId, topicId}`, matching the server's
 *  own rule for what counts as the `{collectionId, topicId, problem}` form. */
const readRow = (entry) =>
  entry && typeof entry === 'object' && entry.problem && typeof entry.problem === 'object'
    ? { problem: entry.problem, collectionId: entry.collectionId, topicId: entry.topicId }
    : { problem: entry, collectionId: undefined, topicId: undefined };

/**
 * Recognise the grouped shape.
 *
 * A non-array top level is the discriminator: the legacy per-problem format is
 * always a JSON array, so any object is an attempt at the grouped format. That
 * also means a file with `problems` but no `topic` is reported as a missing
 * topic name rather than as a malformed array, which is what the trainer who
 * forgot the topic actually needs to be told.
 */
const isGroupedPayload = (parsed) =>
  Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed);

/**
 * Reduce any accepted file to one previewable shape:
 *   { topic: string, problems: [], grouped: boolean }
 * `topic` is '' for the legacy format, which carries per-row Day links instead.
 */
function readImportPayload(parsed) {
  if (isGroupedPayload(parsed)) {
    const list = Array.isArray(parsed.problems) ? parsed.problems : null;
    return {
      grouped: true,
      topic: typeof parsed.topic === 'string' ? parsed.topic.trim() : '',
      problems: list || [],
      malformedProblems: !list,
    };
  }
  return { grouped: false, topic: '', problems: Array.isArray(parsed) ? parsed : [], malformedProblems: !Array.isArray(parsed) };
}

function validateRow(row) {
  const p = row.problem || {};
  if (!p || typeof p !== 'object' || Array.isArray(p)) return 'Entry is not a problem object.';
  if (!p.title || !p.description || !p.difficulty) {
    return 'Missing required fields (title, description, or difficulty).';
  }
  if (!DIFFICULTIES.includes(p.difficulty)) return 'Invalid difficulty.';
  if (p.status && !STATUSES.includes(p.status)) return `Invalid status: ${p.status}.`;

  const badType = TEXT_FIELDS.find(
    (f) => p[f] !== undefined && p[f] !== null && typeof p[f] !== 'string'
  );
  if (badType) return `${badType} must be a string.`;
  if (!slugify(p.title)) return 'Title must contain at least one letter or number.';

  if (p.allowedLanguages !== undefined && p.allowedLanguages !== null) {
    if (!Array.isArray(p.allowedLanguages)) return 'allowedLanguages must be an array.';
    if (p.allowedLanguages.includes('javascript')) return 'JavaScript is not supported.';
    const unknown = p.allowedLanguages.find((l) => !LANGUAGES.includes(l));
    if (unknown) return `Invalid language: ${unknown}.`;
  }

  if (p.testCases !== undefined) {
    if (!Array.isArray(p.testCases)) return 'testCases must be an array.';
    const orders = new Set();
    for (let i = 0; i < p.testCases.length; i++) {
      const tc = p.testCases[i];
      if (!tc || typeof tc !== 'object' || Array.isArray(tc)) {
        return `Test case ${i + 1} must be an object.`;
      }
      if (tc.input === undefined || tc.expectedOutput === undefined) {
        return `Test case ${i + 1} requires input and expectedOutput.`;
      }
      const order = tc.order ?? i;
      if (orders.has(order)) return `Duplicate test-case order: ${order}.`;
      orders.add(order);
    }
  }

  // Presence is tested as truthiness, matching the server: a falsy id is
  // treated as absent by both, so neither invents a "missing pair" error.
  const hasCollection = Boolean(row.collectionId);
  const hasTopic = Boolean(row.topicId);
  if (hasCollection !== hasTopic) {
    return 'collectionId and topicId must be supplied together.';
  }
  if (hasCollection && (!OBJECT_ID.test(String(row.collectionId)) || !OBJECT_ID.test(String(row.topicId)))) {
    return 'collectionId and topicId must both be valid ids.';
  }
  return '';
}

/**
 * Blob -> text. `Blob.text()` is missing in some environments (jsdom, older
 * Safari), so fall back to FileReader rather than silently failing.
 */
function readBlobText(blob) {
  if (typeof blob?.text === 'function') return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/**
 * Downloads the backend's import template for this batch.
 * Exported so the list page can offer the same action from its toolbar.
 *
 * Pass `{ asJson: true }` to get the parsed template back instead of a file —
 * the Problems workspace uses that to fill in the selected collection and day
 * before writing the file, so the schema is always the server's own.
 */
export async function downloadProblemTemplateFile(
  batchId,
  { asJson = false, collectionId = '', topicId = '', topicName = '' } = {}
) {
  try {
    const res = await downloadProblemTemplate(batchId);
    // Axios may hand back a Blob (responseType: 'blob') or raw text.
    const data = res.data;
    const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/json' });
    const parsed = JSON.parse(await readBlobText(blob));

    // The grouped template names its Day instead of carrying ids. Prefill that
    // name from the Day the trainer has selected, so the file they download is
    // already pointed at the right place. The collection is deliberately not
    // written into the file: it is chosen once in the UI at import time.
    const filled = isGroupedPayload(parsed)
      ? { ...parsed, topic: topicName || parsed.topic }
      : parsed;

    if (asJson) return filled;

    const out = new Blob([JSON.stringify(filled, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(out);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'trainer_problem_template.json';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return asJson ? null : false;
  }
}

/**
 * ProblemImportModal — bulk JSON import for a batch's problems.
 *
 * Accepts a file or pasted JSON, validates and previews every row locally,
 * requires an explicit confirmation, and then reports the server's own summary
 * including per-row failures. Rows that fail validation are dropped from the
 * upload rather than sent to fail there.
 *
 * Exported so the list page can offer the same action from its toolbar.
 */
export default function ProblemImportModal({
  isOpen,
  onClose,
  batchId,
  collectionId,
  topicId,
  topics,
  onImported,
}) {
  const [mode, setMode] = useState('file');
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [raw, setRaw] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [requestError, setRequestError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [rowErrors, setRowErrors] = useState([]);
  // { id, created } reported by the server for a grouped import.
  const [resolvedTopic, setResolvedTopic] = useState(null);
  const [templateFailed, setTemplateFailed] = useState(false);

  const reset = useCallback(() => {
    setMode('file');
    setFile(null);
    setText('');
    setRaw(null);
    setParseError(null);
    setSubmitting(false);
    setConfirmed(false);
    setRequestError(null);
    setSummary(null);
    setRowErrors([]);
    setResolvedTopic(null);
    setTemplateFailed(false);
  }, []);

  const close = () => {
    // A finished import is a success the caller still wants reported; do not
    // swallow it by resetting on the way out.
    reset();
    onClose();
  };

// Parse once, wherever the JSON came from, and keep the reduced shape. Rows
  // are derived from `raw` so switching tabs can never desync the preview from
  // what would actually be uploaded.
  const ingest = useCallback((parsed) => {
    const payload = readImportPayload(parsed);

    if (payload.malformedProblems) {
      setRaw(null);
      setParseError(payload.grouped
        ? 'Expected a "problems" array alongside the topic name.'
        : 'Expected a JSON array of problems.');
      return;
    }
    if (payload.problems.length === 0) {
      setRaw(null);
      setParseError('The file contains no problems.');
      return;
    }
    if (payload.problems.length > MAX_ROWS) {
      setRaw(null);
      setParseError(`This file has ${payload.problems.length} problems. The limit is ${MAX_ROWS} per import — split it into smaller files.`);
      return;
    }
    // A grouped file has no Day id, so the topic name is the only way its
    // problems can be filed. Catch it here rather than after the request.
    if (payload.grouped && !payload.topic) {
      setRaw(null);
      setParseError('This file is missing a topic name.');
      return;
    }
    setParseError(null);
    setRaw(payload);
  }, []);

  const handleFile = useCallback(
    async (selected) => {
      setSummary(null);
      setRowErrors([]);
      setRequestError(null);
      setConfirmed(false);
      setResolvedTopic(null);
      if (!selected) {
        setFile(null);
        setRaw(null);
        setParseError(null);
        return;
      }
      if (selected.type !== 'application/json' && !selected.name.endsWith('.json')) {
        setFile(null);
        setRaw(null);
        setParseError('Please select a .json file.');
        return;
      }
      setFile(selected);
      setParseError(null);
      try {
        // readBlobText, not selected.text(): File.prototype.text() is missing in
        // jsdom and older Safari, and without the FileReader fallback a valid
        // file reported "not valid JSON".
        ingest(JSON.parse(await readBlobText(selected)));
      } catch {
        setRaw(null);
        setParseError('This file is not valid JSON.');
      }
    },
    [ingest]
  );

  const handleText = (value) => {
    setText(value);
    setSummary(null);
    setRowErrors([]);
    setRequestError(null);
    setConfirmed(false);
    setResolvedTopic(null);
    if (!value.trim()) {
      setRaw(null);
      setParseError(null);
      return;
    }
    try {
      ingest(JSON.parse(value));
    } catch {
      setRaw(null);
      setParseError('This is not valid JSON.');
    }
  };

  // Local per-row validation. `usable` is what actually gets uploaded.
  //
  // Duplicates are deliberately NOT dropped. The server only claims a slug for
  // a row it fully accepted, so if row 1 is rejected for a reason this preview
  // cannot model (a bad status, an unsupported language, a slug already in the
  // batch), row 2 is still created. Dropping it here would lose a problem the
  // server would have happily created, and the message claiming "the server
  // rejects the second one" is not always true.
  const analysis = useMemo(() => {
    if (!raw || !Array.isArray(raw.problems)) return { rows: [], usable: [], invalid: [], duplicates: [] };

    const rows = raw.problems.map((entry, index) => ({
      row: index + 1,
      entry,
      ...readRow(entry),
    }));

    const invalid = rows
      .map((r) => ({ row: r.row, title: r.problem?.title || '(untitled)', message: validateRow(r) }))
      .filter((r) => r.message);

    const invalidRows = new Set(invalid.map((r) => r.row));
    const seen = new Map();
    const duplicates = [];
    const usable = [];

    rows.forEach((r) => {
      if (invalidRows.has(r.row)) return;
      const slug = slugify(r.problem.title);
      if (seen.has(slug)) {
        duplicates.push({
          row: r.row,
          title: r.problem.title,
          message: `Shares a title with row ${seen.get(slug)}. The server keeps the first one it accepts and reports the rest.`,
        });
      } else {
        seen.set(slug, r.row);
      }
      // Uploaded either way: the server is the authority on which duplicate
      // survives, and only it knows what already exists in the batch.
      usable.push(r.entry);
    });

    return { rows, usable, invalid, duplicates };
  }, [raw]);

  // Counted separately so the preview never claims a row will be created when
  // the server is the one deciding whether it is a duplicate at all.
  const duplicateRows = useMemo(() => new Set(analysis.duplicates.map((d) => d.row)), [analysis.duplicates]);

  // The server honours an explicit `status` on a row. Counting those lets the
  // preview say so, instead of promising nothing is ever published.
  const explicitlyPublished = useMemo(
    () =>
      analysis.rows.filter(
        (r) => !analysis.invalid.some((i) => i.row === r.row) && r.problem?.status === 'PUBLISHED'
      ).length,
    [analysis]
  );

  const usableCount = analysis.usable.length;
  const skippedCount = analysis.invalid.length;
  const canSubmit = Boolean(raw) && usableCount > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setRequestError(null);
    setRowErrors([]);
    try {
      // Grouped files carry the Day as a name and no per-row ids; legacy files
      // keep the request-level ids as defaults. `collectionId` is sent in both
      // cases because the collection is chosen once in the UI either way.
      const payload = raw.grouped
        ? { topic: raw.topic, problems: analysis.usable, collectionId }
        : { problems: analysis.usable, collectionId, topicId };
      const res = await bulkImportProblems(batchId, payload);
      const apiSummary = res?.data?.summary;
      const apiErrors = Array.isArray(res?.data?.errors) ? res.data.errors : [];
      setSummary(apiSummary || null);
      setRowErrors(apiErrors);
      // The server reports the Day it resolved, and whether it had to create it,
      // so the trainer can see the topic was not silently invented.
      setResolvedTopic(res?.data?.topic || null);
      setConfirmed(false);
      if (onImported) onImported(apiSummary);
    } catch (err) {
      setRequestError(apiErrorMessage(err, 'Import failed. Please try again.'));
      setConfirmed(false);
    } finally {
      setSubmitting(false);
    }
  };

  // The Day this import will file problems under. A grouped file names its own
  // topic; the legacy per-problem format has no name, so fall back to the
  // topic selected in the workspace.
  const selectedTopicName = useMemo(() => {
    if (raw?.grouped) return raw.topic;
    return topics?.find?.((t) => t.id === topicId)?.name || '';
  }, [raw?.grouped, raw?.topic, topics, topicId]);

  return (
    <Modal isOpen={isOpen} onClose={close} title="Bulk Import Problems">
      <div className="trainer-import-form">
        {/* Section 1: Download Template */}
        <div className="trainer-import-form__section trainer-import-form__section--compact">
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              const ok = await downloadProblemTemplateFile(batchId, { topicName: selectedTopicName });
              setTemplateFailed(!ok);
            }}
          >
            <Icon name="download" size={14} />
            Download JSON Template
          </Button>
          {templateFailed && (
            <p className="trainer-import-form__error" role="alert">
              The template could not be downloaded. Please try again.
            </p>
          )}
        </div>

        {/* Section 2: File Upload */}
        <div className="trainer-import-form__section">
          <h3 className="trainer-import-form__section-title">Import JSON File</h3>
          <p className="trainer-import-form__section-desc">
            Upload a JSON file with one topic name and a problems array — up to {MAX_ROWS} problems per import.
          </p>
          <div className="trainer-file-upload">
            <input
              id="trainer-import-file"
              type="file"
              accept=".json,application/json"
              className="trainer-file-upload__input"
              onChange={(e) => handleFile(e.target.files?.[0])}
              disabled={submitting}
            />
            <label htmlFor="trainer-import-file" className="trainer-file-upload__label">
              <Icon name="upload" size={18} />
              <span>Click to browse or drag & drop a JSON file</span>
            </label>
            {file && (
              <p className="trainer-file-upload__selected">
                <Icon name="file" size={14} />
                Selected: {file.name}
              </p>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="trainer-import-form__divider">
          <span>or</span>
        </div>

        {/* Section 3: Paste JSON */}
        <div className="trainer-import-form__section">
          <h3 className="trainer-import-form__section-title">Paste JSON</h3>
          <p className="trainer-import-form__section-desc">
            Paste your JSON content directly. Supports grouped format with topic name and problems array.
          </p>
          <textarea
            id="trainer-import-text"
            className="trainer-import-form__textarea"
            rows={10}
            value={text}
            disabled={submitting}
            placeholder='{"topic": "Arrays", "problems": [{"title": "Two Sum", "description": "...", "difficulty": "EASY"}]}'
            onChange={(e) => handleText(e.target.value)}
          />
        </div>

        {/* Parse errors */}
        {parseError && (
          <div className="trainer-import-form__error" role="alert">
            {parseError}
          </div>
        )}

        {/* Preview Section */}
        {raw && !parseError && (
          <div className="trainer-import-form__preview">
            <div className="trainer-import-preview__head">
              <p className="trainer-import-preview__title">
                {mode === 'file' && file ? `${file.name} — ` : ''}
                {raw?.grouped ? `Topic “${raw.topic}” · ` : ''}
                {analysis.rows.length} row{analysis.rows.length === 1 ? '' : 's'} found
              </p>
              <p className="trainer-import-preview__counts">
                {usableCount} will be sent
                {skippedCount > 0 ? ` · ${skippedCount} skipped` : ''}
                {duplicateRows.size > 0
                  ? ` · ${duplicateRows.size} duplicate${duplicateRows.size === 1 ? '' : 's'} the server resolves`
                  : ''}
              </p>
            </div>

            <div className="trainer-table-wrapper">
              <table className="admin-table">
                <caption className="trainer-sr-only">Rows found in this import</caption>
                <thead>
                  <tr>
                    <th scope="col">Row</th>
                    <th scope="col">Title</th>
                    <th scope="col">Difficulty</th>
                    <th scope="col">Status</th>
                    <th scope="col">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.rows.slice(0, 50).map((r) => {
                    const problem = r.problem || {};
                    const invalidRow = analysis.invalid.find((i) => i.row === r.row);
                    const duplicateRow = analysis.duplicates.find((d) => d.row === r.row);
                    const note = invalidRow || duplicateRow;
                    return (
                      <tr key={r.row}>
                        <th scope="row" className="trainer-table__row-head">
                          {r.row}
                        </th>
                        <td>{problem.title || '—'}</td>
                        <td>{problem.difficulty || '—'}</td>
                        <td className="trainer-table__muted">{problem.status || 'DRAFT'}</td>
                        <td className="trainer-table__muted">
                          {note ? (
                            <span style={{ color: 'var(--trainer-danger-text)' }}>{note.message}</span>
                          ) : raw?.grouped ? (
                            `Linked to “${raw.topic}”`
                          ) : r.topicId ? (
                            'Linked to a Day'
                          ) : (
                            'No Day link'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {analysis.rows.length > 50 ? (
              <p className="trainer-form__hint">
                Showing the first 50 rows. All {usableCount} importable rows will be sent.
              </p>
            ) : null}

            {analysis.invalid.length > 0 ? (
              <div className="trainer-form__error" role="alert">
                <p>
                  {analysis.invalid.length} invalid row
                  {analysis.invalid.length === 1 ? '' : 's'} will be skipped before upload.
                </p>
                {analysis.invalid.map((issue) => (
                  <p key={`${issue.row}-${issue.message}`}>
                    Row {issue.row}: {issue.message}
                  </p>
                ))}
              </div>
            ) : null}

            {analysis.duplicates.length > 0 ? (
              <div className="trainer-notice trainer-notice--error" role="status">
                <Icon name="alertTriangle" size={16} />
                <span>
                  {analysis.duplicates.length} row
                  {analysis.duplicates.length === 1 ? '' : 's'} share a title. They are still sent —
                  the server creates the first one it accepts and reports the rest, so nothing is
                  silently dropped.
                </span>
              </div>
            ) : null}

            {explicitlyPublished > 0 ? (
              <div className="trainer-notice trainer-notice--error" role="status">
                <Icon name="alertTriangle" size={16} />
                <span>
                  {explicitlyPublished} row{explicitlyPublished === 1 ? '' : 's'} set{' '}
                  <code>status: PUBLISHED</code>. Those problems become visible to students as soon as
                  they are imported. Everything else stays a Draft.
                </span>
              </div>
            ) : null}

            <p className="trainer-import-form__hint">
              Every imported problem stays inside this batch and is created as a{' '}
              <strong>Draft</strong> unless its row explicitly asks for another status. Nothing is
              published on its own.
            </p>
          </div>
        )}

        <TrainerNotice tone="error" message={requestError} onDismiss={() => setRequestError(null)} />

        {summary && (
          <div className={`trainer-import-form__notice trainer-import-form__notice--${summary.failed > 0 ? 'error' : 'success'}`} role="status">
            <Icon name={summary.failed > 0 ? 'alertTriangle' : 'checkCircle2'} size={16} />
            <span>
              Imported {summary.created} of {summary.total} problem{summary.total === 1 ? '' : 's'}
              {summary.failed > 0 ? ` · ${summary.failed} failed` : ''}.
              {resolvedTopic ? ` ${resolvedTopic.created ? `Created a new topic "${raw?.topic}".` : `Added to the existing topic "${raw?.topic}".`}` : ''}
            </span>
          </div>
        )}

        {/* Row-level failures the server reported. These were collected into
            state but never rendered, so a partially failed import looked like
            a clean success. */}
        {rowErrors.length > 0 && (
          <ul className="trainer-import-form__row-errors">
            {rowErrors.map((issue, i) => (
              <li key={`${issue.row}-${i}`}>
                Row {issue.row}{issue.field ? ` (${issue.field})` : ''}: {issue.message}
              </li>
            ))}
          </ul>
        )}

        {/* Footer Actions */}
        <div className="trainer-import-form__footer">
          {!confirmed ? (
            <>
              <Button variant="secondary" onClick={close} disabled={submitting}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => setConfirmed(true)}
                disabled={!canSubmit}
                title={usableCount > 0 ? undefined : 'No importable rows — fix the problems listed above first'}
              >
                Import {usableCount > 0 ? usableCount : ''} problem{usableCount === 1 ? '' : 's'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={close} disabled={submitting}>
                Cancel
              </Button>
              <Button variant="primary" onClick={submit} loading={submitting}>
                <Icon name="checkCircle2" size={14} />
                Confirm Import
              </Button>
            </>
          )}
        </div>

        {confirmed && !submitting && (
          <p className="trainer-import-form__hint">
            This will create {usableCount} problem{usableCount === 1 ? '' : 's'} in this batch
            {explicitlyPublished > 0 ? `, ${explicitlyPublished} of them published as requested` : ' as drafts'}.
            Confirm to send the request.
          </p>
        )}
      </div>
    </Modal>
  );
}

ProblemImportModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  batchId: PropTypes.string,
  collectionId: PropTypes.string,
  topicId: PropTypes.string,
  // Days of the selected training, used only to name the Day in a downloaded
  // template. Optional: without it the template keeps its example name.
  topics: PropTypes.arrayOf(
    PropTypes.shape({ id: PropTypes.string, name: PropTypes.string })
  ),
  onImported: PropTypes.func,
};

export { readRow, validateRow, readImportPayload, isGroupedPayload, MAX_ROWS };