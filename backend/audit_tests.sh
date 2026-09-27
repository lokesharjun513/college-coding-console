#!/bin/bash
TESTS=(
  "tests/adminBatches.test.js"
  "tests/adminBatchStudents.test.js"
  "tests/adminTrainers.test.js"
  "tests/auth.test.js"
  "tests/authorization.test.js"
  "tests/studentSubmissions.test.js"
  "tests/trainerBatches.test.js"
  "tests/trainerProblems.test.js"
  "tests/trainerTestCases.test.js"
  "tests/user.test.js"
  "tests/userCrud.test.js"
  "tests/placeholder.test.js"
)

echo "Suite,Tests,Runtime,Warnings,ConsoleOutput" > audit_results.csv

cd backend
for test in "${TESTS[@]}"; do
  echo "Running $test..."
  # Use jest's timing if possible, or time command for overall
  # We want runInBand to be fair
  # Capture output to a file to inspect later
  output=$(npx jest "$test" --runInBand 2>&1)

  # Extract runtime, test count, etc.
  # This might be tricky with regex, let's just save the output
  echo "$output" > "test_logs/${test//\//_}.log"
done
