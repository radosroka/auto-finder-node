const { check, validationResult } = require('express-validator')
const Router = require('express-promise-router')

const router =  new Router()

const login = require('./login')
const query = require('./query')
const user = require('../user/user')


router.all('/', (req, res) => {
  req.session.name = 'sssss'
  res.redirect('login');
  res.redirect('query?query=limit%3D100');
});

router.all('/main', (req, res) => {
  res.redirect('query?query=limit%3D100');
});


router.get('/login', login.get)
router.post('/login', login.post)
router.all('/logout', login.logout)


router.get('/query', login.protected, query.get)
router.post('/query', login.protected, query.post)

module.exports = router;
