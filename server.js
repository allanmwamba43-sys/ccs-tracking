// server.js
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// -------------------------------
// Optional: AfterShip Tracking API
// -------------------------------
async function aftershipGetTracking(trackingNumber) {
  try {
    const res = await fetch('https://api.aftership.com/v4/trackings/${trackingNumber}', {
      headers: {
        'aftership-api-key': process.env.AFTERSHIP_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      console.error('AfterShip API error:', res.statusText);
      return null;
    }

    const data = await res.json();
    return data;
  } catch (err) {
    console.error('Error fetching from AfterShip:', err);
    return null;
  }
}
// -------------------------------
// Tracking API Endpoint
// -------------------------------
app.post('/api/track', async (req, res) => {
  try {
    const { trackingNumber } = req.body;

    if (!trackingNumber) {
      return res.status(400).json({ error: 'Missing trackingNumber' });
    }

    // If AfterShip API key is available
    if (process.env.AFTERSHIP_API_KEY) {
      const data = await aftershipGetTracking(trackingNumber);
      const t = data && data.data && data.data.tracking ? data.data.tracking : null;

      if (!t) {
        return res.json({
          source: 'aftership',
          data: { tracking_number: trackingNumber, status: 'Not Found' },
        });
      }

      const transformed = {
        tracking_number: t.tracking_number || trackingNumber,
        status: t.tag || (t.current_status && t.current_status.tag) || 'Unknown',
        last_update: t.updated_at || new Date().toISOString(),
        estimated_delivery: t.expected_delivery || null,
        history:
          (t.checkpoints || []).map((cp) => ({
            date: cp.checkpoint_time || cp.created_at || new Date().toISOString(),
            location: (cp.location || {}).city || cp.location || 'Unknown location',
            status: cp.message || cp.tag || 'Update',
          })) || [],
      };

      return res.json({ source: 'aftership', data: transformed });
    }

    // ------------------------------------
    // Fallback Mock Data (no API key used)
    // ------------------------------------
    const now = new Date();
    const mock = {
      tracking_number: trackingNumber,
      status: 'In Transit',
      last_update: now.toISOString(),
      estimated_delivery: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      history: [
        {
          date: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
          location: 'Origin Facility - Kampala, Uganda',
          status: 'Shipment created',
        },
        {
          date: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          location: 'In Transit - Nairobi, Kenya',
          status: 'Package scanned at facility',
        },
      ],
    };

    return res.json({ source: 'mock', data: mock });
  } catch (err) {
    console.error('Error in /api/track:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// -------------------------------
// Server Start
// -------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log('✅ CCS Tracking server running on port ${PORT}');
});