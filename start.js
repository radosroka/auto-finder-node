require('dotenv').config();
const app = require('./app');


const server = app.listen(process.env.APP_PORT, process.env.HOST_NAME, () => {
  console.log(`Express is running on port ${server.address().port}`);
});
