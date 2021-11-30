const { check, validationResult } = require('express-validator')
const Router = require('express-promise-router')

const router =  new Router()

const lists = require('./lists')
const login = require('./login')
const query = require('./query')
const user = require('../user/user')


router.all('/', (req, res) => {
  return res.redirect('query?query=limit%3D100');
});

router.all('/main', (req, res) => {
  return res.redirect('query?query=limit%3D100');
});

router.post('/lists', user.protected, lists.manage)

router.get('/login', login.get)
router.post('/login', login.post)
router.all('/logout', login.logout)


router.get('/query', user.protected, query.get)
router.post('/query', user.protected, query.post)

module.exports = router;
