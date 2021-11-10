//const express = require('express');
const { check, validationResult } = require('express-validator');

const Router = require('express-promise-router')

const path = require('path');
const auth = require('http-auth');

const db = require('../db/pg')



const router =  new Router();

router.all('/', (req, res) => {
  res.redirect('main');
});

router.get('/login',(req, res) => {
  res.render('form', {title: 'Login form'})
});

router.post('/login',
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
                //res.send('Loged in');
                res.redirect('main');
              } else {
                res.render('form', {
                  title: 'Login Form',
                  errors: errors.array(),
                  data: req.body,
                });
              }
});

router.get('/main', async (req, res) => {

  const result = await db.query({
    rowMode: 'array',
    text: 'SELECT * FROM my_view LIMIT 100;'
  });
  //console.log(result.rows);
  res.render('main', {title: 'Query table', rows: result.rows});
});


router.post('/main',
            [
              check('car_plate')
                .trim()
                .isLength({ max: 6 })
                .withMessage('Car Plate number is too long'),
              check('car_model')
                .trim(),
              check('car_type')
                .trim(),
              check('car_color')
                .trim(),
              check('car_year_from')
                .trim(),
              check('car_year_to')
                .trim(),
            ],
            async (req, res) => {


  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    res.render('main', {
      title: 'Query Table5',
      errors: errors.array(),
      data: req.body,
      rows: [],
    });
  }

  var sql = 'SELECT * FROM my_view '
  var where = " WHERE "
  var query = []

  const car_plate = req.body.car_plate;

  if (! (car_plate === '')) {
    query.push(` car_plate = '${car_plate}' `)
  }

  const car_model = req.body.car_model;

  if (! (car_model === '')) {
    var model = car_model.split(" ").join('.*')
    query.push(` lower(car_model) ~* '.*${model.toLowerCase()}.*' `)
  }


  const type_name = req.body.type_name;

  if (! (type_name === '')) {
    query.push(` lower(type_name) ~* '.*${type_name.toLowerCase()}.*' `)
  }


  const car_color = req.body.car_color;

  if (! (car_color === '')) {
    query.push(` lower(car_color) ~* '.*${car_color.toLowerCase()}.*' `)
  }


  const car_year_from = req.body.car_year_from;

  if (! (car_year_from === '')) {
    query.push(`car_year >= '${car_year_from}'`)
  }

  const car_year_to = req.body.car_year_to;

  if (! (car_year_to === '')) {
    query.push(`car_year <= '${car_year_to}'`)
  }


  if (!(query.length === 0)) {
    sql = sql + where + query.join(' AND ')
  }

  sql = sql + ' ORDER BY car_year LIMIT 10000; ';
  console.log(sql)

  const result = await db.query({
    rowMode: 'array',
    text: sql,
  });

  res.render('main', {
    title: 'Query Table',
    data: req.body,
    rows: result.rows,
  });

});

module.exports = router;
