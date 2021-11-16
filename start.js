const fs = require('fs');
const https = require('https');
const express = require('express');



require('dotenv').config();
const app = require('./app');

if (process.env.HTTPS === 'yes') {

  var key = fs.readFileSync(__dirname + '/../../certs/selfsigned.key');
  var cert = fs.readFileSync(__dirname + '/../../certs/selfsigned.crt');
  var options = {
    key: key,
    cert: cert
  };

  var server = https.createServer(options, app);

  server.listen(process.env.APP_PORT, process.env.HOST_NAME, () => {
    console.log(`Express[https] is running on port ${server.address().port}`);
  });
} else {
  var server = app.listen(process.env.APP_PORT, process.env.HOST_NAME, () => {
    console.log(`Express[http] is running on port ${server.address().port}`);
  });
}
