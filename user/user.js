
exports.users = [{
   username: process.env.BIL_USER,
   digest: process.env.BIL_PASSWD
   }]

exports.protected = function (req, res, next) {
  if (req.session.loggedIn) {
    next()
  } else {
    return res.redirect('login')
  }
};
