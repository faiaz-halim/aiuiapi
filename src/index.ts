import express from 'express';
import cors from 'cors';
import './lib/db';
import sessionRoutes from './routes/session';
import providerRoutes from './routes/provider';
import chatRoutes from './routes/chat';
import openAiRoutes from './routes/openai'; // Import the new route

const app = express();
app.use(cors());
app.use(express.json());

// Internal API Routes
app.use('/session', sessionRoutes);
app.use('/providers', providerRoutes);
app.use('/chat', chatRoutes);

// OpenAI Standardized Route
app.use('/v1', openAiRoutes);

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send({
        status: 'Browser AI Gateway Online',
        endpoints: {
            standard: '/chat',
            openai: '/v1/chat/completions'
        }
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
