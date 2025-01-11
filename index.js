require("dotenv").config();
const express = require('express');
const axios = require('axios');
const app = express();
const moment = require('moment');
const port = 3000;

async function getAdAccountInsights() {
    const url = `https://graph.facebook.com/v21.0/${process.env.ACCOUNT_ID}/insights`;

    try {
        const response = await axios.get(url, {
            params: {
                fields: 'campaign_id,impressions,clicks,spend,reach,cpc,cpm,ctr,frequency',
                time_range: '{"since":"2023-12-01","until":"2024-12-31"}',
                level: 'campaign',
                access_token: process.env.ACCESS_TOKEN
            }
        });

        return response.data; 
    } catch (error) {
        throw new Error(error.response?.data || error.message);
    }
}


app.get('/ad-insights', async (req, res) => {
    try {
        const insights = await getAdAccountInsights();
        res.json(insights);
    } catch (error) {
        console.error('Error fetching insights:', error.message);
        res.status(500).json({ error: error.message }); 
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
