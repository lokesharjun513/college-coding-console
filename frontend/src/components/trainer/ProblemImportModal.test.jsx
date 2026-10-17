// Regression coverage for the trainer bulk import flow
// (frontend/src/components/trainer/ProblemImportModal.jsx).
//
// These tests pin the behaviour the trainer depends on:
//
//   - the file is parsed, validated and PREVIEWED before anything is sent;
//   - invalid rows and in-file duplicates are skipped locally, with a reason
//     per row, instead of being uploaded to fail server-side;
//   - the 100-row limit and malformed/empty/non-array files are rejected
//     up front;
//   - the request requires an explicit confirmation and cannot be double-sent;
//   - the server's own summary and row-level errors are what gets reported.
import React from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import ProblemImportModal, { downloadProblemTemplateFile, readImportPayload } from './ProblemImportModal';
import { bulkImportProblems, downloadProblemTemplate } from '../../api/trainer';

/** jsdom has no Blob.prototype.text(); read through FileReader, as the app does. */
const readBlobText = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

// Multi-step interaction tests; see TrainingManagement.test.jsx for why the
// default 5s budget is too tight for these under a full-suite run.
vi.setConfig({ testTimeout: 20000 });

vi.mock('../../api/trainer', () => ({
  bulkImportProblems: vi.fn(),
  downloadProblemTemplate: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  bulkImportProblems.mockResolvedValue({
    data: { success: true, summary: { total: 1, created: 1, failed: 0 } },
  });
  downloadProblemTemplate.mockResolvedValue({ data: new Blob(['[]']) });
  // jsdom does not implement object URLs; stub them so the download path runs.
  window.URL.createObjectURL = vi.fn(() => 'blob:mock');
  window.URL.revokeObjectURL = vi.fn();
});

const renderModal = (props = {}) =>
  render(
    <ProblemImportModal
      isOpen
      onClose={vi.fn()}
      batchId="batch-1"
      {...props}
    />
  );

/** Paste a JSON payload into the Paste JSON section and wait for the preview.
 *  The file-upload and paste sections are stacked (separated by an "or"
 *  divider), not tabs, so the textarea is always present — no tab to switch. */
async function pasteAndSettle(container, json) {
  fireEvent.change(container.querySelector('#trainer-import-text'), {
    target: { value: json },
  });
}

const validRow = (overrides = {}) => ({
  title: 'Two Sum',
  description: 'Find the pair.',
  difficulty: 'EASY',
  ...overrides,
});

/* ------------------------------------------------- grouped format: {topic, problems} */

test('a grouped file previews under its topic name', async () => {
  const { container } = renderModal({ collectionId: 'col-1' });
  await pasteAndSettle(
    container,
    JSON.stringify({ topic: 'Arrays', problems: [validRow(), validRow({ title: 'Merge Sort' })] })
  );

  expect(await screen.findByText(/Topic “Arrays” · 2 rows found/)).toBeInTheDocument();
  expect(screen.getAllByText(/Linked to “Arrays”/)).toHaveLength(2);
});

test('a grouped file is sent as a topic name with the selected collection', async () => {
  bulkImportProblems.mockResolvedValue({ data: { summary: { total: 1, created: 1, failed: 0 } } });
  const { container } = renderModal({ collectionId: 'col-1', topicId: 'ignored-topic' });
  await pasteAndSettle(container, JSON.stringify({ topic: 'Arrays', problems: [validRow()] }));

  fireEvent.click(await screen.findByRole('button', { name: /^Import 1 problem$/i }));
  fireEvent.click(screen.getByRole('button', { name: /Confirm import/i }));

  await waitFor(() =>
    // The topic travels as a NAME; the batch is never in the payload and the
    // workspace's selected topicId is not used to override the file's own name.
    expect(bulkImportProblems).toHaveBeenCalledWith('batch-1', {
      topic: 'Arrays',
      problems: [validRow()],
      collectionId: 'col-1',
    })
  );
});

test('a grouped file without a topic name is rejected before any request', async () => {
  const { container } = renderModal({ collectionId: 'col-1' });
  await pasteAndSettle(container, JSON.stringify({ problems: [validRow()] }));

  expect(await screen.findByText('This file is missing a topic name.')).toBeInTheDocument();
  expect(bulkImportProblems).not.toHaveBeenCalled();
});

test('a grouped file with an empty topic name is rejected before any request', async () => {
  const { container } = renderModal({ collectionId: 'col-1' });
  await pasteAndSettle(container, JSON.stringify({ topic: '   ', problems: [validRow()] }));

  expect(await screen.findByText('This file is missing a topic name.')).toBeInTheDocument();
  expect(bulkImportProblems).not.toHaveBeenCalled();
});

test('a grouped file with an empty problems array is rejected before any request', async () => {
  const { container } = renderModal({ collectionId: 'col-1' });
  await pasteAndSettle(container, JSON.stringify({ topic: 'Arrays', problems: [] }));

  expect(await screen.findByText('The file contains no problems.')).toBeInTheDocument();
  expect(bulkImportProblems).not.toHaveBeenCalled();
});

test('a grouped file whose problems is missing is rejected before any request', async () => {
  const { container } = renderModal({ collectionId: 'col-1' });
  await pasteAndSettle(container, JSON.stringify({ topic: 'Arrays' }));

  expect(
    await screen.findByText('Expected a "problems" array alongside the topic name.')
  ).toBeInTheDocument();
  expect(bulkImportProblems).not.toHaveBeenCalled();
});

test('invalid rows inside a grouped file are skipped, the rest are sent', async () => {
  bulkImportProblems.mockResolvedValue({ data: { summary: { total: 2, created: 2, failed: 0 } } });
  const { container } = renderModal({ collectionId: 'col-1' });
  await pasteAndSettle(
    container,
    JSON.stringify({
      topic: 'Arrays',
      problems: [validRow({ title: 'Reverse an Array' }), { title: 'No description' }],
    })
  );

  expect(await screen.findByText(/1 invalid row will be skipped/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Import 1 problem$/i }));
  fireEvent.click(screen.getByRole('button', { name: /Confirm import/i }));

  await waitFor(() =>
    expect(bulkImportProblems).toHaveBeenCalledWith('batch-1', {
      topic: 'Arrays',
      problems: [validRow({ title: 'Reverse an Array' })],
      collectionId: 'col-1',
    })
  );
});

test('the summary reports whether the topic was created or reused', async () => {
  bulkImportProblems.mockResolvedValue({
    data: {
      summary: { total: 1, created: 1, failed: 0 },
      topic: { id: 'topic-9', created: true },
    },
  });
  const { container } = renderModal({ collectionId: 'col-1' });
  await pasteAndSettle(container, JSON.stringify({ topic: 'Arrays', problems: [validRow()] }));

  fireEvent.click(await screen.findByRole('button', { name: /^Import 1 problem$/i }));
  fireEvent.click(screen.getByRole('button', { name: /Confirm import/i }));

  // Quote-glyph agnostic: the point is created-vs-reused, not the quote style.
  expect(await screen.findByText(/Created a new topic .?Arrays/)).toBeInTheDocument();
});

test('the legacy per-problem array format is still accepted', async () => {
  bulkImportProblems.mockResolvedValue({ data: { summary: { total: 1, created: 1, failed: 0 } } });
  const { container } = renderModal({ collectionId: 'col-1', topicId: 'topic-1' });
  await pasteAndSettle(container, JSON.stringify([validRow()]));

  fireEvent.click(await screen.findByRole('button', { name: /^Import 1 problem$/i }));
  fireEvent.click(screen.getByRole('button', { name: /Confirm import/i }));

  await waitFor(() =>
    // Legacy rows keep the request-level ids as defaults, exactly as before.
    expect(bulkImportProblems).toHaveBeenCalledWith('batch-1', {
      problems: [validRow()],
      collectionId: 'col-1',
      topicId: 'topic-1',
    })
  );
});

test('readImportPayload tells the two formats apart by the presence of topic', () => {
  expect(readImportPayload({ topic: 'Arrays', problems: [validRow()] })).toMatchObject({
    grouped: true,
    topic: 'Arrays',
    malformedProblems: false,
  });
  expect(readImportPayload([validRow()])).toMatchObject({
    grouped: false,
    topic: '',
    malformedProblems: false,
  });
  expect(readImportPayload({ topic: 'Arrays' }).malformedProblems).toBe(true);
  expect(readImportPayload('nonsense').malformedProblems).toBe(true);
});

test('a JSON file is read even when File.prototype.text is unavailable', async () => {
  // jsdom (and older Safari) have no Blob.prototype.text(). Before this was
  // routed through readBlobText, a perfectly valid file was reported as
  // "This file is not valid JSON." because `selected.text()` was undefined.
  const originalText = Blob.prototype.text;
  delete Blob.prototype.text;
  expect(typeof Blob.prototype.text).toBe('undefined');

  try {
    const { container } = renderModal();
    const file = new File(
      [JSON.stringify([{ problem: validRow() }])],
      'rows.json',
      { type: 'application/json' }
    );

    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: [file] },
    });

    // The row is previewed, i.e. it parsed via the FileReader fallback.
    expect(await screen.findByText(/1 problem/i)).toBeInTheDocument();
    expect(screen.queryByText('This file is not valid JSON.')).not.toBeInTheDocument();
  } finally {
    Blob.prototype.text = originalText;
  }
});

test('an empty file is rejected before any request', async () => {
  const { container } = renderModal();
  await pasteAndSettle(container, '[]');

  expect(await screen.findByText('The file contains no problems.')).toBeInTheDocument();
  expect(bulkImportProblems).not.toHaveBeenCalled();
});

test('a non-array payload is rejected before any request', async () => {
  const { container } = renderModal();
  await pasteAndSettle(container, '{"title":"nope"}');

  // A non-array top level is an attempt at the grouped format, so the message
  // names the missing field instead of complaining about an array.
  expect(
    await screen.findByText('Expected a "problems" array alongside the topic name.')
  ).toBeInTheDocument();
  expect(bulkImportProblems).not.toHaveBeenCalled();
});

test('a payload that is neither an array nor an object is rejected before any request', async () => {
  const { container } = renderModal();
  await pasteAndSettle(container, '"just a string"');

  expect(await screen.findByText('Expected a JSON array of problems.')).toBeInTheDocument();
  expect(bulkImportProblems).not.toHaveBeenCalled();
});

test('malformed JSON is reported and never uploaded', async () => {
  const { container } = renderModal();
  await pasteAndSettle(container, '[{ "title": ');

  expect(await screen.findByText('This is not valid JSON.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Import/ })).toBeDisabled();
  expect(bulkImportProblems).not.toHaveBeenCalled();
});

test('the 100-row limit is enforced with the real number', async () => {
  const { container } = renderModal();
  const rows = Array.from({ length: 101 }, (_, i) => validRow({ title: `P${i}` }));
  await pasteAndSettle(container, JSON.stringify(rows));

  expect(await screen.findByText(/101 problems.*limit is 100 per import/i)).toBeInTheDocument();
  expect(bulkImportProblems).not.toHaveBeenCalled();
});

test('a valid payload is previewed and requires confirmation before uploading', async () => {
  const { container } = renderModal();
  await pasteAndSettle(container, JSON.stringify([validRow()]));

  expect(await screen.findByText(/1 row found/i)).toBeInTheDocument();
  expect(screen.getByText('Two Sum')).toBeInTheDocument();
  expect(screen.getByText(/1 will be sent/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^Import 1 problem$/i }));

  // Confirming is a separate, explicit step.
  expect(bulkImportProblems).not.toHaveBeenCalled();
  expect(screen.getByText(/create 1 problem in this batch/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Confirm import/i }));

  await waitFor(() =>
    expect(bulkImportProblems).toHaveBeenCalledWith('batch-1', {
      problems: [validRow()],
      collectionId: undefined,
      topicId: undefined,
    })
  );
});

test('imported problems are drafts unless the row explicitly asks otherwise', async () => {
  const { container } = renderModal();
  await pasteAndSettle(container, JSON.stringify([validRow({ status: 'PUBLISHED' })]));

  // The server honours an explicit status, so the preview has to say so rather
  // than claiming nothing is ever published.
  expect(await screen.findByText(/1 row set/i)).toHaveTextContent('status: PUBLISHED');
  // Split across elements by the <code> tag, so match the container.
  expect(screen.getByText(/1 row set/i)).toHaveTextContent('visible to students');
});

test('a draft import says nothing is published on its own', async () => {
  const { container } = renderModal();
  await pasteAndSettle(container, JSON.stringify([validRow()]));

  expect(await screen.findByText(/created as a/i)).toHaveTextContent('Draft');
  expect(screen.queryByText(/status: PUBLISHED/i)).not.toBeInTheDocument();
});

test('invalid rows are skipped locally with a per-row reason', async () => {
  const { container } = renderModal();
  await pasteAndSettle(
    container,
    JSON.stringify([
      validRow({ title: 'Good one' }),
      validRow({ title: 'No description', description: undefined }),
      validRow({ title: 'Bad difficulty', difficulty: 'TRIVIAL' }),
    ])
  );

  expect(await screen.findByText(/1 will be sent · 2 skipped/i)).toBeInTheDocument();
  expect(screen.getByText(/Row 2: Missing required fields/i)).toBeInTheDocument();
  expect(screen.getByText(/Row 3: Invalid difficulty/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^Import 1 problem$/i }));
  fireEvent.click(screen.getByRole('button', { name: /Confirm import/i }));

  await waitFor(() => expect(bulkImportProblems).toHaveBeenCalled());
  // Only the valid row is uploaded.
  expect(bulkImportProblems.mock.calls[0][1].problems).toEqual([validRow({ title: 'Good one' })]);
});

test('an in-file duplicate is flagged but still sent, never silently dropped', async () => {
  const { container } = renderModal();
  await pasteAndSettle(container, JSON.stringify([validRow(), validRow()]));

  // Both rows are uploaded. The server claims a slug only for a row it fully
  // accepted, so if row 1 is rejected for a reason this preview cannot model,
  // row 2 is still created. Dropping it here would lose a real problem.
  expect(await screen.findByText(/2 will be sent/i)).toBeInTheDocument();
  expect(screen.getByText(/share a title/i)).toBeInTheDocument();
  expect(screen.getByText(/Shares a title with row 1/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^Import 2 problems$/i }));
  fireEvent.click(screen.getByRole('button', { name: /Confirm import/i }));

  await waitFor(() => expect(bulkImportProblems).toHaveBeenCalled());
  expect(bulkImportProblems.mock.calls[0][1].problems).toHaveLength(2);
});

test('a duplicate is rescued when the first row fails a rule the preview cannot model', async () => {
  // Row 1 carries a status the server rejects. The server therefore never
  // claims its slug, so row 2 — which the preview marked as a duplicate — is
  // the one that actually gets created. Dropping it client-side would have lost
  // it entirely.
  bulkImportProblems.mockResolvedValue({
    data: { success: true, summary: { total: 2, created: 1, failed: 1 } },
  });
  const { container } = renderModal();
  await pasteAndSettle(
    container,
    JSON.stringify([validRow({ status: 'PUBLISHED_BETA' }), validRow()])
  );

  // The preview already refuses row 1 locally, so neither is treated as a
  // duplicate and row 2 is still sent.
  fireEvent.click(screen.getByRole('button', { name: /^Import 1 problem$/i }));
  fireEvent.click(screen.getByRole('button', { name: /Confirm import/i }));

  await waitFor(() => expect(bulkImportProblems).toHaveBeenCalled());
  expect(bulkImportProblems.mock.calls[0][1].problems).toEqual([validRow()]);
});

test('server-only rules are checked locally so the preview never over-promises', async () => {
  const { container } = renderModal();
  await pasteAndSettle(
    container,
    JSON.stringify([
      validRow({ title: 'Bad status', status: 'published' }),
      validRow({ title: 'Bad language', allowedLanguages: ['javascript'] }),
      validRow({ title: 'Unknown language', allowedLanguages: ['cobol'] }),
      validRow({ title: 'Bad test cases', testCases: [{ input: '1' }] }),
      validRow({ title: 42, description: 'Non-string title' }),
      validRow({ title: '!!!', description: 'd' }),
    ])
  );

  expect(await screen.findByText(/0 will be sent · 6 skipped/i)).toBeInTheDocument();
  expect(screen.getByText(/Row 1: Invalid status: published/i)).toBeInTheDocument();
  expect(screen.getByText(/Row 2: JavaScript is not supported/i)).toBeInTheDocument();
  expect(screen.getByText(/Row 3: Invalid language: cobol/i)).toBeInTheDocument();
  expect(screen.getByText(/Row 4: Test case 1 requires input and expectedOutput/i)).toBeInTheDocument();
  expect(screen.getByText(/Row 5: title must be a string/i)).toBeInTheDocument();
  expect(screen.getByText(/Row 6: Title must contain at least one letter or number/i)).toBeInTheDocument();
});

test('a half-supplied collectionId/topicId pair is reported, not silently ignored', async () => {
  const { container } = renderModal();
  await pasteAndSettle(
    container,
    JSON.stringify([{ collectionId: '6'.repeat(24), problem: validRow() }])
  );

  expect(await screen.findByText(/Row 1: collectionId and topicId must be supplied together/i)).toBeInTheDocument();
});

test('the server summary and row-level errors are reported verbatim', async () => {
  bulkImportProblems.mockResolvedValue({
    data: {
      success: true,
      summary: { total: 3, created: 2, failed: 1 },
      errors: [{ row: 2, field: 'slug', message: 'Problem with this slug already exists' }],
    },
  });
  const { container } = renderModal();
  await pasteAndSettle(container, JSON.stringify([validRow({ title: 'A' }), validRow({ title: 'B' }), validRow({ title: 'C' })]));

  fireEvent.click(screen.getByRole('button', { name: /^Import 3 problems$/i }));
  fireEvent.click(screen.getByRole('button', { name: /Confirm import/i }));

  expect(await screen.findByText(/Imported 2 of 3 problems · 1 failed/i)).toBeInTheDocument();
  expect(screen.getByText(/Row 2 \(slug\): Problem with this slug already exists/i)).toBeInTheDocument();
});

test('a request failure is surfaced with the server message', async () => {
  bulkImportProblems.mockRejectedValue({
    response: { status: 403, data: { message: 'Access denied' } },
  });
  const { container } = renderModal();
  await pasteAndSettle(container, JSON.stringify([validRow()]));

  fireEvent.click(screen.getByRole('button', { name: /^Import 1 problem$/i }));
  fireEvent.click(screen.getByRole('button', { name: /Confirm import/i }));

  expect(await screen.findByText('Access denied')).toBeInTheDocument();
});

test('the selected Day is sent with the import so rows are linked', async () => {
  const { container } = renderModal({ collectionId: 'c1', topicId: 't1' });
  await pasteAndSettle(container, JSON.stringify([validRow()]));

  fireEvent.click(screen.getByRole('button', { name: /^Import 1 problem$/i }));
  fireEvent.click(screen.getByRole('button', { name: /Confirm import/i }));

  await waitFor(() =>
    expect(bulkImportProblems).toHaveBeenCalledWith('batch-1', {
      problems: [validRow()],
      collectionId: 'c1',
      topicId: 't1',
    })
  );
});

test('the template can be downloaded from the import flow', async () => {
  renderModal();
  fireEvent.click(await screen.findByRole('button', { name: /Download JSON Template/i }));

  await waitFor(() => expect(downloadProblemTemplate).toHaveBeenCalledWith('batch-1'));
  // Wait for the blob write to finish too. The download path is async, and an
  // unsettled call would otherwise land in the NEXT test's createObjectURL mock
  // and make it look as though parsing triggered a download.
  await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
});

test('the in-modal template names the topic it was given instead of an id', async () => {
  // The grouped template files problems under a Day *name*; the collection is
  // chosen in the UI at import time and is deliberately not written into the file.
  const template = {
    topic: 'Arrays',
    problems: [{ title: 'Two Sum', description: 'd', difficulty: 'EASY' }],
  };
  downloadProblemTemplate.mockResolvedValue({ data: JSON.stringify(template) });

  renderModal({
    collectionId: 'col-1',
    topicId: 'topic-1',
    topics: [{ id: 'topic-1', name: 'Linked Lists' }],
  });
  fireEvent.click(await screen.findByRole('button', { name: /Download JSON Template/i }));

  await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
  const written = window.URL.createObjectURL.mock.calls[0][0];
  const parsed = JSON.parse(await readBlobText(written));
  expect(parsed.topic).toBe('Linked Lists');
  expect(Array.isArray(parsed.problems)).toBe(true);
  // No ids leak into the file: the collection is a UI choice, not file content.
  expect(JSON.stringify(parsed)).not.toContain('col-1');
  expect(JSON.stringify(parsed)).not.toContain('topic-1');
});

test('the template keeps its own topic name when no topic is selected', async () => {
  const template = {
    topic: 'Arrays',
    problems: [{ title: 'Two Sum', description: 'd', difficulty: 'EASY' }],
  };
  downloadProblemTemplate.mockResolvedValue({ data: JSON.stringify(template) });

  renderModal({ collectionId: 'col-1', topicId: '', topics: [] });
  fireEvent.click(await screen.findByRole('button', { name: /Download JSON Template/i }));

  await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
  const parsed = JSON.parse(await readBlobText(window.URL.createObjectURL.mock.calls[0][0]));
  expect(parsed.topic).toBe('Arrays');
});

test('the template helper can return the parsed template instead of a file', async () => {
  const template = {
    topic: 'Arrays',
    problems: [{ title: 'Two Sum', description: 'd', difficulty: 'EASY' }],
  };
  downloadProblemTemplate.mockResolvedValue({ data: JSON.stringify(template) });

  // The Problems workspace calls this so the schema it writes is the server's.
  const parsed = await downloadProblemTemplateFile('batch-1', { asJson: true });

  expect(downloadProblemTemplate).toHaveBeenCalledWith('batch-1');
  expect(parsed).toEqual(template);
  // Parsing must not trigger a browser download.
  expect(window.URL.createObjectURL).not.toHaveBeenCalled();
});

test('the template helper reports failure instead of writing an empty file', async () => {
  downloadProblemTemplate.mockRejectedValue(new Error('network down'));

  expect(await downloadProblemTemplateFile('batch-1', { asJson: true })).toBeNull();
  expect(await downloadProblemTemplateFile('batch-1')).toBe(false);
  expect(window.URL.createObjectURL).not.toHaveBeenCalled();
});