const db = require('../db/sqlite');

exports.getAllByUser = async function (user_id) {

  var sql = 'SELECT list_id,list_name,count FROM list_count_view ' +
            'WHERE user_id = ' + user_id + ';'

  const result = await db.query({
    rowMode: 'array',
    text: sql,
  });

  return result.rows
};

deleteListByUser = async function (list_id, user_id) {

  var sql = 'DELETE FROM list_items WHERE list_id = ' + list_id + ';'

  const result = await db.query({
    rowMode: 'array',
    text: sql,
  });

  sql = 'DELETE FROM lists WHERE list_id = ' + list_id + ' AND user_id = ' + user_id + ';'

  const result2 = await db.query({
    rowMode: 'array',
    text: sql,
  });
};

addUserList = async function (list_name, user_id) {

  var sql = 'INSERT INTO lists(list_name, user_id) VALUES ' +
      '(\'' + list_name + '\',' + user_id + ');'

  const result = await db.query({
    rowMode: 'array',
    text: sql,
  });

};

deleteFromList = async function (list_id, car_id) {

  var sql = 'DELETE FROM list_items WHERE list_id = ' + list_id + ' AND car_id=' + car_id + ';'

  const result = await db.query({
    rowMode: 'array',
    text: sql,
  });
};

addToList = async function (list_id, car_id) {

  var sql = 'INSERT INTO list_items(list_id, car_id) VALUES ' +
      '(\'' + list_id + '\',' + car_id + ');'

  const result = await db.query({
    rowMode: 'array',
    text: sql,
  });

};

exportList = async function (list_id, user_id) {
  // Export to Excel is not yet implemented for the SQLite version.
  // The original Python script (gen_excel.py) used a direct PostgreSQL connection.
  // TODO: replace with a JavaScript-based Excel export (e.g. exceljs).
  console.warn('exportList: Excel export not available in SQLite mode');
};


exportCleanUp = async function () {

  var yourscript = spawn('bash', 
	  ['rm', '-rf', `$(process.env.FOLDER)` + '/result*'], 
	  {shell: true});

  yourscript.stdout.on('data', (data) => {
    console.log(data.toString());
  });

  yourscript.stderr.on('data', (data) => {
    console.error(data.toString());
  });

  yourscript.on('exit', (code) => {
    console.log(`Child exited with code ${code}`);
  });
};

exports.manage_lists_get = async function (req, res) {

  var user = req.session.user
  var user_id = req.session.user_id

  var operation = req.query.operation
  var list_id = req.query.list_id
  var list_name = req.query.list_name

  if (operation === 'delete' && list_id) {
    await deleteListByUser(list_id, user_id);
    return res.redirect('/manage_lists');
  }

  if (operation === 'add' && list_name) {
    await addUserList(list_name, user_id);
    return res.redirect('/manage_lists');
  }

  const custom = await exports.getAllByUser(user_id)

  return res.render('manage_lists', {
    title: 'List Query',
    searchForm: true,
    session: req.session,
    custom_lists: custom,
    data: req.body,
    rows: custom,
  });
};

exports.manage_lists_post = async function (req, res) {

  var user = req.session.user
  var user_id = req.session.user_id
  var new_list = req.body.new_list_name

  var qs = '/manage_lists'

  if (new_list) {
    qs += '?operation=add&list_name=' + new_list
  }

  res.redirect(qs)
};

exports.manage_list_content_get = async function (req, res) {

  var user = req.session.user
  var user_id = req.session.user_id

  var operation = req.query.operation
  var list_id = req.query.list_id
  var car_id = req.query.car_id

  if (operation === 'delete' && list_id && car_id) {
    await deleteFromList(list_id, car_id)
    return res.redirect('/manage_list_content?list_id=' + list_id)
  }

  if (operation === 'add' && list_id && car_id) {
    await addToList(list_id, car_id)
    return res.redirect('/manage_list_content?list_id=' + list_id)
  }

  if (operation === 'export' && list_id) {
    return res.download(process.env.FOLDER + '/result-' + list_id + '-' + user_id + '.xlsx');
  }

  await exportList(list_id, user_id);

  const sql = 'SELECT car_plate,car_model,type_name,car_color,car_year,owner_name,owner_age,owner_street,owner_postnumber,owner_city,owner_phone,link,list_id,car_id,owner_id' +
      ' FROM list_view2 WHERE user_id = ' + user_id + ' AND list_id = ' + list_id + ';'


  const custom = await exports.getAllByUser(user_id)

  const result = await db.query({
    rowMode: 'array',
    text: sql,
  });

  return res.render('manage_list_content', {
    title: 'List Content Query',
    //searchForm: false,
    session: req.session,
    query: req.query,
    custom_lists: custom,
    data: req.body,
    rows: result.rows,
  });
};

exports.manage_list_content_post = async function (req, res) {

  var list_id = req.query.list_id
  var list_name = req.query.list_name
  var user = req.session.user
  var user_id = req.session.user_id


  const custom = await exports.getAllByUser(user_id)

  const result = await db.query({
    rowMode: 'array',
    text: sql,
  });

  return res.render('query', {
    title: 'List ' + list_name,
    session: req.session,
    query: req.query,
    custom_lists: custom,
    data: req.body,
    rows: result.rows,
  });
};
