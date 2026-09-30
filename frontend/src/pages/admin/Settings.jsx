import React, { useEffect, useState } from 'react';
import { getAdminSettings, updateAdminSettings } from '../../api/admin';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import Spinner from '../../components/ui/Spinner';

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const [savedSettings, setSavedSettings] = useState(null);
  const [formData, setFormData] = useState({
    platformTitle: '',
    registrationEnabled: true,
    maintenanceMode: false,
    submissionsEnabled: true,
    maxSubmissionsPerDay: 50,
    defaultTimeLimit: 2000,
    defaultMemoryLimit: 128,
  });

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminSettings();
      const data = res.data?.data;
      if (data) {
        setSavedSettings(data);
        setFormData({
          platformTitle: data.platformTitle ?? '',
          registrationEnabled: !!data.registrationEnabled,
          maintenanceMode: !!data.maintenanceMode,
          submissionsEnabled: !!data.submissionsEnabled,
          maxSubmissionsPerDay: data.maxSubmissionsPerDay ?? 50,
          defaultTimeLimit: data.defaultTimeLimit ?? 2000,
          defaultMemoryLimit: data.defaultMemoryLimit ?? 128,
        });
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load platform settings');
      setToast({ message: err?.response?.data?.message || 'Failed to load platform settings', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleReset = () => {
    if (savedSettings) {
      setFormData({
        platformTitle: savedSettings.platformTitle ?? '',
        registrationEnabled: !!savedSettings.registrationEnabled,
        maintenanceMode: !!savedSettings.maintenanceMode,
        submissionsEnabled: !!savedSettings.submissionsEnabled,
        maxSubmissionsPerDay: savedSettings.maxSubmissionsPerDay ?? 50,
        defaultTimeLimit: savedSettings.defaultTimeLimit ?? 2000,
        defaultMemoryLimit: savedSettings.defaultMemoryLimit ?? 128,
      });
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        platformTitle: formData.platformTitle.trim(),
        registrationEnabled: Boolean(formData.registrationEnabled),
        maintenanceMode: Boolean(formData.maintenanceMode),
        submissionsEnabled: Boolean(formData.submissionsEnabled),
        maxSubmissionsPerDay: Number(formData.maxSubmissionsPerDay),
        defaultTimeLimit: Number(formData.defaultTimeLimit),
        defaultMemoryLimit: Number(formData.defaultMemoryLimit),
      };

      const res = await updateAdminSettings(payload);
      const updated = res.data?.data;
      if (updated) {
        setSavedSettings(updated);
        setFormData({
          platformTitle: updated.platformTitle ?? '',
          registrationEnabled: !!updated.registrationEnabled,
          maintenanceMode: !!updated.maintenanceMode,
          submissionsEnabled: !!updated.submissionsEnabled,
          maxSubmissionsPerDay: updated.maxSubmissionsPerDay ?? 50,
          defaultTimeLimit: updated.defaultTimeLimit ?? 2000,
          defaultMemoryLimit: updated.defaultMemoryLimit ?? 128,
        });
      }
      setToast({ message: 'Settings saved successfully', type: 'success' });
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to save settings';
      setError(msg);
      setToast({ message: msg, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const isUnchanged = savedSettings && JSON.stringify(formData) === JSON.stringify({
    platformTitle: savedSettings.platformTitle ?? '',
    registrationEnabled: !!savedSettings.registrationEnabled,
    maintenanceMode: !!savedSettings.maintenanceMode,
    submissionsEnabled: !!savedSettings.submissionsEnabled,
    maxSubmissionsPerDay: savedSettings.maxSubmissionsPerDay ?? 50,
    defaultTimeLimit: savedSettings.defaultTimeLimit ?? 2000,
    defaultMemoryLimit: savedSettings.defaultMemoryLimit ?? 128,
  });

  return (
    <>
      <PageHeader
        title="Platform Settings"
        description="Manage global platform configuration and operational controls."
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {loading ? (
        <Spinner />
      ) : (
        <form onSubmit={handleSave}>
          {error && (
            <div
              style={{
                color: 'var(--color-danger)',
                backgroundColor: 'var(--color-surface-secondary)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 'var(--space-4)',
              }}
            >
              {error}
            </div>
          )}

          {/* SECTION 1 — General */}
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-5)',
              marginBottom: 'var(--space-5)',
            }}
          >
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--space-4)', marginTop: 0 }}>
              General
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <label htmlFor="platformTitle" style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>
                Platform Title
              </label>
              <input
                id="platformTitle"
                type="text"
                value={formData.platformTitle}
                onChange={(e) => handleChange('platformTitle', e.target.value)}
                required
                maxLength={200}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--text-base)',
                  width: '100%',
                  maxWidth: '500px',
                }}
              />
            </div>
          </div>

          {/* SECTION 2 — Platform Access */}
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-5)',
              marginBottom: 'var(--space-5)',
            }}
          >
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--space-4)', marginTop: 0 }}>
              Platform Access
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.registrationEnabled}
                  onChange={(e) => handleChange('registrationEnabled', e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                <div>
                  <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>Registration Enabled</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                    Allow new student and trainer accounts to register.
                  </div>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.maintenanceMode}
                  onChange={(e) => handleChange('maintenanceMode', e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                <div>
                  <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>Maintenance Mode</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                    Indicate platform maintenance status.
                  </div>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.submissionsEnabled}
                  onChange={(e) => handleChange('submissionsEnabled', e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                <div>
                  <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>Submissions Enabled</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                    Allow users to submit code solutions.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* SECTION 3 — Code Execution Defaults */}
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-5)',
              marginBottom: 'var(--space-5)',
            }}
          >
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--space-4)', marginTop: 0 }}>
              Code Execution Defaults
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <label htmlFor="maxSubmissionsPerDay" style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>
                  Maximum Submissions Per Day
                </label>
                <input
                  id="maxSubmissionsPerDay"
                  type="number"
                  min={1}
                  max={1000}
                  value={formData.maxSubmissionsPerDay}
                  onChange={(e) => handleChange('maxSubmissionsPerDay', parseInt(e.target.value, 10) || 0)}
                  required
                  style={{
                    padding: 'var(--space-2) var(--space-3)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--text-base)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <label htmlFor="defaultTimeLimit" style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>
                  Default Time Limit (milliseconds)
                </label>
                <input
                  id="defaultTimeLimit"
                  type="number"
                  min={100}
                  max={60000}
                  value={formData.defaultTimeLimit}
                  onChange={(e) => handleChange('defaultTimeLimit', parseInt(e.target.value, 10) || 0)}
                  required
                  style={{
                    padding: 'var(--space-2) var(--space-3)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--text-base)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <label htmlFor="defaultMemoryLimit" style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>
                  Default Memory Limit (MB)
                </label>
                <input
                  id="defaultMemoryLimit"
                  type="number"
                  min={16}
                  max={1048576}
                  value={formData.defaultMemoryLimit}
                  onChange={(e) => handleChange('defaultMemoryLimit', parseInt(e.target.value, 10) || 0)}
                  required
                  style={{
                    padding: 'var(--space-2) var(--space-3)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--text-base)',
                  }}
                />
              </div>
            </div>
          </div>

          {/* SECTION 4 — Actions */}
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <Button type="submit" variant="primary" disabled={saving || isUnchanged}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button type="button" variant="secondary" onClick={handleReset} disabled={saving || isUnchanged}>
              Reset / Cancel
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
