import { useState, useEffect, useCallback } from 'react';
import { getCompilerKeys, updateCompilerKeyLimit, resetCompilerKey, resetAllCompilerKeys, replaceCompilerKey, getCompilerKeysLogs } from '../../api/admin';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import ToastProvider, { useToast } from '../../components/ui/toast/ToastProvider';
import Modal, { ModalFooter, ModalBody } from '../../components/ui/Modal';
import DataTable from '../../components/ui/DataTable';
import CompilerKeyOverview from './components/admin/compiler-keys/CompilerKeyOverview';
import ActiveKeySummary from './components/admin/compiler-keys/ActiveKeySummary';
import UsageProgress from './components/admin/compiler-keys/UsageProgress';
import KeyStatusBadge from './components/admin/compiler-keys/KeyStatusBadge';
import '../../styles/pages/admin.css';
import '../../styles/pages/compiler-keys.css';

const CompilerKeysPage = () => {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeKeyIndex, setActiveKeyIndex] = useState(null);
  const [summary, setSummary] = useState({
    totalSubmissions: 0,
    totalRequestsUsed: 0,
    totalRemainingCapacity: 0
  });
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [showLimitUpdateModal, setShowLimitUpdateModal] = useState(false);
  const [limitUpdateKeyIndex, setLimitUpdateKeyIndex] = useState(null);
  const [limitUpdateValue, setLimitUpdateValue] = useState('');
  const [limitUpdatePassword, setLimitUpdatePassword] = useState('');
  const [showKeyReplaceModal, setShowKeyReplaceModal] = useState(false);
  const [keyReplaceKeyIndex, setKeyReplaceKeyIndex] = useState(null);
  const [keyReplaceData, setKeyReplaceData] = useState({
    displayName: '',
    newKey: '',
    limit: '',
    adminPassword: ''
  });
  const [resetKeyPassword, setResetKeyPassword] = useState('');
  const [resetAllConfirm, setResetAllConfirm] = useState(false);
  const [resetAllPassword, setResetAllPassword] = useState('');
  const [resetKeyIndex, setResetKeyIndex] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [showResetKeyModal, setShowResetKeyModal] = useState(false);
  const [refreshTimestamp, setRefreshTimestamp] = useState(null);
  const toast = useToast();

  const fetchCompilerKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getCompilerKeys();
      if (response.data && response.data.success) {
        const { data } = response.data;
        setKeys(data.keys || []);
        setActiveKeyIndex(data.activeKeyIndex !== undefined ? data.activeKeyIndex : null);
        setSummary(data.summary || { totalSubmissions: 0, totalRequestsUsed: 0, totalRemainingCapacity: 0 });
        setRefreshTimestamp(data.timestamp);
      } else {
        const message = response.data?.message || 'Failed to fetch compiler keys data';
        setError(message);
        if (toast && typeof toast.error === 'function') {
          toast.error(message);
        }
      }
    } catch (err) {
      setError(`Failed to fetch compiler keys data: ${err.message}`);
      if (toast && typeof toast.error === 'function') {
        toast.error(`Failed to fetch compiler keys data: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const response = await getCompilerKeysLogs();
      if (response.data && response.data.success) {
        setLogs(response.data.data?.logs || []);
      } else {
        setLogs([]);
        const message = response.data?.message || 'Failed to fetch compiler keys logs';
        if (toast && typeof toast.error === 'function') {
          toast.error(message);
        }
      }
    } catch (err) {
      setLogs([]);
      if (toast && typeof toast.error === 'function') {
        toast.error(`Failed to fetch compiler keys logs: ${err.message}`);
      }
    } finally {
      setLogsLoading(false);
    }
  }, [toast]);

  const handleLimitUpdateSubmit = async () => {
    try {
      // Need a new API method for this if it requires password
      // Wait, updateCompilerKeyLimit currently just takes index, limit
      // The requirement says "Require administrator password verification for this action as well."
      // Let me re-read the requirement.
      // Yes, "Update Request Limit Separately ... Require administrator password verification for this action as well."
      // My backend implementation of `updateLimit` does NOT currently take password as an argument.
      // I should update backend first.

      // Actually, I can just call updateCompilerKeyLimit with the password if I update the backend.
      // Let me update the backend `updateLimit` route to require `adminPassword`.

      // Let's implement the UI first, and update backend/frontend APIs in parallel.

      const response = await updateCompilerKeyLimit(limitUpdateKeyIndex, limitUpdateValue, limitUpdatePassword);
      if (response.data && response.data.success) {
        if (toast && typeof toast.success === 'function') {
          toast.success(`Key ${limitUpdateKeyIndex} limit updated successfully`);
        }
        setShowLimitUpdateModal(false);
        await fetchCompilerKeys();
      } else {
        throw new Error(response.data?.message || 'Failed to update limit');
      }
    } catch (err) {
      if (toast && typeof toast.error === 'function') {
        toast.error(err.message || 'Failed to update key limit');
      }
    }
  };

  const handleKeyReplaceSubmit = async () => {
    try {
      const { displayName, newKey, limit, adminPassword } = keyReplaceData;
      if (!displayName || !newKey || !adminPassword) {
        if (toast && typeof toast.error === 'function') {
          toast.error('Please fill all required fields');
        }
        return;
      }

      const response = await replaceCompilerKey(keyReplaceKeyIndex, {
        displayName,
        newKey,
        limit: limit ? parseInt(limit, 10) : undefined,
        adminPassword
      });

      if (response.data && response.data.success) {
        if (toast && typeof toast.success === 'function') {
          toast.success(`Key ${keyReplaceKeyIndex} replaced successfully`);
        }
        setShowKeyReplaceModal(false);
        await fetchCompilerKeys();
      } else {
        throw new Error(response.data?.message || 'Failed to replace key');
      }
    } catch (err) {
      if (toast && typeof toast.error === 'function') {
        toast.error(err.message || 'Failed to replace key');
      }
    }
  };

  const handleResetKey = async (keyIndex) => {
    try {
      const response = await resetCompilerKey(keyIndex, resetPassword);
      if (response.data && response.data.success) {
        if (toast && typeof toast.success === 'function') {
          toast.success(`Key ${keyIndex} reset successfully`);
        }
        setShowResetKeyModal(false);
        setResetPassword('');
        await fetchCompilerKeys();
      } else {
        throw new Error(response.data?.message || 'Failed to reset key');
      }
    } catch (err) {
      if (toast && typeof toast.error === 'function') {
        toast.error(err.message || 'Failed to reset key');
      }
    }
  };

  const handleOpenKeyReplaceModal = (keyIndex) => {
    setKeyReplaceKeyIndex(keyIndex);
    setKeyReplaceData({
      displayName: '',
      newKey: '',
      limit: '',
      adminPassword: ''
    });
    setShowKeyReplaceModal(true);
  };

  const handleResetAllKeys = async () => {
    try {
      const response = await resetAllCompilerKeys(resetAllConfirm, resetAllPassword);
      if (response.data && response.data.success) {
        if (toast && typeof toast.success === 'function') {
          toast.success('All compiler keys reset successfully');
        }
        setResetAllPassword('');
        await fetchCompilerKeys();
        setResetAllConfirm(false);
      } else {
        throw new Error(response.data?.message || 'Failed to reset all keys');
      }
    } catch (err) {
      if (toast && typeof toast.error === 'function') {
        toast.error(err.message || 'Failed to reset all keys');
      }
    }
  };

  useEffect(() => {
    fetchCompilerKeys();
    fetchLogs();
  }, [fetchCompilerKeys, fetchLogs]);

  useEffect(() => {
    const interval = setInterval(fetchCompilerKeys, 20000);
    return () => clearInterval(interval);
  }, [fetchCompilerKeys]);

  if (loading && keys.length === 0) {
    return (
      <div className="admin-page compiler-keys-page">
        <div className="admin-dashboard__loading" aria-busy="true">
          <div className="admin-dashboard__loader">
            <div className="admin-dashboard__loader-ring" />
          </div>
        </div>
      </div>
    );
  }

  const activeKey = keys.find(k => k.keyIndex === activeKeyIndex);

  return (
    <ToastProvider>
      <div className="admin-page compiler-keys-page">
        {/* Breadcrumb & Header */}
        <header className="admin-page-header">
          <nav className="admin-breadcrumb" aria-label="Breadcrumb">
            <a href="/admin" className="admin-breadcrumb__item">Admin</a>
            <span className="admin-breadcrumb__separator">/</span>
            <span className="admin-breadcrumb__item">System Management</span>
            <span className="admin-breadcrumb__separator">/</span>
            <span className="admin-breadcrumb__current" aria-current="page">Compiler Keys</span>
          </nav>
          <div className="admin-page-header-content">
            <div className="admin-page-header-text">
              <h1 className="admin-page-title">API Key Rotation & Submissions</h1>
              <p className="admin-page-description">
                Monitor compiler API keys, usage, remaining capacity, rotation, and recent activity.
              </p>
            </div>
            <div className="admin-header-actions">
              <Button variant="secondary" size="sm" onClick={fetchCompilerKeys}>
                Refresh Data
              </Button>
            </div>
          </div>
        </header>

        {/* KPI Cards */}
        <CompilerKeyOverview
          activeKeyIndex={activeKeyIndex}
          summary={summary}
          keys={keys}
        />

        {/* Active Key Summary */}
        <ActiveKeySummary
          activeKey={activeKey}
          refreshTimestamp={refreshTimestamp}
        />

        {/* Key Management Matrix */}
        <div className="admin-card mb-6">
          <div className="admin-section-header">
            <div className="admin-section-heading">
              <div>
                <h3 className="admin-section-title">Key Management Matrix</h3>
                <p className="text-xs text-muted-foreground">Configure limits, inspect rotation status, and reset counters</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setResetAllConfirm(true)}
              >
                Reset All Keys
              </Button>
            </div>
          </div>

          <DataTable
            columns={[
              { key: 'keyIndex', header: 'Key Index' },
              { key: 'maskedKey', header: 'Masked API Key' },
              { key: 'usagePercentage', header: 'Usage Progress' },
              { key: 'remainingRequests', header: 'Remaining' },
              { key: 'status', header: 'Status' },
              { key: 'maxRequestLimit', header: 'Max Limit' },
              { key: 'actions', header: 'Actions' }
            ]}
            data={keys.map((key) => ({
              keyIndex: (
                <div className="font-semibold text-primary">Key #{key.keyIndex}</div>
              ),
              maskedKey: (
                <div className="font-mono text-xs">{key.maskedKey}</div>
              ),
              usagePercentage: (
                <UsageProgress
                  usagePercentage={key.usagePercentage}
                  currentRequestCount={key.currentRequestCount}
                  maxRequestLimit={key.maxRequestLimit}
                />
              ),
              remainingRequests: (
                <span className="font-medium">{key.remainingRequests.toLocaleString()}</span>
              ),
              status: (
                <KeyStatusBadge
                  status={key.status}
                  keyIndex={key.keyIndex}
                  activeKeyIndex={activeKeyIndex}
                  exhaustionNotified={key.exhaustionNotified}
                />
              ),
              maxRequestLimit: (
                <span className="font-medium">{key.maxRequestLimit.toLocaleString()}</span>
              ),
              actions: (
                <div className="flex items-center justify-center gap-1.5">
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenKeyReplaceModal(key.keyIndex)}
                    >
                      Edit Key
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setLimitUpdateKeyIndex(key.keyIndex);
                        setLimitUpdateValue('');
                        setLimitUpdatePassword('');
                        setShowLimitUpdateModal(true);
                      }}
                    >
                      Update Limit
                    </Button>
                     <Button
                       variant="secondary"
                       size="sm"
                       onClick={() => {
                         setResetKeyIndex(key.keyIndex);
                         setResetPassword('');
                         setShowResetKeyModal(true);
                       }}
                     >
                       Reset
                     </Button>
                  </>
                </div>
              )
            }))}
            loading={loading}
            error={error}
            emptyMessage="No compiler keys configured."
          />
        </div>

        {/* Recent Activity Log */}
        <div className="admin-card">
          <div className="admin-section-header">
            <div className="admin-section-heading">
              <div>
                <h3 className="admin-section-title">Recent Activity Log</h3>
                <p className="text-xs text-muted-foreground">Audit trail of key status changes and rotation events</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={fetchLogs}>
              Refresh Logs
            </Button>
          </div>

          <DataTable
            columns={[
              { key: 'timestamp', header: 'Timestamp' },
              { key: 'eventType', header: 'Event Type' },
              { key: 'keyIndex', header: 'Key Index' },
              { key: 'description', header: 'Description' }
            ]}
            data={logs.map((log) => ({
              timestamp: log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A',
              eventType: log.eventType || 'N/A',
              keyIndex: log.keyIndex !== undefined ? `Key #${log.keyIndex}` : 'N/A',
              description: log.description || 'N/A'
            }))}
            loading={logsLoading}
            emptyMessage="No recent activity to display."
          />
        </div>

        {/* Limit Update Modal */}
        {showLimitUpdateModal && (
          <Modal isOpen={showLimitUpdateModal} onClose={() => setShowLimitUpdateModal(false)} title="Update Request Limit">
            <ModalBody className="space-y-4">
              <Input
                id="new-limit"
                label="New Limit"
                type="number"
                min="1"
                value={limitUpdateValue}
                onChange={(e) => setLimitUpdateValue(e.target.value)}
              />
              <Input
                id="admin-password-limit"
                label="Admin Password"
                type="password"
                value={limitUpdatePassword}
                onChange={(e) => setLimitUpdatePassword(e.target.value)}
              />
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onClick={() => setShowLimitUpdateModal(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleLimitUpdateSubmit}>Save Changes</Button>
            </ModalFooter>
          </Modal>
        )}

        {/* Key Replace Modal */}
        {showKeyReplaceModal && (
          <Modal isOpen={showKeyReplaceModal} onClose={() => setShowKeyReplaceModal(false)} title="Edit Compiler Key">
            <ModalBody className="space-y-4">
              <Input
                id="display-name"
                label="Display Name"
                value={keyReplaceData.displayName}
                onChange={(e) => setKeyReplaceData({...keyReplaceData, displayName: e.target.value})}
              />
              <Input
                id="new-api-key"
                label="New API Key"
                type="password"
                value={keyReplaceData.newKey}
                onChange={(e) => setKeyReplaceData({...keyReplaceData, newKey: e.target.value})}
              />
              <Input
                id="request-limit"
                label="Request Limit (Optional)"
                type="number"
                min="1"
                value={keyReplaceData.limit}
                onChange={(e) => setKeyReplaceData({...keyReplaceData, limit: e.target.value})}
              />
              <Input
                id="admin-password-replace"
                label="Admin Password"
                type="password"
                value={keyReplaceData.adminPassword}
                onChange={(e) => setKeyReplaceData({...keyReplaceData, adminPassword: e.target.value})}
              />
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onClick={() => setShowKeyReplaceModal(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleKeyReplaceSubmit}>Save Changes</Button>
            </ModalFooter>
          </Modal>
        )}

        {/* Reset Single Key Confirmation Modal */}
        {showResetKeyModal && (
          <Modal isOpen={showResetKeyModal} onClose={() => setShowResetKeyModal(false)} title="Reset Compiler Key">
            <ModalBody className="space-y-4">
              <p className="text-sm text-secondary">
                Are you sure you want to reset the usage counter for Key #{resetKeyIndex}? This will reactivate the key if it was exhausted.
              </p>
              <Input
                id="admin-password-reset"
                label="Admin Password"
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
              />
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onClick={() => setShowResetKeyModal(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => handleResetKey(resetKeyIndex)}>Reset Key</Button>
            </ModalFooter>
          </Modal>
        )}

        {/* Reset All Confirmation Modal */}
        {resetAllConfirm && (
          <Modal isOpen={resetAllConfirm} onClose={() => setResetAllConfirm(false)} title="Reset All Compiler Keys">
            <ModalBody className="space-y-4">
              <p className="text-sm text-secondary">
                Are you sure you want to reset usage counters for all 5 compiler keys? Historical submission totals will be preserved.
              </p>
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="reset-all-confirm"
                  checked={resetAllConfirm}
                  onChange={(e) => setResetAllConfirm(e.target.checked)}
                />
                <label htmlFor="reset-all-confirm" className="text-xs font-medium">
                  Confirm reset of all keys
                </label>
              </div>
              <Input
                id="admin-password-reset-all"
                label="Admin Password"
                type="password"
                value={resetAllPassword}
                onChange={(e) => setResetAllPassword(e.target.value)}
              />
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onClick={() => setResetAllConfirm(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleResetAllKeys}>
                Reset All Keys
              </Button>
            </ModalFooter>
          </Modal>
        )}
      </div>
    </ToastProvider>
  );
};

export default CompilerKeysPage;