const { Client } = require('pg')

const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB,
    password: process.env.DB_USER_PASSWD,
});

module.exports = {
    query: (text, params) => client.query(text, params),
    client: client,
};
