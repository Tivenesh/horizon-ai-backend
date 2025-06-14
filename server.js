// server.js (or app.js)

const express = require('express');
const dotenv = require('dotenv'); // Make sure you have dotenv installed for environment variables

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = process.env.PORT || 3000; // Use port from environment variable or default to 3000

// Middleware to parse JSON request bodies
app.use(express.json());

// Import the chart routes
const chartRoutes = require('./src/routes/chartRoutes');

// Use the chart routes under the '/api/charts' base path
app.use('/api/charts', chartRoutes);

// Basic route for testing server
app.get('/', (req, res) => {
  res.send('Horizon AI Backend is running!');
});

// Start the server
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  console.log(`Access API at http://localhost:${port}/api/charts`);
});