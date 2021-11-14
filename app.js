const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');


const routes = require('./routes/index');

const db = require('./db/pg')

db.client.connect();

const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.use(express.static('public'));
app.set('query parser', 'simple')
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/', routes);

module.exports = app;
