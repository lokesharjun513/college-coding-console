/**
 * Executes GCC code safely using the sync endpoint.
 * @param {string} code - The C source code to run.
 * @param {string} input - Standard input for the program.
 * @param {number} timeoutMs - Max execution time in milliseconds (default 5000ms).
 */
async function runUserCode(code, input, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Explicitly using an alternative initialization format to protect header casing in Node
    const response = await fetch("https://api.onlinecompiler.io/api/run-code-sync/", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": process.env.ONLINE_COMPILER_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        compiler: "gcc-15", // Targeting GCC 15
        code: code,
        input: input
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        status: "api_error",
        error: `Compiler API Error (HTTP ${response.status}): ${errorText}`
      };
    }

    const result = await response.json();

    // 1. CHECK FOR COMPILATION OR RUNTIME FAILURES (exit_code !== 0)
    if (result.exit_code !== 0 || result.status === "error") {
      return {
        success: false,
        status: "compile_or_runtime_error",
        exitCode: result.exit_code,
        signal: result.signal,
        // The API returns compiler diagnostics and syntax errors inside result.error
        errorLogs: result.error || "Unknown compilation error.",
        outputLog: result.output || ""
      };
    }

    // 2. CHECK FOR CLEAN SUCCESS
    return {
      success: true,
      status: "success",
      exitCode: result.exit_code,
      errorLogs: null,
      outputLog: result.output // Clean standard output
    };

  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        success: false,
        status: "timeout",
        errorLogs: `Execution timed out after ${timeoutMs / 1000} seconds.`,
        outputLog: ""
      };
    }
    
    return {
      success: false,
      status: "system_error",
      errorLogs: `Network/System Error: ${error.message}`,
      outputLog: ""
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ==========================================
// 🧪 TESTING GCC COMPILER SCENARIOS
// ==========================================
(async () => {
  console.log("------------------------------------------");
  console.log("🚀 Starting GCC Sync Validation Tests...\n");

  // Scenario A: Testing Valid C Code Execution
  console.log("⏳ Running Valid C Program...");
  const validCCode = `#include <stdio.h>\nint main() {\n    printf("Hello from GCC 15!\\n");\n    return 0;\n}`;
  const resA = await runUserCode(validCCode, ""); 
  console.log("Result A (Expected Success):", resA);
  console.log("------------------------------------------");

  // Scenario B: Testing a GCC Compilation Error (Missing Semicolon)
  console.log("⏳ Running Broken C Program (Compilation Error)...");
  const brokenCCode = `#include <stdio.h>\nint main() {\n    printf("Missing semicolon")\n    return 0;\n}`;
  const resB = await runUserCode(brokenCCode, "");
  console.log("Result B (Expected Error):", resB);
  console.log("==========================================");
})();
