const { check, validationResult } = require('express-validator')
const Router = require('express-promise-router')

const router =  new Router()

const login = require('./login')
const query = require('./query')


router.all('/', (req, res) => {
  res.redirect('query?query=limit%3D100');
});

router.all('/main', (req, res) => {
  res.redirect('query?query=limit%3D100');
});


router.get('/login', login.get)
router.post('/login', login.post)


router.get('/query', query.get)
router.post('/query', query.post)

module.exports = router;
