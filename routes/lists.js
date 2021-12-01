const db = require('../db/pg')



exports.getAllByUser = async function (user) {

  var sql = 'SELECT list_id,list_name FROM lists ' +
            'WHERE user_id = ' +
            '(SELECT user_id FROM users WHERE user_name = \'' + user + '\');'

  const result = await db.query({
    rowMode: 'array',
    text: sql,
  });

  return result.rows
};

exports.manage = async function (req, res) {


};

exports.show = async function (req, res) {

  var list_id = req.query.listid
  var list_name = req.query.listname
  var user = req.session.user
  var user_id = req.session.user_id

  var sql = 'SELECT car_plate,car_model,type_name,car_color,car_year ' +
      'FROM list_view WHERE user_id = ' + user_id + ' AND list_id = ' + list_id + ';'

  const custom = await exports.getAllByUser(user)

  const result = await db.query({
    rowMode: 'array',
    text: sql,
  });

  return res.render('query', {
    title: 'List ' + list_name,
    session: req.session,
    custom_lists: custom,
    data: req.body,
    rows: result.rows,
  });
};
