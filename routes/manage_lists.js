const db = require('../db/sqlite');
const ExcelJS = require('exceljs');

const PER_PAGE = 100;

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

  await db.query({ rowMode: 'array', text: sql });

  sql = 'DELETE FROM lists WHERE list_id = ' + list_id + ' AND user_id = ' + user_id + ';'

  await db.query({ rowMode: 'array', text: sql });
};

addUserList = async function (list_name, user_id) {

  var sql = 'INSERT INTO lists(list_name, user_id) VALUES ' +
      '(\'' + list_name + '\',' + user_id + ');'

  await db.query({ rowMode: 'array', text: sql });
};

deleteFromList = async function (list_id, car_id) {

  var sql = 'DELETE FROM list_items WHERE list_id = ' + list_id + ' AND car_id=' + car_id + ';'

  await db.query({ rowMode: 'array', text: sql });
};

addToList = async function (list_id, car_id) {

  var sql = 'INSERT INTO list_items(list_id, car_id) VALUES ' +
      '(\'' + list_id + '\',' + car_id + ');'

  await db.query({ rowMode: 'array', text: sql });
};

exportListToResponse = async function (list_id, user_id, list_name, res) {

  const sql = 'SELECT car_plate, car_model, type_name, car_color, car_year, ' +
              'owner_name, owner_age, owner_street, owner_postnumber, owner_city, owner_phone, link ' +
              'FROM list_view2 WHERE user_id = ' + user_id + ' AND list_id = ' + list_id + ';'

  const result = await db.query({ text: sql });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(list_name || 'List');

  sheet.columns = [
    { header: 'Car Plate',    key: 'car_plate',        width: 14 },
    { header: 'Model',        key: 'car_model',        width: 24 },
    { header: 'Type',         key: 'type_name',        width: 20 },
    { header: 'Color',        key: 'car_color',        width: 14 },
    { header: 'Year',         key: 'car_year',         width: 8  },
    { header: 'Owner',        key: 'owner_name',       width: 24 },
    { header: 'Age',          key: 'owner_age',        width: 6  },
    { header: 'Street',       key: 'owner_street',     width: 24 },
    { header: 'Post Number',  key: 'owner_postnumber', width: 12 },
    { header: 'City',         key: 'owner_city',       width: 18 },
    { header: 'Phone',        key: 'owner_phone',      width: 16 },
    { header: 'Link',         key: 'link',             width: 40 },
  ];

  // Bold header row
  sheet.getRow(1).font = { bold: true };

  for (const row of result.rows) {
    sheet.addRow(row);
  }

  // Borders on all cells
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top:    { style: 'thin' },
        left:   { style: 'thin' },
        bottom: { style: 'thin' },
        right:  { style: 'thin' },
      };
      cell.alignment = { horizontal: 'center' };
    });
  });

  const filename = `list-${list_id}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  await workbook.xlsx.write(res);
  res.end();
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

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const where = ' WHERE user_id = ' + user_id;

  const countResult = await db.query({ rowMode: 'array', text: 'SELECT COUNT(*) FROM list_count_view' + where + ';' });
  const total = countResult.rows[0][0];
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * PER_PAGE;

  const pageResult = await db.query({
    rowMode: 'array',
    text: 'SELECT list_id,list_name,count FROM list_count_view' + where + ' LIMIT ' + PER_PAGE + ' OFFSET ' + offset + ';',
  });

  const custom = await exports.getAllByUser(user_id)

  const pagination = { page: safePage, perPage: PER_PAGE, total, totalPages };

  return res.render('manage_lists', {
    title: 'List Query',
    searchForm: true,
    session: req.session,
    custom_lists: custom,
    data: req.body,
    rows: pageResult.rows,
    pagination,
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
    const lists = await exports.getAllByUser(user_id)
    const list = lists.find(l => String(l[0]) === String(list_id))
    const list_name = list ? list[1] : 'list'
    return exportListToResponse(list_id, user_id, list_name, res)
  }

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const where = ' WHERE user_id = ' + user_id + ' AND list_id = ' + list_id;

  const countResult = await db.query({ rowMode: 'array', text: 'SELECT COUNT(*) FROM list_view2' + where + ';' });
  const total = countResult.rows[0][0];
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * PER_PAGE;

  const sql = 'SELECT car_plate,car_model,type_name,car_color,car_year,owner_name,owner_age,owner_street,owner_postnumber,owner_city,owner_phone,link,list_id,car_id,owner_id' +
      ' FROM list_view2' + where + ' LIMIT ' + PER_PAGE + ' OFFSET ' + offset + ';';

  const custom = await exports.getAllByUser(user_id)

  const result = await db.query({
    rowMode: 'array',
    text: sql,
  });

  const pagination = {
    page: safePage,
    perPage: PER_PAGE,
    total,
    totalPages,
    list_id,
  };

  return res.render('manage_list_content', {
    title: 'List Content Query',
    session: req.session,
    query: req.query,
    custom_lists: custom,
    data: req.body,
    rows: result.rows,
    pagination,
  });
};

exports.manage_list_content_post = async function (req, res) {

  var list_id = req.query.list_id
  var list_name = req.query.list_name
  var user = req.session.user
  var user_id = req.session.user_id

  const custom = await exports.getAllByUser(user_id)

  const sql = 'SELECT car_plate,car_model,type_name,car_color,car_year,owner_name,owner_age,owner_street,owner_postnumber,owner_city,owner_phone,link,list_id,car_id,owner_id' +
      ' FROM list_view2 WHERE user_id = ' + user_id + ' AND list_id = ' + list_id + ';'

  const result = await db.query({
    rowMode: 'array',
    text: sql,
  });

  return res.render('manage_list_content', {
    title: 'List ' + list_name,
    session: req.session,
    query: req.query,
    custom_lists: custom,
    data: req.body,
    rows: result.rows,
  });
};
