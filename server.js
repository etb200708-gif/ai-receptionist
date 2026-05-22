const express = require('express');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const Datastore = require('nedb-promises');
const twilio = require('twilio');

dotenv.config();
const app = express();
app.use(express.json());
app.use(express.static('public'));

// 1. Connect to Third-Party Services
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// 2. Setup Database
const db = Datastore.create({ filename: './leads.db', autoload: true });

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

        const aiResult = JSON.parse(response.choices.message.content);

        // Build Lead Document
        const newLead = {
            name, phone, email, service,
            leadScore: aiResult.leadScore,
            spamScore: aiResult.spamScore,
            type: aiResult.type,
            summary: aiResult.summary,
            createdAt: new Date()
        };

        // Save to Database
        const savedLead = await db.insert(newLead);

        // 🚨 NEW: If it's a Hot Lead, instantly text the client's cell phone!
        if (aiResult.type === "Hot Lead") {
            await client.messages.create({
                body: `🚨 HOT LEAD DETECTED!\n\n👤 Name: ${name}\n📞 Phone: ${phone}\n\n📝 Summary: ${aiResult.summary}`,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: process.env.CLIENT_PHONE_NUMBER
            });
            console.log("SMS Notification Sent successfully!");
        }

        res.json({ success: true, ...savedLead });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Route to fetch all saved leads
app.get('/api/leads', async (req, res) => {
    try {
        const rows = await db.find({}).sort({ createdAt: -1 });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(process.env.PORT || 3000, () => console.log('Your website backend is running!'));
