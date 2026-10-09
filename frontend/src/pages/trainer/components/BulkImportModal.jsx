import React, { useState } from 'react';
import { bulkImportProblems, downloadProblemTemplate } from '../../api/trainer';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import Toast from '../../components/ui/Toast';
import { Upload, Download } from 'lucide-react';
import '../../styles/pages/trainer-problems-hierarchy.css';

export default function BulkImportModal({ isOpen, onClose, onImportComplete }) {
  const [importFile, setImportFile] = useState(null);
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState('file');
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importErrors, setImportErrors] = useState([]);
  const [parsedPreview, setParsedPreview] = useState([]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      setImportErrors([{ row: 0, message: 'Please select a valid .json file' }]);
      setImportFile(null);
      return;
    }
    setImportFile(file);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (Array.isArray(json)) {
        setParsedPreview(json);
      } else {
        setParsedPreview([json]);
      }
      setImportErrors([]);
    } catch (err) {
      setParsedPreview([]);
      setImportErrors([{ row: 0, message: 'Invalid JSON format' }]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/json') {
      setImportFile(file);
      handleFileChange({ target: { files: [file] } });
    }
  };

  const handleImport = async () => {
    try {
      let problemsToImport = [];
      if (importMode === 'file') {
        if (!importFile) {
          setImportErrors([{ row: 0, message: 'Please select a JSON file' }]);
          return;
        }
        const text = await importFile.text();
        problemsToImport = JSON.parse(text);
      } else {
        problemsToImport = JSON.parse(importText);
      }

      if (!Array.isArray(problemsToImport)) {
        setImportErrors([{ row: 0, message: 'Expected an array of problems' }]);
        return;
      }

      setImportSubmitting(true);
      const res = await bulkImportProblems({ problems: problemsToImport });

      if (res.data.success) {
        const summary = res.data.summary;
        let msg = `${summary.created} problem(s) created successfully`;
        if (summary.failed > 0) {
          msg += `, ${summary.failed} failed`;
        }
        if (onImportComplete) onImportComplete(summary);
        if (res.data.errors && res.data.errors.length > 0) {
          setImportErrors(res.data.errors);
        }
      } else {
        setImportErrors([{ row: 0, message: res.data.message || 'Import failed' }]);
      }
    } catch (err) {
      setImportErrors([{ row: 0, message: err.response?.data?.message || 'Import failed / Invalid JSON' }]);
    } finally {
      setImportSubmitting(false);
    }
  };

  const handleReset = () => {
    setImportFile(null);
    setImportText('');
    setImportErrors([]);
    setParsedPreview([]);
    setImportMode('file');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="trainer-problems__modal-overlay" onClick={onClose}>
      <div className="trainer-problems__modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="trainer-problems__modal-header">
          <h3>Bulk Import Problems</h3>
          <button className="trainer-problems__modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="trainer-problems__modal-body">
          <div className="trainer-problems__import-tabs">
            <button
              className={importMode === 'file' ? 'trainer-problems__tab-active' : 'trainer-problems__tab-inactive'}
              onClick={() => setImportMode('file')}
            >
              Upload JSON
            </button>
            <button
              className={importMode === 'text' ? 'trainer-problems__tab-active' : 'trainer-problems__tab-inactive'}
              onClick={() => setImportMode('text')}
            >
              Paste JSON
            </button>
          </div>

          {importMode === 'file' ? (
            <div className="trainer-problems__import-file">
              <label className="trainer-problems__import-label">Select .json File</label>
              <div
                className="trainer-problems__drag-drop-area"
                onDragOver={handleDragOver}
                onDragLeave={handleDragOver}
                onDrop={handleDrop}
              >
                <p>Drag & drop a JSON file here, or click to select</p>
                <input
                  className="trainer-problems__file-input"
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                />
                {importFile && (
                  <div className="trainer-problems__file-info">
                    Selected: {importFile.name} ({parsedPreview.length} items parsed)
                  </div>
                )}
              </div>
              {importErrors.length > 0 && (
                <div className="trainer-problems__import-errors">
                  {importErrors.map((error, index) => (
                    <div key={index} className="trainer-problems__error-item">
                      {error.message}
                    </div>
                  ))}
                </div>
              )}
              {parsedPreview.length > 0 && importErrors.length === 0 && (
                <div className="trainer-problems__import-preview">
                  <p>✓ Valid JSON: {parsedPreview.length} problem(s) ready for import.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="trainer-problems__import-text">
              <label className="trainer-problems__import-label">Paste JSON Array</label>
              <textarea
                className="trainer-problems__textarea"
                rows={8}
                value={importText}
                onChange={(e) => {
                  setImportText(e.target.value);
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setParsedPreview(Array.isArray(parsed) ? parsed : [parsed]);
                    setImportErrors([]);
                  } catch {
                    setParsedPreview([]);
                    setImportErrors([{ row: 0, message: 'Invalid JSON format' }]);
                  }
                }}
                placeholder='[{"title": "Two Sum", "difficulty": "EASY", "description": "..."}]'
              />
              {importErrors.length > 0 && (
                <div className="trainer-problems__import-errors">
                  {importErrors.map((error, index) => (
                    <div key={index} className="trainer-problems__error-item">
                      {error.message}
                    </div>
                  ))}
                </div>
              )}
              {parsedPreview.length > 0 && importErrors.length === 0 && (
                <div className="trainer-problems__import-preview">
                  <p>✓ Valid JSON: {parsedPreview.length} problem(s) ready for import.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="trainer-problems__modal-footer">
          <button
            className="trainer-problems__btn-secondary"
            onClick={handleReset}
            disabled={importSubmitting}
          >
            Cancel
          </button>
          <button
            className="trainer-problems__btn-primary"
            onClick={handleImport}
            disabled={importSubmitting ||
                     (importMode === 'file' && !importFile) ||
                     (importMode === 'text' && !importText.trim())}
          >
            {importSubmitting ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}