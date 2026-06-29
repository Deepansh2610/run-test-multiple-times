module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, auth-token');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const baseUrl = 'https://api.testrigor.com/api/v1';
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
      const authToken = req.headers['auth-token'];
      const action = req.query?.action;

      if (action !== 'status') {
        res.status(400).json({ success: false, message: 'Unsupported GET action.' });
        return;
      }

      if (!suiteId || !authToken) {
        res.status(400).json({ success: false, message: 'suiteId and auth-token are required.' });
        return;
      }

      const encodedSuiteId = encodeURIComponent(suiteId);
      const statusResponse = await withTimeout(
        fetch(`${baseUrl}/apps/${encodedSuiteId}/status`, {
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

      res.status(200).json({
        success: true,
        status: statusBody?.statusBody?.raw || statusBody?.status || statusBody?.state || statusBody?.result || statusBody?.message || 'Unknown',
        statusBody,
      });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ success: false, message: 'Only GET and POST requests are supported.' });
      return;
    }

    const { suiteId, authToken, testCaseUuid, action = 'retest' } = req.body || {};

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
