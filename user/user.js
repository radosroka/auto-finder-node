
exports.users = [];

exports.loadUsers = async function (db) {

  var sql = 'SELECT * from users;'

  const result = await db.query({
    rowMode: 'array',
    text: sql,
  });

  var data = result.rows
  for (let index in data) {
    var user = {user_id: data[index][0], user_name: data[index][1], digest: data[index][2]}
    exports.users.push(user)
  }

};

exports.protected = function (req, res, next) {
  if (req.session.loggedIn) {
    next()
  } else {
    return res.redirect('login')
  }
};
