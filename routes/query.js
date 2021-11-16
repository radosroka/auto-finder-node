const { check, validationResult } = require('express-validator')
const Router = require('express-promise-router')
const db = require('../db/pg')


exports.get = async function (req, res) {

  console.log(req.session.loggedIn)
  console.log(req.session.user)

  var sql = 'SELECT * FROM my_view '
  var where = " WHERE "
  var query = []

  const qs = new URLSearchParams(req.query.query)

  if (qs.has('car_plate')) {
    query.push(` car_plate = '${qs.get('car_plate')}' `)
    req.body.car_plate = qs.get('car_plate')
  }

  if (qs.has('car_model')) {
    var model = qs.get('car_model').split(" ").join('.*')
    query.push(` lower(car_model) ~* '.*${model.toLowerCase()}.*' `)
    req.body.car_model = qs.get('car_model')
  }

  if (qs.has('type_name')) {
    query.push(` lower(type_name) ~* '.*${qs.get('type_name').toLowerCase()}.*' `)
    req.body.type_name = qs.get('type_name')
  }

  if (qs.has('car_color')) {
    query.push(` lower(car_color) ~* '.*${qs.get('car_color').toLowerCase()}.*' `)
    req.body.car_color = qs.get('car_color')
  }

  if (qs.has('car_year_from')) {
    query.push(`car_year >= '${qs.get('car_year_from')}'`)
    req.body.car_year_from = qs.get('car_year_from')
  }

  if (qs.has('car_year_to')) {
    query.push(`car_year <= '${qs.get('car_year_to')}'`)
    req.body.car_year_to = qs.get('car_year_to')
  }

  if (!(query.length === 0)) {
    sql = sql + where + query.join(' AND ')
  }

  var limit = '10000'

  if (qs.has('limit')) {
    limit = qs.get('limit')
  }

  sql = sql + ' ORDER BY car_year LIMIT ' + limit + ';';

  console.log(sql)

  const result = await db.query({
    rowMode: 'array',
    text: sql,
  });

  return res.render('query', {
    title: 'Query Table',
    data: req.body,
    rows: result.rows,
  });

};


exports.post =  function (req, res) {
  var qs = []

  const car_plate = req.body.car_plate;

  if (! (car_plate === '')) {
    qs.push(`car_plate=${car_plate}`)
  }


  const car_model = req.body.car_model;

  if (! (car_model === '')) {
    var model = car_model.split(" ").join('.*')
    qs.push(`car_model=${car_model}`)
  }


  const type_name = req.body.type_name;

  if (! (type_name === '')) {
    qs.push(`type_name=${type_name}`)
  }


  const car_color = req.body.car_color;

  if (! (car_color === '')) {
    qs.push(`car_color=${car_color}`)
  }


  const car_year_from = req.body.car_year_from;

  if (! (car_year_from === '')) {
    qs.push(`car_year_from=${car_year_from}`)
  }


  const car_year_to = req.body.car_year_to;

  if (! (car_year_to === '')) {
    qs.push(`car_year_to=${car_year_to}`)
  }


  if (!(qs.length === 0)) {
    qs = 'query?query=' + encodeURIComponent(qs.join('&'))
  } else {
    qs = 'query?query='
  }

  return res.redirect(qs)
};
