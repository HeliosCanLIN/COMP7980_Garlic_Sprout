var express = require('express');
var router = express.Router();
const {generateToken} = require('../utils/auth');
const { connectToDB, ObjectId} = require("../utils/db");

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

module.exports = router;
