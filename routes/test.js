var express = require('express');
var router = express.Router();
const {generateToken} = require('../utils/auth');
const { connectToDB, ObjectId} = require("../utils/db");
var passport = require('passport');

router.use(passport.authenticate('bearer', { session: false }));


router.get('/', function(req, res, next) {
    res.json('respond with a resource');
});

//it's a demo for passport use in router

module.exports = router;
