import React, { useState } from 'react';
import { Upload, File, AlertTriangle, Download, CheckCircle, XCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import { bulkUploadStudents, downloadStudentTemplate } from '../../api/admin';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import Spinner from '../../components/ui/Spinner';
import '../../styles/pages/admin-students.css';

const parseCSV = (text) => {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const header = lines[0]?.split(',').map(h => h.trim().toLowerCase()) ?? [];
  const rows = [];
  for (let i = 1; i < lines.length && i <= 500; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    const row = {};
    header.forEach((h, idx) => { row[h] = cols[idx] ?? ''; });
    rows.push(row);
  }
  return { header, rows };
};

export default function BulkUploadModal({ isOpen, onClose, onSuccess }) {
  // 1: Select File, 2: Review File Info, 3: Review Students, 4: Confirm, 5: Uploading, 6: Success, 7: Error Result
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedFile, setSelectedFile] = useState(null);
  const [students, setStudents] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [importResult, setImportResult] = useState(null);
  const [toast, setToast] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const resetState = () => {
    setCurrentStep(1);
    setSelectedFile(null);
    setStudents([]);
    setValidationErrors([]);
    setIsUploading(false);
    setUploadProgress(0);
    setImportResult(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleDownloadTemplate = async (e) => {
    e.stopPropagation();
    setDownloading(true);
    try {
      const response = await downloadStudentTemplate();
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'student_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setToast({ message: 'Template downloaded successfully', type: 'success' });
    } catch (err) {
      setToast({ message: 'Failed to download template', type: 'error' });
    } finally {
      setDownloading(false);
    }
  };

  const processFile = (fileObj) => {
    if (!fileObj) return;
    const isCsv = fileObj.type === 'text/csv' || fileObj.name?.endsWith('.csv');
    if (!isCsv) {
      setToast({ message: 'Please select a valid CSV file', type: 'error' });
      return;
    }
    if (fileObj.size > 5 * 1024 * 1024) {
      setToast({ message: 'File size exceeds 5MB limit', type: 'error' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (!text) {
        setToast({ message: 'File is empty', type: 'error' });
        return;
      }
      const { rows } = parseCSV(text);
      if (rows.length === 0) {
        setToast({ message: 'CSV file contains no rows', type: 'error' });
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const errors = [];
      rows.forEach((r, idx) => {
        const missing = !r.name || !r.email || !r.rollnumber || !r.department || !r.academicbatchstart || !r.academicbatchend;
        if (missing) {
          errors.push({ row: idx + 1, message: 'Missing required field' });
        } else if (!emailRegex.test(r.email.toLowerCase())) {
          errors.push({ row: idx + 1, message: 'Invalid email format' });
        }
      });

      setSelectedFile(fileObj);
      setStudents(rows);
      setValidationErrors(errors);
      setCurrentStep(2); // Move to Screen 2: File Selected / Review File
    };
    reader.readAsText(fileObj);
  };

  const handleFileChange = (e) => {
    processFile(e.target.files?.[0]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    processFile(e.dataTransfer.files?.[0]);
  };

  const handleConfirmUpload = async () => {
    setCurrentStep(5); // Uploading
    setIsUploading(true);
    setUploadProgress(30);

    const formattedStudents = students.map(r => ({
      name: r.name,
      email: r.email,
      rollNumber: r.rollnumber,
      academicBatch: {
        startYear: parseInt(r.academicbatchstart) || 0,
        endYear: parseInt(r.academicbatchend) || 0,
      },
      department: r.department,
      section: r.section || undefined,
    }));

    try {
      setUploadProgress(70);
      const res = await bulkUploadStudents({ students: formattedStudents });
      setUploadProgress(100);
      const created = res.data?.created ?? res.data?.data?.created ?? 0;
      const backendErrors = res.data?.errors ?? res.data?.data?.errors ?? [];

      setImportResult({ created, backendErrors });
      if (backendErrors.length > 0) {
        setCurrentStep(7); // Error Result
      } else {
        setCurrentStep(6); // Success
      }
      if (onSuccess) onSuccess();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Upload failed', type: 'error' });
      setCurrentStep(4); // Back to Confirm on error
    } finally {
      setIsUploading(false);
    }
  };

  const downloadFailedRows = () => {
    if (!importResult?.backendErrors) return;
    const failedRows = importResult.backendErrors.map(e => `Row ${e.row}: ${e.error || e.message}`).join('\n');
    const blob = new Blob([failedRows], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'failed_import_report.txt');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const readyCount = students.length - validationErrors.length;
  const errorCount = validationErrors.length;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import Students" className="admin-students__modal-glass">
      <div className="admin-students__modal-content">

        {/* Step Indicator */}
        <div className="admin-students__step-indicator">
          {[
            { num: 1, label: 'Upload' },
            { num: 2, label: 'File Info' },
            { num: 3, label: 'Review' },
            { num: 4, label: 'Confirm' },
            { num: 5, label: 'Importing' },
            { num: 6, label: 'Complete' },
          ].map((s) => (
            <div
              key={s.num}
              className={`admin-students__step-item ${currentStep === s.num || (s.num === 6 && currentStep === 7) ? 'active' : ''} ${currentStep > s.num ? 'completed' : ''}`}
            >
              <span className="admin-students__step-num">{currentStep > s.num ? '✓' : s.num}</span>
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        {/* SCREEN 1: SELECT FILE */}
        {currentStep === 1 && (
          <div className="admin-students__screen">
            <div className="admin-students__screen-header">
              <h2 className="admin-students__screen-title">Bulk Upload Students</h2>
              <p className="admin-students__screen-subtitle">Add multiple students to the platform using a CSV or XLSX file.</p>
            </div>

            <label
              htmlFor="csv-file-input"
              className={`admin-students__upload-zone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <input
                id="csv-file-input"
                type="file"
                accept=".csv,.xlsx"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <Upload size={44} className="admin-students__upload-icon" />
              <p className="admin-students__upload-prompt">Drop your file here</p>
              <p className="admin-students__upload-subtext">or browse from your computer (CSV, XLSX format, max 500 rows)</p>
              <Button type="button" variant="secondary" size="sm">Choose File</Button>
            </label>

            <div style={{ textAlign: 'center', marginTop: '12px' }}>
              <button className="admin-students__template-link" onClick={handleDownloadTemplate} disabled={downloading}>
                {downloading ? 'Downloading Template...' : 'Download Template (.csv)'}
              </button>
            </div>
          </div>
        )}

        {/* SCREEN 2: FILE SELECTED / REVIEW FILE */}
        {currentStep === 2 && (
          <div className="admin-students__screen">
            <div className="admin-students__screen-header">
              <h2 className="admin-students__screen-title">File Selected</h2>
              <p className="admin-students__screen-subtitle">Verify your selected file before inspecting records.</p>
            </div>

            <div className="admin-students__file-row" style={{ padding: '20px', borderRadius: '20px', background: 'rgba(255, 255, 255, 0.6)' }}>
              <div className="admin-students__file-meta" style={{ gap: '14px' }}>
                <File size={28} style={{ color: 'var(--interactive, #2563eb)' }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '15px' }}>{selectedFile?.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {(selectedFile?.size / 1024).toFixed(1)} KB • {students.length} rows detected
                  </div>
                </div>
              </div>
              <button className="admin-students__clear-btn" onClick={() => setCurrentStep(1)} style={{ padding: '6px 12px', background: 'rgba(0,0,0,0.05)', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '12px' }}>
                Replace File
              </button>
            </div>

            <div className="admin-students__stats-bar" style={{ marginTop: '16px' }}>
              <div><span className="admin-students__stat-val">{students.length}</span> Total Records</div>
              <div>•</div>
              <div><span className="admin-students__stat-val success">{readyCount}</span> Ready</div>
              <div>•</div>
              <div><span className="admin-students__stat-val error">{errorCount}</span> Errors</div>
            </div>

            <div className="admin-students__modal-footer">
              <Button variant="secondary" onClick={() => setCurrentStep(1)}>
                <ArrowLeft size={16} style={{ marginRight: '6px' }} /> Back
              </Button>
              <Button onClick={() => setCurrentStep(3)}>
                Review Students <ArrowRight size={16} style={{ marginLeft: '6px' }} />
              </Button>
            </div>
          </div>
        )}

        {/* SCREEN 3: REVIEW STUDENTS */}
        {currentStep === 3 && (
          <div className="admin-students__screen">
            <div className="admin-students__screen-header">
              <h2 className="admin-students__screen-title">Review Students</h2>
              <p className="admin-students__screen-subtitle">Check the imported records before adding them.</p>
            </div>

            <div className="admin-students__stats-bar">
              <div><span className="admin-students__stat-val">{students.length}</span> Total</div>
              <div>•</div>
              <div><span className="admin-students__stat-val success">{readyCount}</span> Ready</div>
              <div>•</div>
              <div><span className="admin-students__stat-val error">{errorCount}</span> Errors</div>
            </div>

            {errorCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.08)', marginBottom: '12px', color: 'var(--color-danger)' }}>
                <AlertTriangle size={16} />
                <span style={{ fontSize: '12px' }}>Some rows contain errors. Review highlighted rows below.</span>
              </div>
            )}

            <div className="admin-students__preview-container">
              <table className="admin-students__preview-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Roll Number</th>
                    <th>Department</th>
                    <th>Start Year</th>
                    <th>End Year</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((row, idx) => {
                    const rowErr = validationErrors.find(e => e.row === idx + 1);
                    return (
                      <tr key={idx} className={rowErr ? 'admin-students__row-error' : ''} title={rowErr ? rowErr.message : ''}>
                        <td>{idx + 1}</td>
                        <td>{row.name || '—'}</td>
                        <td>{row.email || '—'}</td>
                        <td>{row.rollnumber || '—'}</td>
                        <td>{row.department || '—'}</td>
                        <td>{row.academicbatchstart || '—'}</td>
                        <td>{row.academicbatchend || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="admin-students__modal-footer">
              <Button variant="secondary" onClick={() => setCurrentStep(2)}>
                <ArrowLeft size={16} style={{ marginRight: '6px' }} /> Back
              </Button>
              <Button onClick={() => setCurrentStep(4)}>
                Continue <ArrowRight size={16} style={{ marginLeft: '6px' }} />
              </Button>
            </div>
          </div>
        )}

        {/* SCREEN 4: CONFIRM IMPORT */}
        {currentStep === 4 && (
          <div className="admin-students__screen">
            <div className="admin-students__screen-header">
              <h2 className="admin-students__screen-title">Ready to import?</h2>
              <p className="admin-students__screen-subtitle">You are about to add {readyCount} students to the platform.</p>
            </div>

            <div className="admin-students__confirm-card">
              <div className="admin-students__confirm-row">
                <span className="admin-students__confirm-label">Students to import</span>
                <span className="admin-students__confirm-value success" style={{ color: 'var(--color-success)' }}>{readyCount}</span>
              </div>
              <div className="admin-students__confirm-row">
                <span className="admin-students__confirm-label">Skipped / invalid</span>
                <span className="admin-students__confirm-value error" style={{ color: errorCount > 0 ? 'var(--color-danger)' : 'inherit' }}>{errorCount}</span>
              </div>
              <div className="admin-students__confirm-row" style={{ borderBottom: 'none' }}>
                <span className="admin-students__confirm-label">File</span>
                <span className="admin-students__confirm-value">{selectedFile?.name}</span>
              </div>
            </div>

            {errorCount > 0 && (
              <p style={{ fontSize: '13px', color: 'var(--color-danger)', marginTop: '8px' }}>
                Note: {errorCount} invalid rows will be skipped during import unless fixed.
              </p>
            )}

            <div className="admin-students__modal-footer">
              <Button variant="secondary" onClick={() => setCurrentStep(3)}>
                <ArrowLeft size={16} style={{ marginRight: '6px' }} /> Back
              </Button>
              <Button onClick={handleConfirmUpload} disabled={readyCount === 0}>
                Import Students
              </Button>
            </div>
          </div>
        )}

        {/* SCREEN 5: IMPORTING */}
        {currentStep === 5 && (
          <div className="admin-students__screen">
            <div className="admin-students__uploading-screen">
              <Spinner size={48} />
              <h3 style={{ fontSize: '18px', fontWeight: 600, margin: '8px 0 2px' }}>Importing Students</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>Adding students securely. Please keep this window open.</p>

              <div className="admin-students__progress-bar-track">
                <div className="admin-students__progress-bar-fill" style={{ width: `${uploadProgress}%` }}></div>
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 6: SUCCESS */}
        {currentStep === 6 && importResult && (
          <div className="admin-students__screen">
            <div className="admin-students__complete-screen">
              <div className="admin-students__complete-icon">
                <CheckCircle size={32} />
              </div>
              <h3 className="admin-students__screen-title">Students imported successfully</h3>

              <div className="admin-students__confirm-card" style={{ width: '100%', maxWidth: '360px', marginTop: '12px' }}>
                <div className="admin-students__confirm-row">
                  <span className="admin-students__confirm-label">Added</span>
                  <span className="admin-students__confirm-value" style={{ color: 'var(--color-success)' }}>{importResult.created}</span>
                </div>
                <div className="admin-students__confirm-row" style={{ borderBottom: 'none' }}>
                  <span className="admin-students__confirm-label">Failed / Skipped</span>
                  <span className="admin-students__confirm-value">{importResult.backendErrors.length}</span>
                </div>
              </div>
            </div>

            <div className="admin-students__modal-footer">
              <Button variant="secondary" onClick={handleClose}>
                Upload Another File
              </Button>
              <Button onClick={handleClose}>
                Done
              </Button>
            </div>
          </div>
        )}

        {/* SCREEN 7: ERROR RESULT */}
        {currentStep === 7 && importResult && (
          <div className="admin-students__screen">
            <div className="admin-students__screen-header">
              <h2 className="admin-students__screen-title">Import completed with some issues</h2>
              <p className="admin-students__screen-subtitle">{importResult.created} imported · {importResult.backendErrors.length} failed.</p>
            </div>

            <div className="admin-students__confirm-card" style={{ marginBottom: '12px' }}>
              <div className="admin-students__confirm-row">
                <span className="admin-students__confirm-label">Imported</span>
                <span className="admin-students__confirm-value" style={{ color: 'var(--color-success)' }}>{importResult.created}</span>
              </div>
              <div className="admin-students__confirm-row" style={{ borderBottom: 'none' }}>
                <span className="admin-students__confirm-label">Failed</span>
                <span className="admin-students__confirm-value" style={{ color: 'var(--color-danger)' }}>{importResult.backendErrors.length}</span>
              </div>
            </div>

            <div className="admin-students__preview-container" style={{ maxHeight: '200px' }}>
              <table className="admin-students__preview-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Error Details</th>
                  </tr>
                </thead>
                <tbody>
                  {importResult.backendErrors.map((err, idx) => (
                    <tr key={idx} className="admin-students__row-error">
                      <td>Row {err.row}</td>
                      <td>{err.error || err.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="admin-students__modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Button variant="secondary" onClick={downloadFailedRows}>
                <Download size={16} style={{ marginRight: '6px' }} /> Download Error Report
              </Button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" onClick={() => { resetState(); }}>
                  Upload Another File
                </Button>
                <Button onClick={handleClose}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        )}

      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </Modal>
  );
}
