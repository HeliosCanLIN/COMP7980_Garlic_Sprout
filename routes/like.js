var express = require('express');
var router = express.Router();
const {generateToken} = require('../utils/auth');
const { connectToDB, ObjectId} = require("../utils/db");
var passport = require('passport');


router.use(passport.authenticate('bearer', {session: false}));

router.post('/add/', async function (req, res) {
    const db = await connectToDB();
    try {
        req.body.PostID= new ObjectId(req.body.PostID)
        req.body.CommentID= new ObjectId(req.body.CommentID)
        let insertResult = await db.collection("like").insertOne(req.body);
        if (insertResult > 0) {
            res.status(404).json({message: "点赞失败，请稍后重试"});
        } else {
            res.json(insertResult);
        }

    } catch (err) {
        res.status(400).json({message: err.message});
    } finally {
        await db.client.close();
    }
})

module.exports = router;
