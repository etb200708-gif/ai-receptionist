const express = require('express');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const Datastore = require('nedb-promises');
const path = require('path');

dotenv.config();
const app = express();
app.use(express.json());
app.use(express.static('public'));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const db = Datastore.create({ filename: './leads.db', autoload: true });

// Route to serve the dashboard interface smoothly
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// 1. Lead Receiver Endpoint (Saves with client identification tag)
app.post('/api/analyze-lead', async (req, res) => {
    const { clientId, name, phone, email, service } = req.body;
    
    const prompt = `Analyze this business lead. Provide a JSON response with keys: leadScore (0-100), spamScore (0-100), type ("Hot Lead", "Warm Lead", "Cold Lead"), and summary. Lead info: Name: ${name}, Service: ${service}.`;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });

        const aiResult = JSON.parse(response.choices[0].message.content);

        const newLead = {
            clientId: clientId || 'unknown', // 🌟 Stamped with Client Identifier
            name, phone, email, service,
            leadScore: aiResult.leadScore,
            spamScore: aiResult.spamScore,
            type: aiResult.type,
            summary: aiResult.summary,
            createdAt: new Date()
        };

        const savedLead = await db.insert(newLead);
        res.json({ success: true, ...savedLead });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Multi-Tenant Route: Fetches data rows matching ONLY the requested Client ID
app.get('/api/leads/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;
        const rows = await db.find({ clientId: clientId }).sort({ createdAt: -1 });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(process.env.PORT || 3000, () => console.log('Your multi-tenant backend is running!'));
