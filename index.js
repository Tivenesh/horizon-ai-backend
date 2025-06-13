// backend/index.js
const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Load environment variables from .env file

const app = express();
const PORT = process.env.PORT || 3001; // Backend will run on port 3001

// IMPORTANT: CORS Middleware - allows our Next.js frontend to talk to this backend
app.use(cors({
  origin: 'http://localhost:3000' // This must match your Next.js frontend's URL
}));

app.use(express.json()); // Enable parsing of JSON request bodies

// Test route for the backend
app.get('/', (req, res) => {
  res.json({ message: 'Node.js Backend is live and cookin!' });
});

// Our main /api/analyze endpoint and other AI logic will go here later

app.listen(PORT, () => {
  console.log(`Node.js server listening on http://localhost:${PORT}`);
});