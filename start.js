require('dotenv').config();
const app = require('./app');


const server = app.listen(3000, process.env.HOSTNAME, () => {
  console.log(`Express is running on port ${server.address().port}`);
});
