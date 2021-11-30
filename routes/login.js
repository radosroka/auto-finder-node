const crypto = require('crypto')
const auth = require('../user/user')

exports.get = function (req, res) {

  if (req.session.loggedIn) {
    return res.redirect('query')
  }

  return res.render('login', {title: 'Login form'})
};

exports.post = function (req, res) {
  var name = req.body.logname
  var passwd = req.body.passwd

  if(name && passwd) {

    var hash = crypto.createHash('sha256')
    hash.update(passwd)
    var digest = hash.digest('hex')

    auth.users.filter( function(user) {

      console.log(name, digest)
      console.log(user)

      if (user.user_name === name && user.digest === digest) {
        req.session.loggedIn = true
        req.session.user = name
        req.session.user_id = user.user_id
      }
    });

    if (req.session.loggedIn) {
      return res.redirect('/query');
    } else {
      return res.render('login', { title: 'Login form',
                          errors: ['Log name or password is incorrect'],
                          data: req.body
                        })
    }

  }
  return res.render('login', { title: 'Login form',
                          errors: ['Log name or password was not specified'],
                          data: req.body
                        })
};

exports.logout = function (req, res) {
  if (req.session.loggedIn) {
    req.session.destroy()
  }

  return res.redirect('/login')
};
