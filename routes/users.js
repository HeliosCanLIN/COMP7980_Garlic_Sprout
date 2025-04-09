var express = require('express');
var router = express.Router();

const {generateToken} = require('../utils/auth');
const {connectToDB, ObjectId} = require("../utils/db");

/* GET users listing. */
router.get('/', function (req, res, next) {
    res.send('respond with a resource');
});

router.post('/register/', async function (req, res) {
    const db = await connectToDB();
    try {
        var username = req.body.username;
        var password = req.body.password;
        delete req.body.confirmPassword;
        req.body.deleteFlag=1;
        let result = await db.collection("garlic_user").findOne({username: username});
        if (result != null) {
            res.status(404).json({message: "用户名已存在"});
        } else {
            let insertResult = await db.collection("garlic_user").insertOne(req.body);
            if (insertResult > 0) {
                res.status(404).json({message: "注册失败，请稍后重试"});
            } else {
                res.json(insertResult);
            }
        }
    } catch (err) {
        res.status(400).json({message: err.message});
    } finally {
        await db.client.close();
    }
})

router.post('/login/', async function (req, res) {
    const db = await connectToDB();
    try {
        var username = req.body.username;
        var password = req.body.password;
        let result = await db.collection("garlic_user").findOne({username: username, password: password,deleteFlag:1});
        if (result != null) {
            const token = generateToken(result);
            res.json({token: token, username: username,id:result._id});
        } else {
            res.status(400).json({message: "Wrong username or password"})
        }
    } catch (err) {
        res.status(400).json({message: err.message});
    } finally {
        await db.client.close();
    }
})


module.exports = router;
