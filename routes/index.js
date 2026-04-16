const { Router } = require('express')

const router = Router()

const lists = require('./manage_lists')
const login = require('./login')
const query = require('./query')
const user = require('../user/user')


router.all('/', (req, res) => {
  return res.redirect('query?query=');
});

router.all('/main', (req, res) => {
  return res.redirect('query?query=');
});

router.get('/manage_lists', user.protected, lists.manage_lists_get)
router.post('/manage_lists', user.protected, lists.manage_lists_post)

router.get('/manage_list_content', user.protected, lists.manage_list_content_get)
router.post('/manage_list_content', user.protected, lists.manage_list_content_post)

router.get('/login', login.get)
router.post('/login', login.post)
router.all('/logout', login.logout)

router.get('/query', user.protected, query.get)
router.post('/query', user.protected, query.post)

module.exports = router;
