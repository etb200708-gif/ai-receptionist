const express = require('express');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const sqlite3 = require('sqlite3').verbose();

dotenv.config();
const app = express();
app.use(express.json());
app.use(express.static('public'));

// 1. Connect to OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 2. Setup Your Free Database
const db = new sqlite3.Database('./leads.db', (err) => {
    if (!err) {
        db.run(`CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT, phone TEXT, email TEXT, service TEXT,
            leadScore INTEGER, spamScore INTEGER, type TEXT, summary TEXT
        )`);
    }
});

// 3. Create the Lead Receiver
app.post('/api/analyze-lead', async (req, res) => {
    const { name, phone, email, service } = req.body;
    
    const prompt = `Analyze this business lead. Provide a JSON response with keys: leadScore (0-100), spamScore (0-100), type ("Hot Lead", "Warm Lead", "Cold Lead"), and summary. Lead info: Name: ${name}, Service: ${service}.`;

    try {
        // Send to AI
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });

        const aiResult = JSON.parse(response.choices[0].message.content);

        // Save to Database
        const query = `INSERT INTO leads (name, phone, email, service, leadScore, spamScore, type, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        db.run(query, [name, phone, email, service, aiResult.leadScore, aiResult.spamScore, aiResult.type, aiResult.summary], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, ...aiResult });
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(process.env.PORT || 3000, () => console.log('Your website backend is running!'));
// 4. Route to fetch all saved leads from database
app.get('/api/leads', (req, res) => {
    db.all(`SELECT * FROM leads ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
