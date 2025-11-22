import express from 'express';
import cors from 'cors';
import './lib/db'; 
import sessionRoutes from './routes/session'; // Import routes
import providerRoutes from './routes/provider';
import chatRoutes from './routes/chat';

const app = express();
app.use(cors());
app.use(express.json());

// Register Routes
app.use('/session', sessionRoutes);
app.use('/providers', providerRoutes); // Register Provider CRUD
app.use('/chat', chatRoutes);          // Register Chat Logic

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send({ status: 'Browser AI Gateway Online' });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
