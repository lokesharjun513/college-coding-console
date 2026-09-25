require('dotenv').config({ path: '.env' });
const { connectDB } = require('./config/db');
const app = require('./app');

const PORT = process.env.PORT || 3003;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[SERVER] API running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[SERVER] Failed to start server due to DB error:', err);
    process.exit(1);
  });
