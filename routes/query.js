const db = require('../db/sqlite')
const lists = require('./manage_lists')

const PER_PAGE = 100;

exports.get = async function (req, res) {

  req.body = req.body || {};

  const qs = new URLSearchParams(req.query.query);
  const page = Math.max(1, parseInt(req.query.page) || 1);

  const conditions = [];

  if (qs.has('car_plate')) {
    conditions.push(`car_plate = '${qs.get('car_plate')}'`)
    req.body.car_plate = qs.get('car_plate')
  }

  if (qs.has('car_model')) {
    var model = qs.get('car_model').split(" ").join('%')
    conditions.push(`lower(car_model) LIKE '%${model.toLowerCase()}%'`)
    req.body.car_model = qs.get('car_model')
  }

  if (qs.has('type_name')) {
    conditions.push(`lower(type_name) LIKE '%${qs.get('type_name').toLowerCase()}%'`)
    req.body.type_name = qs.get('type_name')
  }

  if (qs.has('car_color')) {
    conditions.push(`lower(car_color) LIKE '%${qs.get('car_color').toLowerCase()}%'`)
    req.body.car_color = qs.get('car_color')
  }

  if (qs.has('car_year_from')) {
    conditions.push(`car_year >= '${qs.get('car_year_from')}'`)
    req.body.car_year_from = qs.get('car_year_from')
  }

  if (qs.has('car_year_to')) {
    conditions.push(`car_year <= '${qs.get('car_year_to')}'`)
    req.body.car_year_to = qs.get('car_year_to')
  }

  const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
  const orderClause = (qs.has('car_year_from') || qs.has('car_year_to')) ? ' ORDER BY car_year' : '';

  const countResult = await db.query({ rowMode: 'array', text: `SELECT COUNT(*) FROM my_view${whereClause};` });
  const total = countResult.rows[0][0];
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * PER_PAGE;

  const sql = `SELECT * FROM my_view${whereClause}${orderClause} LIMIT ${PER_PAGE} OFFSET ${offset};`;
  console.log(sql);
  const result = await db.query({ rowMode: 'array', text: sql });
  const rows = result.rows;

  const pagination = {
    page: safePage,
    perPage: PER_PAGE,
    total,
    totalPages,
    queryString: req.query.query || '',
  };

  const custom = await lists.getAllByUser(req.session.user_id)

  return res.render('query', {
    title: 'Query Table',
    searchForm: true,
    session: req.session,
    custom_lists: custom,
    data: req.body,
    rows,
    pagination,
  });

};


exports.post = function (req, res) {
  var qs = []

  const car_plate = req.body.car_plate;
  if (!(car_plate === '')) {
    qs.push(`car_plate=${car_plate}`)
  }

  const car_model = req.body.car_model;
  if (!(car_model === '')) {
    qs.push(`car_model=${car_model}`)
  }

  const type_name = req.body.type_name;
  if (!(type_name === '')) {
    qs.push(`type_name=${type_name}`)
  }

  const car_color = req.body.car_color;
  if (!(car_color === '')) {
    qs.push(`car_color=${car_color}`)
  }

  const car_year_from = req.body.car_year_from;
  if (!(car_year_from === '')) {
    qs.push(`car_year_from=${car_year_from}`)
  }

  const car_year_to = req.body.car_year_to;
  if (!(car_year_to === '')) {
    qs.push(`car_year_to=${car_year_to}`)
  }

  if (!(qs.length === 0)) {
    qs = 'query?query=' + encodeURIComponent(qs.join('&'))
  } else {
    qs = 'query?query='
  }

  return res.redirect(qs)
};
