
exports.users = [];

exports.loadUsers = async function (db) {

  var sql = 'SELECT user_id, user_name, user_passwd_hash FROM users;'

  const result = await db.query({
    text: sql,
  });

  for (const row of result.rows) {
    exports.users.push({
      user_id:  row.user_id,
      user_name: row.user_name,
      digest:   row.user_passwd_hash,
    })
  }

};

exports.protected = function (req, res, next) {
  if (req.session.loggedIn) {
    next()
  } else {
    return res.redirect('login')
  }
};
