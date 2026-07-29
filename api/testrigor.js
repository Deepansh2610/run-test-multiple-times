module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, auth-token');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const productionBaseUrl = 'https://api.testrigor.com/api/v1';
  const resolveBaseUrl = (requestedBaseUrl) => {
    const parsedBaseUrl = new URL(requestedBaseUrl || productionBaseUrl);
    if (parsedBaseUrl.protocol !== 'https:' || parsedBaseUrl.username || parsedBaseUrl.password) {
      throw new Error('Base URL must be an HTTPS URL without embedded credentials.');
    }
    return parsedBaseUrl.toString().replace(/\/$/, '');
  };
  const withTimeout = async (promise, timeoutMs) => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms.`)), timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    if (req.method === 'GET') {
      const suiteId = req.query?.suiteId;
      const testCaseUuid = req.query?.testCaseUuid;
      const authToken = req.headers['auth-token'];
      const action = req.query?.action;
      const requestedBaseUrl = req.query?.baseUrl;

      if (action !== 'status') {
        res.status(400).json({ success: false, message: 'Unsupported GET action.' });
        return;
      }

      if (!suiteId || !testCaseUuid || !authToken) {
        res.status(400).json({
          success: false,
          message: 'suiteId, testCaseUuid, and auth-token are required.',
        });
        return;
      }

      let baseUrl;
      try {
        baseUrl = resolveBaseUrl(requestedBaseUrl);
      } catch (error) {
        res.status(400).json({ success: false, message: error.message });
        return;
      }

      const encodedSuiteId = encodeURIComponent(suiteId);
      const encodedTestCaseUuid = encodeURIComponent(testCaseUuid);
      const statusResponse = await withTimeout(
        fetch(`${baseUrl}/apps/${encodedSuiteId}/testcase/status?testCaseUuids=${encodedTestCaseUuid}`, {
          headers: {
            'auth-token': authToken,
          },
        }),
        10000,
      );

      const statusText = await statusResponse.text();
      let statusBody = null;
      try {
        statusBody = JSON.parse(statusText);
      } catch {
        statusBody = { raw: statusText };
      }

      if (!statusResponse.ok) {
        res.status(statusResponse.status).json({ success: false, message: 'The status request failed.', statusBody });
        return;
      }

      const matchingTestCase = Array.isArray(statusBody?.testCases)
        ? statusBody.testCases.find((testCase) => testCase?.testCaseUuid === testCaseUuid)
        : null;

      res.status(200).json({
        success: true,
        status: matchingTestCase?.status || 'Unknown',
        statusBody,
      });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ success: false, message: 'Only GET and POST requests are supported.' });
      return;
    }

    const { suiteId, authToken, testCaseUuid, baseUrl: requestedBaseUrl, action = 'retest' } = req.body || {};

    if (action !== 'retest') {
      res.status(400).json({ success: false, message: 'Unsupported POST action.' });
      return;
    }

    if (!suiteId || !authToken || !testCaseUuid) {
      res.status(400).json({
        success: false,
        message: 'suiteId, authToken, and testCaseUuid are required.',
      });
      return;
    }

    let baseUrl;
    try {
      baseUrl = resolveBaseUrl(requestedBaseUrl);
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }

    const encodedSuiteId = encodeURIComponent(suiteId);
    const retestResponse = await withTimeout(
      fetch(`${baseUrl}/apps/${encodedSuiteId}/retest-simple`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth-token': authToken,
        },
        body: JSON.stringify({
          testCaseUuids: [testCaseUuid],
        }),
      }),
      10000,
    );

    const retestBodyText = await retestResponse.text();
    let retestBody = null;
    try {
      retestBody = JSON.parse(retestBodyText);
    } catch {
      retestBody = { raw: retestBodyText };
    }

    if (!retestResponse.ok) {
      res.status(502).json({ success: false, message: 'The retest request failed.', retestResponse: retestBody });
      return;
    }

    res.status(200).json({ success: true, message: 'Retest request accepted.', retestResponse: retestBody });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'An unexpected error occurred.' });
  }
};
