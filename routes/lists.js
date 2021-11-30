const db = require('../db/pg')

exports.manage = async function (req, res) {


};

exports.getAllByUser = async function (user) {

  var sql = 'SELECT list_name FROM lists ' +
            'WHERE user_id = ' +
            '(SELECT user_id FROM users WHERE user_name = \'' + user + '\');'


  const result = await db.query({
    rowMode: 'array',
    text: sql,
  });

  console.log(sql)
  console.log(result.rows)

  return result.rows
};
