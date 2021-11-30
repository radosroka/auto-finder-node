const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session')
const cookieParser = require('cookie-parser')

const routes = require('./routes/index');

const db = require('./db/pg')
const user = require('./user/user')

db.client.connect();

const app = express();

user.loadUsers(db);

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.use(express.static('public'));
app.set('query parser', 'simple')
app.use(express.json())
app.use(bodyParser.urlencoded({ extended: true }));


app.set('trust proxy', 1) // trust first proxy
app.use(cookieParser())

var cookie_secure = false
if (process.env.HTTPS === 'yes') {
  cookie_secure = true
}

app.use(session({
  secret: process.env.COOKIE_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 * 24, secure: cookie_secure }
}))

app.use('/', routes);


module.exports = app;
