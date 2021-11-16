const { check, validationResult } = require('express-validator')

const auth = require('../user/user')

exports.get = function (req, res) {
  res.render('login', {title: 'Login form'})
};

exports.post = function (req, res) {
  var name = req.body.logname
  var passwd = req.body.passwd
    if(!name || !passwd) {
      res.render('login', {title: 'LLogin form'})
    } else {
      auth.users.filter(function(user) {
         if(user.username === name && user.password === passwd){
            req.session.loggedIn = true
            req.session.user = name;
            res.redirect('/query');
         }
      });

      res.send('invalid')
      res.end()
    }
};

exports.logout = function (req, res) {
  req.session.destroy()
  res.redirect('/')
};

exports.protected = function (req, res, next) {
  if (req.session.loggedIn) {
    next()
  } else {
    res.redirect('/login')
  }
};
