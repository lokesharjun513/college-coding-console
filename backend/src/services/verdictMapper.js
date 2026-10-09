// backend/src/services/verdictMapper.js
// Shared mapping from executor result to submission verdict.
// Supports both Judge0-style responses and OnlineCompiler-style responses.

/**
 * Normalize execution result to a consistent internal format.
 * @param {Object} execResult - Raw executor response
 * @returns {Object} Normalized result with stdout, stderr, exitCode, status
 */
function normalizeExecResult(execResult) {
  return {
    // OnlineCompiler uses 'output', Judge0 may use 'stdout'
    stdout: execResult.output || execResult.stdout || '',
    // OnlineCompiler uses 'error', Judge0 may use 'stderr'
    stderr: execResult.error || execResult.stderr || execResult.compile_output || '',
    // OnlineCompiler: exit_code number, Judge0: status object with id
    exitCode: execResult.exit_code ?? execResult.status?.id,
    // OnlineCompiler: status as string ('success', 'error', etc.)
    // Judge0: status object with id
    status: execResult.status,
  };
}

/**
 * Map execution result to platform verdict.
 * @param {Object} execResult - Raw executor response
 * @returns {string} Platform verdict
 */
function mapResultToVerdict(execResult) {
  const normalized = normalizeExecResult(execResult);

  // Check OnlineCompiler-style status (string: 'success', 'error', 'compile_error', etc.)
  if (normalized.status === 'success') {
    return 'ACCEPTED';
  }

  // Check Judge0-style successful status (id === 3 typically means Accepted)
  if (normalized.status?.id === 3) {
    return 'ACCEPTED';
  }

  // Compilation error detection
  if (normalized.stderr && normalized.stderr.trim()) {
    // OnlineCompiler sends compilation errors to 'error' field with 'Compilation' in message
    if (normalized.stderr.includes('Compilation') || normalized.status === 'compile_error') {
      return 'COMPILATION_ERROR';
    }
    // Otherwise runtime error
    return 'RUNTIME_ERROR';
  }

  // Judge0-style compile_output check
  if (execResult.compile_output && execResult.compile_output.trim()) {
    return 'COMPILATION_ERROR';
  }

  // Check exit codes for OnlineCompiler
  // 0 = success, 1 = runtime error, 124 = timeout
  if (normalized.exitCode === 0) {
    return 'ACCEPTED';
  }
  if (normalized.exitCode === 124) {
    return 'TIME_LIMIT_EXCEEDED';
  }

  return 'EXECUTION_ERROR';
}

module.exports = { mapResultToVerdict };