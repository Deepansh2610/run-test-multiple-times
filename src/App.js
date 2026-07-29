import { useRef, useState } from 'react';
import './App.css';

const repeatValues = [2, 5, 10];
const successfulCompletionStatuses = new Set(['finished', 'passed']);
const failedStatuses = new Set(['failed']);

export const isSuccessfulCompletion = (status) => (
  successfulCompletionStatuses.has(String(status).trim().toLowerCase())
);

const isFailedStatus = (status) => (
  failedStatuses.has(String(status).trim().toLowerCase())
);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const createRunId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function App() {
  const [repeatCount, setRepeatCount] = useState('5');
  const [suiteId, setSuiteId] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [testCaseUuid, setTestCaseUuid] = useState('');
  const [formError, setFormError] = useState('');
  const [runs, setRuns] = useState([]);
  const stopRequestedRef = useRef(new Set());

  const updateRun = (runId, changes) => {
    setRuns((previousRuns) => previousRuns.map((run) => (
      run.id === runId ? { ...run, ...changes } : run
    )));
  };

  const appendLog = (runId, message) => {
    setRuns((previousRuns) => previousRuns.map((run) => (
      run.id === runId ? { ...run, logs: [...run.logs, message] } : run
    )));
  };

  const toggleRun = (runId) => {
    setRuns((previousRuns) => previousRuns.map((run) => (
      run.id === runId ? { ...run, isExpanded: !run.isExpanded } : run
    )));
  };

  const executeRun = async (run) => {
    const {
      id,
      suiteId: runSuiteId,
      authToken: runAuthToken,
      testCaseUuid: runTestCaseUuid,
      requestedRuns,
    } = run;
    let completedRuns = 0;

    try {
      for (let index = 1; index <= requestedRuns; index += 1) {
        if (stopRequestedRef.current.has(id)) {
          updateRun(id, {
            completedRuns,
            status: 'Stopped',
            outcome: 'stopped',
            message: 'Stopped before the next run began.',
          });
          return;
        }

        appendLog(id, `Run ${index}/${requestedRuns}: sending retest request...`);
        const response = await fetch('/api/testrigor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            suiteId: runSuiteId,
            authToken: runAuthToken,
            testCaseUuid: runTestCaseUuid,
            action: 'retest',
          }),
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.message || 'The retest request failed.');
        }

        appendLog(id, `Run ${index}/${requestedRuns}: retest request accepted.`);
        appendLog(id, `Run ${index}/${requestedRuns}: waiting before checking status...`);
        await wait(4000);

        let status = 'Pending';
        let completedSuccessfully = false;
        const startedAt = Date.now();

        while (Date.now() - startedAt < 300000) {
          const statusParams = new URLSearchParams({
            suiteId: runSuiteId,
            testCaseUuid: runTestCaseUuid,
            action: 'status',
          });
          const statusResponse = await fetch(`/api/testrigor?${statusParams.toString()}`, {
            method: 'GET',
            headers: { 'auth-token': runAuthToken },
          });
          const statusPayload = await statusResponse.json();

          if (!statusResponse.ok) {
            throw new Error(statusPayload.message || 'The status request failed.');
          }

          status = statusPayload?.status || 'Unknown';
          appendLog(id, `Run ${index}/${requestedRuns}: status=${status}`);

          if (isSuccessfulCompletion(status)) {
            completedSuccessfully = true;
            break;
          }

          if (isFailedStatus(status)) {
            updateRun(id, {
              completedRuns: index - 1,
              status: 'Failed',
              outcome: 'failed',
              message: 'The run stopped because the status API returned Failed.',
            });
            return;
          }

          if (stopRequestedRef.current.has(id)) {
            appendLog(id, `Run ${index}/${requestedRuns}: stop requested; waiting for the current run to finish.`);
          }

          await wait(2000);
        }

        if (!completedSuccessfully) {
          updateRun(id, {
            completedRuns: index - 1,
            status: 'Timed out',
            outcome: 'failed',
            message: 'The status API did not reach Passed or Finished in time.',
          });
          return;
        }

        completedRuns = index;

        if (stopRequestedRef.current.has(id)) {
          updateRun(id, {
            completedRuns,
            status: 'Stopped',
            outcome: 'stopped',
            message: 'Stopped after the current run finished.',
          });
          return;
        }

        if (completedRuns < requestedRuns) {
          updateRun(id, {
            completedRuns,
            status: 'Still running',
            outcome: 'running',
            message: `Completed ${completedRuns} of ${requestedRuns} run(s); continuing.`,
          });
        }
      }

      updateRun(id, {
        completedRuns,
        status: 'Completed',
        outcome: 'success',
        message: `Completed ${requestedRuns} run(s) successfully.`,
      });
    } catch (requestError) {
      updateRun(id, {
        completedRuns,
        status: 'Error',
        outcome: 'failed',
        message: requestError.message || 'An unexpected error occurred.',
      });
    } finally {
      stopRequestedRef.current.delete(id);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!suiteId || !authToken || !testCaseUuid) {
      setFormError('Please complete the suite ID, auth token, and test case UUID fields.');
      return;
    }

    const requestedRuns = Number(repeatCount);
    const run = {
      id: createRunId(),
      suiteId,
      authToken,
      testCaseUuid,
      requestedRuns,
      completedRuns: 0,
      status: 'Still running',
      outcome: 'running',
      message: `Preparing ${requestedRuns} run(s).`,
      logs: [],
      isExpanded: false,
    };

    setFormError('');
    setRuns((previousRuns) => [run, ...previousRuns]);
    setTestCaseUuid('');
    executeRun(run);
  };

  const handleStopRun = (runId) => {
    stopRequestedRef.current.add(runId);
    updateRun(runId, {
      status: 'Stopping',
      outcome: 'running',
      message: 'Stop requested. The current run will finish before stopping.',
    });
  };

  return (
    <div className="app-shell">
      <div className="app-card">
        <h1>TestRigor retry runner</h1>
        <p className="subtitle">
          Start another test case at any time. Each run is tracked independently in the panel on the right.
        </p>

        <form onSubmit={handleSubmit} className="form-grid">
          <label className="field">
            <span>Run count</span>
            <select value={repeatCount} onChange={(event) => setRepeatCount(event.target.value)}>
              {repeatValues.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Suite ID</span>
            <input type="text" value={suiteId} onChange={(event) => setSuiteId(event.target.value)} placeholder="Enter suite ID" />
          </label>

          <label className="field">
            <span>Auth token/PAT</span>
            <input type="password" value={authToken} onChange={(event) => setAuthToken(event.target.value)} placeholder="Enter auth token" />
          </label>

          <label className="field">
            <span>Test case UUID</span>
            <input type="text" value={testCaseUuid} onChange={(event) => setTestCaseUuid(event.target.value)} placeholder="Enter test case UUID" />
          </label>

          <div className="button-row">
            <button type="submit" className="run-button">RUN</button>
          </div>
        </form>

        {formError && <div className="message error form-error">{formError}</div>}
      </div>

      <aside className="run-stack" aria-label="Test run status">
        <div className="run-stack-heading">
          <h2>Test runs</h2>
          <span>{runs.length}</span>
        </div>
        {runs.length === 0 ? (
          <p className="empty-runs">Submitted test cases will appear here.</p>
        ) : (
          <div className="run-list">
            {runs.map((run) => (
              <article className={`run-modal ${run.isExpanded ? 'expanded' : ''}`} key={run.id}>
                <button type="button" className="run-modal-header" onClick={() => toggleRun(run.id)} aria-expanded={run.isExpanded}>
                  <span className="run-case-id">{run.testCaseUuid}</span>
                  <span className={`run-status ${run.outcome}`}>{run.status}</span>
                  <span className="run-progress">{run.completedRuns} / {run.requestedRuns} runs</span>
                </button>

                {run.isExpanded && (
                  <div className="run-modal-body" aria-live="polite">
                    <h3>Run summary</h3>
                    <div className={`message ${run.outcome === 'success' ? 'success' : run.outcome === 'running' ? 'warning' : 'error'}`}>
                      {run.message}
                    </div>
                    <p>Completed runs: <strong>{run.completedRuns}</strong> / {run.requestedRuns}</p>
                    {run.outcome === 'running' && run.status !== 'Stopping' && (
                      <button type="button" className="stop-button" onClick={() => handleStopRun(run.id)}>STOP</button>
                    )}
                    {run.logs.length > 0 && (
                      <ul className="log-list">
                        {run.logs.map((entry, index) => (
                          <li key={`${entry}-${index}`}>{entry}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

export default App;