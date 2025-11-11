const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

async function aftershipGetTracking(trackingNumber) {
  const key = process.env.AFTERSHIP_API_KEY;
  if (!key) throw new Error('AfterShip API key not configured');
  const url = `https://api.aftership.com/v4/trackings/${encodeURIComponent(trackingNumber)}`;
  const res = await fetch(url, { method: 'GET', headers: { 'aftership-api-key': key, 'Content-Type': 'application/json' } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('AfterShip error: ' + res.status + ' ' + text);
  }
  return res.json();
}

app.post('/api/track', async (req, res) => {
  try {
    const { trackingNumber } = req.body;
    if (!trackingNumber) return res.status(400).json({ error: 'Missing trackingNumber' });

    if (process.env.AFTERSHIP_API_KEY) {
      const data = await aftershipGetTracking(trackingNumber);
      const t = data && data.data && data.data.tracking ? data.data.tracking : data;
      const transformed = {
        tracking_number: t.tracking_number || trackingNumber,
        status: t.tag || (t.current_status && t.current_status.tag) || 'Unknown',
        last_update: t.updated_at || t.last_update_time || new Date().toISOString(),
        estimated_delivery: t.expected_delivery || t.estimated_delivery || null,
        history: (t.checkpoints || []).map(cp => ({
          date: cp.checkpoint_time || cp.created_at || cp.date || new Date().toISOString(),
          location: (cp.location || {}).city || cp.location || 'Unknown location',
          status: cp.message || cp.tag || cp.status || 'Update'
        }))
      };
      return res.json({ source: 'aftership', data: transformed });
    } else {
      const now = new Date();
      const mock = {
        tracking_number: req.body.trackingNumber,
        status: 'In Transit',
        last_update: now.toISOString(),
        estimated_delivery: new Date(now.getTime() + 3*24*60*60*1000).toISOString(),
        history: [
          { date: new Date(now.getTime() - 4*24*60*60*1000).toISOString(), location: 'Origin Facility', status: 'Shipment received' },
          { date: new Date(now.getTime() - 2*24*60*60*1000).toISOString(), location: 'Sorting Center', status: 'Departed facility' },
          { date: new Date(now.getTime() - 24*60*60*1000).toISOString(), location: 'Transit Hub', status: 'Arrived at transit hub' }
        ]
      };
      return res.json({ source: 'mock', data: mock });
    }
  } catch (err) {
    console.error('Error /api/track', err);
    return res.status(500).json({ error: 'Tracking service error', details: err.message });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`CCS tracking server listening on ${PORT}`));
