import { useRef, useState } from 'react';
import './App.css';

const repeatValues = [2, 5, 10];

function App() {
  const [repeatCount, setRepeatCount] = useState('5');
  const [suiteId, setSuiteId] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [testCaseUuid, setTestCaseUuid] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState([]);
  const [stopRequested, setStopRequested] = useState(false);
  const stopRequestedRef = useRef(false);

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!suiteId || !authToken || !testCaseUuid) {
      setError('Please complete the suite ID, auth token, and test case UUID fields.');
      return;
    }

    const repeatCountNumber = Number(repeatCount);
    const allLogs = [];

    stopRequestedRef.current = false;
    setStopRequested(false);
    setIsRunning(true);
    setError('');
    setResult(null);
    setLogs([]);

    const appendLog = (message) => {
      allLogs.push(message);
      setLogs([...allLogs]);
    };

    try {
      for (let index = 1; index <= repeatCountNumber; index += 1) {
        if (stopRequestedRef.current) {
          appendLog(`Run ${index}/${repeatCountNumber}: stop requested before the next run.`);
          break;
        }

        appendLog(`Run ${index}/${repeatCountNumber}: sending retest request...`);

        const response = await fetch('/api/testrigor', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            suiteId,
            authToken,
            testCaseUuid,
            action: 'retest',
          }),
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.message || 'The retest request failed.');
        }

        appendLog(`Run ${index}/${repeatCountNumber}: retest request accepted.`);
        appendLog(`Run ${index}/${repeatCountNumber}: waiting before checking status...`);
        await wait(3000);

        let status = 'Pending';
        const startedAt = Date.now();

        while (Date.now() - startedAt < 300000) {
          const statusResponse = await fetch('/api/testrigor?suiteId=' + encodeURIComponent(suiteId) + '&action=status', {
            method: 'GET',
            headers: {
              'auth-token': authToken,
            },
          });
          const statusPayload = await statusResponse.json();

          const rawStatus = statusPayload?.statusBody?.raw;
          status = typeof rawStatus === 'string' && rawStatus.trim()
            ? rawStatus.trim()
            : statusPayload?.status || statusPayload?.state || statusPayload?.result || statusPayload?.message || 'Unknown';

          appendLog(`Run ${index}/${repeatCountNumber}: status=${status}`);

          if (status === 'Finished') {
            break;
          }

          if (status === 'Failed') {
            setResult({
              success: false,
              message: 'The run stopped because the status API returned Failed.',
              completedRuns: index - 1,
              requestedRuns: repeatCountNumber,
              logs: [...allLogs],
            });
            return;
          }

          if (stopRequestedRef.current) {
            appendLog(`Run ${index}/${repeatCountNumber}: stop requested; waiting for the current run to finish.`);
          }

          await wait(2000);
        }

        if (stopRequestedRef.current) {
          setResult({
            success: false,
            message: 'Stopped after the current run finished.',
            completedRuns: index - 1,
            requestedRuns: repeatCountNumber,
            logs: [...allLogs],
          });
          return;
        }

        if (status !== 'Finished') {
          setResult({
            success: false,
            message: 'The status API did not reach Finished in time.',
            completedRuns: index - 1,
            requestedRuns: repeatCountNumber,
            logs: [...allLogs],
          });
          return;
        }
      }

      if (stopRequestedRef.current) {
        setResult({
          success: false,
          message: 'Stopped after the current run finished.',
          completedRuns: repeatCountNumber - 1,
          requestedRuns: repeatCountNumber,
          logs: [...allLogs],
        });
      } else {
        setResult({
          success: true,
          message: `Completed ${repeatCountNumber} run(s) successfully.`,
          completedRuns: repeatCountNumber,
          requestedRuns: repeatCountNumber,
          logs: [...allLogs],
        });
      }
    } catch (requestError) {
      setError(requestError.message || 'An unexpected error occurred.');
    } finally {
      setIsRunning(false);
      setStopRequested(false);
      stopRequestedRef.current = false;
    }
  };

  const handleStopClick = () => {
    if (!isRunning || stopRequestedRef.current) {
      return;
    }

    stopRequestedRef.current = true;
    setStopRequested(true);
    setLogs((prev) => [...prev, 'Stop requested. The current run will finish and then the loop will stop.']);
  };

  return (
    <div className="app-shell">
      <div className="app-card">
        <h1>TestRigor retry runner</h1>
        <p className="subtitle">
          Trigger the same retest flow multiple times while waiting for each status check to finish.
        </p>

        <form onSubmit={handleSubmit} className="form-grid">
          <label className="field">
            <span>Run count</span>
            <select value={repeatCount} onChange={(event) => setRepeatCount(event.target.value)}>
              {repeatValues.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Suite ID</span>
            <input
              type="text"
              value={suiteId}
              onChange={(event) => setSuiteId(event.target.value)}
              placeholder="Enter suite ID"
            />
          </label>

          <label className="field">
            <span>Auth token</span>
            <input
              type="password"
              value={authToken}
              onChange={(event) => setAuthToken(event.target.value)}
              placeholder="Enter auth token"
            />
          </label>

          <label className="field">
            <span>Test case UUID</span>
            <input
              type="text"
              value={testCaseUuid}
              onChange={(event) => setTestCaseUuid(event.target.value)}
              placeholder="Enter test case UUID"
            />
          </label>

          <div className="button-row">
            <button type="submit" className="run-button" disabled={isRunning}>
              {isRunning ? 'Running…' : 'RUN'}
            </button>
            {isRunning && (
              <button type="button" className="stop-button" onClick={handleStopClick} disabled={stopRequested}>
                {stopRequested ? 'Stopping…' : 'STOP'}
              </button>
            )}
          </div>
        </form>

        <div className="summary-card" aria-live="polite">
          <h2>Run summary</h2>
          {error ? (
            <div className="message error">{error}</div>
          ) : result ? (
            <>
              <div className={`message ${result.success ? 'success' : 'warning'}`}>
                {result.message}
              </div>
              <p>
                Completed runs: <strong>{result.completedRuns}</strong> / {result.requestedRuns}
              </p>
            </>
          ) : (
            <p className="helper-text">No run has been started yet.</p>
          )}

          {logs.length > 0 && (
            <ul className="log-list">
              {logs.map((entry, index) => (
                <li key={`${entry}-${index}`}>{entry}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
