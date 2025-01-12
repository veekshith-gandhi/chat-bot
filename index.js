const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
const port = process.env.PORT || 3000;

async function getAdAccountInsights(param) {
    const url = `https://graph.facebook.com/v16.0/${process.env.ACCOUNT_ID}/insights`;

    try {
        const response = await axios.get(url, {
            params: {
                fields: param.fields || 'campaign_id,impressions,clicks,spend,reach,cpc,cpm,ctr,frequency',
                time_range: param.time_range || { since: '2023-12-01', until: '2023-12-31' },
                level: param.level || 'campaign',
                access_token: process.env.ACCESS_TOKEN,
            },
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching Ad Insights:', error.response?.data || error.message);
        throw new Error('Failed to fetch ad insights.');
    }
}

async function analyzeUserQueryWithClaude(userQuery,action) {
    const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
    let prompt;
    if (action === 'extractParams') {
        prompt = `
        Human:
        You are a virtual assistant that helps analyze marketing data. The user asked: "${userQuery}"
        Based on this query, extract the following:
        1. Date range (e.g., "last month" -> {"since": "YYYY-MM-DD", "until": "YYYY-MM-DD"}).
        2. Metrics to analyze (e.g., impressions, clicks, spend, etc.).
        3. Granularity level (e.g., campaign, ad set, or ad).
        Output the extracted parameters as JSON.
        Assistant:`;
    } else if (action === 'summarizeData') {
        prompt = `
        Human:
        Here is the ad performance data:
        ${JSON.stringify(userQuery, null, 2)} // This will be ad data in JSON format
        Summarize this data, highlighting key metrics, trends, and areas for improvement.
        Assistant:`;
    }
    const requestBody = {
        model: 'claude-3-sonnet-20240229',  
        max_tokens: 1024,
            messages: [
            {
                "role": "user",
                "content": prompt
            }
        ]
    };

    const headers = {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
    };
    try {
        const response = await axios.post(ANTHROPIC_API_URL, requestBody, { headers });
        return response.data;
    } catch (error) {
        console.error('Error calling Anthropic:', error.response?.data || error.message);
        throw error;
    }
}

async function extractParams(extractedParams) {
    try {
        const content = extractedParams.content[0].text;
        const jsonStartIndex = content.indexOf('{');
        const jsonEndIndex = content.lastIndexOf('}') + 1;
        if (jsonStartIndex === -1 || jsonEndIndex === -1) {
            throw new Error('Failed to parse JSON from Claude response.');
        }
        const params = JSON.parse(content.slice(jsonStartIndex, jsonEndIndex));
        const apiParams = {
            fields: params.metrics.join(',') || 'impressions,clicks,spend', 
            time_range: params.date_range || { since: '2023-04-01', until: '2023-04-30' },
            level: params.granularity_level || 'ad', 
        };
        return apiParams;
    } catch (error) {
        console.error('Error processing extracted parameters or fetching insights:', error.message);
        throw error;
    }
}

app.post('/process-insights', async (req, res) => {
    try {
        const extractedParams = req.body.extractedParams; // Assume this is passed in the request
        const insights = await processExtractedParamsAndFetchInsights(extractedParams);
        res.json(insights);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Route to handle Slack -> Backend -> Claude -> Meta API -> Summary Flow
app.post('/process-message', async (req, res) => {
    const { userMessage } = req.body;
    if (!userMessage) return res.status(400).json({ error: 'Message is required' });
    const EXTRAPARAMS = 'extractParams';
    const SUMMERISEDATA = 'summarizeData';
    try {
        const userQueryData = await analyzeUserQueryWithClaude(userMessage,EXTRAPARAMS);
        const extractedParams = extractParams(userQueryData);
        const adInsights = await getAdAccountInsights(extractedParams);
        const summary = await analyzeUserQueryWithClaude(adInsights,SUMMERISEDATA);
        res.json({ summary });
    } catch (error) {
        console.error('Error in process-message:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
