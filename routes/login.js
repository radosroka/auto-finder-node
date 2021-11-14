const { check, validationResult } = require('express-validator')


exports.get = function (req, res) {
  res.render('form', {title: 'Login form'})
};

exports.post = function
/*
            [
              check('username')
                .isLength({ min: 1 })
                .withMessage('Please enter a user name'),
              check('passwd')
                .isLength({ min: 1 })
                .withMessage('Please enter a password'),
            ],
*/
            (req, res) {
              const errors = validationResult(req);

              if (errors.isEmpty()) {
                //res.send('Loged in');
                res.redirect('main');
              } else {
                res.render('form', {
                  title: 'Login Form',
                  errors: errors.array(),
                  data: req.body,
                });
              }
};
