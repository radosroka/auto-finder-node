const express = require('express');
const { check, validationResult } = require('express-validator');

const path = require('path');
const auth = require('http-auth');



const router = express.Router();

router.get('/', (req, res) => {
  res.render('form', {title: 'Login form'})
});

router.post('/',
            [
              check('username')
                .isLength({ min: 1 })
                .withMessage('Please enter a user name'),
              check('passwd')
                .isLength({ min: 1 })
                .withMessage('Please enter a password'),
            ],
            (req, res) => {
              const errors = validationResult(req);

              if (errors.isEmpty()) {
                res.send('Loged in');
              } else {
                res.render('form', {
                  title: 'Login Form',
                  errors: errors.array(),
                  data: req.body,
                });
              }
});

module.exports = router;
